import { logger } from '../../utils/logger';
import { prisma } from '../db/prisma';

export interface InterviewQuestion {
    id: string;
    stage: string;
    text: string;
    number: number;
    total: number;
    isStageEnd: boolean;
}

// Complete question catalog
const INTERVIEW_QUESTIONS = [
    // Stage 1: Personal Basics
    { id: 'name', stage: 'basics', text: 'Wie heißt du?' },
    { id: 'age', stage: 'basics', text: 'Wie alt bist du ungefähr?' },
    { id: 'birthdate', stage: 'basics', text: 'Wann hast du Geburtstag? (Tag.Monat.Jahr)' },
    { id: 'birthplace', stage: 'basics', text: 'Wo bist du geboren?' },
    { id: 'location', stage: 'basics', text: 'Wo wohnst du aktuell?' },

    // Stage 2: Context & Daily Life
    { id: 'work', stage: 'context', text: 'Was machst du beruflich oder studierst du?' },
    { id: 'living', stage: 'context', text: 'Wohnst du alleine, mit Familie oder in einer WG?' },
    { id: 'rhythm', stage: 'context', text: 'Hast du feste Arbeitszeiten oder Schichten?' },

    // Stage 3: Interests (Active)
    { id: 'projects', stage: 'interests', text: 'An welchen Projekten arbeitest du gerade?' },
    { id: 'creation', stage: 'interests', text: 'Was erschaffst oder entwickelst du gerne?' },

    // Stage 4: Interests (Passive)
    { id: 'relaxation', stage: 'interests', text: 'Was machst du gerne zur Entspannung?' },
    { id: 'media_passive', stage: 'interests', text: 'Was schaust oder hörst du, wenn du abschalten willst?' },

    // Stage 5: Preferences & Goals
    { id: 'favorites', stage: 'preferences', text: 'Was ist deine Lieblings-Musik, Film oder Serie?' },
    { id: 'atmosphere', stage: 'preferences', text: 'Welche Atmosphäre magst du? Gemütlich, minimalistisch oder eher chaotisch-kreativ?' },
    { id: 'goals_short', stage: 'preferences', text: 'Was willst du kurzfristig erreichen? In den nächsten Wochen oder Monaten?' },
    { id: 'goals_long', stage: 'preferences', text: 'Was sind deine langfristigen Träume oder Ziele?' },
];

/**
 * Simple Interview Service with DB Persistence
 */
export class SimpleInterviewService {

    /**
     * Mark a question as answered and persist to memory
     */
    /**
     * Mark a question as answered and persist to memory
     * Handles updates by de-activating old answers to the same question
     */
    async markQuestionAnswered(userId: string, questionId: string, answer: string): Promise<void> {
        // Persist to Long-Term Memory
        try {
            const { embeddingService } = await import('../memory/EmbeddingService');
            const { relationService } = await import('../memory/RelationService');

            // Map question ID to memory type
            let type = 'FACT';
            if (['projects', 'creation'].includes(questionId)) type = 'PROJECT';
            if (['favorites', 'atmosphere', 'relaxation', 'media_passive'].includes(questionId)) type = 'PREFERENCE';
            if (['goals_short', 'goals_long'].includes(questionId)) type = 'GOAL';
            if (['birthdate', 'birthplace'].includes(questionId)) type = 'FACT';

            const content = `Interview (${questionId}): ${answer}`;
            const tagName = `interview:${questionId}`;

            // Deactivate old answers for this question (using tags)
            const oldEntries = await prisma.memoryEntry.findMany({
                where: {
                    userId,
                    isActive: true,
                    tags: { some: { name: tagName } }
                },
                select: { id: true }
            });

            if (oldEntries.length > 0) {
                await prisma.memoryEntry.updateMany({
                    where: { id: { in: oldEntries.map(e => e.id) } },
                    data: { isActive: false }
                });
            }

            // Create Entry (without sourceExtractionId to avoid FK violation)
            const entry = await prisma.memoryEntry.create({
                data: {
                    userId,
                    type: type as any,
                    content,
                    importanceScore: 1.0,
                    isActive: true
                }
            });

            // Add Tag for retrieval
            try {
                let tag = await prisma.memoryTag.findUnique({ where: { name: tagName } });
                if (!tag) {
                    tag = await prisma.memoryTag.create({ data: { name: tagName } });
                }

                await prisma.memoryEntry.update({
                    where: { id: entry.id },
                    data: {
                        tags: {
                            connect: { id: tag.id }
                        }
                    }
                });
            } catch (tagError) {
                logger.warn('Failed to tag interview memory', { error: tagError });
            }

            // Generate Embedding (Safe Mode - don't fail save if this fails)
            try {
                const embedding = await embeddingService.embed(content);
                await embeddingService.storeEmbedding(entry.id, embedding);

                // Detect Relations
                await relationService.detectRelations(entry.id, content);
            } catch (aiError) {
                logger.warn(`[Interview] Failed to generate embedding/relations for ${entry.id} (saved anyway)`, aiError);
            }

            logger.info(`[Interview] Persisted answer for ${questionId} as memory ${entry.id}`);

        } catch (error) {
            logger.error(`[Interview] Failed to persist answer for ${questionId}`, error);
            throw error; // Propagate error to API
        }
    }

