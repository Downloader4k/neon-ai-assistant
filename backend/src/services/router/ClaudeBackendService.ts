import { claudeService, ClaudeMessage } from '../claude/ClaudeService';
import { ollamaService, OllamaMessage } from '../ollama/OllamaService';
import { logger } from '../../utils/logger';

export interface ClaudeAnalysis {
    facts: string[];
    tradeoffs?: string[];
    risks?: string[];
    structureHint: string;
}

/**
 * ClaudeBackendService - Phase 3: Claude as Subsystem
 * 
 * When Claude is needed, it ONLY provides analysis/structure.
 * Gemma3 then formulates the final answer in Neon's voice.
 * This keeps Neon's personality consistent and Claude invisible.
 */
export class ClaudeBackendService {

    /**
     * Get analysis from Claude (structured JSON output)
     */
    async getAnalysis(
        userMessage: string,
        conversationHistory: ClaudeMessage[],
        systemPrompt?: string
    ): Promise<ClaudeAnalysis> {
        try {
            // Spezialabfrage für Geburtstags- und Datumsanfragen
            const isBirthdayQuery = userMessage.toLowerCase().match(/wie alt|alter|geboren|geburtstag|wann.*geboren|geburt/i);
            
            let analysisPrompt;
            
            if (isBirthdayQuery) {
                // Spezialisierte Prompt für Datums- und Geburtstagsfragen
                analysisPrompt = `Du bist ein Analyse-Modul für Datums- und Geburtstagsfragen. Deine Aufgabe ist es, die folgende Anfrage zu analysieren und PRÄZISE Faktendaten zu liefern.

WICHTIG: Antworte NUR mit JSON, kein zusätzlicher Text!

Bei Geburtstagsfragen verwende die Informationen aus dem Gedaechtnis-System.
Falls kein Geburtsdatum gespeichert ist, frage den Nutzer.

Format:
{
  "facts": ["Fakt 1", "Fakt 2", ...],
  "datumInformationen": ["Geburtsdatum: aus Memory laden"],  // Bei Geburtstagsanfragen
  "präziseDaten": true,  // Setze auf true wenn exakte Daten wichtig sind
  "structureHint": "Empfohlene Struktur für die Antwort"
}

Anfrage: "${userMessage}"

JSON:`;
            } else {
                // Standard-Analyseprompt für alle anderen Anfragen
                analysisPrompt = `Du bist ein Analyse-Modul. Analysiere die folgende Anfrage und liefere STRUKTURIERTE Fakten.

WICHTIG: Antworte NUR mit JSON, kein zusätzlicher Text!

Format:
{
  "facts": ["Fakt 1", "Fakt 2", ...],
  "tradeoffs": ["Tradeoff 1", "Tradeoff 2", ...],  // Optional
  "risks": ["Risk 1", "Risk 2", ...],              // Optional
  "structureHint": "Empfohlene Struktur für die Antwort"
}

Anfrage: "${userMessage}"

JSON:`;
            }

            const response = await claudeService.sendMessage(
                analysisPrompt,
                conversationHistory,
                systemPrompt
            );

            // Parse JSON from Claude's response
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                logger.warn('ClaudeBackend: Failed to parse JSON, returning defaults');
                return {
                    facts: [response.content],
                    structureHint: 'Beantworte direkt die Frage'
                };
            }

            const analysis = JSON.parse(jsonMatch[0]);

            return {
                facts: Array.isArray(analysis.facts) ? analysis.facts : [response.content],
                tradeoffs: Array.isArray(analysis.tradeoffs) ? analysis.tradeoffs : undefined,
                risks: Array.isArray(analysis.risks) ? analysis.risks : undefined,
                structureHint: analysis.structureHint || 'Beantworte direkt die Frage'
            };

        } catch (error) {
            logger.error('ClaudeBackend: Failed to get analysis', { error });
            throw error;
        }
    }

    /**
     * Use Claude's analysis + Gemma3's formulation
     * This is the complete "Claude as Backend" workflow
     */
    async answerWithClaudeBackend(
        userMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
        systemPrompt?: string
    ): Promise<string> {
        try {
            // Step 1: Get analysis from Claude
            logger.info('ClaudeBackend: Requesting analysis from Claude');
            const analysis = await this.getAnalysis(
                userMessage,
                conversationHistory as ClaudeMessage[],
                systemPrompt
            );

            // Step 2: Gemma3 formulates using analysis
            logger.info('ClaudeBackend: Formulating answer with Gemma3');

            let contextParts: string[] = [];

            if (analysis.facts.length > 0) {
                contextParts.push(`Fakten:\n${analysis.facts.map(f => `- ${f}`).join('\n')}`);
            }

            if (analysis.tradeoffs && analysis.tradeoffs.length > 0) {
                contextParts.push(`Tradeoffs:\n${analysis.tradeoffs.map(t => `- ${t}`).join('\n')}`);
            }

            if (analysis.risks && analysis.risks.length > 0) {
                contextParts.push(`Risiken:\n${analysis.risks.map(r => `- ${r}`).join('\n')}`);
            }

            const gemmaPrompt = `Basierend auf dieser Analyse, formuliere eine Antwort in Neons Stil (ehrlich, lokal, denkend, persönlich).

${contextParts.join('\n\n')}

Struktur-Empfehlung: ${analysis.structureHint}

User-Frage: ${userMessage}

Deine Antwort (in Neons Stimme):`;

            const gemmaResponse = await ollamaService.chat(
                gemmaPrompt,
                conversationHistory as OllamaMessage[]
            );

            return gemmaResponse.content;

        } catch (error) {
            logger.error('ClaudeBackend: Failed to answer with backend', { error });
            throw error;
        }
    }

    /**
     * Streaming version of answerWithClaudeBackend
     */
    async *streamAnswerWithClaudeBackend(
        userMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
        systemPrompt?: string
    ): AsyncGenerator<string, void, unknown> {
        try {
            // Step 1: Get analysis from Claude (non-streaming)
            yield '💡 Analysiere mit Cloud-Backend...\n\n';

            const analysis = await this.getAnalysis(
                userMessage,
                conversationHistory as ClaudeMessage[],
                systemPrompt
            );

            // Step 2: Stream Gemma3's formulation
            yield '✅ Formuliere Antwort lokal...\n\n';

            let contextParts: string[] = [];

            if (analysis.facts.length > 0) {
                contextParts.push(`Fakten:\n${analysis.facts.map(f => `- ${f}`).join('\n')}`);
            }

            if (analysis.tradeoffs && analysis.tradeoffs.length > 0) {
                contextParts.push(`Tradeoffs:\n${analysis.tradeoffs.map(t => `- ${t}`).join('\n')}`);
            }

            if (analysis.risks && analysis.risks.length > 0) {
                contextParts.push(`Risiken:\n${analysis.risks.map(r => `- ${r}`).join('\n')}`);
            }

            const gemmaPrompt = `Basierend auf dieser Analyse, formuliere eine Antwort in Neons Stil (ehrlich, lokal, denkend, persönlich).

${contextParts.join('\n\n')}

Struktur-Empfehlung: ${analysis.structureHint}

User-Frage: ${userMessage}

Deine Antwort (in Neons Stimme):`;

            for await (const chunk of ollamaService.streamChat(
                gemmaPrompt,
                conversationHistory as OllamaMessage[]
            )) {
                yield chunk;
            }

        } catch (error) {
            logger.error('ClaudeBackend: Failed to stream answer with backend', { error });
            throw error;
        }
    }
}

export const claudeBackendService = new ClaudeBackendService();
