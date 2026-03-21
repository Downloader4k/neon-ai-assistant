import { Router } from 'express';
import { prisma } from '../services/db/prisma';

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

export const proactiveRoutes = router;
