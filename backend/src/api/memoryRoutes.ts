
import { Router } from 'express';
import { prisma } from '../services/db/prisma';
import { logger } from '../utils/logger';
import { memoryGatekeeper } from '../services/memory/MemoryGatekeeper';
const router = Router();

// POST /api/memory
// Create a new memory entry (via MemoryGatekeeper - Memory 2.0)
router.post('/', async (req, res) => {
    try {
        const { userId, content, type, importanceScore, summary, tags } = req.body;

        if (!userId || !content) {
            res.status(400).json({ error: 'userId und content sind erforderlich' });
            return;
        }

        const result = await memoryGatekeeper.save({
            userId,
            type: type || 'FACT',
            content,
            summary,
            importance: importanceScore ?? 0.7,
            tags: Array.isArray(tags) ? tags : undefined,
        });

        if (result.status === 'blocked' || result.status === 'skipped') {
            res.status(422).json({
                success: false,
                status: result.status,
                reason: result.reason,
                hint: 'Content wurde vom Gatekeeper abgelehnt (zu lang, Muster-Match, zu geringe Wichtigkeit o.ae.)',
            });
            return;
        }

        res.json({ success: true, id: result.entryId, status: result.status });
    } catch (error) {
        logger.error('Failed to create memory', error);
        res.status(500).json({ error: 'Failed to create memory' });
    }
});

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

// DELETE /api/memory/:id
// Soft delete by memory ID only (no userId required — e.g. called from intent handler)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.memoryEntry.update({
            where: { id },
            data: { isActive: false }
        });

        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to delete memory by id', error);
        res.status(500).json({ error: 'Failed to delete memory' });
    }
});

// DELETE /api/memory/:userId/:id
// Soft delete memory (with userId ownership check)
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
        const stats = { created: 0, replaced: 0, merged: 0, skipped: 0, blocked: 0 };

        for (const line of lines) {
            const cleanLine = line.replace(/^-\s*/, '').trim();
            const res = await memoryGatekeeper.save({
                userId,
                type: 'FACT',
                content: cleanLine,
                importance: 0.75,
            });
            stats[res.status] = (stats[res.status] ?? 0) + 1;

            // Relationen nur fuer neu angelegte Eintraege
            if (res.status === 'created' && res.entryId) {
                try {
                    const { relationService } = await import('../services/memory/RelationService');
                    await relationService.detectRelations(res.entryId, cleanLine);
                } catch (err) {
                    logger.error('relation detect failed', err);
                }
            }
        }

        const count = stats.created + stats.replaced + stats.merged;
        res.json({ success: true, count, stats });

    } catch (error) {
        logger.error('Failed to import', error);
        res.status(500).json({ error: 'Failed to import' });
    }
});

// GET /api/memory/:userId/timeline
// Get memories as timeline data (grouped by date)
router.get('/:userId/timeline', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit as string) || 200;

        const memories = await prisma.memoryEntry.findMany({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                type: true,
                content: true,
                importanceScore: true,
                accessCount: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Group by date
        const timeline: Record<string, any[]> = {};
        for (const m of memories) {
            const dateKey = m.createdAt.toISOString().split('T')[0];
            if (!timeline[dateKey]) timeline[dateKey] = [];
            timeline[dateKey].push({
                ...m,
                type: m.type.toLowerCase(),
            });
        }

        res.json(timeline);
    } catch (error) {
        logger.error('Failed to fetch timeline', error);
        res.status(500).json({ error: 'Failed to fetch timeline' });
    }
});

// GET /api/memory/:userId/decay
// Get decay information for all memories
router.get('/:userId/decay', async (req, res) => {
    try {
        const { userId } = req.params;

        const memories = await prisma.memoryEntry.findMany({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: {
                id: true,
                type: true,
                content: true,
                importanceScore: true,
                accessCount: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Calculate decay for each memory
        const HALF_LIVES: Record<string, number> = {
            INSTRUCTION: Infinity,
            FACT: 60,        // 60 days
            PREFERENCE: 90,  // 90 days
            KNOWLEDGE: 120,  // 120 days
            PROJECT: 30,     // 30 days
        };

        const now = Date.now();
        const decayData = memories.map(m => {
            const ageMs = now - m.createdAt.getTime();
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            const halfLife = HALF_LIVES[m.type] || 60;
            const decayFactor = halfLife === Infinity ? 1.0 : Math.pow(0.5, ageDays / halfLife);
            const effectiveScore = m.importanceScore * decayFactor;

            return {
                id: m.id,
                type: m.type.toLowerCase(),
                content: m.content.substring(0, 100),
                originalImportance: m.importanceScore,
                currentImportance: Math.round(effectiveScore * 100) / 100,
                decayFactor: Math.round(decayFactor * 100) / 100,
                ageDays: Math.round(ageDays),
                halfLife,
                accessCount: m.accessCount,
            };
        });

        res.json(decayData);
    } catch (error) {
        logger.error('Failed to fetch decay data', error);
        res.status(500).json({ error: 'Failed to fetch decay data' });
    }
});

// GET /api/memory/:userId/heatmap
// Get importance heatmap data (importance over time)
router.get('/:userId/heatmap', async (req, res) => {
    try {
        const { userId } = req.params;

        const memories = await prisma.memoryEntry.findMany({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'asc' },
            select: {
                type: true,
                importanceScore: true,
                createdAt: true,
            },
        });

        // Group by week and type for heatmap
        const heatmap: Record<string, Record<string, { count: number; avgImportance: number }>> = {};

        for (const m of memories) {
            const date = m.createdAt;
            // Get week start (Monday)
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1);
            const weekStart = new Date(date.setDate(diff)).toISOString().split('T')[0];
            const type = m.type.toLowerCase();

            if (!heatmap[weekStart]) heatmap[weekStart] = {};
            if (!heatmap[weekStart][type]) heatmap[weekStart][type] = { count: 0, avgImportance: 0 };

            const cell = heatmap[weekStart][type];
            cell.avgImportance = (cell.avgImportance * cell.count + m.importanceScore) / (cell.count + 1);
            cell.count++;
        }

        res.json(heatmap);
    } catch (error) {
        logger.error('Failed to fetch heatmap', error);
        res.status(500).json({ error: 'Failed to fetch heatmap' });
    }
});

// GET /api/memory/:userId/relations
// Get memory relations (knowledge graph)
router.get('/:userId/relations', async (req, res) => {
    try {
        const { userId } = req.params;

        const memories = await prisma.memoryEntry.findMany({
            where: { userId, isActive: true },
            select: { id: true, type: true, content: true, importanceScore: true },
            take: 100,
            orderBy: { importanceScore: 'desc' },
        });

        // Try to get relations from MemoryRelation table
        let relations: any[] = [];
        try {
            relations = await (prisma as any).memoryRelation.findMany({
                where: {
                    OR: [
                        { sourceId: { in: memories.map((m: any) => m.id) } },
                        { targetId: { in: memories.map((m: any) => m.id) } },
                    ],
                },
            });
        } catch {
            // MemoryRelation table might not exist
        }

        res.json({
            nodes: memories.map(m => ({
                id: m.id,
                type: m.type.toLowerCase(),
                label: m.content.substring(0, 50),
                importance: m.importanceScore,
            })),
            edges: relations.map((r: any) => ({
                source: r.sourceId,
                target: r.targetId,
                type: r.relationType,
                strength: r.strength,
            })),
        });
    } catch (error) {
        logger.error('Failed to fetch relations', error);
        res.status(500).json({ error: 'Failed to fetch relations' });
    }
});

export const memoryRoutes = router;
