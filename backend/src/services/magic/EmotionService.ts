/**
 * Emotion Awareness & Sentiment Analysis Service
 *
 * Erweiterte Emotionserkennung mit:
 * - Umfangreichen deutschen Wortlisten + Intensitaetsstufen
 * - Kontext-Erkennung (Verneinungen, Verstaerker)
 * - Emoji-Analyse
 * - Stimmungsverlauf und Trend-Erkennung
 */

export interface EmotionAnalysis {
    sentiment: 'positive' | 'negative' | 'neutral';
    emotions: {
        joy: number;
        sadness: number;
        anger: number;
        fear: number;
        surprise: number;
        love: number;
        disgust: number;
    };
    confidence: number;
    intensity: 'low' | 'medium' | 'high';
    dominantEmotion: string;
}

// Gewichtete Keywords: [wort, intensitaet (0.5-2.0)]
type WeightedKeyword = [string, number];

const JOY_KEYWORDS: WeightedKeyword[] = [
    ['glücklich', 1.5], ['freude', 1.5], ['toll', 1.0], ['super', 1.0],
    ['großartig', 1.5], ['fantastisch', 1.5], ['wunderbar', 1.5], ['genial', 1.5],
    ['cool', 0.8], ['nice', 0.8], ['geil', 1.2], ['hammer', 1.2],
    ['perfekt', 1.3], ['klasse', 1.0], ['prima', 0.8], ['herrlich', 1.2],
    ['begeistert', 1.5], ['freut', 1.0], ['freu', 1.0], ['spaß', 1.2],
    ['lachen', 1.0], ['lache', 1.0], ['lustig', 0.8], ['witzig', 0.8],
    ['zufrieden', 1.0], ['stolz', 1.2], ['dankbar', 1.3], ['danke', 0.7],
    ['😊', 1.0], ['😄', 1.2], ['🎉', 1.3], ['😃', 1.2], ['🥳', 1.5],
    ['❤️', 1.0], ['👍', 0.7], ['🙌', 1.2], ['😁', 1.0], ['🤩', 1.5],
];

const SADNESS_KEYWORDS: WeightedKeyword[] = [
    ['traurig', 1.5], ['schade', 0.8], ['schlecht', 1.0], ['enttäuscht', 1.3],
    ['deprimiert', 1.8], ['einsam', 1.5], ['vermisse', 1.3], ['weinen', 1.5],
    ['weine', 1.5], ['niedergeschlagen', 1.5], ['hoffnungslos', 1.8],
    ['unglücklich', 1.5], ['elend', 1.5], ['kummer', 1.3], ['leid', 1.0],
    ['tut mir leid', 0.5], ['leider', 0.7], ['bedauerlich', 0.8],
    ['melancholisch', 1.2], ['resigniert', 1.3], ['verloren', 1.0],
    ['😢', 1.2], ['😞', 1.0], ['😥', 1.0], ['😭', 1.5], ['💔', 1.3],
];

const ANGER_KEYWORDS: WeightedKeyword[] = [
    ['wütend', 1.5], ['ärgerlich', 1.3], ['frustriert', 1.3], ['genervt', 1.2],
    ['sauer', 1.3], ['wut', 1.5], ['ärger', 1.3], ['hass', 1.8],
    ['verdammt', 1.2], ['scheiße', 1.5], ['mist', 1.0], ['nervig', 1.0],
    ['aggressiv', 1.5], ['rasend', 1.8], ['empört', 1.3], ['zornig', 1.5],
    ['unfair', 1.0], ['ungerecht', 1.2], ['dreist', 1.0], ['frechheit', 1.3],
    ['😠', 1.2], ['😡', 1.5], ['🤬', 1.8], ['💢', 1.3],
];

const FEAR_KEYWORDS: WeightedKeyword[] = [
    ['angst', 1.5], ['sorge', 1.0], ['befürchtung', 1.2], ['nervös', 1.2],
    ['beunruhigt', 1.2], ['panik', 1.8], ['furcht', 1.5], ['ängstlich', 1.3],
    ['besorgt', 1.0], ['unsicher', 0.8], ['unwohl', 0.8], ['bange', 1.0],
    ['gruselig', 1.0], ['erschrocken', 1.2], ['zittern', 1.3],
    ['gestresst', 1.2], ['überfordert', 1.3], ['stress', 1.0],
    ['😰', 1.2], ['😨', 1.3], ['😱', 1.5], ['🫣', 0.8],
];

