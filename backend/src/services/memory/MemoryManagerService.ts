import { PrismaClient } from '@prisma/client';
import { workingMemoryService, WorkingMessage } from './WorkingMemoryService';
import { shortTermMemoryService } from './ShortTermMemoryService';
import { embeddingService } from './EmbeddingService';
import { socketService } from '../socket/SocketService';
import { logger } from '../../utils/logger';

const prisma = new PrismaClient();

/**
 * MemoryManagerService - Central coordinator for all memory layers
 * 
 * Orchestrates retrieval across:
 * - Working Memory (current session)
 * - Short-Term Memory (last 48h)
 * - Long-Term Memory (permanent storage)
 */

export interface MemoryContext {
    workingMemory: WorkingMessage[];
    shortTermContext: string;
    longTermContext: string;
    totalTokens: number;
}

export class MemoryManagerService {
    private TOKEN_BUDGET = {
        working: 2000,
        shortTerm: 1000,
        longTerm: 2000
    };
    
    constructor() {
        logger.info('[MemoryManager] Initialized');
    }

    /**
     * Detect if a query is about personal information (triggers broader memory search)
     */
    private detectPersonalQuery(userMessage: string): {
        isPersonalQuery: boolean;
    } {
        const normalizedQuery = userMessage.toLowerCase().trim();

        const personalPatterns = [
            /was weißt du über mich/i,
            /was weisst du über mich/i,
            /wer bin ich/i,
            /kennst du mich/i,
            /was hast du.*über mich.*gespeichert/i,
            /meine? (?:daten|infos|informationen|profil)/i,
            /wie alt|geburtstag|geboren/i,
            /(?:ueber|about) mich/i,
        ];

        const isPersonalQuery = personalPatterns.some(p => p.test(normalizedQuery));

        if (isPersonalQuery) {
            logger.info(`[MemoryManager] Personal query detected: "${userMessage}"`);
        }

        return { isPersonalQuery };
    }

    async getRelevantContext(
        sessionId: string,
        userId: string,
        userMessage: string
    ): Promise<MemoryContext> {
        logger.info(`[MemoryManager] Getting context for user: ${userId}, message: ${userMessage.substring(0, 50)}...`);

        const { isPersonalQuery } = this.detectPersonalQuery(userMessage);

        // 1. Working Memory (current conversation)
        const working = workingMemoryService.getHistory(sessionId);

        // 2. Short-Term Memory (recent conversations)
        const shortTermResults = await shortTermMemoryService.searchRecent(
            userId,
            userMessage,
            isPersonalQuery ? 5 : 3
        );
        const shortTermContext = this.buildShortTermContext(shortTermResults);

        // 3. Long-Term Memory (semantic search via embeddings)
        const longTermResults = await this.searchLongTerm(
            userMessage,
            isPersonalQuery ? 15 : 10,
            isPersonalQuery ? 0.35 : 0.4,
            false
        );

        const longTermContext = this.buildLongTermContext(longTermResults);

        logger.info(`[MemoryManager] Retrieved ${longTermResults.length} long-term memories`);
        longTermResults.forEach((memory, idx) => {
            logger.debug(`[MemoryManager] Memory ${idx + 1}: ${memory.type} (${memory.similarity?.toFixed(4) || '?'}) - ${memory.content.substring(0, 80)}`);
        });

        return {
            workingMemory: working,
            shortTermContext,
            longTermContext,
            totalTokens: this.estimateTokens(working, shortTermContext, longTermContext)
        };
    }

    /**
     * Search long-term memory using semantic similarity
     */
    private async searchLongTerm(query: string, limit: number = 10, threshold: number = 0.4, _boostCriticalTags = false) {
        try {
            const vectorResults = await embeddingService.searchSimilar(query, limit, threshold);

            // Fetch full memory entries
            const memories = await Promise.all(
                vectorResults.map(async (result) => {
                    const entry = await prisma.memoryEntry.findUnique({
                        where: { id: result.id },
                        include: { tags: true }
                    });

                    if (entry && entry.isActive) {
                        return { ...entry, similarity: result.similarity };
                    }
                    return null;
                })
            );

            const filtered = memories
                .filter(m => m !== null)
                .sort((a, b) => (b?.similarity || 0) - (a?.similarity || 0));

            logger.info(`[MemoryManager] Retrieved ${filtered.length} memories (from ${vectorResults.length} vector results)`);
            return filtered;
        } catch (error) {
            logger.error('[MemoryManager] Long-term search failed:', error);
            return [];
        }
    }

    /**
     * Build context string from short-term conversations
     */
    private buildShortTermContext(conversations: any[]): string {
        if (conversations.length === 0) return '';

        const chunks: string[] = [];
        let tokens = 0;

        for (const conv of conversations) {
            const summary = conv.summary || this.summarizeConversation(conv.messages);
            const chunk = `[${this.formatDate(conv.createdAt)}] ${summary}`;
            const chunkTokens = this.estimateText(chunk);

            if (tokens + chunkTokens > this.TOKEN_BUDGET.shortTerm) break;

            chunks.push(chunk);
            tokens += chunkTokens;
        }

        return chunks.length > 0
            ? `Kürzliche Konversationen:\n${chunks.join('\n')}`
            : '';
    }

