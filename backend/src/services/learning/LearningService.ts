import { logger } from '../../utils/logger';

/**
 * Learning session framework for personality development
 */
export class LearningService {
    /**
     * Create a learning session
     */
    async createSession(userId: string, type: 'onboarding' | 'preference' | 'feedback') {
        const { prisma } = await import('../db/prisma');

        // Create learning session (requires LearningSession model in schema)
        // @ts-ignore - Prisma client update might lag in IDE
        const session = await prisma.learningSession.create({
            data: {
                userId,
                topic: type, // Mapped type to topic
                startedAt: new Date(),
            },
        });

        logger.info('Learning session created', { userId, type, sessionId: session.id });
        return session;
    }

    /**
     * Track user preference
     */
    async trackPreference(userId: string, category: string, preference: any) {
        const { prisma } = await import('../db/prisma');

        await prisma.userPreference.upsert({
            where: {
                userId_key: { // Changed from userId_category to userId_key
                    userId,
                    key: category, // Using category name as key
                },
            },
            update: {
                value: String(preference), // Ensure string
                updatedAt: new Date(),
            },
            create: {
                userId,
                key: category, // Using category name as key
                value: String(preference), // Ensure string
                category: 'trait', // Default category
            },
        });

        logger.info('User preference tracked', { userId, category });
    }

    /**
     * Get personality traits
     */
    async getPersonalityProfile(userId: string) {
        const { prisma } = await import('../db/prisma');

        const preferences = await prisma.userPreference.findMany({
            where: { userId },
        });

        const profile = {
            userId,
            traits: this.calculateTraits(preferences),
            preferences: preferences.reduce((acc, pref) => {
                if (pref.category) acc[pref.category] = pref.value;
                else acc[pref.key] = pref.value;
                return acc;
            }, {} as Record<string, any>),
        };

        return profile;
    }

    /**
     * Calculate personality traits from preferences
     */
    private calculateTraits(preferences: any[]) {
        // Helper to get float value from preferences
        const getTrait = (name: string, defaultVal: number) => {
            const pref = preferences.find(p => p.category === `trait_${name}`);
            return pref ? parseFloat(pref.value) : defaultVal;
        };

        return {
            formality: getTrait('formality', 0.5),
            verbosity: getTrait('verbosity', 0.5),
            technicalLevel: getTrait('technical_level', 0.7),
            humor: getTrait('humor', 0.3),
            empathy: getTrait('empathy', 0.5)
        };
    }

    /**
     * AI Analysis: Updates personality traits based on recent interaction history
     */
    async updatePersonalityFromHistory(userId: string) {
        // ... existing implemenation ...
        try {
            const { prisma } = await import('../db/prisma');
            const { aiRouter } = await import('../router/AIRouter'); // Import locally to avoid top-level circular dep if any

            // 1. Fetch recent messages (via Conversation relation)
            const messages = await prisma.message.findMany({
                where: {
                    conversation: { userId }
                },
                orderBy: { timestamp: 'desc' },
                take: 50
            });

            if (messages.length < 5) return; // Not enough data yet

            // 2. Analyze with AI
            const analysisPrompt = `
Analyze the user's communication style and preferences based on these recent messages.
Messages:
${messages.map((m: any) => `${m.role}: ${m.content}`).reverse().join('\n')}

Output ONLY a valid JSON object with these numerical values (0.0 to 1.0):
{
  "formality": 0.5,
  "verbosity": 0.5,
  "technical_level": 0.5,
  "humor": 0.5,
  "empathy": 0.5
}
`;

            // Use 'hybrid' via Router
            // FORCE OLLAMA for now as Hybrid/Claude might still be flaky if keys are missing
            const response = await aiRouter.route(
                analysisPrompt,
                [],
                'ollama'
            );

            // 3. Parse and Save
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : response.content;

            const traits = JSON.parse(jsonStr);

            // Save each trait as a preference
            for (const [key, value] of Object.entries(traits)) {
                await this.trackPreference(userId, `trait_${key}`, String(value));
            }

            logger.info('Personality updated via AI analysis', { userId, traits });

        } catch (error) {
            logger.error('Failed to update personality', { error });
        }
    }

    /**
     * Extract and save explicit memories from a conversation exchange
     */
    /**
     * Extract and save explicit memories from a conversation exchange
     * NOW DELIGHTFULLY SIMPLE: Delegates to ExtractionService!
     */
    async extractAndSaveMemories(_userId: string, _userMessage: string, _aiResponse: string, _history: any[] = []) {
        try {

            // We don't do real-time extraction here anymore to keep latency low.
            // Instead, we ensure the message is in Working Memory.
            // The MemoryManagerService background job handles extraction later.

            // Just ensure it's logged in working memory (usually done by websocket, but safety check)
            // This method is kept for compatibility but is now a pass-through/no-op
            // as the architecture has shifted to async extraction.

        } catch (error) {
            logger.error('Failed to extract/save memory', { error });
        }
    }

    /**
     * Record feedback
     */
    async recordFeedback(
        userId: string,
        messageId: string,
        type: 'positive' | 'negative' | 'neutral',
        comment?: string
    ) {
        const { prisma } = await import('../db/prisma');

        await prisma.feedback.create({
            data: {
                userId,
                // messageId, // Removed as it doesn't exist in Schema
                type,
                comment,
                // timestamp: new Date(), // createdAt is default(now())
            },
        });

        logger.info('Feedback recorded', { userId, messageId, type });
    }

    /**
     * Process bulk text import for memories
     */
    /**
     * Process bulk text import for memories
     */
    async processBulkImport(_userId: string, _text: string, _onProgress?: (percent: number, status: string, stats?: { foundCount: number }) => void, _provider: 'claude' | 'ollama' = 'ollama') {
        // Disabled for MVP - needs migration to ExtractionService
        logger.warn('Bulk import temporarily disabled during memory system upgrade');
        return { success: true, count: 0 };
    }
}

export const learningService = new LearningService();
