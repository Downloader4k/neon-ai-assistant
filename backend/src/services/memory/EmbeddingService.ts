import path from 'path';

/**
 * EmbeddingService - Generates embeddings via Ollama and stores in SQLite-Vec
 * 
 * Features:
 * - Embedding generation using nomic-embed-text (768 dimensions)
 * - Vector storage in SQLite-Vec for KNN search
 * - Similarity search with threshold filtering
 */

export interface VectorSearchResult {
    id: string;
    distance: number;
    similarity: number;
}

export class EmbeddingService {
    private ollamaUrl: string;
    private db: any; // Database type is dynamic with require
    private model: string = 'nomic-embed-text';
    private vectorDimension: number = 768;

    constructor(ollamaUrl: string = 'http://localhost:11434') {
        this.ollamaUrl = ollamaUrl;

        // Initialize SQLite database with vec extension
        const dbPath = path.join(__dirname, '../../../dev.db');

        // Use require() for native modules to avoid ERR_DLOPEN_FAILED issues with TS imports
        const Database = require('better-sqlite3');
        const sqliteVec = require('sqlite-vec');

        this.db = new Database(dbPath);

        // Load sqlite-vec extension
        sqliteVec.load(this.db);

        // Initialize vector table
        this.initializeVectorTable();
    }

    /**
     * Create virtual table for vector storage
     */
    private initializeVectorTable(): void {
        try {
            // Create mapping table for UUID -> integer rowid
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS vector_mapping (
                    id TEXT PRIMARY KEY,
                    rowid INTEGER
                )
            `);

            // Check if vector table exists
            const tableExists = this.db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='memory_vectors'
            `).get();

            if (!tableExists) {
                this.db.exec(`
                    CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors
                    USING vec0(
                        embedding FLOAT[${this.vectorDimension}]
                    )
                `);
                console.log('[EmbeddingService] Vector table created');
            }
        } catch (error) {
            console.error('[EmbeddingService] Failed to create vector table:', error);
        }
    }

    /**
     * Generate embedding for a text using Ollama
     */
    async embed(text: string): Promise<number[]> {
        try {
            const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: text
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }

            const data = await response.json() as any;
            return (data as any).embedding;
        } catch (error) {
            console.error('[EmbeddingService] Embedding generation failed:', error);
            throw error;
        }
    }

    /**
     * Store embedding in vector database
     */
    async storeEmbedding(id: string, vector: number[]): Promise<void> {
        const insertMapping = this.db.prepare('INSERT OR REPLACE INTO vector_mapping (id, rowid) VALUES (?, ?)');
        const getMapping = this.db.prepare('SELECT rowid FROM vector_mapping WHERE id = ?');

        try {
            // Check if exists
            const existing = getMapping.get(id) as { rowid: number } | undefined;
            const vectorJson = JSON.stringify(vector);

            if (existing) {
                // Update existing: delete old vector and insert new (vec0 requirement)
                this.db.prepare('DELETE FROM memory_vectors WHERE rowid = ?').run(existing.rowid);
                this.db.prepare('INSERT INTO memory_vectors (rowid, embedding) VALUES (?, ?)').run(existing.rowid, vectorJson);
            } else {
                // Insert new
                const result = this.db.prepare('INSERT INTO memory_vectors (embedding) VALUES (?)').run(vectorJson);
                const newRowId = result.lastInsertRowid;
                insertMapping.run(id, newRowId);
            }
        } catch (error) {
            console.error('[EmbeddingService] Failed to store embedding:', error);
            throw error;
        }
    }

    /**
     * Search for similar vectors using KNN
     */
    async searchSimilar(
        queryText: string,
        limit: number = 5,
        threshold: number = 0.5
    ): Promise<Array<{ id: string; similarity: number }>> {
        const queryVector = await this.embed(queryText);
        const queryVectorJson = JSON.stringify(queryVector);

        // sqlite-vec requires explicit LIMIT on the virtual table query for KNN
        // We perform the vector search in a subquery, then join mapping
        const results = this.db.prepare(`
            WITH matches AS (
                SELECT 
                    rowid,
                    vec_distance_cosine(embedding, ?) as distance
                FROM memory_vectors
                ORDER BY distance
                LIMIT ?
            )
            SELECT 
                vm.id,
                m.distance
            FROM matches m
            JOIN vector_mapping vm ON m.rowid = vm.rowid
            WHERE m.distance <= ?
        `).all(queryVectorJson, limit, 1 - threshold);
        // Note: Threshold convert (similarity vs distance). 
        // vec_distance_cosine is 0..2 (1 - cosine). 
        // A high similarity (0.9) means low distance (0.1).
        // So distance <= (1 - threshold).

        return results.map((r: any) => ({
            id: r.id,
            similarity: 1 - r.distance
        }));
    }

    /**
     * Delete embedding by ID
     */
    async deleteEmbedding(id: string): Promise<void> {
        try {
            const getMapping = this.db.prepare('SELECT rowid FROM vector_mapping WHERE id = ?');
            const existing = getMapping.get(id) as { rowid: number } | undefined;

            if (existing) {
                this.db.prepare('DELETE FROM memory_vectors WHERE rowid = ?').run(existing.rowid);
                this.db.prepare('DELETE FROM vector_mapping WHERE id = ?').run(id);
            }
        } catch (error) {
            console.error('[EmbeddingService] Failed to delete embedding:', error);
            throw error;
        }
    }

    /**
     * Get embedding by ID
     */
    async getEmbedding(id: string): Promise<number[] | null> {
        try {
            const stmt = this.db.prepare(`
                SELECT v.embedding 
                FROM memory_vectors v
                JOIN vector_mapping m ON v.rowid = m.rowid
                WHERE m.id = ?
            `);
            const result = stmt.get(id) as { embedding: string } | undefined;
            return result ? JSON.parse(result.embedding) : null;
        } catch (error) {
            console.error('[EmbeddingService] Failed to get embedding:', error);
            return null;
        }
    }

    /**
     * Clear all embeddings (for reset)
     */
    async clearAll(): Promise<void> {
        try {
            this.db.exec(`DELETE FROM memory_vectors`);
            console.log('[EmbeddingService] All embeddings cleared');
        } catch (error) {
            console.error('[EmbeddingService] Failed to clear embeddings:', error);
            throw error;
        }
    }

    /**
     * Close database connection
     */
    close(): void {
        this.db.close();
    }
}

// Singleton instance
export const embeddingService = new EmbeddingService();
