import { Router } from 'express';
import { prisma } from '../services/db/prisma';
import { presenceService } from '../services/presence/PresenceService';
import { logger } from '../utils/logger';

const router = Router();

// Get pending notifications — marks as read+delivered so they NEVER return again
router.get('/:userId/pending', async (req, res) => {
    try {
        const { userId } = req.params;
        logger.info(`[Proactive API] GET pending for ${userId}`);

        // Prevent browser caching — proactive messages must always be fresh
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const messages = await prisma.proactiveMessage.findMany({
            where: {
                userId,
                read: false,
            },
            orderBy: { generatedAt: 'desc' },
            take: 3,
        });

        logger.info(`[Proactive API] Found ${messages.length} unread for ${userId}`);

        // Sofort als read+delivered markieren — einmal angezeigt = erledigt
        if (messages.length > 0) {
            await prisma.proactiveMessage.updateMany({
                where: { id: { in: messages.map(m => m.id) } },
                data: { read: true, deliveredAt: new Date() },
            });
            logger.info(`[Proactive API] Marked ${messages.length} as read+delivered`);
        }

        res.json(messages);
    } catch (error) {
        logger.error('[Proactive API] Failed', { error });
        res.status(500).json({ error: 'Failed' });
    }
});

// Mark as read/triggered
router.patch('/:id/trigger', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.proactiveMessage.update({
            where: { id },
            data: { read: true, deliveredAt: new Date() },
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Get presence status
router.get('/:userId/presence', async (req, res) => {
    try {
        const { userId } = req.params;
        const status = presenceService.getStatus(userId);
        if (!status) {
            res.json({ state: 'offline', timeOfDay: presenceService.getTimeOfDay() });
            return;
        }
        res.json({
            state: status.state,
            previousState: status.previousState,
            timeOfDay: status.timeOfDay,
            since: status.since,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Get proactivity history
router.get('/:userId/history', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit as string) || 20;
        const messages = await prisma.proactiveMessage.findMany({
            where: { userId },
            orderBy: { generatedAt: 'desc' },
            take: limit,
        });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

export const proactiveRoutes = router;
