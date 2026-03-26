import { Router } from 'express';
import { prisma } from '../services/db/prisma';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/summary/daily?userId=default-user&date=2024-01-15
router.get('/daily', async (req, res) => {
    try {
        const userId = (req.query.userId as string) || 'default-user';
        const dateStr = req.query.date as string | undefined;

        // Parse date or use today
        const targetDate = dateStr ? new Date(dateStr) : new Date();
        const dayStart = new Date(targetDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDate);
        dayEnd.setHours(23, 59, 59, 999);

        // 1. Conversations created or continued today
        const conversationsCount = await prisma.conversation.count({
            where: {
                userId,
                OR: [
                    { createdAt: { gte: dayStart, lte: dayEnd } },
                    { updatedAt: { gte: dayStart, lte: dayEnd } },
                ],
            },
        });

        // 2. Messages sent/received today
        const messagesCount = await prisma.message.count({
            where: {
                timestamp: { gte: dayStart, lte: dayEnd },
                conversation: { userId },
            },
        });

        // 3. Memories created today
        const memoriesCount = await prisma.memoryEntry.count({
            where: {
                userId,
                createdAt: { gte: dayStart, lte: dayEnd },
            },
        });

        // 4. Research topics (memoryEntries starting with "[Recherche:")
        const researchEntries = await prisma.memoryEntry.findMany({
            where: {
                userId,
                createdAt: { gte: dayStart, lte: dayEnd },
                content: { startsWith: '[Recherche:' },
            },
            select: { id: true, content: true },
        });

        // 5. Time capsules created today
        const capsules = await prisma.timeCapsule.findMany({
            where: {
                userId,
                createdAt: { gte: dayStart, lte: dayEnd },
            },
            select: { id: true, content: true, openAt: true },
        });

        res.json({
            date: dayStart.toISOString().split('T')[0],
            userId,
            conversations: conversationsCount,
            messages: messagesCount,
            memories: memoriesCount,
            research: {
                count: researchEntries.length,
                topics: researchEntries.map((e) => e.content),
            },
            capsules: {
                count: capsules.length,
                items: capsules,
            },
        });
    } catch (error) {
        logger.error('Error generating daily summary', { error });
        res.status(500).json({
            error: 'Tageszusammenfassung konnte nicht erstellt werden',
            details: error instanceof Error ? error.message : 'Unbekannter Fehler',
        });
    }
});

export { router as summaryRoutes };