    /**
     * Build context string from long-term memories with improved formatting
     */
    private buildLongTermContext(memories: any[]): string {
        if (memories.length === 0) return '';

        const chunks: string[] = [];
        let tokens = 0;

        // Sort by similarity score
        const sorted = [...memories].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

        for (const memory of sorted) {
            const text = memory.content;
            const chunk = `- [${memory.type}] ${text}`;
            const chunkTokens = this.estimateText(chunk);

            if (tokens + chunkTokens > this.TOKEN_BUDGET.longTerm) break;

            chunks.push(chunk);
            tokens += chunkTokens;
        }

        return chunks.length > 0
            ? `Gespeicherte Erinnerungen ueber den Nutzer:\n${chunks.join('\n')}`
            : '';
    }

    /**
     * Summarize conversation (simple heuristic)
     */
    private summarizeConversation(messages: any[]): string {
        const firstUser = messages.find((m: any) => m.role === 'user');
        if (!firstUser) return 'Konversation';

        const text = firstUser.content.substring(0, 80);
        return text.length < firstUser.content.length ? `${text}...` : text;
    }

    /**
     * Format date for context
     */
    private formatDate(date: Date | string): string {
        const d = new Date(date);
        const now = new Date();
        const diffHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));

        if (diffHours < 1) return 'vor Kurzem';
        if (diffHours < 24) return `vor ${diffHours}h`;
        if (diffHours < 48) return 'gestern';
        return `vor ${Math.floor(diffHours / 24)} Tagen`;
    }

    /**
     * Estimate tokens (simple heuristic: ~4 chars per token)
     */
    private estimateText(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Estimate total tokens
     */
    private estimateTokens(
        working: WorkingMessage[],
        shortTerm: string,
        longTerm: string
    ): number {
        const workingText = working.map(m => m.content).join(' ');
        return (
            this.estimateText(workingText) +
            this.estimateText(shortTerm) +
            this.estimateText(longTerm)
        );
    }

    /**
     * Save conversation and extract memories (called when session ends)
     */
    async processEndedSession(sessionId: string, userId: string): Promise<void> {
        try {
            const session = workingMemoryService.endSession(sessionId);
            if (!session) {
                console.warn(`[MemoryManager] Session not found: ${sessionId}`);
                return;
            }

            // Save to short-term memory
            const conversationId = await shortTermMemoryService.saveConversation(
                userId,
                sessionId,
                session.messages.map(m => ({
                    role: m.role,
                    content: m.content,
                    timestamp: m.timestamp
                }))
            );

            console.log(`[MemoryManager] Session ${sessionId} saved as conversation ${conversationId}`);

            // Trigger extraction immediately
            this.runExtractionJob().catch(err =>
                console.error('[MemoryManager] Post-session extraction failed:', err)
            );
        } catch (error) {
            console.error('[MemoryManager] Failed to process ended session:', error);
        }
    }

    /**
     * Check if active session needs extraction
     */
    async checkAutoExtraction(sessionId: string, userId: string): Promise<void> {
        try {
            const history = workingMemoryService.getHistory(sessionId);

            // Extract every 5 messages
            if (history.length > 0 && history.length % 5 === 0) {
                console.log(`[MemoryManager] Auto-extraction triggered for session ${sessionId} (${history.length} msgs)`);

                const { extractionService } = await import('./ExtractionService');

                // Ensure conversation exists in DB to link memories
                const conversationId = await shortTermMemoryService.ensureActiveConversation(userId, sessionId);

                // Extract from current buffer
                const memories = await extractionService.extractMemories({
                    id: conversationId,
                    messages: history.map(m => ({
                        role: m.role,
                        content: m.content
                    }))
                });

                if (memories.length > 0) {
                    await extractionService.saveMemories(userId, conversationId, memories);
                    console.log(`[MemoryManager] Auto-extracted ${memories.length} memories from active session`);

                    // Notify frontend to reload memories
                    socketService.emit('memories-updated', {
                        count: memories.length,
                        source: 'auto-extraction'
                    });
                }
            }
        } catch (error) {
            console.error('[MemoryManager] Auto-extraction failed:', error);
        }
    }

    /**
     * Extract memories from unprocessed conversations (background job)
     */
    async runExtractionJob(): Promise<{ processed: number, skipped: number, errors: number }> {
        const stats = { processed: 0, skipped: 0, errors: 0 };
        try {
            const unprocessed = await shortTermMemoryService.getUnprocessedConversations(10);

            if (unprocessed.length === 0) {
                console.log('[MemoryManager] No unprocessed conversations found');
                return stats;
            }

            console.log(`[MemoryManager] Processing ${unprocessed.length} conversations...`);

            const { extractionService } = await import('./ExtractionService');

            for (const [index, conversation] of unprocessed.entries()) {
                const progress = {
                    processed: index + 1,
                    total: unprocessed.length,
                    currentStep: `Extrahiere aus Konversation ${conversation.id.substring(0, 8)}...`
                };

                // Emit progress
                socketService.emit('memory-extraction-progress', progress);

                try {
                    // Extract memories

                    // Add timeout race
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Extraction timed out after 30s')), 30000)
                    );

                    const memories = await Promise.race([
                        extractionService.extractMemories({
                            id: conversation.id,
                            messages: conversation.messages
                        }),
                        timeoutPromise
                    ]) as any;

                    if (memories.length > 0) {
                        // Save to long-term memory
                        await extractionService.saveMemories(
                            conversation.userId,
                            conversation.id,
                            memories
                        );
                        stats.processed++;
                    } else {
                        stats.skipped++;
                    }

                    // Mark as processed
                    await shortTermMemoryService.markAsProcessed(conversation.id);
                } catch (error) {
                    logger.error(`[MemoryManager] Failed to extract from ${conversation.id}:`, error);
                    stats.errors++;
                }
            }
            logger.info(`[MemoryManager] Job finished:`, stats);
            return stats;
        } catch (error) {
            console.error('[MemoryManager] Extraction job failed:', error);
            throw error;
        }
    }

    /**
     * Get statistics for dashboard
     */
    async getStats(userId: string) {
        try {
            const shortTermStats = await shortTermMemoryService.getStats(userId);
            const longTermCount = await prisma.memoryEntry.count({
                where: { userId, isActive: true }
            });
            const episodeCount = await prisma.episode.count({ where: { userId } });

            return {
                shortTerm: shortTermStats,
                longTerm: { total: longTermCount },
                episodic: { total: episodeCount },
                working: {
                    activeSessions: workingMemoryService.getActiveSessions().length
                }
            };
        } catch (error) {
            console.error('[MemoryManager] Failed to get stats:', error);
            return null;
        }
    }

    /**
     * Delete a specific memory by ID
     */
    async deleteMemory(memoryId: string): Promise<void> {
        try {
            // Delete from vector store
            await embeddingService.deleteEmbedding(memoryId);

            // Delete from database
            await prisma.memoryEntry.delete({ where: { id: memoryId } });

            logger.info(`[MemoryManager] Deleted memory ${memoryId}`);
        } catch (error) {
            logger.error('[MemoryManager] Failed to delete memory:', error);
            throw error;
        }
    }

    /**
     * Delete memories by filter criteria
     */
    async deleteMemoriesByFilter(userId: string, filter: {
        minImportance?: number;
        maxImportance?: number;
        types?: string[];
        tags?: string[];
        excludeTags?: string[];
    }): Promise<number> {
        try {
            const where: any = { userId, isActive: true };

            if (filter.minImportance !== undefined || filter.maxImportance !== undefined) {
                where.importanceScore = {};
                if (filter.minImportance !== undefined) where.importanceScore.gte = filter.minImportance;
                if (filter.maxImportance !== undefined) where.importanceScore.lte = filter.maxImportance;
            }

            if (filter.types && filter.types.length > 0) {
                where.type = { in: filter.types };
            }

            if (filter.tags && filter.tags.length > 0) {
                where.tags = { some: { name: { in: filter.tags } } };
            }

            if (filter.excludeTags && filter.excludeTags.length > 0) {
                where.tags = { none: { name: { in: filter.excludeTags } } };
            }

            const toDelete = await prisma.memoryEntry.findMany({ where, select: { id: true } });

            for (const mem of toDelete) {
                await embeddingService.deleteEmbedding(mem.id);
            }

            const result = await prisma.memoryEntry.deleteMany({ where });

            logger.info(`[MemoryManager] Deleted ${result.count} memories by filter`);
            return result.count;
        } catch (error) {
            logger.error('[MemoryManager] Failed to delete memories by filter:', error);
            throw error;
        }
    }

    /**
     * Clear all memories (for reset)
     */
    async clearAll(userId: string): Promise<void> {
        try {
            // Clear working memory
            workingMemoryService.clearAll();

            // Clear embeddings
            await embeddingService.clearAll();

            // Clear long-term memories
            await prisma.memoryEntry.deleteMany({ where: { userId } });
            await prisma.episode.deleteMany({ where: { userId } });
            await prisma.knowledgeEntry.deleteMany({ where: { userId } });

            // Clear short-term conversations
            await prisma.conversation.deleteMany({ where: { userId } });

            console.log(`[MemoryManager] All memories cleared for user ${userId}`);
        } catch (error) {
            console.error('[MemoryManager] Failed to clear memories:', error);
            throw error;
        }
    }
}

// Singleton instance
export const memoryManagerService = new MemoryManagerService();
