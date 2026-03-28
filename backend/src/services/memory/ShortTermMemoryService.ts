import { PrismaClient } from '@prisma/client';

/**
 * ShortTermMemoryService - Conversation persistence (Layer 2)
 * 
 * Stores completed conversations in SQLite.
 * Background job cleans up conversations older than 48h.
 */

const prisma = new PrismaClient();

export interface ConversationSummary {
    id: string;
    sessionId: string;
    messageCount: number;
    startTime: Date;
    endTime: Date | null;
    importanceScore: number;
}

export class ShortTermMemoryService {
    private cleanupIntervalMs: number = 6 * 60 * 60 * 1000; // 6 hours
    private retentionHours: number = 48;

    constructor() {
        // Start background cleanup job
        setInterval(() => this.cleanupOldConversations(), this.cleanupIntervalMs);
        console.log('[ShortTermMemory] Cleanup job scheduled (every 6 hours)');
    }

    /**
     * Save conversation to database when session ends
     */
    async saveConversation(
        userId: string,
        sessionId: string,
        messages: Array<{ role: string; content: string; timestamp: Date; modelUsed?: string }>,
        summary?: string
    ): Promise<string> {
        try {
            // Check if conversation already exists (from auto-extraction)
            const existing = await prisma.conversation.findFirst({
                where: { sessionId }
            });

            if (existing) {
                // Update existing conversation
                const updated = await prisma.conversation.update({
                    where: { id: existing.id },
                    data: {
                        title: existing.title === 'Active Session' ? this.generateTitle(messages) : existing.title,
                        summary: summary || null,
                        endedAt: new Date(),
                        // Messages might be partially there if we supported incremental save, 
                        // but currently we blindly save all messages from WorkingMemory at end.
                        // Ideally we should wipe and replace, or only add new?
                        // For simplicity/robustness, we deleted them in 'create' via relation? No.
                        // Let's delete existing messages for this conversation and re-save all to be sure we have the full correct order/content
                        // valid for this architecture
                        messages: {
                            deleteMany: {},
                            create: messages.map(msg => ({
                                role: msg.role,
                                content: msg.content,
                                timestamp: msg.timestamp,
                                modelUsed: msg.modelUsed || null
                            }))
                        }
                    }
                });
                console.log(`[ShortTermMemory] Conversation updated: ${updated.id} (${messages.length} messages)`);
                return updated.id;
            } else {
                // Create new conversation
                const conversation = await prisma.conversation.create({
                    data: {
                        userId,
                        sessionId,
                        title: this.generateTitle(messages),
                        type: 'chat',
                        summary: summary || null,
                        importanceScore: 0.5,
                        endedAt: new Date(),
                        messages: {
                            create: messages.map(msg => ({
                                role: msg.role,
                                content: msg.content,
                                timestamp: msg.timestamp,
                                modelUsed: msg.modelUsed || null
                            }))
                        }
                    }
                });
                console.log(`[ShortTermMemory] Conversation saved: ${conversation.id} (${messages.length} messages)`);
                return conversation.id;
            }
        } catch (error) {
            console.error('[ShortTermMemory] Failed to save conversation:', error);
            throw error;
        }
    }

    /**
     * Ensure an active conversation record exists
     */
    async ensureActiveConversation(userId: string, sessionId: string): Promise<string> {
        try {
            const existing = await prisma.conversation.findFirst({
                where: { sessionId }
            });

            if (existing) return existing.id;

            const newConv = await prisma.conversation.create({
                data: {
                    userId,
                    sessionId,
                    title: 'Active Session', // Temporary title
                    type: 'chat',
                    endedAt: null, // Active
                    processed: false
                }
            });
            console.log(`[ShortTermMemory] Active conversation created: ${newConv.id}`);
            return newConv.id;
        } catch (error) {
            console.error('[ShortTermMemory] Failed to ensure active conversation:', error);
            throw new Error('Could not create active conversation');
        }
    }

    /**
     * Get conversation by ID
     */
    async getConversation(conversationId: string) {
        try {
            return await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: { messages: true }
            });
        } catch (error) {
            console.error('[ShortTermMemory] Failed to get conversation:', error);
            return null;
        }
    }

    /**
     * Search recent conversations (last 48h)
     */
    async searchRecent(userId: string, query: string, limit: number = 5) {
        try {
            const cutoffDate = new Date(Date.now() - this.retentionHours * 60 * 60 * 1000);

            return await prisma.conversation.findMany({
                where: {
                    userId,
                    createdAt: { gte: cutoffDate },
                    OR: [
                        { title: { contains: query } },
                        { summary: { contains: query } }
                    ]
                },
                include: {
                    messages: {
                        orderBy: { timestamp: 'asc' }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit
            });
        } catch (error) {
            console.error('[ShortTermMemory] Search failed:', error);
            return [];
        }
    }

    /**
     * Get unprocessed conversations (for extraction)
     */
    async getUnprocessedConversations(limit: number = 10) {
        try {
            return await prisma.conversation.findMany({
                where: {
                    processed: false,
                    // createdAt: { lt: cutoffDate } // REMOVED: We want to process NEW conversations too!
                },
                include: {
                    messages: {
                        orderBy: { timestamp: 'asc' }
                    }
                },
                take: limit
            });
        } catch (error) {
            console.error('[ShortTermMemory] Failed to get unprocessed conversations:', error);
            return [];
        }
    }

    /**
     * Mark conversation as processed
     */
    async markAsProcessed(conversationId: string): Promise<void> {
        try {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { processed: true }
            });
        } catch (error) {
            console.error('[ShortTermMemory] Failed to mark as processed:', error);
        }
    }

    /**
     * Background cleanup - remove old processed conversations
     */
    private async cleanupOldConversations(): Promise<void> {
        try {
            const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days for processed

            const result = await prisma.conversation.deleteMany({
                where: {
                    processed: true,
                    createdAt: { lt: cutoffDate }
                }
            });

            if (result.count > 0) {
                console.log(`[ShortTermMemory] Cleaned up ${result.count} old conversations`);
            }
        } catch (error) {
            console.error('[ShortTermMemory] Cleanup failed:', error);
        }
    }

    /**
     * Generate conversation title from first user message
     */
    private generateTitle(messages: Array<{ role: string; content: string }>): string {
        const firstUserMessage = messages.find(m => m.role === 'user');
        if (!firstUserMessage) return 'Untitled Conversation';

        const title = firstUserMessage.content.substring(0, 50);
        return title.length < firstUserMessage.content.length ? `${title}...` : title;
    }

    /**
     * Get statistics
     */
    async getStats(userId: string) {
        try {
            const total = await prisma.conversation.count({ where: { userId } });
            const unprocessed = await prisma.conversation.count({
                where: { userId, processed: false }
            });
            const recent = await prisma.conversation.count({
                where: {
                    userId,
                    createdAt: { gte: new Date(Date.now() - this.retentionHours * 60 * 60 * 1000) }
                }
            });

            return { total, unprocessed, recent };
        } catch (error) {
            console.error('[ShortTermMemory] Failed to get stats:', error);
            return { total: 0, unprocessed: 0, recent: 0 };
        }
    }
}

// Singleton instance
export const shortTermMemoryService = new ShortTermMemoryService();
