import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';

export interface OllamaMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: string[]; // Base64 encoded images
}

export interface OllamaResponse {
    content: string;
    model: string;
    tokensGenerated: number;
}

export interface OllamaModel {
    name: string;
    size: number;
    digest: string;
    modified: string;
}

export class OllamaService {
    private client: AxiosInstance;
    private baseURL: string;
    private model: string;

    constructor() {
        this.baseURL = process.env.OLLAMA_URL || 'http://localhost:11434';
        this.model = process.env.OLLAMA_MODEL || 'gemma3:4b';

        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 120000, // 2 minutes for model loading
        });

        logger.info('Ollama service initialized', { baseURL: this.baseURL, model: this.model });
    }

    /**
     * Update the model to use
     */
    public setModel(modelName: string): void {
        if (modelName && modelName !== this.model) {
            logger.info(`Changing Ollama model from ${this.model} to ${modelName}`);
            this.model = modelName;
        }
    }

    /**
     * Check if Ollama is installed and running
     */
    async isOllamaInstalled(): Promise<boolean> {
        try {
            const response = await this.client.get('/api/tags');
            return response.status === 200;
        } catch (error) {
            logger.warn('Ollama is not running or not installed', { error });
            return false;
        }
    }

    /**
     * List all available models
     */
    async listModels(): Promise<OllamaModel[]> {
        try {
            const response = await this.client.get('/api/tags');
            return response.data.models || [];
        } catch (error) {
            logger.error('Error listing Ollama models', { error });
            return [];
        }
    }

    /**
     * Check if the configured model is downloaded
     */
    async isModelDownloaded(): Promise<boolean> {
        try {
            const models = await this.listModels();
            return models.some(m => m.name === this.model);
        } catch (error) {
            return false;
        }
    }

    /**
     * Download a model (pull)
     */
    async downloadModel(modelName?: string): Promise<void> {
        const targetModel = modelName || this.model;

        try {
            logger.info(`Downloading Ollama model: ${targetModel}...`);
            await this.client.post('/api/pull', { name: targetModel });
        } catch (error) {
            logger.error('Error downloading model', { error });
            throw error;
        }
    }

    /**
     * Generate embeddings for a given text
     */
    async embed(prompt: string, modelOverride?: string): Promise<number[]> {
        const model = modelOverride || process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
        try {
            const response = await this.client.post('/api/embeddings', {
                model: model,
                prompt: prompt
            });
            return response.data.embedding; // Ollama returns { embedding: [...] }
        } catch (error) {
            logger.error('Error generating embeddings', { error, model });
            throw error;
        }
    }



    /**
     * Send a chat message to Ollama
     */
    async chat(
        message: string,
        conversationHistory: OllamaMessage[] = [],
        modelOverride?: string, // Allow overriding model for specific calls (e.g. vision)
        systemPromptOverride?: string | null, // Allow overriding system prompt (pass null/empty to skip default)
        images?: string[] // Optional images for vision models
    ): Promise<OllamaResponse> {
        try {
            const validModel = modelOverride || this.model;

            // Ensure model is downloaded (only check current/target)
            // Note: Optimization - Maybe skip check if we trust it's there? 
            // For now, keep it safe but maybe optimize logic later.

            const messages: OllamaMessage[] = [];

            // Only add system prompt if not strictly disabled (null)
            // If undefined, use default. If string, use specific.
            if (systemPromptOverride !== null) {
                const sysContent = systemPromptOverride !== undefined ? systemPromptOverride : this.getSystemPrompt();
                if (sysContent) {
                    messages.push({ role: 'system', content: sysContent });
                }
            }

            // Append history and user message
            messages.push(...conversationHistory);

            // HARD-CODED SAFETY LAYER: Inject critical reminder before EVERY user message
            // This ensures rules are never ignored, even in long conversations
            messages.push({
                role: 'system',
                content: `⚠️ KRITISCHE ERINNERUNG(IMMER BEFOLGEN):
- NIEMALS Informationen erfinden oder halluzinieren
    - Bei Unsicherheit EHRLICH sagen: "Das weiß ich nicht genau"
        - Bei fehlendem Kontext: NACHFRAGEN statt raten
            - KEINE wiederholten Begrüßungen in laufenden Gesprächen
                - Nur FAKTEN, die du WIRKLICH kennst
                    - NIEMALS Zeitstempel als Zeitdauer ausgeben
                    - NIEMALS Formulierungen wie "die letzten XX:XX Minuten"`
            });

            messages.push({ role: 'user', content: message, ...(images && { images }) });

            logger.debug('Sending message to Ollama', {
                model: validModel,
                messageLength: message.length,
                historyLength: conversationHistory.length,
                hasSystemPrompt: messages.some(m => m.role === 'system')
            });

            const response = await this.client.post('/api/chat', {
                model: validModel,
                messages: messages,
                stream: false,
            });

            const content = response.data.message?.content || '';
            const tokensGenerated = response.data.eval_count || 0;

            logger.info('Ollama response received', {
                tokensGenerated,
                outputLength: content.length,
            });

            return {
                content,
                model: this.model,
                tokensGenerated,
            };
        } catch (error) {
            logger.error('Error calling Ollama API', { error });
            throw new Error(`Ollama API error: ${error instanceof Error ? error.message : 'Unknown error'} `);
        }
    }

    /**
     * Stream a chat message from Ollama
     */
    async *streamResponse(
        message: string,
        conversationHistory: OllamaMessage[] = [],
        modelOverride?: string,
        systemPromptOverride?: string
    ): AsyncGenerator<string, void, unknown> {
        try {
            // Ensure model is downloaded
            if (!(await this.isModelDownloaded())) {
                logger.warn(`Model ${this.model} not found.Downloading...`);
                await this.downloadModel();
            }

            const messages: OllamaMessage[] = [];

            // Only add system prompt if not strictly disabled (null)
            // If undefined, use default. If string, use specific.
            if (systemPromptOverride !== null) {
                const sysContent = systemPromptOverride !== undefined ? systemPromptOverride : this.getSystemPrompt();
                if (sysContent) {
                    messages.push({ role: 'system', content: sysContent });
                }
            }

            messages.push(...conversationHistory);
            messages.push({ role: 'user', content: message });


            logger.debug('Streaming message to Ollama', {
                messageLength: message.length,
                historyLength: conversationHistory.length,
            });

            // [DEBUG] Log prompt
            const sysMsg = messages.find(m => m.role === 'system');
            if (sysMsg) {
                logger.warn('[OLLAMA STREAM PROMPT] System: ' + sysMsg.content?.substring(0, 200) + '...');
            }

            // Optimierte Parameter für Gemma3:4b
            const response = await this.client.post('/api/chat', {
                model: modelOverride || this.model,
                messages: messages,
                stream: true,
                options: {
                    temperature: 0.6, // Reduzierter Wert für bessere Faktentreue
                    top_p: 0.85, // Leicht konservativer für Gemma3
                    repeat_penalty: 1.2, // Erhöhte Wiederholungsstrafe für bessere Kohärenz
                    top_k: 40, // Bessere Kontrolle bei Gemma3
                }
            }, {
                responseType: 'stream',
            });

            // Import formatter dynamically to avoid circular deps if any
            // Actually ResponseFormatter is utils, should be fine.
            // But let's keep logic similar to before if possible, or just raw stream first.
            // The previous code used ResponseFormatter. We should probably keep using it if needed.
            // But for simple streaming, raw chunks are often safer to start with.
            // Let's assume raw chunks are fine for now or basic JSON parsing.

            // Wait, previous code used ResponseFormatter. I should probably include it.
            // Re-implementing the parsing logic from previous view_file.

            for await (const chunk of response.data) {
                const lines = chunk.toString().split('\n').filter((line: string) => line.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.message?.content) {
                            yield data.message.content;
                        }
                    } catch (e) {
                        // Ignore parsing errors for incomplete chunks
                    }
                }
            }

            logger.info('Ollama streaming complete');
        } catch (error) {
            logger.error('Error streaming from Ollama API', { error });
            throw new Error(`Ollama streaming error: ${error instanceof Error ? error.message : 'Unknown error'} `);
        }
    }

    // Alias for compatibility
    // Alias for compatibility
    async *streamChat(
        message: string,
        conversationHistory: OllamaMessage[] = [],
        modelOverride?: string,
        systemPromptOverride?: string
    ): AsyncGenerator<string, void, unknown> {
        for await (const chunk of this.streamResponse(message, conversationHistory, modelOverride, systemPromptOverride)) {
            yield chunk;
        }
    }

    /**
     * Get system prompt for Ollama using PromptService
     */
    private getSystemPrompt(): string {
        const { promptService } = require('../prompts/PromptService');
        // No policy passed here = default policy
        return promptService.buildSystemPrompt();
    }

    /**
     * Get Ollama version and info
     */
    async getInfo(): Promise<any> {
        try {
            const response = await this.client.get('/api/version');
            return response.data;
        } catch (error) {
            logger.error('Error getting Ollama info', { error });
            return null;
        }
    }

    // Alias for consistency with other services
    async generateResponse(
        prompt: string,
        history: OllamaMessage[] = [],
        modelOverride?: string,
        systemPrompt?: string
    ): Promise<OllamaResponse> {
        return this.chat(prompt, history, modelOverride, systemPrompt);
    }
}

export const ollamaService = new OllamaService();
