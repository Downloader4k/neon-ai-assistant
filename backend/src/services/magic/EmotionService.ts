/**
 * Emotion Awareness & Sentiment Analysis Service
 */

export interface EmotionAnalysis {
    sentiment: 'positive' | 'negative' | 'neutral';
    emotions: {
        joy: number;
        sadness: number;
        anger: number;
        fear: number;
        surprise: number;
    };
    confidence: number;
}

export class EmotionService {
    /**
     * Analyze emotion from text
     */
    analyzeEmotion(text: string): EmotionAnalysis {
        // Simple keyword-based emotion detection
        const lowerText = text.toLowerCase();

        // Emotion keywords
        const joyWords = ['glücklich', 'freude', 'toll', 'super', 'großartig', 'fantastisch', '😊', '😄', '🎉'];
        const sadWords = ['traurig', 'schade', 'schlecht', 'enttäuscht', 'deprimiert', '😢', '😞'];
        const angerWords = ['wütend', 'ärgerlich', 'frustriert', 'genervt', 'sauer', '😠', '😡'];
        const fearWords = ['angst', 'sorge', 'befürchtung', 'nervös', 'beunruhigt', '😰', '😨'];
        const surpriseWords = ['überrascht', 'wow', 'erstaunlich', 'unglaublich', '😮', '😲'];

        // Count matches
        const joy = this.countMatches(lowerText, joyWords);
        const sadness = this.countMatches(lowerText, sadWords);
        const anger = this.countMatches(lowerText, angerWords);
        const fear = this.countMatches(lowerText, fearWords);
        const surprise = this.countMatches(lowerText, surpriseWords);

        // Normalize to 0-1
        const total = joy + sadness + anger + fear + surprise || 1;
        const emotions = {
            joy: joy / total,
            sadness: sadness / total,
            anger: anger / total,
            fear: fear / total,
            surprise: surprise / total,
        };

        // Determine overall sentiment
        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
        if (joy > sadness + anger + fear) {
            sentiment = 'positive';
        } else if (sadness + anger + fear > joy) {
            sentiment = 'negative';
        }

        return {
            sentiment,
            emotions,
            confidence: Math.max(...Object.values(emotions)),
        };
    }

    /**
     * Count keyword matches
     */
    private countMatches(text: string, keywords: string[]): number {
        return keywords.reduce((count, keyword) => {
            return count + (text.includes(keyword) ? 1 : 0);
        }, 0);
    }

    /**
     * Get emotion emoji
     */
    getEmotionEmoji(emotion: EmotionAnalysis): string {
        const dominant = Object.entries(emotion.emotions).reduce((a, b) =>
            a[1] > b[1] ? a : b
        )[0];

        const emojiMap: Record<string, string> = {
            joy: '😊',
            sadness: '😢',
            anger: '😠',
            fear: '😰',
            surprise: '😲',
        };

        return emojiMap[dominant] || '😐';
    }

    /**
     * Track emotion over time
     */
    async trackEmotion(userId: string, text: string) {
        const emotion = this.analyzeEmotion(text);
        const { prisma } = await import('../db/prisma');

        // @ts-ignore
        await prisma.emotionLog.create({
            data: {
                userId,
                text,
                sentiment: emotion.sentiment,
                emotions: JSON.stringify(emotion.emotions),
                confidence: emotion.confidence,
                timestamp: new Date(),
            },
        });

        return emotion;
    }

    /**
     * Get emotion history
     */
    async getEmotionHistory(userId: string, days: number = 7) {
        const { prisma } = await import('../db/prisma');
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // @ts-ignore
        const logs = await prisma.emotionLog.findMany({
            where: {
                userId,
                timestamp: { gte: since },
            },
            orderBy: { timestamp: 'asc' },
        });

        return logs;
    }

    /**
     * Get overall mood
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
                emotionTrend: 'neutral',
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

        // Simple trend detection
        const recentAvg = sentimentScores.slice(-3).reduce((a: number, b: number) => a + b, 0) / 3;
        const olderAvg = sentimentScores.slice(0, 3).reduce((a: number, b: number) => a + b, 0) / 3;

        let emotionTrend = 'stable';
        if (recentAvg > olderAvg + 0.3) emotionTrend = 'improving';
        else if (recentAvg < olderAvg - 0.3) emotionTrend = 'declining';

        return {
            averageSentiment,
            emotionTrend,
            score: avgScore,
            topEmotion: 'mixed' // Simplify for now, or calculate real top emotion
        };
    }
}

export const emotionService = new EmotionService();
