import { PrismaClient } from '@prisma/client';
import { workingMemoryService, WorkingMessage } from './WorkingMemoryService';
import { shortTermMemoryService } from './ShortTermMemoryService';
import { embeddingService } from './EmbeddingService';
import { socketService } from '../socket/SocketService';
import { logger } from '../../utils/logger';
import { finalScore, scoreBreakdown } from './MemoryScorer';
import { classifyIntent, IntentResult } from './IntentClassifier';
import { MemoryType, MEMORY_TYPE } from './MemoryTypes';

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

        // Memory 2.0: Intent-Klassifikation steuert, ob & welche Types wir laden
        const intent = classifyIntent(userMessage);
        logger.info(`[MemoryManager] Intent: ${intent.intent} (conf=${intent.confidence.toFixed(2)}, types=[${intent.preferredTypes.join(',')}], skipRetrieval=${intent.skipRetrieval})`);

        // 1. Working Memory (current conversation) - immer geladen
        const working = workingMemoryService.getHistory(sessionId);

        if (intent.skipRetrieval) {
            // Smalltalk → kein Memory-Dump
            return {
                workingMemory: working,
                shortTermContext: '',
                longTermContext: '',
                totalTokens: this.estimateTokens(working, '', ''),
            };
        }

        const { isPersonalQuery } = this.detectPersonalQuery(userMessage);

        // 2. Short-Term Memory (recent conversations) - nur wenn sinnvoll
        const shortTermResults = await shortTermMemoryService.searchRecent(
            userId,
            userMessage,
            isPersonalQuery ? 3 : 2,
        );
        const shortTermContext = this.buildShortTermContext(shortTermResults);

        // 3. Long-Term Memory via Composite-Score + Type-Routing + Hard-Cap 5
        const longTermResults = await this.searchLongTermV2(userMessage, intent);
        const longTermContext = this.buildLongTermContextV2(longTermResults);

        logger.info(`[MemoryManager] Retrieved ${longTermResults.length} long-term memories (cap=5)`);
        longTermResults.forEach((m: any, idx: number) => {
            logger.debug(`[MemoryManager] M${idx + 1}: ${m.type} score=${m.finalScore.toFixed(3)} sim=${(m.similarity || 0).toFixed(3)} - ${m.content.substring(0, 70)}`);
        });

        return {
            workingMemory: working,
            shortTermContext,
            longTermContext,
            totalTokens: this.estimateTokens(working, shortTermContext, longTermContext),
        };
    }

    /**
     * Memory 2.0 Retrieval:
     *   1. Vector-Search (breiter, low threshold) holt Kandidaten
     *   2. Type-Filter anhand Intent (preferredTypes)
     *   3. Composite-Score (Importance × 0.5 + Recency × 0.2 + Access × 0.2 + Relevance × 0.1)
     *   4. Hard-Cap auf TOP 5
     */
    private async searchLongTermV2(
        query: string,
        intent: IntentResult,
        hardCap: number = 5,
    ): Promise<any[]> {
        try {
            // Kandidaten-Pool: bewusst breit, damit der Composite-Score sortieren kann
            const vectorResults = await embeddingService.searchSimilar(query, 30, 0.25);
            if (vectorResults.length === 0) return [];

            const now = new Date();
            const ids = vectorResults.map(v => v.id);
            const entries = await prisma.memoryEntry.findMany({
                where: {
                    id: { in: ids },
                    isActive: true,
                    ...(intent.preferredTypes.length > 0 && intent.intent !== 'GENERIC_QUERY'
                        ? { type: { in: intent.preferredTypes as string[] } }
                        : {}),
                },
                include: { tags: true },
            });

            const bySimilarity = new Map(vectorResults.map(v => [v.id, v.similarity]));
            const scored = entries.map(e => {
                const similarity = bySimilarity.get(e.id) ?? 0;
                const finalSc = finalScore(e as any, { similarity, now });
                return {
                    ...e,
                    similarity,
                    finalScore: finalSc,
                    _breakdown: scoreBreakdown(e as any, { similarity, now }),
                };
            });

            scored.sort((a, b) => b.finalScore - a.finalScore);
            const top = scored.slice(0, hardCap);

            // Fallback: falls Type-Filter zu streng war und nichts kam → generisch erneut
            if (top.length === 0 && intent.intent !== 'GENERIC_QUERY') {
                return this.searchLongTermV2(query, { ...intent, preferredTypes: [], intent: 'GENERIC_QUERY' }, hardCap);
            }

            // Nach Abruf: accessCount + lastAccessedAt inkrementieren (async, fire-and-forget)
            for (const m of top) {
                prisma.memoryEntry.update({
                    where: { id: m.id },
                    data: { accessCount: { increment: 1 }, lastAccessedAt: now },
                }).catch(() => { /* non-critical */ });
            }

            return top;
        } catch (error) {
            logger.error('[MemoryManager] Long-term v2 search failed:', error);
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
     * Memory 2.0 Context-Builder:
     *   - Gruppiert nach Type (FACTS / PREFERENCES / CURRENT WORK / RECENT EPISODES / INSTRUCTIONS)
     *   - Max 5 Eintraege gesamt (kommt vom Retrieval-Cap)
     *   - Kompakter, weniger noisy Output fuer den System-Prompt
     */
    private buildLongTermContextV2(memories: any[]): string {
        if (memories.length === 0) return '';

        const groups: Record<MemoryType, string[]> = {
            FACT: [],
            PREFERENCE: [],
            PROJECT: [],
            EPISODIC: [],
            INSTRUCTION: [],
        };
        for (const m of memories) {
            const key = (m.type as MemoryType) in groups ? (m.type as MemoryType) : MEMORY_TYPE.FACT;
            groups[key].push(`- ${m.content}`);
        }

        const labels: Record<MemoryType, string> = {
            FACT: 'FAKTEN',
            PREFERENCE: 'VORLIEBEN',
            PROJECT: 'AKTUELLE PROJEKTE',
            EPISODIC: 'LETZTE EREIGNISSE',
            INSTRUCTION: 'SYSTEM-REGELN',
        };

        const sections: string[] = [];
        let tokens = 0;
        for (const type of Object.keys(groups) as MemoryType[]) {
            if (groups[type].length === 0) continue;
            const block = `${labels[type]}:\n${groups[type].join('\n')}`;
            const tks = this.estimateText(block);
            if (tokens + tks > this.TOKEN_BUDGET.longTerm) break;
            sections.push(block);
            tokens += tks;
        }

        if (sections.length === 0) return '';
        return sections.join('\n\n');
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

                    // Memory 2.0: Zusaetzlich EINE episodische Zusammenfassung pro Conversation
                    try {
                        const { episodeSummarizer } = await import('./EpisodeSummarizer');
                        await episodeSummarizer.persistEpisodeForConversation(conversation.id);
                    } catch (epErr) {
                        logger.warn(`[MemoryManager] Episode summary failed for ${conversation.id}`, { err: (epErr as Error).message });
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
