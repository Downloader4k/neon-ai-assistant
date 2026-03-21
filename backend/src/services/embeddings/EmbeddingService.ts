import axios from 'axios';
import { logger } from '../../utils/logger';

export class EmbeddingService {
    private client;
    private modelName: string = 'nomic-embed-text'; // Ollama embedding model
    private isInitialized: boolean = false;

    constructor() {
        const baseURL = process.env.OLLAMA_URL || 'http://localhost:11434';
        this.client = axios.create({
            baseURL,
            timeout: 10000,
        });
        logger.info('Embedding service created (Ollama)', { model: this.modelName });
    }

    /**
     * Initialize needs to ensure model is pulled
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            logger.info('Initializing embedding model...', { model: this.modelName });

            // Check if model exists
            const tags = await this.client.get('/api/tags');
            const models = tags.data.models || [];
            const hasModel = models.some((m: any) => m.name.includes(this.modelName));

            if (!hasModel) {
                logger.info(`Model ${this.modelName} not found. Pulling... (this may take a while)`);
                await this.client.post('/api/pull', { name: this.modelName });
                logger.info(`Model ${this.modelName} pulled successfully.`);
            }

            this.isInitialized = true;
        } catch (error) {
            logger.error('Error initializing embedding model', { error });
            // Don't throw, we can try to use it anyway (maybe pull happens on fly)
        }
    }

    /**
     * Generate embedding for a single text with improved preprocessing
     */
    async generateEmbedding(text: string): Promise<number[]> {
        if (!this.isInitialized) await this.initialize();

        try {
            // Enhanced text preprocessing for better embeddings
            let cleanText = text.trim();
            if (!cleanText) return [];
            
            // Normalisiere Texte für bessere Embeddings
            cleanText = this.preprocessTextForEmbedding(cleanText);
            
            // Bei sehr kurzen Texten - erweitere Kontext
            if (cleanText.length < 20 && !cleanText.includes("geburt")) {
                cleanText = `Kontext: ${cleanText} Information: ${cleanText}`;
            }
            
            // Bei Geburtstags- oder Datums-bezogenen Abfragen - verstärke Signalwörter
            if (cleanText.match(/geburt|alter|wann|datum|geboren|\d{1,2}\.\d{1,2}|\d{4}/i)) {
                cleanText = `Persönliche Information: ${cleanText} Wichtiges Datum: ${cleanText}`;
                logger.info(`[EmbeddingService] Verstärkter Embedding-Text für Datumsabfrage: "${cleanText.substring(0, 100)}..."`);
            }

            const response = await this.client.post('/api/embeddings', {
                model: this.modelName,
                prompt: cleanText,
            });

            const embedding = response.data.embedding;

            logger.debug('Embedding generated', {
                textLength: cleanText.length,
                embeddingDim: embedding.length,
            });

            return embedding;
        } catch (error) {
            logger.error('Error generating embedding', { error, textPreview: text.slice(0, 50) });
            // Zweiter Versuch mit reduziertem Text, falls der erste Versuch fehlschlägt
            try {
                const reducedText = text.trim().substring(0, 500); // Begrenze auf 500 Zeichen
                logger.info('[EmbeddingService] Zweiter Versuch mit reduziertem Text');
                
                const response = await this.client.post('/api/embeddings', {
                    model: this.modelName,
                    prompt: reducedText,
                });
                
                return response.data.embedding;
            } catch (retryError) {
                logger.error('[EmbeddingService] Auch zweiter Versuch fehlgeschlagen', retryError);
                return [];
            }
        }
    }
    
    /**
     * Hilfsfunktion zur Textvorverarbeitung für bessere Embeddings
     */
    private preprocessTextForEmbedding(text: string): string {
        // Entferne mehrfache Leerzeichen, Tabs etc.
        let processed = text.replace(/\s+/g, ' ');
        
        // Normalisiere Datumsformate (für bessere Vergleichbarkeit)
        // 25.03.1991, 25.3.1991, 25/03/1991 -> standardisiert
        processed = processed.replace(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/g, (_match, day, month, year) => {
            return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
        });
        
        // Normalisiere "25. März 1991" -> "25.03.1991"
        const monthMap: {[key: string]: string} = {
            'januar': '01', 'februar': '02', 'märz': '03', 'april': '04', 
            'mai': '05', 'juni': '06', 'juli': '07', 'august': '08',
            'september': '09', 'oktober': '10', 'november': '11', 'dezember': '12'
        };
        
        processed = processed.replace(/(\d{1,2})\.?\s+(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})/i, 
            (_match, day, month, year) => {
                const monthNum = monthMap[month.toLowerCase()];
                return `${day.padStart(2, '0')}.${monthNum}.${year}`;
            }
        );
        
        return processed;
    }

    /**
     * Generate embeddings for multiple texts (batch)
     * Ollama doesn't support batch endpoint natively widely yet (depends on version),
     * so we do sequential or parallel requests.
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (!this.isInitialized) await this.initialize();

        try {
            const embeddings: number[][] = [];

            // Limit concurrency
            for (const text of texts) {
                const emb = await this.generateEmbedding(text);
                embeddings.push(emb);
            }

            logger.info('Batch embeddings generated', { count: texts.length });
            return embeddings;
        } catch (error) {
            logger.error('Error generating batch embeddings', { error });
            return texts.map(() => []); // Fallback
        }
    }

    // ... (Keep utility methods like chunkText, cosineSimilarity if needed, or remove them)

    /**
    * Internal: Calculate cosine similarity
    */
    cosineSimilarity(embedding1: number[], embedding2: number[]): number {
        if (!embedding1.length || !embedding2.length) return 0;

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }

        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    getModelInfo(): { name: string; initialized: boolean } {
        return {
            name: this.modelName,
            initialized: this.isInitialized,
        };
    }
}

export const embeddingService = new EmbeddingService();

