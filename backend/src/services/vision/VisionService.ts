
import axios from 'axios';
import { ollamaService } from '../ollama/OllamaService';
import { logger } from '../../utils/logger';

export class VisionService {
    private visionModel: string;

    constructor() {
        // gemma3 unterstützt Vision nativ und ist meistens installiert
        // Fallback-Kette: VISION_MODEL env → gemma3:12b → gemma3:4b → llava
        this.visionModel = process.env.VISION_MODEL || 'gemma3:12b';
    }

    /**
     * Analyze an image and return a description
     * @param base64Image Pure base64 string (without data:image/... prefix)
     * @param prompt User's specific question or default "describe"
     */
    async analyzeImage(base64Image: string, prompt: string = ''): Promise<string> {
        try {
            logger.info(`[Vision] Start Bildanalyse, base64-Länge: ${base64Image.length} Zeichen`);

            // Prüfe ob das Vision-Modell verfügbar ist
            const available = await this.checkVisionModel();
            if (!available) {
                logger.warn(`[Vision] Kein Vision-Modell verfügbar`);
                return "[FEHLER: Kein Vision-Modell verfügbar. Bitte installiere gemma3 mit: ollama pull gemma3:12b]";
            }

            const systemInstruction = prompt
                ? prompt
                : "Beschreibe dieses Bild detailliert aber prägnant auf Deutsch. Fokussiere dich auf das Hauptmotiv, Farben und Text falls vorhanden. Erfinde keinen Text der nicht sichtbar ist.";

            logger.info(`[Vision] Sende Bild an ${this.visionModel} (Timeout: 180s, Safety-Layer: deaktiviert)...`);

            const response = await ollamaService.chat(
                systemInstruction,
                [],
                this.visionModel,
                null, // Kein System-Prompt für Vision
                [base64Image],
                { skipSafetyLayer: true, timeoutMs: 180000 } // Vision braucht länger, kein Safety-Prompt
            );

            if (response.content && response.content.trim().length > 10) {
                logger.info(`[Vision] Analyse erfolgreich (${response.content.length} Zeichen)`);
                return response.content;
            }

            return "[FEHLER: Vision-Modell hat keine sinnvolle Beschreibung geliefert]";

        } catch (error) {
            logger.error('[Vision] Analyse fehlgeschlagen', { error: (error as Error).message });
            return "[FEHLER: Bildanalyse fehlgeschlagen. Das Vision-Modell antwortet nicht.]";
        }
    }

    /**
     * Prüft ob ein Vision-fähiges Modell verfügbar ist, mit Fallback-Kette
     */
    private async checkVisionModel(): Promise<boolean> {
        try {
            const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
            const response = await axios.get(`${ollamaUrl}/api/tags`, { timeout: 5000 });
            const data = response.data as { models: Array<{ name: string }> };
            const installedModels = data.models.map((m: { name: string }) => m.name);

            // Prüfe ob das konfigurierte Modell vorhanden ist
            if (installedModels.some(m => m.startsWith(this.visionModel.split(':')[0]))) {
                return true;
            }

            // Fallback: Andere Vision-fähige Modelle suchen
            const visionCapable = ['gemma3', 'llava', 'llava-llama3', 'bakllava', 'moondream'];
            for (const model of visionCapable) {
                const found = installedModels.find(m => m.startsWith(model));
                if (found) {
                    logger.info(`[Vision] Fallback auf ${found} (${this.visionModel} nicht gefunden)`);
                    this.visionModel = found;
                    return true;
                }
            }

            return false;
        } catch {
            return false;
        }
    }
}

export const visionService = new VisionService();
