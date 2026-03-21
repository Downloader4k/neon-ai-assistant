
import { Router } from 'express';
import { prisma } from '../services/db/prisma';
import { logger } from '../utils/logger';
const router = Router();

// GET /api/memory/:userId
// Fetch memories with filters
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { type } = req.query;

        const where: any = {
            userId,
            isActive: true
        };

        if (type && type !== 'all') {
            where.type = (type as string).toUpperCase();
        }

        const memories = await prisma.memoryEntry.findMany({
            where,
            include: {
                tags: true // Include tags for filtering/display
            },
            orderBy: { createdAt: 'desc' },
            take: 500 // Increased limit to show more memories
        });

        // Map to frontend format if needed (or just send raw)
        const mapped = memories.map(m => ({
            ...m,
            type: m.type.toLowerCase(),
            status: m.isActive ? 'active' : 'archived',
            importance: m.importanceScore,
            tags: m.tags.map(t => t.name) // Convert tag objects to array of names
        }));

        res.json(mapped);
    } catch (error) {
        logger.error('Failed to fetch memories', error);
        res.status(500).json({ error: 'Failed to fetch memories' });
    }
});

// GET /api/memory/:userId/stats
// Get memory statistics
router.get('/:userId/stats', async (req, res) => {
    try {
        const { userId } = req.params;

        // Total count
        const total = await prisma.memoryEntry.count({ where: { userId } });

        // By Status
        const active = await prisma.memoryEntry.count({ where: { userId, isActive: true } });
        const archived = total - active;

        // By Type
        const byTypeRaw = await prisma.memoryEntry.groupBy({
            by: ['type'],
            where: { userId, isActive: true },
            _count: true
        });

        const byType: Record<string, number> = {};
        byTypeRaw.forEach(g => {
            byType[g.type.toLowerCase()] = g._count;
        });

        // Avg Importance
        const avgAgg = await prisma.memoryEntry.aggregate({
            where: { userId, isActive: true },
            _avg: { importanceScore: true }
        });

        res.json({
            total,
            byStatus: { active, archived },
            byType,
            avgImportance: avgAgg._avg.importanceScore || 0
        });

    } catch (error) {
        logger.error('Failed to fetch stats', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// PUT /api/memory/:userId/:id
// Update memory content
router.put('/:userId/:id', async (req, res) => {
    try {
        const { userId, id } = req.params;
        const { content } = req.body;

        await prisma.memoryEntry.update({
            where: { id, userId },
            data: { content, updatedAt: new Date() }
        });

        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to update memory', error);
        res.status(500).json({ error: 'Failed to update memory' });
    }
});

// DELETE /api/memory/:userId/:id
// Soft delete memory
router.delete('/:userId/:id', async (req, res) => {
    try {
        const { userId, id } = req.params;

        await prisma.memoryEntry.update({
            where: { id, userId },
            data: { isActive: false }
        });

        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to delete memory', error);
        res.status(500).json({ error: 'Failed to delete memory' });
    }
});

// POST /api/memory/:userId/import
// Import memories from text
router.post('/:userId/import', async (req, res) => {
    try {
        const { userId } = req.params;
        const { text, provider: _provider } = req.body;

        // TODO: Use correct model based on provider if needed
        // For now, reuse the manual extraction logic or specific import logic

        // We'll treat this as a "manual extraction" from a bulk text
        // Splitting by newlines for a naive approach or passing to LLM?
        // Since MemoryDashboard calls it "Analysieren & Importieren", we should use LLM.

        // Dummy implementation for now: Just create one entry per line if it looks like a fact
        // Ideally we call extractionService.extractFromText(text) - but that method doesn't exist yet on the public interface.
        // We will adapt to just creating a raw entry for now, or use memoryManager to process it.

        const lines = text.split('\n').filter((l: string) => l.trim().length > 5);
        let count = 0;

        for (const line of lines) {
            // Check if it looks like a list item
            const cleanLine = line.replace(/^-\s*/, '').trim();

            const entry = await prisma.memoryEntry.create({
                data: {
                    userId,
                    type: 'FACT',
                    content: cleanLine,
                    importanceScore: 1.0,
                    createdAt: new Date(),
                    isActive: true
                }
            });

            // Generate Embedding
            try {
                const { embeddingService } = await import('../services/memory/EmbeddingService');
                const embedding = await embeddingService.embed(cleanLine);
                await embeddingService.storeEmbedding(entry.id, embedding);

                // Detect Relations
                const { relationService } = await import('../services/memory/RelationService');
                await relationService.detectRelations(entry.id, cleanLine);

            } catch (err) {
                logger.error(`Failed to process embedding/relations for imported memory ${entry.id}`, err);
            }

            count++;
        }

        res.json({ success: true, count });

    } catch (error) {
        logger.error('Failed to import', error);
        res.status(500).json({ error: 'Failed to import' });
    }
});

export const memoryRoutes = router;