    /**
     * Get the next unanswered question based on DB state
     */
    async getNextQuestion(userId: string): Promise<InterviewQuestion | null> {
        const answeredIds = await this.getAnsweredQuestionIds(userId);

        logger.debug('Interview state (DB)', { userId, answeredCount: answeredIds.size, total: INTERVIEW_QUESTIONS.length });

        // Find next unanswered question
        for (let i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
            const question = INTERVIEW_QUESTIONS[i];

            if (!answeredIds.has(question.id)) {
                // Check if this is the end of a stage
                const isStageEnd =
                    i + 1 >= INTERVIEW_QUESTIONS.length || // Last question overall
                    INTERVIEW_QUESTIONS[i + 1].stage !== question.stage; // Different stage next

                return {
                    ...question,
                    number: i + 1,
                    total: INTERVIEW_QUESTIONS.length,
                    isStageEnd,
                };
            }
        }

        // All questions answered
        return null;
    }

    /**
     * Get set of answered question IDs from DB via Tags
     */
    private async getAnsweredQuestionIds(userId: string): Promise<Set<string>> {
        const entries = await prisma.memoryEntry.findMany({
            where: {
                userId,
                isActive: true,
                tags: {
                    some: {
                        name: { startsWith: 'interview:' }
                    }
                }
            },
            include: {
                tags: true
            }
        });

        const ids = new Set<string>();
        for (const entry of entries) {
            for (const tag of entry.tags) {
                if (tag.name.startsWith('interview:')) {
                    const id = tag.name.split(':')[1];
                    if (id) ids.add(id);
                }
            }
        }
        return ids;
    }

    /**
     * Get interview progress
     */
    async getProgress(userId: string): Promise<{ current: number; total: number; percentage: number }> {
        const answeredIds = await this.getAnsweredQuestionIds(userId);

        return {
            current: answeredIds.size,
            total: INTERVIEW_QUESTIONS.length,
            percentage: Math.round((answeredIds.size / INTERVIEW_QUESTIONS.length) * 100),
        };
    }

    /**
     * Reset interview (Delete interview memories via Tags)
     */
    async resetInterview(userId: string): Promise<void> {
        try {
            // Find entries via tags
            const entries = await prisma.memoryEntry.findMany({
                where: {
                    userId,
                    tags: {
                        some: { name: { startsWith: 'interview:' } }
                    }
                },
                select: { id: true }
            });

            if (entries.length > 0) {
                await prisma.memoryEntry.deleteMany({
                    where: {
                        id: { in: entries.map(e => e.id) }
                    }
                });
            }
            logger.info('Interview reset (DB cleared using tags)', { userId, count: entries.length });
        } catch (error) {
            logger.error('Failed to reset interview', error);
        }
    }

    /**
     * Start interview session (Logic handled in websocket, this is just a helper/noop now)
     */
    startInterview(userId: string): void {
        logger.info('Interview started signal', { userId });
    }

    /**
     * Get full catalog
     */
    getQuestions() {
        return INTERVIEW_QUESTIONS;
    }
}

export const simpleInterviewService = new SimpleInterviewService();

