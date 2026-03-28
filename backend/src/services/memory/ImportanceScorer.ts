// Local definition to avoid import issues
export enum MemoryType {
    WORKING = 'working',
    SHORT_TERM = 'short_term',
    LONG_TERM = 'long_term',
    EPISODIC = 'episodic',
    SEMANTIC = 'semantic',
}
// import { logger } from '../../utils/logger';

/**
 * Importance Scoring Algorithm
 * Calculates importance of a memory based on various factors
 */
export class ImportanceScorer {
    /**
     * Calculate importance score for a message/memory
     */
    calculateImportance(data: {
        content: string;
        conversationContext?: string;
        messageRole?: string;
        hasCodeBlock?: boolean;
        hasQuestions?: boolean;
        containsKeywords?: string[];
        userFeedback?: 'positive' | 'negative' | 'neutral';
        isPartOfLongThread?: boolean;
    }): number {
        let score = 0.5; // Base score

        // Content length factor (longer = potentially more important)
        const contentLength = data.content.length;
        if (contentLength > 500) score += 0.1;
        if (contentLength > 1000) score += 0.1;

        // Code blocks are usually important
        if (data.hasCodeBlock) {
            score += 0.2;
        }

        // Questions often indicate important information
        if (data.hasQuestions) {
            score += 0.15;
        }

        // Keywords boost (e.g., "important", "remember", "don't forget")
        const importanceKeywords = [
            'wichtig',
            'merke',
            'vergiss nicht',
            'erinnere',
            'immer',
            'niemals',
            'remember',
            'important',
            'key',
            'critical',
        ];

        const lowerContent = data.content.toLowerCase();
        const keywordMatches = importanceKeywords.filter((kw) => lowerContent.includes(kw)).length;
        score += keywordMatches * 0.1;

        // User feedback
        if (data.userFeedback === 'positive') {
            score += 0.2;
        } else if (data.userFeedback === 'negative') {
            score -= 0.2;
        }

        // Part of long conversation thread
        if (data.isPartOfLongThread) {
            score += 0.1;
        }

        // Assistant responses to user's questions are important
        if (data.messageRole === 'assistant' && data.hasQuestions) {
            score += 0.15;
        }

        // Clamp between 0 and 1
        return Math.max(0, Math.min(1, score));
    }

    /**
     * Determine memory type based on content and context
     */
    determineMemoryType(data: {
        content: string;
        isFactual?: boolean;
        isPersonal?: boolean;
        isSkillRelated?: boolean;
        isEvent?: boolean;
    }): MemoryType {
        // Episodic: Personal events, conversations
        if (data.isEvent || data.isPersonal) {
            return MemoryType.EPISODIC;
        }

        // Semantic: Factual knowledge, skills, concepts
        if (data.isFactual || data.isSkillRelated) {
            return MemoryType.SEMANTIC;
        }

        // Check content for patterns
        const lowerContent = data.content.toLowerCase();

        // Factual/knowledge keywords -> Semantic
        const factualKeywords = [
            'definition',
            'bedeutet',
            'ist',
            'erkläre',
            'wie funktioniert',
            'was ist',
            'tutorial',
            'guide',
        ];
        if (factualKeywords.some((kw) => lowerContent.includes(kw))) {
            return MemoryType.SEMANTIC;
        }

        // Personal/event keywords -> Episodic
        const eventKeywords = ['ich habe', 'wir haben', 'gestern', 'heute', 'letzte woche', 'projekt'];
        if (eventKeywords.some((kw) => lowerContent.includes(kw))) {
            return MemoryType.EPISODIC;
        }

        // Default to short-term, will be promoted later if important
        return MemoryType.SHORT_TERM;
    }

    /**
     * Calculate decay rate for memory importance over time
     */
    calculateDecay(
        originalImportance: number,
        createdAt: Date,
        accessCount: number,
        type: MemoryType
    ): number {
        const now = new Date();
        const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

        let decayRate = 0;

        // Different decay rates for different memory types
        switch (type) {
            case MemoryType.WORKING:
                // Working memory decays fast (hours)
                decayRate = ageInDays * 0.5; // 50% per day
                break;

            case MemoryType.SHORT_TERM:
                // Short-term decays moderately (days)
                decayRate = ageInDays * 0.05; // 5% per day
                break;

            case MemoryType.LONG_TERM:
            case MemoryType.EPISODIC:
            case MemoryType.SEMANTIC:
                // Long-term decays slowly (months)
                decayRate = ageInDays * 0.001; // 0.1% per day
                break;
        }

        // Access count reduces decay (frequently accessed = more important)
        const accessBonus = Math.min(0.3, accessCount * 0.01);

        // Calculate new importance
        const newImportance = originalImportance - decayRate + accessBonus;

        return Math.max(0, Math.min(1, newImportance));
    }

    /**
     * Boost importance based on retrieval/usage
     */
    boostOnRetrieval(currentImportance: number, retrievalContext: {
        wasRelevant: boolean;
        wasUsedInResponse: boolean;
    }): number {
        let boost = 0;

        if (retrievalContext.wasRelevant) {
            boost += 0.05;
        }

        if (retrievalContext.wasUsedInResponse) {
            boost += 0.1;
        }

        return Math.max(0, Math.min(1, currentImportance + boost));
    }
}

export const importanceScorer = new ImportanceScorer();
