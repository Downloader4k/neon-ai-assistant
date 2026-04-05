import { Router } from 'express';
import { prisma } from '../services/db/prisma';
import { presenceService } from '../services/presence/PresenceService';

const router = Router();

// Get pending notifications
router.get('/:userId/pending', async (req, res) => {
    try {
        const { userId } = req.params;
        const messages = await prisma.proactiveMessage.findMany({
            where: {
                userId,
                read: false,
                deliveredAt: { equals: null }, // Only undelivered
            },
            orderBy: { generatedAt: 'desc' },
        });
        res.json(messages);
    } catch (error) {
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
