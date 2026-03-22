/**
 * Predictive Assistance - Proaktive Vorschlaege basierend auf Mustern
 *
 * Analysiert Konversationshistorie und generiert kontextbezogene
 * Vorschlaege, Fragen und Erinnerungen.
 */
import { logger } from '../../utils/logger';
import { Cache } from '../../utils/performance';

export interface Prediction {
    type: 'task' | 'question' | 'reminder' | 'suggestion';
    content: string;
    confidence: number;
    category: string;
    priority: 'high' | 'medium' | 'low';
    basedOn?: string;
}

// Cache fuer Vorhersagen (5 Minuten pro User)
const predictionCache = new Cache<Prediction[]>(5 * 60 * 1000);

export class PredictiveService {
    /**
     * Muster analysieren und Vorhersagen generieren
     */
    async predictNext(userId: string): Promise<Prediction[]> {
        // Cache pruefen
        const cached = predictionCache.get(`predict-${userId}`);
        if (cached) return cached;

        try {
            const { prisma } = await import('../db/prisma');
            const { aiRouter } = await import('../router/AIRouter');

            // Letzte 5 Konversationen mit Nachrichten laden
            const conversations = await prisma.conversation.findMany({
                where: { userId },
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: {
                    messages: {
                        take: 10,
                        orderBy: { timestamp: 'desc' },
                    },
                },
            });

            // Kontext aus History aufbauen
            let contextSummary = '';
            conversations.forEach((conv, i) => {
                const msgs = conv.messages.slice().reverse()
                    .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
                    .join('\n');
                contextSummary += `\n[Konversation ${i + 1} - ${conv.title}]\n${msgs}\n`;
            });

            if (!contextSummary.trim()) {
                const fallback: Prediction[] = [{
                    type: 'suggestion',
                    content: 'Ich bin bereit! Erzaehl mir, woran du gerade arbeitest.',
                    confidence: 0.9,
                    category: 'Start',
                    priority: 'high',
                }];
                return fallback;
            }

            // AI-basierte Vorhersagen
            const prompt = `Du bist 'Neon', ein proaktiver KI-Assistent.
Analysiere die letzten Konversationen und generiere 3 hilfreiche Vorschlaege.

Regeln:
- Nur valides JSON ausgeben, keine Markdown-Formatierung
- Sprache: Deutsch
- Sei spezifisch, nicht generisch
- Max 3 Eintraege

Format: JSON-Array mit Objekten:
[{"type":"question"|"task"|"suggestion","content":"Text","confidence":0.0-1.0,"category":"Label","priority":"high"|"medium"|"low"}]

Konversationen:
${contextSummary.slice(0, 3000)}

JSON:`;

            const response = await aiRouter.route(prompt, [], 'ollama');
            let jsonString = response.content.replace(/```json/g, '').replace(/```/g, '').trim();

            const predictions = JSON.parse(jsonString);

            if (Array.isArray(predictions)) {
                const sorted = predictions
                    .slice(0, 3)
                    .sort((a: any, b: any) => b.confidence - a.confidence);

                predictionCache.set(`predict-${userId}`, sorted);
                return sorted;
            }

            throw new Error('Kein gueltiges JSON-Array');
        } catch (error) {
            logger.debug('KI-Vorhersage fehlgeschlagen, nutze Fallback-Logik', { error });
            return this.getFallbackPredictions();
        }
    }

    /**
     * Zeitbasierte Fallback-Vorhersagen
     */
    private getFallbackPredictions(): Prediction[] {
        const hour = new Date().getHours();
        const predictions: Prediction[] = [];

        if (hour >= 6 && hour < 12) {
            predictions.push({
                type: 'task',
                content: 'Guten Morgen! Was sind deine Hauptziele fuer heute?',
                confidence: 0.8,
                category: 'Planung',
                priority: 'high',
            });
        } else if (hour >= 12 && hour < 14) {
            predictions.push({
                type: 'suggestion',
                content: 'Mittagspause? Soll ich dir eine Zusammenfassung deines Vormittags geben?',
                confidence: 0.6,
                category: 'Check-in',
                priority: 'medium',
            });
        } else if (hour >= 14 && hour < 18) {
            predictions.push({
                type: 'suggestion',
                content: 'Wie laeuft dein Tag? Gibt es Blockaden bei deinen aktuellen Aufgaben?',
                confidence: 0.7,
                category: 'Check-in',
                priority: 'medium',
            });
        } else if (hour >= 18 && hour < 22) {
            predictions.push({
                type: 'question',
                content: 'Feierabend-Modus! Moechtest du etwas Neues lernen oder einfach plaudern?',
                confidence: 0.6,
                category: 'Freizeit',
                priority: 'low',
            });
        } else {
            predictions.push({
                type: 'suggestion',
                content: 'Spaete Stunde — brauchst du Hilfe bei etwas oder ist alles erledigt?',
                confidence: 0.5,
                category: 'Check-in',
                priority: 'low',
            });
        }

        return predictions;
    }

    /**
     * Kontextbasierte Beduerfnisse vorhersagen
     */
    async predictUserNeeds(_userId: string, context: string): Promise<string[]> {
        const lowerCtx = context.toLowerCase();
        const needs: string[] = [];

        // Coding-Kontext
        if (/code|programmier|function|bug|error|debug/.test(lowerCtx)) {
            needs.push('Code-Beispiele', 'Dokumentation', 'Best Practices');
        }

        // Problem-Kontext
        if (/problem|fehler|geht nicht|funktioniert nicht|kaputt/.test(lowerCtx)) {
            needs.push('Schritt-fuer-Schritt Loesung', 'Alternative Ansaetze', 'Debugging-Tipps');
        }

        // Lern-Kontext
        if (/lernen|verstehen|erklär|tutorial|wie geht/.test(lowerCtx)) {
            needs.push('Einfache Erklaerung', 'Praktische Beispiele', 'Uebungen');
        }

        // Planungs-Kontext
        if (/plan|projekt|ziel|strategie|roadmap/.test(lowerCtx)) {
            needs.push('Strukturierte Planung', 'Meilensteine', 'Risiko-Analyse');
        }

        // Kreativ-Kontext
        if (/idee|kreativ|brainstorm|design|konzept/.test(lowerCtx)) {
            needs.push('Inspiration', 'Kreative Ansaetze', 'Referenzen');
        }

        return needs;
    }
}

export const predictiveService = new PredictiveService();
