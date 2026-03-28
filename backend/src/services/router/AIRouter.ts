import { claudeService, ClaudeMessage, ClaudeContent } from '../claude/ClaudeService';
import { ollamaService, OllamaMessage } from '../ollama/OllamaService';
import { knowledgeBaseService } from '../../skills/knowledgeBase/service';
import { logger } from '../../utils/logger';
import { prisma } from '../db/prisma';
import { capabilityScorer } from './CapabilityScorer';
import { claudeBackendService } from './ClaudeBackendService';
import { spellCheckService } from '../spellcheck/SpellCheckService';

export type AIProvider = 'claude' | 'ollama' | 'hybrid';

// Domain types for classification
export type MessageDomain =
    | 'emotional'      // "Wie geht's dir?", feelings
    | 'conversation'   // Smalltalk, greetings
    | 'memory'         // "Erinnerst du dich..."
    | 'goodnight'      // Tagesabschluss
    | 'personal'       // User-bezogene Reflexion
    | 'code'           // Programming tasks
    | 'planning'       // Architecture, strategy
    | 'knowledge'      // General questions
    | 'reasoning';     // Complex analysis

export interface MessageClassification {
    domain: MessageDomain;
    expectedDepth: number;  // 0.0 - 1.0
    riskLevel: 'low' | 'medium' | 'high';
}

// Domains that should NEVER use Claude (protect Neon's identity)
const NO_CLAUDE_DOMAINS: MessageDomain[] = [
    'emotional',
    'conversation',
    'memory',
    'goodnight',
    'personal'
];


// Constants for DB storage
const SYSTEM_USER_ID = 'system';
const SYSTEM_SETTINGS_CATEGORY = 'system_settings';

export interface RouterConfig {
    complexityThreshold: number; // 0-100: below this uses Ollama, above uses Claude
    enableHybridMode: boolean;
    privacyMode: boolean; // If true, only use Ollama
    ollamaModel: string;
    enableOrchestrator: boolean; // Enable 5-stage orchestrator (Phase 1-3)
    selfConfidenceThreshold: number; // Threshold for self-confidence (Phase 2)
    claudeThreshold: number; // Threshold for expected depth (Phase 4)
}

export interface AIResponse {
    content: string;
    provider: AIProvider;
    tokensUsed?: number;
    model: string;
}

export class AIRouter {
    private config: RouterConfig;

    constructor() {
        this.config = {
            complexityThreshold: parseInt(process.env.COMPLEXITY_THRESHOLD || '30', 10),
            enableHybridMode: process.env.ENABLE_HYBRID_MODE === 'true',
            privacyMode: process.env.PRIVACY_MODE === 'true',
            ollamaModel: process.env.OLLAMA_MODEL || 'gemma3:12b',
            enableOrchestrator: process.env.ENABLE_ORCHESTRATOR !== 'false', // Default: true
            selfConfidenceThreshold: parseFloat(process.env.SELF_CONFIDENCE_THRESHOLD || '0.55'),
            claudeThreshold: parseFloat(process.env.CLAUDE_THRESHOLD || '0.8'),
        };

        this.loadSettings().catch(err => logger.error('Failed to load initial settings', { err }));
        logger.info('AI Router initialized', this.config);
    }

    private async ensureSystemUser() {
        try {
            const systemUser = await prisma.user.findUnique({ where: { id: SYSTEM_USER_ID } });
            if (!systemUser) {
                await prisma.user.create({
                    data: {
                        id: SYSTEM_USER_ID,
                        name: 'System',
                        email: 'system@neon.ai' // Optional but good for clarity
                    }
                });
                logger.info('Created system user for settings persistence');
            }
        } catch (error) {
            logger.error('Failed to ensure system user exists', { error });
        }
    }

