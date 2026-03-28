import { prisma } from '../db/prisma';
import { embeddingService } from './EmbeddingService';
import { logger } from '../../utils/logger';

export class RelationService {

    /**
     * Detect and create relations for a new memory entry
     */
    async detectRelations(newEntryId: string, content: string): Promise<void> {
        logger.info(`[RelationService] Detecting relations for memory ${newEntryId}...`);

        try {
            // 1. Find semantically similar memories
            const candidates = await embeddingService.searchSimilar(content, 5, 0.6); // 0.6 threshold

            if (candidates.length === 0) {
                logger.debug('[RelationService] No candidates found.');
                return;
            }

            // Filter out self
            const relatedIds = candidates
                .filter(c => c.id !== newEntryId)
                .map(c => c.id);

            if (relatedIds.length === 0) return;

            // 2. Create Relations
            // Ideally, we ask LLM to classify type (RELATED_TO, CONTRADICTS, etc.)
            // For now, we assume RELATED_TO based on high similarity to verify the pipeline.
            // TODO: Add LLM step here for precision.

            let createdCount = 0;

            for (const candidate of candidates) {
                if (candidate.id === newEntryId) continue;

                // Fix: Verify target exists in DB (orphaned vector cleanup)
                const targetExists = await prisma.memoryEntry.findUnique({ where: { id: candidate.id } });
                if (!targetExists) {
                    logger.warn(`[RelationService] Skipping orphaned vector relation to ${candidate.id}`);
                    continue;
                }

                // Check if relation already exists
                const existing = await prisma.memoryRelation.findFirst({
                    where: {
                        OR: [
                            { fromId: newEntryId, toId: candidate.id },
                            { fromId: candidate.id, toId: newEntryId }
                        ]
                    }
                });

                if (!existing) {
                    await prisma.memoryRelation.create({
                        data: {
                            fromId: newEntryId,
                            toId: candidate.id,
                            type: 'RELATED_TO', // Default for semantic match
                            strength: candidate.similarity
                        }
                    });
                    createdCount++;
                }
            }

            logger.info(`[RelationService] Created ${createdCount} new relations for ${newEntryId}`);

        } catch (error) {
            logger.error('[RelationService] Failed to detect relations:', error);
        }
    }

    /**
     * Get related memories for a list of IDs
     */
    async getRelatedMemories(memoryIds: string[]): Promise<any[]> {
        const relations = await prisma.memoryRelation.findMany({
            where: {
                OR: [
                    { fromId: { in: memoryIds } },
                    { toId: { in: memoryIds } }
                ]
            },
            include: {
                from: true,
                to: true
            },
            take: 10
        });

        // Flatten results
        const relatedMemories = relations.map(r => {
            const isFrom = memoryIds.includes(r.fromId);
            return isFrom ? r.to : r.from;
        });

        // Deduplicate
        return Array.from(new Set(relatedMemories.map(m => m.id)))
            .map(id => relatedMemories.find(m => m.id === id));
    }
}

export const relationService = new RelationService();
