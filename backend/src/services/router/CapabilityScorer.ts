import { ollamaService } from '../ollama/OllamaService';
import { logger } from '../../utils/logger';

export interface CapabilityScore {
    selfConfidence: number;        // 0.0 - 1.0
    missingKnowledge: boolean;
    reasoningDepthNeeded: number;  // 0.0 - 1.0
}

/**
 * CapabilityScorer - Phase 2: Self-Scoring
 * 
 * Allows the local model (Gemma3) to evaluate its own capability
 * to answer a given question. This meta-evaluation helps determine
 * whether Claude is truly needed.
 */
export class CapabilityScorer {

    /**
     * Ask local model to score its own capability (meta-call)
     */
    async scoreLocalCapability(message: string): Promise<CapabilityScore> {
        try {
            const metaPrompt = `Du bist ein lokales KI-Modell (Gemma3 4b). Bewerte OBJEKTIV und EHRLICH deine Fähigkeit, diese Anfrage zu beantworten.

Kriterien:
1. selfConfidence: Wie sicher bist du, eine korrekte Antwort zu geben? (0.0 = unsicher, 1.0 = sehr sicher)
2. missingKnowledge: Fehlt dir spezifisches Wissen? (true/false)
3. reasoningDepthNeeded: Wie komplex ist das Reasoning? (0.0 = trivial, 1.0 = sehr komplex)

WICHTIG: Antworte NUR mit JSON, kein zusätzlicher Text!

Format:
{
  "selfConfidence": 0.0-1.0,
  "missingKnowledge": true/false,
  "reasoningDepthNeeded": 0.0-1.0
}

Anfrage: "${message}"

JSON:`;

            const response = await ollamaService.chat(metaPrompt, []);

            // Parse JSON response
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                logger.warn('CapabilityScorer: Failed to parse JSON, using defaults');
                return {
                    selfConfidence: 0.5,
                    missingKnowledge: false,
                    reasoningDepthNeeded: 0.5
                };
            }

            const score = JSON.parse(jsonMatch[0]);

            // Validate and clamp values
            return {
                selfConfidence: Math.max(0, Math.min(1, score.selfConfidence || 0.5)),
                missingKnowledge: score.missingKnowledge === true,
                reasoningDepthNeeded: Math.max(0, Math.min(1, score.reasoningDepthNeeded || 0.5))
            };

        } catch (error) {
            logger.error('CapabilityScorer: Failed to score capability', { error });

            // Fallback: Default to medium confidence
            return {
                selfConfidence: 0.6,
                missingKnowledge: false,
                reasoningDepthNeeded: 0.5
            };
        }
    }
}

export const capabilityScorer = new CapabilityScorer();