    private async loadSettings() {
        try {
            await this.ensureSystemUser();

            const preferences = await prisma.userPreference.findMany({
                where: {
                    userId: SYSTEM_USER_ID,
                    key: { in: ['complexityThreshold', 'enableHybridMode', 'privacyMode', 'ollamaModel'] }
                }
            });
            //...

            if (preferences.length > 0) {
                const newConfig = { ...this.config };

                for (const pref of preferences) {
                    if (pref.key === 'complexityThreshold') newConfig.complexityThreshold = parseInt(pref.value, 10);
                    if (pref.key === 'enableHybridMode') newConfig.enableHybridMode = pref.value === 'true';
                    if (pref.key === 'privacyMode') newConfig.privacyMode = pref.value === 'true';
                    if (pref.key === 'ollamaModel') newConfig.ollamaModel = pref.value;
                }

                this.config = newConfig;
                logger.info('Loaded settings from DB', this.config);
            }
        } catch (error) {
            logger.error('Failed to load settings from DB', { error });
        }
    }

    private async saveSettings() {
        try {
            const updates = [
                { key: 'complexityThreshold', value: String(this.config.complexityThreshold) },
                { key: 'enableHybridMode', value: String(this.config.enableHybridMode) },
                { key: 'privacyMode', value: String(this.config.privacyMode) },
                { key: 'ollamaModel', value: this.config.ollamaModel }
            ];

            for (const update of updates) {
                await prisma.userPreference.upsert({
                    where: {
                        userId_key: {
                            userId: SYSTEM_USER_ID,
                            key: update.key
                        }
                    },
                    update: {
                        value: update.value,
                        category: SYSTEM_SETTINGS_CATEGORY,
                        updatedAt: new Date()
                    },
                    create: {
                        userId: SYSTEM_USER_ID,
                        key: update.key,
                        value: update.value,
                        category: SYSTEM_SETTINGS_CATEGORY
                    }
                });
            }
            logger.info('Saved settings to DB');
        } catch (error) {
            logger.error('Failed to save settings to DB', { error });
        }
    }

