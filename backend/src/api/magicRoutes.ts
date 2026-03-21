import { Router } from 'express';
import { emotionService } from '../services/magic/EmotionService';
import { predictiveService } from '../services/magic/PredictiveService';
import { logger } from '../utils/logger';

const router = Router();

// Emotion: Get overall mood
router.get('/emotion/:userId/mood', async (req, res) => {
    try {
        const { userId } = req.params;
        const { days } = req.query;

        const mood = await emotionService.getOverallMood(
            userId,
            days ? parseInt(days as string) : 7
        );
        res.json(mood);
    } catch (error) {
        logger.error('Error fetching mood', { error });
        res.status(500).json({ error: 'Failed to fetch mood' });
    }
});

// Emotion: Get history
router.get('/emotion/:userId/history', async (req, res) => {
    try {
        const { userId } = req.params;
        const { days } = req.query;

        const history = await emotionService.getEmotionHistory(
            userId,
            days ? parseInt(days as string) : 7
        );
        res.json(history);
    } catch (error) {
        logger.error('Error fetching emotion history', { error });
        res.status(500).json({ error: 'Failed to fetch emotion history' });
    }
});

// Predictive: Get next predictions
router.get('/predict/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const predictions = await predictiveService.predictNext(userId);
        res.json({ predictions });
    } catch (error) {
        logger.error('Error fetching predictions', { error });
        res.status(500).json({ error: 'Failed to fetch predictions' });
    }
});

export const magicRoutes = router;
