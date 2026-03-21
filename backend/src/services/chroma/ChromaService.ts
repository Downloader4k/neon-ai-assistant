import { ChromaClient, Collection } from 'chromadb';
import { logger } from '../../utils/logger';
import fs from 'fs';
import path from 'path';

export class ChromaService {
    private client: ChromaClient;
    private messagesCollection: Collection | null = null;
    private baseURL: string;

    // Local Fallback Mode
    private useLocalMode: boolean = false;
    private localStore: Array<{
        id: string;
        embedding: number[];
        document: string;
        metadata: any;
    }> = [];
    private localStorePath: string;

    constructor() {
        this.baseURL = process.env.CHROMA_URL || 'http://localhost:8000';
        this.client = new ChromaClient({ path: this.baseURL });

        // Setup local store path
        this.localStorePath = path.join(__dirname, '../../../data/vectors.json');

        // Ensure directory exists
        const dir = path.dirname(this.localStorePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        logger.info('ChromaDB service initialized', { baseURL: this.baseURL });
    }

    /**
     * Initialize collections
     */
    async initialize(): Promise<void> {
        try {
            // Try to connect to Chroma
            // const heartbeat = await this.client.heartbeat();
            logger.info('ChromaDB connected');
            // Get or create messages collection
            this.messagesCollection = await this.client.getOrCreateCollection({
                name: 'messages',
                metadata: { description: 'All chat messages for semantic search' },
            });

            this.useLocalMode = false;
            logger.info('ChromaDB collections initialized (Remote Mode)');
        } catch (error) {
            logger.warn('ChromaDB unavailable, falling back to Local Mode', { error: (error as any).message });
            this.useLocalMode = true;
            this.loadLocalStore();
        }
    }

    private loadLocalStore() {
        try {
            if (fs.existsSync(this.localStorePath)) {
                const data = fs.readFileSync(this.localStorePath, 'utf-8');
                this.localStore = JSON.parse(data);
                logger.info('Local vector store loaded', { count: this.localStore.length });
            }
        } catch (e) {
            logger.error('Failed to load local vector store', { error: e });
            this.localStore = [];
        }
    }

    private saveLocalStore() {
        if (!this.useLocalMode) return;
        try {
            fs.writeFileSync(this.localStorePath, JSON.stringify(this.localStore, null, 2));
        } catch (e) {
            logger.error('Failed to save local vector store', { error: e });
        }
    }

    /**
     * Add a message with its embedding
     */
    async addMessage(
        messageId: string,
        content: string,
        embedding: number[],
        metadata: Record<string, any> = {}
    ): Promise<void> {
        try {
            if (this.useLocalMode) {
                // Add to local store
                this.localStore.push({
                    id: messageId,
                    embedding,
                    document: content,
                    metadata
                });
                this.saveLocalStore();
                logger.debug('Message added to Local Store', { messageId });
                return;
            }

            if (!this.messagesCollection) await this.initialize();
            if (this.useLocalMode) return this.addMessage(messageId, content, embedding, metadata);

            await this.messagesCollection!.add({
                ids: [messageId],
                embeddings: [embedding],
                documents: [content],
                metadatas: [metadata],
            });

            logger.debug('Message added to ChromaDB', { messageId });
        } catch (error) {
            // If remote fails mid-operation, maybe switch to local?
            // For now just error
            logger.error('Error adding message to Vector DB', { error, messageId });
        }
    }

    /**
     * Search for similar messages
     */
    async searchSimilar(
        queryEmbedding: number[],
        limit: number = 10,
        filter?: Record<string, any>
    ): Promise<{
        ids: string[];
        distances: number[];
        documents: string[];
        metadatas: Record<string, any>[];
    }> {
        try {
            if (this.useLocalMode) {
                return this.searchLocal(queryEmbedding, limit, filter);
            }

            if (!this.messagesCollection) await this.initialize();
            if (this.useLocalMode) return this.searchLocal(queryEmbedding, limit, filter);

            const results = await this.messagesCollection!.query({
                queryEmbeddings: [queryEmbedding],
                nResults: limit,
                where: filter,
            });

            return {
                ids: results.ids[0] || [],
                distances: results.distances?.[0] || [],
                documents: (results.documents[0] || []).filter((d): d is string => d !== null),
                metadatas: (results.metadatas[0] || []) as Record<string, any>[],
            };
        } catch (error) {
            logger.error('Error searching in Vector DB', { error });
            // Fallback empty
            return { ids: [], distances: [], documents: [], metadatas: [] };
        }
    }

    private searchLocal(queryEmbedding: number[], limit: number, filter?: Record<string, any>) {
        // 1. Filter
        let candidates = this.localStore;
        if (filter) {
            // Basic filtering (exact match on keys)
            candidates = candidates.filter(item => {
                for (const key in filter) {
                    if (item.metadata[key] !== filter[key]) return false;
                }
                return true;
            });
        }

        // 2. Cosine Similarity
        const results = candidates.map(item => {
            const sim = this.cosineSimilarity(queryEmbedding, item.embedding);
            return { ...item, score: sim };
        });

        // 3. Sort by Distance ASC (Similarity DESC)
        // Cosine Sim: 1.0 is similar. Distance = 1 - Sim.
        // We want smallest distance.
        results.sort((a, b) => b.score - a.score);

        // 4. Slice
        const top = results.slice(0, limit);

        return {
            ids: top.map(x => x.id),
            distances: top.map(x => 1 - x.score), // Convert Sim to Dist for compatibility
            documents: top.map(x => x.document),
            metadatas: top.map(x => x.metadata)
        };
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    }

    /**
     * Check if ChromaDB is available (or Local is working)
     */
    async isAvailable(): Promise<boolean> {
        if (this.useLocalMode) return true;
        try {
            await this.client.heartbeat();
            return true;
        } catch (error) {
            // Will trigger mode switch on next init
            return false;
        }
    }

    async deleteMessage(messageId: string): Promise<void> {
        if (this.useLocalMode) {
            this.localStore = this.localStore.filter(x => x.id !== messageId);
            this.saveLocalStore();
            return;
        }
        if (!this.messagesCollection) await this.initialize();
        if (this.messagesCollection && this.messagesCollection.delete) await this.messagesCollection.delete({ ids: [messageId] });
    }

    async updateMessage(
        messageId: string,
        content?: string,
        embedding?: number[],
        metadata?: Record<string, any>
    ): Promise<void> {
        if (this.useLocalMode) {
            const idx = this.localStore.findIndex(x => x.id === messageId);
            if (idx >= 0) {
                if (content) this.localStore[idx].document = content;
                if (embedding) this.localStore[idx].embedding = embedding;
                if (metadata) this.localStore[idx].metadata = metadata;
                this.saveLocalStore();
            }
            return;
        }
        if (!this.messagesCollection) await this.initialize();
        if (this.useLocalMode) return this.updateMessage(messageId, content, embedding, metadata);

        await this.messagesCollection!.update({
            ids: [messageId],
            embeddings: embedding ? [embedding] : undefined,
            documents: content ? [content] : undefined,
            metadatas: metadata ? [metadata] : undefined,
        });
    }

    async getStats(): Promise<{ count: number }> {
        if (this.useLocalMode) {
            return { count: this.localStore.length };
        }
        if (!this.messagesCollection) await this.initialize();
        if (this.useLocalMode) return { count: this.localStore.length };
        return { count: await this.messagesCollection!.count() };
    }

    /**
     * Wipes the entire collection
     */
    async resetCollection(): Promise<void> {
        logger.warn('Resetting ChromaDB Collection');

        if (this.useLocalMode) {
            this.localStore = [];
            this.saveLocalStore();
            return;
        }

        try {
            // Delete and Recreate
            await this.client.deleteCollection({ name: 'messages' });
            await this.initialize(); // Re-creates it
            logger.info('ChromaDB Collection reset via delete/create');
        } catch (error) {
            // If delete fails, maybe it didn't exist, try just init
            logger.error('Error resetting collection, trying to re-init', { error });
            await this.initialize();
        }
    }
}

export const chromaService = new ChromaService();