    /**
     * Classify message domain (Phase 1: Hard Rules)
     */
    private classifyDomain(message: string): MessageClassification {
        const lower = message.toLowerCase().trim();

        // Emotional - protect Neon's personal connection
        if (lower.match(/wie geht'?s?(?: dir)?|fühlst du|bist du (gut|schlecht|müde|traurig|glücklich)|geht es dir/)) {
            return { domain: 'emotional', expectedDepth: 0.2, riskLevel: 'low' };
        }

        // Goodnight/Tagesabschluss
        if (lower.match(/gute nacht|schlaf (gut|schön)|bis morgen|träum was schönes/)) {
            return { domain: 'goodnight', expectedDepth: 0.1, riskLevel: 'low' };
        }

        // Conversation/Smalltalk
        if (lower.match(/^(hallo|hi|hey|moin|servus|grüß dich|tag|morgen|abend)\b/)) {
            return { domain: 'conversation', expectedDepth: 0.1, riskLevel: 'low' };
        }
        if (lower.match(/danke|vielen dank|super|cool|ok|alles klar|verstanden|perfekt|genau/)) {
            return { domain: 'conversation', expectedDepth: 0.1, riskLevel: 'low' };
        }

        // Memory - user asking about shared history
        if (lower.match(/erinnerst du (dich)?|weißt du noch|letzte mal|neulich|damals|früher/)) {
            return { domain: 'memory', expectedDepth: 0.3, riskLevel: 'low' };
        }

        // Personal - user-specific reflection
        if (lower.match(/ich (bin|habe|mag|will)|mein(e)? (name|projekt|ziel|hobby)/)) {
            return { domain: 'personal', expectedDepth: 0.3, riskLevel: 'low' };
        }

        // Code - technical implementation
        if (message.includes('```') || lower.match(/implementier|refactor|debug|code|funktion|class|async|await|promise/)) {
            return { domain: 'code', expectedDepth: 0.8, riskLevel: 'high' };
        }

        // Planning - architecture/strategy
        if (lower.match(/plane|entwirf|architektur|strategie|konzept|design pattern|skalier/)) {
            return { domain: 'planning', expectedDepth: 0.9, riskLevel: 'high' };
        }

        // Reasoning & Logic - complex analysis or calculations
        if (lower.match(/warum|wieso|weshalb|erkläre ausführlich|analysiere|vergleiche.*mit.*tradeoff/)) {
            return { domain: 'reasoning', expectedDepth: 0.8, riskLevel: 'medium' };
        }
        if (lower.match(/berechne|rechne|wie alt|differenz|datum|mathe|logik|rechnung|wann.*geboren|geburtstag|alter/)) {
            return { domain: 'reasoning', expectedDepth: 0.9, riskLevel: 'medium' };
        }

        // Default: Knowledge (simple questions)
        return { domain: 'knowledge', expectedDepth: 0.5, riskLevel: 'medium' };
    }

    /**
     * Helper to extract text from potential multimodal content
     */
    private extractText(message: string | ClaudeContent): string {
        if (typeof message === 'string') return message;
        if (Array.isArray(message)) {
            return message
                .filter(block => block.type === 'text')
                .map(block => (block as { type: 'text', text: string }).text)
                .join('\n');
        }
        return '';
    }

    /**
     * Route a message to the appropriate AI service
     */
    /**
     * Route a message to the appropriate AI service
     */
    async route(
        message: string | ClaudeContent,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        forceProvider?: AIProvider,
        systemPrompt?: string
    ): Promise<AIResponse> {
        try {
            const textMessage = this.extractText(message);
            let ragSystemPrompt = '';

            // RAG INTEGRATION: Knowledge Base lookup
            try {
                if (textMessage.length > 5) {
                    const knowledgeContext = await knowledgeBaseService.query(textMessage, 5);
                    if (knowledgeContext && knowledgeContext.length > 0) {
                        // Verbesserte RAG-Formatierung mit klarer Struktur und Metadaten
                        const contextBlock = knowledgeContext
                            .map((res: any, idx: number) => {
                                // Extrahiere den Titel aus der Quelle (ohne .pdf)
                                const sourceTitle = res.metadata.sourceTitle || res.metadata.source.replace('.pdf', '').replace(/_/g, ' ');
                                
                                return `
### DOKUMENT: ${sourceTitle}
### QUELLE: ${res.metadata.source}
### ABSCHNITT ${idx+1}:

${res.content}`;
                            })
                            .join('\n\n');

                        ragSystemPrompt = `
[WICHTIGE INFORMATIONEN AUS DER DATENBANK]
Die folgenden Abschnitte stammen aus deinen hochgeladenen Dokumenten.
NUTZE AUSSCHLIESSLICH DIESE QUELLEN für deine Antwort.

${contextBlock}

[ENDE DER DATENBANK-INFOS]

WICHTIGE ANWEISUNGEN:
1. Lies die Quellenabschnitte sorgfältig durch.
2. Beantworte die Frage NUR basierend auf den Informationen aus diesen Quellen.
3. Wenn unterschiedliche Quellen widersprüchliche Informationen enthalten, priorisiere die Quelle, die zur Frage am besten passt.
4. Wenn die Antwort NICHT in den Quellen zu finden ist, sage: "Diese Information ist in den Dokumenten nicht enthalten."
5. ERFINDE NIEMALS FAKTEN. Sei präzise und korrekt.
6. Wenn nach Daten, Zahlen oder Namen gefragt wird, gib die EXAKTE Information aus der Quelle wieder.
7. Bei Geburtstagsinformationen oder Alter, sei besonders genau und prüfe alle Quellen.
`;
                    }
                }
            } catch (ragError) {
                logger.warn('Failed to query Knowledge Base in sync route', { error: ragError });
            }

            // LOCAL RAG: Query indexed files from database
            // Uses current message + recent conversation history for better keyword matching on follow-ups
            try {
                if (textMessage.length > 3) {
                    const allText = [
                        textMessage,
                        ...conversationHistory.slice(-4).map(h => h.content)
                    ].join(' ');
                    const stopWords = new Set(['der', 'die', 'das', 'und', 'oder', 'ein', 'eine', 'ist', 'sind', 'hat', 'haben', 'mit', 'von', 'den', 'dem', 'des', 'auf', 'fuer', 'nicht', 'sich', 'ich', 'bitte', 'auch', 'noch', 'wie', 'was', 'wer', 'welche', 'welcher', 'welches', 'deine', 'meine', 'dein', 'mein', 'hast', 'weisst', 'kannst', 'moechte', 'antworte', 'ausfuehrlich', 'the', 'and', 'for', 'you', 'that', 'this', 'with']);
                    const keywords = [...new Set(
                        allText.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.has(w))
                    )];

                    const ragEntries = await prisma.memoryEntry.findMany({
                        where: {
                            content: { startsWith: '[RAG:' },
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 100,
                    });

                    if (ragEntries.length > 0) {
                        const scored = ragEntries
                            .map((entry: any) => {
                                const lower = entry.content.toLowerCase();
                                const hits = keywords.filter((kw: string) => lower.includes(kw)).length;
                                return { entry, score: hits / keywords.length };
                            })
                            .filter((s: any) => s.score > 0.15)
                            .sort((a: any, b: any) => b.score - a.score)
                            .slice(0, 5);

                        if (scored.length > 0) {
                            const localRagBlock = scored
                                .map((s: any) => {
                                    const match = s.entry.content.match(/^\[RAG: (.+?)\]\s*/);
                                    const filename = match ? match[1] : 'Unbekannt';
                                    const content = s.entry.content.replace(/^\[RAG: .+?\]\s*/, '');
                                    return `### LOKALE DATEI: ${filename}\n${content}`;
                                })
                                .join('\n\n');

                            ragSystemPrompt += `
[LOKALE DATEIEN - INDEXIERTE INHALTE]
${localRagBlock}
[ENDE LOKALE DATEIEN]
`;
                        }
                    }
                }
            } catch (localRagError) {
                logger.warn('Failed to query local RAG entries', { error: localRagError });
            }

            const currentSystemPrompt = systemPrompt || '';
            const systemPromptWithRag = ragSystemPrompt ? `${currentSystemPrompt}\n${ragSystemPrompt}`.trim() : currentSystemPrompt;

            // Force provider if specified
            if (forceProvider) {
                return await this.routeToProvider(forceProvider, message, conversationHistory, systemPromptWithRag);
            }

            // Privacy mode: always use Ollama
            if (this.config.privacyMode) {
                logger.info('Privacy mode enabled, routing to Ollama');
                return await this.routeToProvider('ollama', message, conversationHistory, systemPromptWithRag);
            }

            // PHASE 1: Classify domain + Hard Rules
            const classification = this.classifyDomain(textMessage);

            logger.debug('Message classified', {
                domain: classification.domain,
                depth: classification.expectedDepth
            });

            // Hard Rule: NO_CLAUDE_DOMAINS always go to Ollama
            if (NO_CLAUDE_DOMAINS.includes(classification.domain)) {
                // VERBESSERTE AUSNAHMEN: Breitere Erkennung kritischer Abfragen
                const criticalPatterns = [
                    // Bestehende Logik-Keywords
                    /wie alt|alter|rechnen|kalkulier|geburtstag|datum|wann war|\d{4}/i,
                    // Erweiterte Geburtstagserkennung
                    /wann (wurde|ist) .* geboren/i,
                    /geburts(tag|datum)/i,
                    // Faktenwissen aus Dokumenten
                    /fakten (über|zu) .*/i,
                    /wiki|artikel|pdf|dokument/i,
                    // Zeit- und Datumsberechnungen
                    /vor (wie viel|\d+) (jahren|monaten|tagen)/i,
                    /im jahr \d{4}/i,
                    /\d{1,2}\.\d{1,2}\.\d{4}/i  // Datumsformat: DD.MM.YYYY
                ];
                
                // Wenn irgendein Pattern passt, verwende Claude
                const needsClaude = criticalPatterns.some(pattern => pattern.test(textMessage));
                
                if (needsClaude) {
                    logger.info('🚀 [AIRouter] KRITISCHE ABFRAGE ERKANNT - eskaliere zu Claude trotz persönlicher Domäne');
                    logger.info(`[AIRouter] Abfrage: "${textMessage}"`);
                    return await this.routeToProvider('claude', message, conversationHistory, systemPromptWithRag);
                }

                logger.info('Hard rule: No Claude for this domain', { domain: classification.domain });
                return await this.routeToProvider('ollama', message, conversationHistory, systemPromptWithRag);
            }

            // PHASE 2: Orchestrator / Threshold logic
            if (this.config.enableOrchestrator) {
                logger.info('🧠 Orchestrator enabled - scoring local capability');
                const selfScore = await capabilityScorer.scoreLocalCapability(textMessage);

                const complexity = Math.max(classification.expectedDepth, selfScore.reasoningDepthNeeded);

                // Decide if Claude is needed
                const shouldUseClaude = (
                    complexity >= this.config.claudeThreshold || // Trigger if complex (Logic/Reasoning)
                    (selfScore.selfConfidence < this.config.selfConfidenceThreshold && selfScore.missingKnowledge === true) // Or if knowledge is missing/low confidence
                );

                logger.info(`[AIRouter] Orchestrator decision - shouldUseClaude: ${shouldUseClaude} (Complexity: ${complexity.toFixed(2)}, Confidence: ${selfScore.selfConfidence.toFixed(2)})`);

                if (shouldUseClaude) {
                    const isExtraComplex = complexity >= 0.85 || classification.domain === 'reasoning' || classification.domain === 'code';

                    if (isExtraComplex) {
                        logger.info(`🌩️ Sync - FULL CLAUDE triggered (Complexity: ${complexity.toFixed(2)}, Domain: ${classification.domain})`);
                        return await this.routeToProvider('claude', message, conversationHistory, systemPromptWithRag);
                    } else {
                        logger.info(`🌩️ Sync - Hybrid Backend triggered (Complexity: ${complexity.toFixed(2)}, Domain: ${classification.domain})`);
                        return await this.routeToProvider('hybrid', message, conversationHistory, systemPromptWithRag);
                    }
                } else {
                    return await this.routeToProvider('ollama', message, conversationHistory, systemPromptWithRag);
                }
            } else {
                // FALLBACK: Simple complexity threshold
                if (classification.expectedDepth < this.config.complexityThreshold) {
                    return await this.routeToProvider('ollama', message, conversationHistory, systemPromptWithRag);
                } else {
                    return await this.routeToProvider('claude', message, conversationHistory, systemPromptWithRag);
                }
            }
        } catch (error) {
            logger.error('Error in AI routing', { error });
            throw error;
        }
    }

    /**
     * Stream a message to the appropriate AI service
     */
    public async *streamRoute(
        message: string | ClaudeContent,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        forceProvider?: AIProvider,
        systemPrompt?: string
    ): AsyncGenerator<{ chunk: string; provider: AIProvider }, void, unknown> {
        try {
            const textMessage = this.extractText(message);
            let ragSystemPrompt = '';

            // RAG INTEGRATION
            try {
                if (textMessage.length > 5) {
                    let ragQuery = textMessage;

                    // RAG ENHANCEMENT: If looking for birth/age/biography, add keywords to improve retrieval
                    if (textMessage.toLowerCase().match(/wie alt|geboren|geburtstag|biografie|alter/)) {
                        ragQuery = `${textMessage} Biografie Geburtstag Geburtsdatum`;
                        logger.debug(`📚 Enhanced RAG query: ${ragQuery}`);
                    }

                    // Erhöhe die Anzahl auf 10 für bessere Abdeckung
                    let knowledgeContext = await knowledgeBaseService.query(ragQuery, 10); 

                    if (knowledgeContext && knowledgeContext.length > 0) {
                        // VERBESSERTER RE-RANKING-ALGORITHMUS
                        const queryLower = textMessage.toLowerCase();
                        
                        // Extrahiere mögliche Personennamen aus der Abfrage für präziseres Matching
                        const nameMatches = queryLower.match(/wann wurde (.*?) geboren|wie alt ist (.*?)|wer ist (.*?)|über (.*?)|fakten (zu|über) (.*?)/i);
                        let personName = "";
                        
                        if (nameMatches) {
                            personName = (nameMatches[1] || nameMatches[2] || nameMatches[3] || nameMatches[4] || nameMatches[6] || "").trim().toLowerCase();
                            logger.info(`📚 RAG Re-Ranking: Erkannter Personenname "${personName}"`);
                        }
                        
                        // Intelligenteres Re-Ranking mit Multi-Kriterien-Score
                        knowledgeContext.forEach((item: any) => {
                            let score = 0;
                            const sourceTitle = item.metadata.source.replace('.pdf', '').toLowerCase();
                            const content = item.content.toLowerCase();
                            
                            // Punktevergabe basierend auf Relevanz
                            if (personName && sourceTitle.includes(personName)) score += 5;
                            if (personName && content.includes(personName)) score += 3;
                            if (content.includes("geboren") && queryLower.includes("geboren")) score += 4;
                            if (content.includes("geburtstag") && queryLower.includes("alter")) score += 4;
                            if (content.includes("geburt") && queryLower.match(/wann|datum|geboren/)) score += 4;
                            
                            // Datumspriorisierung
                            if (content.match(/\d{1,2}\.\d{1,2}\.\d{4}|\d{1,2}\.\s\w+\s\d{4}|\d{4}/) && 
                                queryLower.match(/wann|datum|alter|geboren/)) {
                                score += 5;
                            }
                            
                            // Speichere Score für Sortierung
                            item.relevanceScore = score;
                        });
                        
                        // Sortiere nach berechneter Relevanz
                        knowledgeContext.sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);

                        logger.info(`📚 RAG Found ${knowledgeContext.length} chunks. Top source: ${knowledgeContext[0]?.metadata?.sourceTitle || 'unknown'}`);
                        
                        // Detaillierteres Logging der Top-Ergebnisse
                        knowledgeContext.forEach((res: any, i: number) => {
                            logger.info(`RAG Result ${i}: [${res.metadata?.sourceTitle || 'unknown'}] Score: ${res.relevanceScore} - ${res.content.slice(0, 70).replace(/\n/g, ' ')}...`);
                        });

                        const contextBlock = knowledgeContext
                            .map((res: any) => `### QUELLE: ${res.metadata.source}\n${res.content}`)
                            .join('\n\n');

                        ragSystemPrompt = `
[WICHTIGE INFORMATIONEN AUS DER DATENBANK]
DURCHSUCHE DIE FOLGENDEN QUELLEN NACH DER ANTWORT. ACHTE GENAU AUF DEN NAMEN DER QUELLE!
WENN IN DER QUELLE "Vanessa_Mai.pdf" ETWAS ANDERES STEHT ALS IN "Joel_Brandenstein.pdf", NUTZE DIE QUELLE, DIE ZUM NAMEN IN DER FRAGE PASST.

${contextBlock}
[ENDE DER DATENBANK-INFOS]
`;
                    }
                }
            } catch (ragError) {
                logger.warn('Failed to query Knowledge Base in stream route', { error: ragError });
            }

            // LOCAL RAG: Query indexed files from database
            // Uses current message + recent conversation history for better keyword matching on follow-ups
            try {
                if (textMessage.length > 3) {
                    // Build keywords from current message AND recent history for follow-up context
                    const allText = [
                        textMessage,
                        ...conversationHistory.slice(-4).map(h => h.content)
                    ].join(' ');
                    const stopWords = new Set(['der', 'die', 'das', 'und', 'oder', 'ein', 'eine', 'ist', 'sind', 'hat', 'haben', 'mit', 'von', 'den', 'dem', 'des', 'auf', 'fuer', 'nicht', 'sich', 'ich', 'bitte', 'auch', 'noch', 'wie', 'was', 'wer', 'welche', 'welcher', 'welches', 'deine', 'meine', 'dein', 'mein', 'hast', 'weisst', 'kannst', 'moechte', 'antworte', 'ausfuehrlich', 'the', 'and', 'for', 'you', 'that', 'this', 'with']);
                    const keywords = [...new Set(
                        allText.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.has(w))
                    )];

                    const ragEntries = await prisma.memoryEntry.findMany({
                        where: {
                            content: { startsWith: '[RAG:' },
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 100,
                    });

                    if (ragEntries.length > 0) {
                        const scored = ragEntries
                            .map((entry: any) => {
                                const lower = entry.content.toLowerCase();
                                const hits = keywords.filter((kw: string) => lower.includes(kw)).length;
                                return { entry, score: hits / keywords.length };
                            })
                            .filter((s: any) => s.score > 0.15)
                            .sort((a: any, b: any) => b.score - a.score)
                            .slice(0, 5);

                        if (scored.length > 0) {
                            logger.info(`📂 Local RAG: ${scored.length} relevant entries found (keywords from message + history)`);
                            const localRagBlock = scored
                                .map((s: any) => {
                                    const match = s.entry.content.match(/^\[RAG: (.+?)\]\s*/);
                                    const filename = match ? match[1] : 'Unbekannt';
                                    const content = s.entry.content.replace(/^\[RAG: .+?\]\s*/, '');
                                    return `### LOKALE DATEI: ${filename}\n${content}`;
                                })
                                .join('\n\n');

                            ragSystemPrompt += `
[LOKALE DATEIEN - INDEXIERTE INHALTE]
${localRagBlock}
[ENDE LOKALE DATEIEN]
`;
                        }
                    }
                }
            } catch (localRagError) {
                logger.warn('Failed to query local RAG entries in stream route', { error: localRagError });
            }

            const currentSystemPrompt = systemPrompt || '';
            const systemPromptWithRag = ragSystemPrompt ? `${currentSystemPrompt}\n${ragSystemPrompt}`.trim() : currentSystemPrompt;

            // Determine provider
            let provider: AIProvider;
            const classification = this.classifyDomain(textMessage);

            if (forceProvider) {
                provider = forceProvider;
            } else if (this.config.privacyMode) {
                provider = 'ollama';
            } else if (NO_CLAUDE_DOMAINS.includes(classification.domain)) {
                // EXCEPTION: Even in these domains, if it's about MATH or DATES, use Claude
                const logicKeywords = /wie alt|alter|rechnen|kalkulier|geburtstag|datum|wann war|\d{4}/i;
                if (logicKeywords.test(textMessage)) {
                    logger.info(`🚨 [AIRouter] Logic keywords found in personal/memory domain - escalating to Claude in streamRoute`);
                    provider = 'claude';
                } else {
                    provider = 'ollama';
                }
            } else if (this.config.enableOrchestrator) {
                const selfScore = await capabilityScorer.scoreLocalCapability(textMessage);
                const complex = Math.max(classification.expectedDepth, selfScore.reasoningDepthNeeded);

                const shouldUseClaude = (
                    complex >= this.config.claudeThreshold || // Trigger if complex (Logic/Reasoning)
                    (selfScore.selfConfidence < this.config.selfConfidenceThreshold && selfScore.missingKnowledge === true) // Or if knowledge is missing/low confidence
                );

                if (shouldUseClaude) {
                    // FULL CLAUDE STRATEGY: For extra high complexity or logic, use Claude directly.
                    // This prevents Gemma from breaking Claude's logical analysis in hybrid mode.
                    const isExtraComplex = complex >= 0.85 || classification.domain === 'reasoning' || classification.domain === 'code';

                    if (isExtraComplex) {
                        logger.info(`🌩️ Streaming - FULL CLAUDE triggered (Complexity: ${complex.toFixed(2)}, Domain: ${classification.domain})`);
                        for await (const chunk of claudeService.streamMessage(
                            message,
                            conversationHistory as ClaudeMessage[],
                            systemPromptWithRag
                        )) {
                            yield { chunk, provider: 'claude' };
                        }
                    } else {
                        logger.info(`🌩️ Streaming - Hybrid Backend triggered (Complexity: ${complex.toFixed(2)}, Domain: ${classification.domain})`);
                        for await (const chunk of claudeBackendService.streamAnswerWithClaudeBackend(
                            textMessage,
                            conversationHistory,
                            systemPromptWithRag
                        )) {
                            yield { chunk, provider: 'hybrid' };
                        }
                    }
                    return;
                } else {
                    provider = 'ollama';
                }
            } else {
                provider = classification.expectedDepth < this.config.complexityThreshold ? 'ollama' : 'claude';
            }

            // Final check for Ollama installation
            if (provider === 'ollama' && !(await ollamaService.isOllamaInstalled())) {
                logger.warn('Ollama not installed, falling back to Claude');
                provider = 'claude';
            }

            logger.info(`Streaming from ${provider}`);

            // Execution
            if (provider === 'claude') {
                for await (const chunk of claudeService.streamMessage(message, conversationHistory as ClaudeMessage[], systemPromptWithRag)) {
                    yield { chunk, provider: 'claude' };
                }
            } else {
                for await (const chunk of ollamaService.streamChat(textMessage, conversationHistory as OllamaMessage[], this.config.ollamaModel, systemPromptWithRag)) {
                    yield { chunk, provider: 'ollama' };
                }
            }
        } catch (error) {
            logger.error('Error in AI streaming', { error });
            throw error;
        }
    }

