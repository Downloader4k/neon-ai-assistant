import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { trackAPIUsage } from '../db/apiUsageService';

export type ClaudeContent =
    | string
    | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;

export interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: ClaudeContent;
}

export interface ClaudeResponse {
    content: string;
    tokensUsed: number;
    model: string;
}

export class ClaudeService {
    private client: Anthropic;
    private model: string = 'claude-sonnet-4-5-20250929'; // User requested specific model override
    private maxTokens: number = 8192;

    constructor() {
        // ... (existing constructor)
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
        }

        this.client = new Anthropic({
            apiKey: apiKey,
        });

        logger.info('Claude service initialized successfully');
    }

    /**
     * Send a message to Claude and get a response
     */
    async sendMessage(
        message: ClaudeContent,
        conversationHistory: ClaudeMessage[] = [],
        systemPrompt?: string // NEW: Allow overriding
    ): Promise<ClaudeResponse> {
        try {
            // Ensure inputs are correctly typed for the SDK
            // The SDK expects strict types, so we might need to cast or map strictly if using the official SDK types directly
            // For now, passing our ClaudeMessage structure which aligns with API rules

            const messages: any[] = [
                ...conversationHistory,
                { role: 'user', content: message },
            ];

            const messageLength = typeof message === 'string' ? message.length : 'multimodal';

            logger.debug('Sending message to Claude', {
                messageLength,
                historyLength: conversationHistory.length,
            });

            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: this.maxTokens,
                messages: messages as any, // SDK type compat
                system: systemPrompt || this.getSystemPrompt(),
            });

            // ... (rest of method)
            const content = response.content[0].type === 'text'
                ? response.content[0].text
                : '';

            const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

            await trackAPIUsage({
                service: 'claude',
                tokensUsed: tokensUsed,
                cost: this.calculateCost(tokensUsed),
            });

            logger.info('Claude response received', {
                tokensUsed,
                outputLength: content.length,
            });

            return {
                content,
                tokensUsed,
                model: this.model,
            };
        } catch (error) {
            logger.error('Error calling Claude API', { error });
            throw new Error(`Claude API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Stream a message to Claude and get chunks in real-time
     */
    async *streamMessage(
        message: ClaudeContent,
        conversationHistory: ClaudeMessage[] = [],
        systemPrompt?: string // NEW: Allow overriding
    ): AsyncGenerator<string, void, unknown> {
        try {
            const messages: any[] = [
                ...conversationHistory,
                { role: 'user', content: message },
            ];

            const messageLength = typeof message === 'string' ? message.length : 'multimodal';

            logger.debug('Streaming message to Claude', {
                messageLength,
                historyLength: conversationHistory.length,
            });

            const stream = await this.client.messages.stream({
                model: this.model,
                max_tokens: this.maxTokens,
                messages: messages as any,
                system: systemPrompt || this.getSystemPrompt(),
            });

            let totalTokens = 0;

            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    yield chunk.delta.text;
                }

                if (chunk.type === 'message_stop') {
                    // Get final token count from the completed message
                    const finalMessage = await stream.finalMessage();
                    totalTokens = finalMessage.usage.input_tokens + finalMessage.usage.output_tokens;
                }
            }

            // Track API usage after streaming is complete
            if (totalTokens > 0) {
                await trackAPIUsage({
                    service: 'claude',
                    tokensUsed: totalTokens,
                    cost: this.calculateCost(totalTokens),
                });

                logger.info('Claude streaming complete', { tokensUsed: totalTokens });
            }
        } catch (error) {
            logger.error('Error streaming from Claude API', { error });
            throw new Error(`Claude streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Analyze the complexity of a message
     * Returns a score from 0-100
     */
    analyzeComplexity(message: string, conversationHistory: ClaudeMessage[] = []): number {
        let complexity = 0;

        // Length factor (longer messages = more complex)
        const lengthScore = Math.min(message.length / 50, 30);
        complexity += lengthScore;

        // Code presence (code blocks suggest complexity)
        if (message.includes('```') || message.includes('function') || message.includes('class')) {
            complexity += 20;
        }

        // Question words (complex questions)
        const questionWords = ['warum', 'wieso', 'weshalb', 'erkläre', 'analysiere', 'vergleiche', 'why', 'explain', 'analyze'];
        if (questionWords.some(word => message.toLowerCase().includes(word))) {
            complexity += 15;
        }

        // Multi-step or detailed requests
        if (message.includes('schritt für schritt') || message.includes('ausführlich') || message.includes('detailliert')) {
            complexity += 15;
        }

        // Long conversation history suggests context complexity
        complexity += Math.min(conversationHistory.length * 2, 20);

        return Math.min(Math.round(complexity), 100);
    }

    /**
     * Get the system prompt for NEON personality
     */
    /**
     * Get the system prompt for NEON personality using PromptService
     */
    private getSystemPrompt(): string {
        const { promptService } = require('../prompts/PromptService');
        const basePrompt = promptService.buildSystemPrompt();

        // HARD-CODED SAFETY LAYER: Always append critical reminder
        const safetyReminder = `\n\n⚠️ KRITISCHE ERINNERUNG (IMMER BEFOLGEN):
- NIEMALS Informationen erfinden oder halluzinieren
- Bei Unsicherheit EHRLICH sagen: "Das weiß ich nicht genau"
- Bei fehlendem Kontext: NACHFRAGEN statt raten
- KEINE wiederholten Begrüßungen in laufenden Gesprächen
- Nur FAKTEN, die du WIRKLICH kennst`;

        return basePrompt + safetyReminder;
    }

    /**
     * Calculate cost for Claude API usage
     * Pricing for Claude 3.5 Sonnet (as of 2024):
     * Input: $3 per million tokens
     * Output: $15 per million tokens
     * Simplified: Average $9 per million tokens
     */
    private calculateCost(tokens: number): number {
        return (tokens / 1_000_000) * 9;
    }
    // Alias for consistency with other services
    async generateResponse(message: ClaudeContent, history: ClaudeMessage[], systemPrompt?: string) {
        return this.sendMessage(message, history, systemPrompt);
    }

    // Alias for consistency
    async *streamResponse(message: ClaudeContent, history: ClaudeMessage[], systemPrompt?: string) {
        for await (const chunk of this.streamMessage(message, history, systemPrompt)) {
            yield chunk;
        }
    }
}

export const claudeService = new ClaudeService();
