import { ChromaClient, Collection } from 'chromadb';

export class VectorStore {
    private client: ChromaClient;
    private collection: Collection | null = null;
    private readonly COLLECTION_NAME = 'neon-knowledge-base';

    constructor() {
        this.client = new ChromaClient({
            path: "http://localhost:8000" // Default ChromaDB port. User might need to run: `chroma run --path ./chroma_db`
        });
    }

    async init() {
        try {
            this.collection = await this.client.getOrCreateCollection({
                name: this.COLLECTION_NAME,
                metadata: { "hnsw:space": "cosine" }
            });
            console.log(`[VectorStore] Connected to collection: ${this.COLLECTION_NAME}`);
        } catch (error) {
            console.error('[VectorStore] Failed to connect to ChromaDB. Is it running?', error);
        }
    }

    async addDocuments(ids: string[], embeddings: number[][], metadatas: any[], documents: string[]) {
        if (!this.collection) await this.init();
        if (!this.collection) throw new Error("Vector Store not initialized");

        await this.collection.add({
            ids,
            embeddings,
            metadatas,
            documents
        });
    }

    async query(queryEmbeddings: number[], nResults: number = 3) {
        if (!this.collection) await this.init();
        if (!this.collection) throw new Error("Vector Store not initialized");

        return await this.collection.query({
            queryEmbeddings: [queryEmbeddings],
            nResults
        });
    }

    async deleteDocument(docId: string) {
        if (!this.collection) await this.init();
        if (!this.collection) throw new Error("Vector Store not initialized");

        // Chroma deletion by metadata filter is cleaner for deleting all chunks of a file
        await this.collection.delete({
            where: { "source": docId }
        });
    }

    async listDocuments(): Promise<string[]> {
        if (!this.collection) await this.init();
        if (!this.collection) return [];

        // This is tricky in Chroma. We might need a separate metadata store (sqlite) 
        // or just fetch all logic. For MVP, we query all.
        const result = await this.collection.get({
            include: ["metadatas"]
            // limit: 1000 // default?
        } as any);

        // Extract unique source filenames
        const sources = new Set<string>();
        result.metadatas.forEach((m: any) => {
            if (m && m.source) sources.add(m.source);
        });
        return Array.from(sources);
    }
}

export const vectorStore = new VectorStore();