const SURPRISE_KEYWORDS: WeightedKeyword[] = [
    ['überrascht', 1.2], ['wow', 1.0], ['erstaunlich', 1.2], ['unglaublich', 1.3],
    ['krass', 1.2], ['wahnsinn', 1.3], ['echt', 0.5], ['wirklich', 0.5],
    ['unerwartet', 1.0], ['plötzlich', 0.8], ['schockiert', 1.5],
    ['verblüfft', 1.2], ['fassungslos', 1.5], ['sprachlos', 1.3],
    ['😮', 1.0], ['😲', 1.2], ['🤯', 1.5], ['😳', 1.0],
];

const LOVE_KEYWORDS: WeightedKeyword[] = [
    ['liebe', 1.5], ['lieb', 1.0], ['verliebt', 1.8], ['zuneigung', 1.3],
    ['mag dich', 1.3], ['schatz', 1.2], ['herzlich', 1.0], ['innig', 1.3],
    ['warmherzig', 1.2], ['liebevoll', 1.3], ['geborgen', 1.2],
    ['❤️', 1.3], ['😍', 1.5], ['🥰', 1.5], ['💕', 1.3], ['💖', 1.3],
];

const DISGUST_KEYWORDS: WeightedKeyword[] = [
    ['eklig', 1.5], ['widerlich', 1.5], ['abstoßend', 1.5], ['igitt', 1.2],
    ['pfui', 1.0], ['grauenhaft', 1.3], ['furchtbar', 1.2], ['schrecklich', 1.2],
    ['abscheulich', 1.5], ['grässlich', 1.3], ['übel', 1.0],
    ['🤢', 1.3], ['🤮', 1.5], ['😷', 0.8],
];

// Verneinungen die Emotionen umkehren
const NEGATION_WORDS = ['nicht', 'kein', 'keine', 'keinen', 'nie', 'niemals', 'kaum', 'weder'];

// Verstaerker die Intensitaet erhoehen
const INTENSIFIERS = ['sehr', 'extrem', 'total', 'absolut', 'mega', 'richtig', 'echt', 'so', 'voll', 'komplett'];

export class EmotionService {
    /**
     * Erweiterte Emotionsanalyse
     */
    analyzeEmotion(text: string): EmotionAnalysis {
        const lowerText = text.toLowerCase();
        const words = lowerText.split(/\s+/);

        // Verneinungen und Verstaerker erkennen
        const hasNegation = NEGATION_WORDS.some(n => words.includes(n));
        const intensifierCount = INTENSIFIERS.filter(i => words.includes(i)).length;
        const intensityMultiplier = 1 + (intensifierCount * 0.3);

        // Gewichtete Scores berechnen
        let joy = this.calcWeightedScore(lowerText, JOY_KEYWORDS) * intensityMultiplier;
        let sadness = this.calcWeightedScore(lowerText, SADNESS_KEYWORDS) * intensityMultiplier;
        let anger = this.calcWeightedScore(lowerText, ANGER_KEYWORDS) * intensityMultiplier;
        let fear = this.calcWeightedScore(lowerText, FEAR_KEYWORDS) * intensityMultiplier;
        let surprise = this.calcWeightedScore(lowerText, SURPRISE_KEYWORDS) * intensityMultiplier;
        let love = this.calcWeightedScore(lowerText, LOVE_KEYWORDS) * intensityMultiplier;
        let disgust = this.calcWeightedScore(lowerText, DISGUST_KEYWORDS) * intensityMultiplier;

        // Verneinung: positive und negative Emotionen tauschen
        if (hasNegation) {
            [joy, sadness] = [sadness * 0.5, joy * 0.5];
            anger *= 0.5;
        }

        // Normalisieren
        const total = joy + sadness + anger + fear + surprise + love + disgust || 1;
        const emotions = {
            joy: joy / total,
            sadness: sadness / total,
            anger: anger / total,
            fear: fear / total,
            surprise: surprise / total,
            love: love / total,
            disgust: disgust / total,
        };

        // Sentiment bestimmen
        const positiveScore = joy + love + surprise * 0.3;
        const negativeScore = sadness + anger + fear + disgust;

        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
        if (positiveScore > negativeScore * 1.2) sentiment = 'positive';
        else if (negativeScore > positiveScore * 1.2) sentiment = 'negative';

        // Dominante Emotion finden
        const emotionEntries = Object.entries(emotions);
        const dominant = emotionEntries.reduce((a, b) => a[1] > b[1] ? a : b);
        const confidence = dominant[1];

        // Intensitaet bestimmen
        let intensity: 'low' | 'medium' | 'high' = 'low';
        if (total > 3) intensity = 'high';
        else if (total > 1.5) intensity = 'medium';

        return {
            sentiment,
            emotions,
            confidence,
            intensity,
            dominantEmotion: dominant[0],
        };
    }

