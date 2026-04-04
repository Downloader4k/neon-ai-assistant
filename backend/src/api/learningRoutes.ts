/**
 * Learning Orchestrator API Routes
 *
 * Endpoints for the learning orchestrator:
 * - POST /api/learning/feedback - Record user feedback on AI responses
 * - GET /api/learning/stats - Get learning statistics and bandit scores
 * - GET /api/learning/decisions - Get recent routing decisions
 * - POST /api/learning/decay - Apply time decay to bandit scores
 */

import { Router } from 'express';
import { aiRouter } from '../services/router/AIRouter';
import { routingLogger } from '../services/router/RoutingLogger';
import { banditSelector } from '../services/router/BanditSelector';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/learning/feedback
 * Record user feedback for a routing decision
 *
 * Body: { messageId: string, feedback: 'good' | 'bad' | 'wrong_model' }
 */
router.post('/feedback', async (req, res) => {
    try {
        const { messageId, feedback } = req.body;

        if (!messageId || !['good', 'bad', 'wrong_model'].includes(feedback)) {
            res.status(400).json({
                error: 'messageId und feedback (good/bad/wrong_model) erforderlich',
            });
            return;
        }

        const userId = (req as any).userId || 'default-user';
        await aiRouter.recordFeedback(messageId, feedback, userId);

        res.json({ success: true, feedback, messageId });
    } catch (error) {
        logger.error('Failed to record feedback', { error });
        res.status(500).json({ error: 'Feedback konnte nicht gespeichert werden' });
    }
});

/**
 * GET /api/learning/stats
 * Get learning orchestrator statistics
 */
router.get('/stats', (_req, res) => {
    try {
        const stats = aiRouter.getLearningStats();
        res.json(stats);
    } catch (error) {
        logger.error('Failed to get learning stats', { error });
        res.status(500).json({ error: 'Statistiken konnten nicht geladen werden' });
    }
});

/**
 * GET /api/learning/decisions
 * Get recent routing decisions
 */
router.get('/decisions', (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const decisions = routingLogger.getRecentDecisions(limit);
        res.json(decisions);
    } catch (error) {
        logger.error('Failed to get decisions', { error });
        res.status(500).json({ error: 'Entscheidungen konnten nicht geladen werden' });
    }
});

/**
 * POST /api/learning/decay
 * Apply time decay to learning data
 */
router.post('/decay', (_req, res) => {
    try {
        banditSelector.applyDecay();
        res.json({ success: true, message: 'Decay angewendet' });
    } catch (error) {
        logger.error('Failed to apply decay', { error });
        res.status(500).json({ error: 'Decay konnte nicht angewendet werden' });
    }
});

export default router;
