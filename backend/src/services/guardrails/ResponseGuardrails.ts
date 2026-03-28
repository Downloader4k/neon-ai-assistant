import { logger } from '../../utils/logger';

export interface ValidationResult {
    isValid: boolean;
    violations: string[];
    severity: 'low' | 'medium' | 'high';
}

export interface MemoryEntry {
    type: string;
    content: string;
}

/**
 * ResponseGuardrails - Hard-coded rules to prevent hallucinations
 * 
 * These rules CANNOT be bypassed by system prompts.
 * They validate every response before it reaches the user.
 */
export class ResponseGuardrails {

    // WHITELIST: Projects that ACTUALLY exist
    private readonly ALLOWED_PROJECTS = [
        'UserProject',
        'Neon',
        'Neon-AI-Assistant',
        'neon-ai-assistant'
    ];

    // BLACKLIST: Known hallucination patterns
    private readonly FORBIDDEN_PATTERNS = [
        /Phoenix-?Projekt/i,
        /Aurora-?Projekt/i,
        /Titan-?Projekt/i,
        // Generic "our project" without valid name
        /unser(?:e[ms]?)?\s+(?:gemeinsam(?:e[ms]?)?\s+)?Projekt(?!\s*(?:UserProject|Neon))/i,
        // Fake memories
        /letztes?\s+Mal\s+(?:haben\s+wir|hast\s+du|war)/i,
        /neulich\s+(?:haben\s+wir|hast\s+du)/i,
        /erinnerst\s+du\s+dich.*?(?:haben\s+wir|hast\s+du)/i,
    ];

    /**
     * Validate response for hallucinations
     */
    validate(response: string, memoryContext: MemoryEntry[] = []): ValidationResult {
        const violations: string[] = [];

        // Check 1: Forbidden patterns
        for (const pattern of this.FORBIDDEN_PATTERNS) {
            const match = response.match(pattern);
            if (match) {
                violations.push(`Forbidden pattern detected: "${match[0]}"`);
                logger.warn('Guardrail violation: Forbidden pattern', {
                    pattern: pattern.source,
                    match: match[0]
                });
            }
        }

        // Check 2: Unknown project names
        const projectViolations = this.detectUnknownProjects(response);
        violations.push(...projectViolations);

        // Check 3: Fact verification (if memory provided)
        if (memoryContext.length > 0) {
            const factViolations = this.verifyFacts(response, memoryContext);
            violations.push(...factViolations);
        }

        const severity = this.calculateSeverity(violations);

        return {
            isValid: violations.length === 0,
            violations,
            severity
        };
    }

    /**
     * Detect mentions of projects not in whitelist
     */
    private detectUnknownProjects(response: string): string[] {
        const violations: string[] = [];

        // Pattern: "das X-Projekt" or "unser X-Projekt"
        const projectPattern = /(?:das|unser(?:e[ms]?)?)\s+([A-Z][a-zäöüß]*(?:-?[A-Z][a-zäöüß]*)*)-?Projekt/g;

        let match;
        while ((match = projectPattern.exec(response)) !== null) {
            const projectName = match[1];

            // Check if project is in whitelist
            const isAllowed = this.ALLOWED_PROJECTS.some(
                allowed => allowed.toLowerCase() === projectName.toLowerCase()
            );

            if (!isAllowed) {
                violations.push(`Unknown project mentioned: "${projectName}-Projekt"`);
                logger.warn('Guardrail violation: Unknown project', {
                    project: projectName,
                    fullMatch: match[0]
                });
            }
        }

        return violations;
    }

    /**
     * Verify facts against memory context
     */
    private verifyFacts(response: string, memoryContext: MemoryEntry[]): string[] {
        const violations: string[] = [];

        // Extract project mentions
        const projectMentions = this.extractProjectMentions(response);

        for (const project of projectMentions) {
            // Check if project is in memory OR in whitelist
            const inMemory = memoryContext.some(entry =>
                entry.content.toLowerCase().includes(project.toLowerCase())
            );

            const inWhitelist = this.ALLOWED_PROJECTS.some(
                allowed => allowed.toLowerCase() === project.toLowerCase()
            );

            if (!inMemory && !inWhitelist) {
                violations.push(`Project "${project}" not found in memory or whitelist`);
                logger.warn('Guardrail violation: Project not in memory', { project });
            }
        }

        return violations;
    }

    /**
     * Extract project names from response
     */
    private extractProjectMentions(response: string): string[] {
        const projects = new Set<string>();

        // Pattern 1: "UserProject", "Phoenix-Projekt", etc.
        const capitalizedPattern = /\b([A-Z][a-zäöüß]*(?:-?[A-Z][a-zäöüß]*)*)\b/g;

        let match;
        while ((match = capitalizedPattern.exec(response)) !== null) {
            const word = match[1];

            // Filter out common words
            if (!this.isCommonWord(word)) {
                projects.add(word);
            }
        }

        return Array.from(projects);
    }

    /**
     * Check if word is a common German word (not a project name)
     */
    private isCommonWord(word: string): boolean {
        const commonWords = [
            // Articles & Pronouns
            'Der', 'Die', 'Das', 'Ein', 'Eine', 'Ich', 'Du', 'Er', 'Sie', 'Es',
            'Wir', 'Ihr', 'Mir', 'Dir', 'Ihm', 'Dich', 'Mich', 'Sich',
            // Conjunctions
            'Und', 'Oder', 'Aber', 'Wenn', 'Dann', 'Auch', 'Noch', 'Schon',
            'Nur', 'Nicht', 'Keine', 'Kein', 'Alle', 'Viele',
            // Common verbs/adjectives (capitalized in German)
            'Gut', 'Besser', 'Best', 'Mehr', 'Weniger', 'Groß', 'Klein',
            'Wie', 'Was', 'Wann', 'Wo', 'Warum', 'Wer', 'Welche', 'Welcher',
            // Common nouns (not projects)
            'Sache', 'Ideen', 'Idee', 'Frage', 'Antwort', 'Problem', 'Lösung',
            'Zeit', 'Tag', 'Jahr', 'Monat', 'Woche', 'Heute', 'Morgen', 'Gestern',
            'Nachfrage', 'Anfrage', 'Projekt', 'Arbeit', 'Team', 'Firma',
            // Tech stack (not projects)
            'Node', 'Express', 'Flask', 'Django', 'Spring', 'Boot',
            'Java', 'Python', 'Redis', 'MongoDB', 'PostgreSQL', 'Cassandra',
            'Kong', 'Nginx', 'Kafka', 'RabbitMQ', 'Kubernetes', 'Docker',
            'React', 'Vue', 'Angular', 'Svelte'
        ];

        return commonWords.includes(word);
    }

    /**
     * Calculate severity of violations
     */
    private calculateSeverity(violations: string[]): 'low' | 'medium' | 'high' {
        if (violations.length === 0) return 'low';

        const hasForbiddenPattern = violations.some(v => v.includes('Forbidden pattern'));
        const hasUnknownProject = violations.some(v => v.includes('Unknown project'));

        if (hasForbiddenPattern) return 'high';
        if (hasUnknownProject) return 'medium';

        return 'low';
    }

    /**
     * Generate safe fallback response when validation fails
     */
    getSafeFallback(violations: string[]): string {
        logger.warn('Using safe fallback due to guardrail violations', { violations });

        return `Entschuldigung, ich bin mir bei dieser Antwort nicht sicher. Lass mich das nochmal überdenken. 🤔

Kannst du deine Frage vielleicht etwas anders formulieren?`;
    }
}

export const responseGuardrails = new ResponseGuardrails();
