import { Router } from 'express';
import { proactiveRoutes } from './proactiveRoutes';
import { uploadRoutes } from './uploadRoutes';
import { magicRoutes } from './magicRoutes';
import { adminRoutes } from './adminRoutes';
import { summaryRoutes } from './summaryRoutes';
import { ragRoutes } from './ragRoutes';
import voiceRoutes from './voice';
import { settingsRoutes } from './settingsRoutes';
import { memoryRoutes } from './memoryRoutes';
import { profileRoutes } from './profileRoutes';
import { authMiddleware, adminAuthMiddleware } from '../middleware/auth';
import { memoryMonitor } from '../utils/performance';
import { semanticSearchService } from '../services/search/SemanticSearchService';
import { codeExecutionService } from '../services/execution/CodeExecutionService';
import { prisma } from '../services/db/prisma';

const router = Router();

// Health check (immer offen, mit System-Info)
router.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date(),
        uptime: Math.round(process.uptime()),
        memory: memoryMonitor.getStats(),
    });
});

// Semantische Suche
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const query = req.query.q as string;
        const limit = parseInt(req.query.limit as string) || 10;
        const conversationId = req.query.conversationId as string | undefined;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        const results = await semanticSearchService.search(query.trim(), limit, conversationId);
        res.json({ results, query: query.trim(), total: results.length });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// Geschuetzte Routes (Token-Auth wenn API_ACCESS_TOKEN gesetzt)
router.use('/proactive', authMiddleware, proactiveRoutes);
router.use('/upload', authMiddleware, uploadRoutes);
router.use('/voice', authMiddleware, voiceRoutes);
router.use('/magic', authMiddleware, magicRoutes);
router.use('/settings', authMiddleware, settingsRoutes);
router.use('/memory', authMiddleware, memoryRoutes);
router.use('/profiles', authMiddleware, profileRoutes);
router.use('/summary', authMiddleware, summaryRoutes);
router.use('/rag', authMiddleware, ragRoutes);

// Code-Ausfuehrung (Admin-geschuetzt)
router.post('/code/execute', adminAuthMiddleware, async (req, res) => {
    try {
        const { code, language } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'Parameter "code" ist erforderlich' });
        }

        const validLanguages = ['javascript', 'python', 'powershell'] as const;
        if (!language || !validLanguages.includes(language)) {
            return res.status(400).json({ error: `Ungueltige Sprache. Erlaubt: ${validLanguages.join(', ')}` });
        }

        const result = await codeExecutionService.execute(language, code);
        res.json(result);
    } catch (error) {
        console.error('Code execution error:', error);
        res.status(500).json({ error: 'Ausfuehrung fehlgeschlagen', details: error instanceof Error ? error.message : 'Unbekannter Fehler' });
    }
});

// Konversation abzweigen (Fork)
router.post('/conversations/:id/fork', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { fromMessageId } = req.body;

        if (!fromMessageId) {
            return res.status(400).json({ error: 'Parameter "fromMessageId" ist erforderlich' });
        }

        // Original-Konversation laden
        const original = await prisma.conversation.findUnique({
            where: { id },
            include: {
                messages: {
                    orderBy: { timestamp: 'asc' },
                },
            },
        });

        if (!original) {
            return res.status(404).json({ error: 'Konversation nicht gefunden' });
        }

        // Nachrichten bis einschliesslich der angegebenen Nachricht finden
        const cutoffIndex = original.messages.findIndex(m => m.id === fromMessageId);
        if (cutoffIndex === -1) {
            return res.status(404).json({ error: 'Nachricht nicht gefunden' });
        }

        const messagesToCopy = original.messages.slice(0, cutoffIndex + 1);
        const originalTitle = original.title || 'Unterhaltung';
        const forkTitle = `${originalTitle} (Abzweigung)`;

        // Neue Konversation mit kopierten Nachrichten erstellen
        const forkedConversation = await prisma.conversation.create({
            data: {
                userId: original.userId,
                sessionId: crypto.randomUUID(),
                title: forkTitle,
                type: original.type,
                messages: {
                    create: messagesToCopy.map(m => ({
                        role: m.role,
                        content: m.content,
                        modelUsed: m.modelUsed,
                        metadata: m.metadata,
                        timestamp: m.timestamp,
                    })),
                },
            },
            include: {
                messages: {
                    orderBy: { timestamp: 'asc' },
                },
            },
        });

        res.json({
            id: forkedConversation.id,
            title: forkedConversation.title,
            messages: forkedConversation.messages.map(m => ({
                id: m.id,
                role: m.role === 'USER' ? 'user' : m.role === 'ASSISTANT' ? 'assistant' : m.role.toLowerCase(),
                content: m.content,
                timestamp: m.timestamp,
                modelUsed: m.modelUsed,
            })),
        });
    } catch (error) {
        console.error('Fork conversation error:', error);
        res.status(500).json({ error: 'Abzweigung fehlgeschlagen', details: error instanceof Error ? error.message : 'Unbekannter Fehler' });
    }
});

// Admin-Routes (strenger geschuetzt)
router.use('/admin', adminAuthMiddleware, adminRoutes);

export { router };
