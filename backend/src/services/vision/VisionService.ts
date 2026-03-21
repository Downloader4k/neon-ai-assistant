
import { ollamaService } from '../ollama/OllamaService';
import { logger } from '../../utils/logger';

export class VisionService {
    private visionModel: string;

    constructor() {
        // Default to llava, but robust enough to support others
        this.visionModel = process.env.VISION_MODEL || 'llava';
    }

    /**
     * Analyze an image and return a description
     * @param base64Image Pure base64 string (without data:image/... prefix)
     * @param prompt User's specific question or default "describe"
     */
    async analyzeImage(base64Image: string, prompt: string = ''): Promise<string> {
        try {
            // Check if vision model is available (OllamaService handles auto-pull if missing)
            await ollamaService.isModelDownloaded();
            // Note: ollamaService checks 'this.model'. We need to check 'visionModel'.
            // For now, we'll try to use it with the override param I added to OllamaService.

            // Construct a focused prompt for the vision model
            // The goal is to get a factual description that the Main LLM can "see"
            const systemInstruction = prompt
                ? prompt
                : "Describe this image in detail but concisely. Focus on the main subject, setting, and lighting. Only transcribe text if it is clearly legible. Do not invent text or code if none is visible.";

            logger.info('Sending image to Vision Model', { model: this.visionModel });

            const response = await ollamaService.chat(
                systemInstruction,
                [], // No history needed for single image analysis usually
                this.visionModel, // Override model to use vision model
                "", // Override System Prompt: Pass empty string to DISABLE default "You are Neon" injection
                [base64Image] // Images for vision model
            );

            return response.content;

        } catch (error) {
            logger.error('Vision analysis failed', { error });
            // Fallback: Return a string indicating failure so the main LLM knows it can't see the image
            return "[FEHLER: Bildanalyse fehlgeschlagen. Das lokale Vision-Modell (z.B. llava) antwortet nicht.]";
        }
    }
}

export const visionService = new VisionService();