    /**
     * Route to a specific provider
     */
    private async routeToProvider(
        provider: AIProvider,
        message: string | ClaudeContent,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
        systemPrompt?: string
    ): Promise<AIResponse> {
        if (provider === 'claude') {
            const response = await claudeService.sendMessage(
                message,
                conversationHistory as ClaudeMessage[],
                systemPrompt
            );
            const correctedContent = spellCheckService.correct(response.content);
            return {
                content: correctedContent,
                provider: 'claude',
                tokensUsed: response.tokensUsed,
                model: response.model,
            };
        } else if (provider === 'ollama') {
            const textContent = this.extractText(message);
            const response = await ollamaService.chat(
                textContent,
                conversationHistory as OllamaMessage[],
                this.config.ollamaModel,
                systemPrompt
            );
            const correctedContent = spellCheckService.correct(response.content);
            return {
                content: correctedContent,
                provider: 'ollama',
                tokensUsed: response.tokensGenerated,
                model: response.model,
            };
        } else if (provider === 'hybrid') {
            // Hybrid mode: Use Ollama for quick analysis, Claude for final response
            logger.info('Using hybrid mode');

            // Quick analysis with Ollama
            const textContent = this.extractText(message);
            const ollamaResponse = await ollamaService.chat(textContent, conversationHistory as OllamaMessage[]);

            // Enhance with Claude
            const originalText = this.extractText(message);

            let enhancedPrompt: string | ClaudeContent = `Basierend auf dieser Voranalyse, gib eine detaillierte und präzise Antwort:\n\nVoranalyse: ${ollamaResponse.content}\n\nUrsprüngliche Frage: ${originalText}`;

            if (Array.isArray(message)) {
                // Re-attach images if they exist
                const images = message.filter(m => m.type === 'image');
                if (images.length > 0) {
                    enhancedPrompt = [
                        ...images,
                        { type: 'text', text: enhancedPrompt as string }
                    ] as ClaudeContent;
                }
            }

            const claudeResponse = await claudeService.sendMessage(
                enhancedPrompt,
                conversationHistory as ClaudeMessage[]
            );

            const correctedContent = spellCheckService.correct(claudeResponse.content);
            return {
                content: correctedContent,
                provider: 'hybrid',
                tokensUsed: claudeResponse.tokensUsed,
                model: `hybrid (${ollamaResponse.model} + ${claudeResponse.model})`,
            };
        }

        throw new Error(`Invalid provider: ${provider}`);
    }

    /**
     * Get current router configuration
     */
    getConfig(): RouterConfig {
        return { ...this.config };
    }

    /**
     * Update router configuration
     */
    updateConfig(config: Partial<RouterConfig>): void {
        this.config = { ...this.config, ...config };

        // Sync Ollama model if updated
        if (config.ollamaModel) {
            ollamaService.setModel(config.ollamaModel);
        }

        this.saveSettings().catch(err => logger.error('Failed to persist config update', { err }));
        logger.info('Router configuration updated', this.config);
    }

    /**
     * Check availability of AI providers
     */
    async checkAvailability(): Promise<{ claude: boolean; ollama: boolean }> {
        const [claude, ollama] = await Promise.all([
            this.isClaudeAvailable(),
            ollamaService.isOllamaInstalled(),
        ]);

        return { claude, ollama };
    }

    /**
     * Check if Claude is available
     */
    private async isClaudeAvailable(): Promise<boolean> {
        try {
            // Just check if API key is set
            return !!process.env.ANTHROPIC_API_KEY;
        } catch {
            return false;
        }
    }
}

export const aiRouter = new AIRouter();
