import { Router } from 'express';
import { emotionService } from '../services/magic/EmotionService';
import { predictiveService } from '../services/magic/PredictiveService';
import { timeCapsuleService } from '../services/magic/TimeCapsuleService';
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

// Time Capsules: Create a capsule
router.post('/capsules', async (req, res) => {
    try {
        const { userId, message, openAt, metadata } = req.body;
        const capsule = await timeCapsuleService.createCapsule(
            userId,
            message,
            new Date(openAt),
            metadata
        );
        res.json(capsule);
    } catch (error) {
        logger.error('Error creating time capsule', { error });
        res.status(500).json({ error: 'Failed to create time capsule' });
    }
});

// Time Capsules: Get all capsules for user
router.get('/capsules/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const capsules = await timeCapsuleService.getAllCapsules(userId, true);
        res.json(capsules);
    } catch (error) {
        logger.error('Error fetching capsules', { error });
        res.status(500).json({ error: 'Failed to fetch capsules' });
    }
});

// Time Capsules: Get ready-to-open capsules
router.get('/capsules/:userId/ready', async (req, res) => {
    try {
        const { userId } = req.params;
        const capsules = await timeCapsuleService.getReadyCapsules(userId);
        res.json(capsules);
    } catch (error) {
        logger.error('Error fetching ready capsules', { error });
        res.status(500).json({ error: 'Failed to fetch ready capsules' });
    }
});

// Time Capsules: Open a capsule
router.post('/capsules/:id/open', async (req, res) => {
    try {
        const { id } = req.params;
        const capsule = await timeCapsuleService.openCapsule(id);
        res.json(capsule);
    } catch (error) {
        logger.error('Error opening capsule', { error });
        res.status(500).json({ error: 'Failed to open capsule' });
    }
});

export const magicRoutes = router;