    /**
     * Gewichteten Score berechnen
     */
    private calcWeightedScore(text: string, keywords: WeightedKeyword[]): number {
        let score = 0;
        for (const [keyword, weight] of keywords) {
            if (text.includes(keyword)) {
                score += weight;
            }
        }
        return score;
    }

    /**
     * Emotion-Emoji zurueckgeben
     */
    getEmotionEmoji(emotion: EmotionAnalysis): string {
        const emojiMap: Record<string, string> = {
            joy: '😊',
            sadness: '😢',
            anger: '😠',
            fear: '😰',
            surprise: '😲',
            love: '❤️',
            disgust: '🤢',
        };
        return emojiMap[emotion.dominantEmotion] || '😐';
    }

    /**
     * Emotion in DB tracken
     */
    async trackEmotion(userId: string, text: string) {
        const emotion = this.analyzeEmotion(text);
        try {
            const { prisma } = await import('../db/prisma');
            // @ts-ignore - emotionLog Tabelle existiert evtl. noch nicht
            await prisma.emotionLog.create({
                data: {
                    userId,
                    text: text.slice(0, 500), // Max 500 Zeichen
                    sentiment: emotion.sentiment,
                    emotions: JSON.stringify(emotion.emotions),
                    confidence: emotion.confidence,
                    timestamp: new Date(),
                },
            });
        } catch {
            // Tabelle existiert nicht — leise fehlschlagen
        }
        return emotion;
    }

    /**
     * Emotionsverlauf abfragen
     */
    async getEmotionHistory(userId: string, days: number = 7) {
        try {
            const { prisma } = await import('../db/prisma');
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            // @ts-ignore
            return await prisma.emotionLog.findMany({
                where: { userId, timestamp: { gte: since } },
                orderBy: { timestamp: 'asc' },
            });
        } catch {
            return [];
        }
    }

    /**
     * Gesamtstimmung analysieren
     */
    async getOverallMood(userId: string, days: number = 7): Promise<{
        averageSentiment: 'positive' | 'negative' | 'neutral';
        emotionTrend: string;
        score: number;
        topEmotion: string;
    }> {
        const history = await this.getEmotionHistory(userId, days);

        if (history.length === 0) {
            return {
                averageSentiment: 'neutral',
                emotionTrend: 'keine Daten',
                score: 0,
                topEmotion: 'neutral',
            };
        }

        const sentimentScores = history.map((log: any) => {
            if (log.sentiment === 'positive') return 1;
            if (log.sentiment === 'negative') return -1;
            return 0;
        });

        const avgScore = sentimentScores.reduce((a: number, b: number) => a + b, 0) / sentimentScores.length;

        let averageSentiment: 'positive' | 'negative' | 'neutral';
        if (avgScore > 0.2) averageSentiment = 'positive';
        else if (avgScore < -0.2) averageSentiment = 'negative';
        else averageSentiment = 'neutral';

        // Trend: Letzte 3 vs. erste 3 Eintraege
        const recent = sentimentScores.slice(-3);
        const older = sentimentScores.slice(0, 3);
        const recentAvg = recent.reduce((a: number, b: number) => a + b, 0) / (recent.length || 1);
        const olderAvg = older.reduce((a: number, b: number) => a + b, 0) / (older.length || 1);

        let emotionTrend = 'stabil';
        if (recentAvg > olderAvg + 0.3) emotionTrend = 'verbessernd';
        else if (recentAvg < olderAvg - 0.3) emotionTrend = 'verschlechternd';

        // Top-Emotion aus allen Eintraegen berechnen
        const emotionTotals: Record<string, number> = {};
        for (const log of history) {
            try {
                const parsed = typeof (log as any).emotions === 'string'
                    ? JSON.parse((log as any).emotions)
                    : (log as any).emotions;
                for (const [key, val] of Object.entries(parsed)) {
                    emotionTotals[key] = (emotionTotals[key] || 0) + (val as number);
                }
            } catch { /* ignore */ }
        }

        const topEmotion = Object.entries(emotionTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

        return { averageSentiment, emotionTrend, score: avgScore, topEmotion };
    }
}

export const emotionService = new EmotionService();
