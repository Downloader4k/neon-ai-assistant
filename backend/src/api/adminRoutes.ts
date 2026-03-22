import { Router } from 'express';
import multer from 'multer';
import { simpleInterviewService } from '../services/learning/SimpleInterviewService';
import { logger } from '../utils/logger';
import { Cache } from '../utils/performance';

// Cache fuer Admin-Stats (30 Sekunden TTL)
const statsCache = new Cache<any>(30_000);
// Cache fuer API-Usage (60 Sekunden TTL)
const usageCache = new Cache<any>(60_000);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['.txt', '.md', '.json', '.csv'];
        const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Dateityp nicht erlaubt: ${ext}. Erlaubt: ${allowed.join(', ')}`));
        }
    },
});

const router = Router();

// GET /api/admin/stats (mit Cache)
router.get('/stats', async (_req, res) => {
    try {
        const stats = await statsCache.getOrCompute('admin-stats', async () => {
            const { prisma } = await import('../services/db/prisma');
            const totalMemories = await prisma.memoryEntry.count({ where: { isActive: true } });
            const totalMessages = await prisma.message.count();
            const totalConversations = await prisma.conversation.count();
            const totalUsers = await prisma.user.count();

            const apiUsage = await prisma.apiUsage.aggregate({
                _sum: { tokensUsed: true, cost: true },
                _count: true,
            });

            return {
                database: { totalMemories, totalMessages, totalConversations, totalUsers },
                api: {
                    totalRequests: apiUsage._count || 0,
                    totalTokens: apiUsage._sum.tokensUsed || 0,
                    totalCostUsd: apiUsage._sum.cost || 0,
                },
            };
        });

        res.json(stats);
    } catch (error) {
        logger.error('Error getting admin stats', { error });
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// POST /api/admin/reindex-all
router.post('/reindex-all', async (_req, res) => {
    try {
        logger.info('ADMIN: Reindex triggered');

        const { semanticSearchService } = await import('../services/search/SemanticSearchService');
        const result = await semanticSearchService.reindexAllMessages();

        logger.info('ADMIN: Reindex completed', result);
        res.json({
            success: true,
            message: `Reindex abgeschlossen: ${result.success} Nachrichten indexiert, ${result.failed} fehlgeschlagen`,
            indexed: result.success,
            failed: result.failed,
        });
    } catch (error) {
        logger.error('Error reindexing', { error });
        res.status(500).json({ error: 'Reindex fehlgeschlagen' });
    }
});

// POST /api/admin/reset-memory [UPDATED - Simple Interview]
router.post('/reset-memory', async (_req, res) => {
    try {
        const userId = 'default-user';
        logger.warn('ADMIN: Triggering MEMORY RESET for user', { userId });

        // Reset interview state
        simpleInterviewService.resetInterview(userId);
        logger.info('Interview session reset');

        res.json({ success: true, message: 'Memory wiped successfully (Simple Interview)' });
    } catch (error) {
        logger.error('Error resetting memory', { error });
        res.status(500).json({ error: 'Memory reset failed' });
    }
});

// POST /api/admin/import — File upload for document import
router.post('/import', upload.array('files', 10), async (req, res) => {
    try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            res.status(400).json({ error: 'Keine Dateien hochgeladen' });
            return;
        }

        const userId = (req.body.userId as string) || 'default-user';
        const { prisma } = await import('../services/db/prisma');

        // Ensure user exists
        const { ensureDefaultUser } = await import('../services/db/userService');
        await ensureDefaultUser();
        let totalImported = 0;

        for (const file of files) {
            const text = file.buffer.toString('utf-8');
            const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

            let lines: string[] = [];

            if (ext === '.csv') {
                // CSV: skip header, each row becomes an entry
                const rows = text.split('\n').filter(l => l.trim());
                lines = rows.slice(1); // skip header
            } else if (ext === '.json') {
                // JSON: try array of strings or objects with "content" field
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                        lines = parsed.map(item =>
                            typeof item === 'string' ? item : (item.content || item.text || JSON.stringify(item))
                        );
                    } else if (parsed.content) {
                        lines = [parsed.content];
                    } else {
                        lines = [text];
                    }
                } catch {
                    lines = [text];
                }
            } else {
                // TXT, MD: split by double newlines (paragraphs) or single lines
                lines = text.split(/\n{2,}/).filter(l => l.trim().length > 5);
                if (lines.length <= 1) {
                    lines = text.split('\n').filter(l => l.trim().length > 5);
                }
            }

            for (const line of lines) {
                const cleanLine = line.replace(/^[-*]\s*/, '').trim();
                if (cleanLine.length < 3) continue;

                await prisma.memoryEntry.create({
                    data: {
                        userId,
                        type: 'FACT',
                        content: cleanLine,
                        importanceScore: 0.7,
                        isActive: true,
                    },
                });
                totalImported++;
            }

            logger.info(`Admin import: ${file.originalname} -> ${lines.length} entries`);
        }

        res.json({
            success: true,
            message: `${totalImported} Eintraege aus ${files.length} Datei(en) importiert`,
            count: totalImported,
        });
    } catch (error: any) {
        logger.error('Admin import failed', { error });
        res.status(500).json({ error: error.message || 'Import fehlgeschlagen' });
    }
});

// POST /api/admin/extract-memories - Manual Memory Extraction Trigger
router.post('/extract-memories', async (_req, res) => {
    try {
        logger.info('ADMIN: Manual memory extraction triggered');

        // Dynamically import to avoid circular dependency
        const { memoryManagerService } = await import('../services/memory/MemoryManagerService');

        try {
            const stats = await memoryManagerService.runExtractionJob();
            logger.info('ADMIN: Memory extraction completed', stats);
            res.json({
                success: true,
                message: `Extraktion abgeschlossen: ${stats.processed} neu, ${stats.skipped} übersprungen, ${stats.errors} Fehler`,
                stats
            });
        } catch (extractionError: any) {
            logger.error('ADMIN: Memory extraction job failed', {
                error: extractionError,
                message: extractionError?.message,
                stack: extractionError?.stack
            });
            res.status(500).json({
                error: 'Memory extraction failed',
                details: extractionError?.message || 'Unknown error'
            });
        }
    } catch (error: any) {
        logger.error('ADMIN: Failed to import or execute extraction', { error });

        // Check if it's a native module loading error
        if (error?.code === 'ERR_DLOPEN_FAILED' || error?.message?.includes('DLOPEN')) {
            res.status(500).json({
                error: 'Native module loading failed',
                details: 'The memory extraction system requires native modules (better-sqlite3, sqlite-vec) that need to be rebuilt. Run: cd backend && npm rebuild better-sqlite3 sqlite-vec'
            });
        } else {
            res.status(500).json({
                error: 'Internal server error',
                details: error?.message || 'Unknown error'
            });
        }
    }
});

// GET /api/admin/interviews - Get interview status and answers
router.get('/interviews', async (req, res) => {
    try {
        const userId = (req.query.userId as string) || 'default-user';
        const { prisma } = await import('../services/db/prisma');

        // 1. Get Config (Questions)
        const questions = simpleInterviewService.getQuestions();

        // 2. Get Progress
        const progress = await simpleInterviewService.getProgress(userId);

        // 3. Get Actual Answers (Memories)
        const memories = await prisma.memoryEntry.findMany({
            where: {
                userId,
                sourceExtractionId: {
                    startsWith: 'interview-'
                },
                isActive: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // Map memories to answers
        const answers = memories.map(m => {
            const questionId = m.sourceExtractionId?.replace('interview-', '') || 'unknown';
            // Content format: "Interview (questionId): Answer"
            // We want just the answer
            let answerText = m.content;
            const prefix = `Interview (${questionId}): `;
            if (answerText.startsWith(prefix)) {
                answerText = answerText.substring(prefix.length);
            }

            return {
                questionId,
                answer: answerText,
                memoryId: m.id,
                createdAt: m.createdAt
            };
        });

        res.json({
            questions,
            progress,
            answers
        });

    } catch (error) {
        logger.error('Error fetching interview data', { error });
        res.status(500).json({ error: 'Failed to fetch interview data' });
    }
});


// POST /api/admin/interviews/answer - Save an interview answer
router.post('/interviews/answer', async (req, res) => {
    try {
        const { userId = 'default-user', questionId, answer } = req.body;

        if (!questionId || !answer) {
            res.status(400).json({ error: 'Missing questionId or answer' });
            return;
        }

        // Save answer (handles updates internally)
        await simpleInterviewService.markQuestionAnswered(userId, questionId, answer);

        res.json({ success: true, message: 'Answer saved' });
    } catch (error) {
        logger.error('Error saving interview answer', { error });
        res.status(500).json({ error: 'Failed to save answer' });
    }
});

// DELETE /api/admin/memory/:id - Delete a specific memory
router.delete('/memory/:id', async (req, res) => {
    try {
        const { id } = req.params;
        logger.info(`ADMIN: Deleting memory ${id}`);

        const { memoryManagerService } = await import('../services/memory/MemoryManagerService');
        await memoryManagerService.deleteMemory(id);

        res.json({ success: true, message: 'Memory deleted' });
    } catch (error) {
        logger.error('Error deleting memory', { error });
        res.status(500).json({ error: 'Failed to delete memory' });
    }
});

// POST /api/admin/cleanup-memories - Delete memories by filter
router.post('/cleanup-memories', async (req, res) => {
    try {
        const userId = 'default-user';
        const { minImportance, maxImportance, types, tags, excludeTags } = req.body;

        logger.info('ADMIN: Cleanup memories triggered', { filter: req.body });

        const { memoryManagerService } = await import('../services/memory/MemoryManagerService');
        const count = await memoryManagerService.deleteMemoriesByFilter(userId, {
            minImportance,
            maxImportance,
            types,
            tags,
            excludeTags
        });

        res.json({ success: true, message: `${count} memories deleted`, count });
    } catch (error) {
        logger.error('Error cleaning up memories', { error });
        res.status(500).json({ error: 'Failed to cleanup memories' });
    }
});

// GET /api/admin/memories/search - Search memories by keyword
router.get('/memories/search', async (req, res) => {
    try {
        const { q, userId } = req.query;

        if (!q || typeof q !== 'string') {
            res.status(400).json({ error: 'Query parameter "q" is required' });
            return;
        }

        const { prisma } = await import('../services/db/prisma');

        const memories = await prisma.memoryEntry.findMany({
            where: {
                userId: userId as string || 'default-user',
                isActive: true,
                content: {
                    contains: q
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 50
        });

        logger.info('Memory search completed', { query: q, results: memories.length });
        res.json(memories);
    } catch (error) {
        logger.error('Error searching memories', { error });
        res.status(500).json({ error: 'Failed to search memories' });
    }
});

// POST /api/admin/memory/clear-working
// Clear all working memory (session cache) - removes stale info like hallucinated projects
router.post('/memory/clear-working', async (_req, res) => {
    try {
        const { workingMemoryService } = await import('../services/memory/WorkingMemoryService');

        // Clear all sessions
        workingMemoryService.clearAll();

        logger.info('Working memory cleared via admin endpoint');

        res.json({
            success: true,
            message: 'All working memory sessions cleared. Stale info removed.'
        });
    } catch (error) {
        logger.error('Failed to clear working memory', error);
        res.status(500).json({ error: 'Failed to clear working memory' });
    }
});

// GET /api/admin/usage - API-Nutzungsstatistiken (mit Cache)
router.get('/usage', async (_req, res) => {
    try {
        const data = await usageCache.getOrCompute('api-usage', async () => {
            const { prisma } = await import('../services/db/prisma');
            const { currencyService } = await import('../services/currency/CurrencyService');

            const rate = await currencyService.getRate();

            const usageByService = await prisma.apiUsage.groupBy({
                by: ['service'],
                _sum: { tokensUsed: true, cost: true },
            });

            const recentLogs = await prisma.apiUsage.findMany({
                orderBy: { timestamp: 'desc' },
                take: 50,
            });

            const totalCostUsd = usageByService.reduce((sum, item) => sum + (item._sum.cost || 0), 0);

            return {
                currency: 'EUR',
                rate,
                summary: usageByService.map(u => ({
                    service: u.service,
                    tokens: u._sum.tokensUsed || 0,
                    cost: (u._sum.cost || 0) * rate,
                })),
                totalCost: totalCostUsd * rate,
                recentLogs: recentLogs.map(log => ({ ...log, cost: log.cost * rate })),
            };
        });

        res.json(data);
    } catch (error) {
        logger.error('Error fetching API usage', { error });
        res.status(500).json({ error: 'Failed to fetch API usage' });
    }
});

export const adminRoutes = router;
