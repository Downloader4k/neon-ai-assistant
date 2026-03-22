import { chromaService } from '../chroma/ChromaService';
import { embeddingService } from '../embeddings/EmbeddingService';
import { prisma } from '../db/prisma';
import { logger } from '../../utils/logger';

export interface SearchResult {
    messageId: string;
    content: string;
    similarity: number;
    metadata: {
        conversationId: string;
        role: string;
        timestamp: Date;
        modelUsed?: string;
    };
}

export class SemanticSearchService {
    /**
     * Initialize services
     */
    async initialize(): Promise<void> {
        try {
            await Promise.all([
                chromaService.initialize(),
                embeddingService.initialize(),
            ]);

            logger.info('Semantic search service initialized');
        } catch (error) {
            logger.error('Error initializing semantic search service', { error });
            throw error;
        }
    }

    /**
     * Add a message to the semantic search index
     */
    async indexMessage(messageId: string, content: string, metadata: Record<string, any>): Promise<void> {
        try {
            // Generate embedding
            const embedding = await embeddingService.generateEmbedding(content);

            // Store in ChromaDB
            await chromaService.addMessage(messageId, content, embedding, metadata);

            logger.debug('Message indexed for semantic search', { messageId });
        } catch (error) {
            logger.error('Error indexing message', { error, messageId });
            // Don't throw - indexing failures shouldn't break the main flow
        }
    }

    /**
     * Search for similar messages
     */
    async search(
        query: string,
        limit: number = 10,
        conversationId?: string
    ): Promise<SearchResult[]> {
        try {
            // Generate query embedding
            const queryEmbedding = await embeddingService.generateEmbedding(query);

            // Build filter
            const filter = conversationId ? { conversationId } : undefined;

            // Search in ChromaDB
            const results = await chromaService.searchSimilar(queryEmbedding, limit, filter);

            // Transform results
            const searchResults: SearchResult[] = results.ids.map((id, index) => ({
                messageId: id,
                content: results.documents[index],
                similarity: Math.max(0, Math.min(1, 1 / (1 + results.distances[index]))), // Normalize distance to 0-1 similarity
                metadata: results.metadatas[index] as any,
            }));

            logger.info('Semantic search completed', {
                query: query.slice(0, 50),
                results: searchResults.length,
            });

            return searchResults;
        } catch (error) {
            logger.error('Error performing semantic search', { error, query });
            return [];
        }
    }

    /**
     * Get related messages for context enhancement
     */
    async getRelatedMessages(
        messageContent: string,
        conversationId: string,
        limit: number = 5
    ): Promise<SearchResult[]> {
        try {
            // Search within the same conversation
            const results = await this.search(messageContent, limit, conversationId);

            logger.debug('Related messages retrieved', {
                count: results.length,
                conversationId,
            });

            return results;
        } catch (error) {
            logger.error('Error getting related messages', { error });
            return [];
        }
    }

    /**
     * Batch index multiple messages
     */
    async batchIndexMessages(messages: Array<{
        id: string;
        content: string;
        metadata: Record<string, any>;
    }>): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;

        try {
            logger.info('Starting batch indexing', { total: messages.length });

            // Generate all embeddings
            const contents = messages.map(m => m.content);
            const embeddings = await embeddingService.generateEmbeddings(contents);

            // Index all messages
            for (let i = 0; i < messages.length; i++) {
                try {
                    await chromaService.addMessage(
                        messages[i].id,
                        messages[i].content,
                        embeddings[i],
                        messages[i].metadata
                    );
                    success++;
                } catch (error) {
                    logger.error('Error indexing message in batch', {
                        error,
                        messageId: messages[i].id,
                    });
                    failed++;
                }
            }

            logger.info('Batch indexing completed', { success, failed });

            return { success, failed };
        } catch (error) {
            logger.error('Error in batch indexing', { error });
            return { success, failed };
        }
    }

    /**
     * Reindex all messages from database
     */
    async reindexAllMessages(): Promise<{ success: number; failed: number }> {
        try {
            logger.info('Starting full reindexing');

            // Get all messages from database
            const messages = await prisma.message.findMany({
                select: {
                    id: true,
                    content: true,
                    conversationId: true,
                    role: true,
                    timestamp: true,
                    modelUsed: true,
                },
            });

            // Prepare for batch indexing
            const messagesToIndex = messages.map(msg => ({
                id: msg.id,
                content: msg.content,
                metadata: {
                    conversationId: msg.conversationId,
                    role: msg.role,
                    timestamp: msg.timestamp,
                    modelUsed: msg.modelUsed,
                },
            }));

            // Batch index
            const result = await this.batchIndexMessages(messagesToIndex);

            logger.info('Full reindexing completed', result);

            return result;
        } catch (error) {
            logger.error('Error reindexing all messages', { error });
            return { success: 0, failed: 0 };
        }
    }

    /**
     * Get search statistics
     */
    async getStats(): Promise<{
        totalIndexed: number;
        embeddingModel: string;
        chromaAvailable: boolean;
    }> {
        try {
            const [chromaStats, modelInfo, isAvailable] = await Promise.all([
                chromaService.getStats(),
                Promise.resolve(embeddingService.getModelInfo()),
                chromaService.isAvailable(),
            ]);

            return {
                totalIndexed: chromaStats.count,
                embeddingModel: modelInfo.name,
                chromaAvailable: isAvailable,
            };
        } catch (error) {
            logger.error('Error getting search stats', { error });
            return {
                totalIndexed: 0,
                embeddingModel: 'unknown',
                chromaAvailable: false,
            };
        }
    }
}

export const semanticSearchService = new SemanticSearchService();
