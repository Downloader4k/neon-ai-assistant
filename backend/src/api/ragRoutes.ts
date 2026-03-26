import { Router } from 'express';
import { prisma } from '../services/db/prisma';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.json', '.csv', '.ts', '.js', '.py'];

function getAllFiles(dirPath: string, fileList: string[] = []): string[] {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                // Skip node_modules, .git, etc.
                if (['node_modules', '.git', 'dist', '__pycache__', '.next'].includes(entry.name)) {
                    continue;
                }
                getAllFiles(fullPath, fileList);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (SUPPORTED_EXTENSIONS.includes(ext)) {
                    fileList.push(fullPath);
                }
            }
        }
    } catch (err) {
        logger.error('Error reading directory', { dirPath, error: err });
    }
    return fileList;
}

// POST /api/rag/index - Index all supported files in a folder
router.post('/index', async (req, res) => {
    try {
        const { folderPath } = req.body;

        if (!folderPath || typeof folderPath !== 'string') {
            return res.status(400).json({ error: 'Parameter "folderPath" ist erforderlich' });
        }

        const resolvedPath = path.resolve(folderPath);

        if (!fs.existsSync(resolvedPath)) {
            return res.status(400).json({ error: `Ordner nicht gefunden: ${resolvedPath}` });
        }

        if (!fs.statSync(resolvedPath).isDirectory()) {
            return res.status(400).json({ error: `Pfad ist kein Ordner: ${resolvedPath}` });
        }

        const files = getAllFiles(resolvedPath);
        let indexed = 0;
        let errors = 0;

        for (const filePath of files) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const relativeName = path.relative(resolvedPath, filePath).replace(/\\/g, '/');
                const truncatedContent = content.slice(0, 1000);

                await prisma.memoryEntry.create({
                    data: {
                        type: 'FACT',
                        content: `[RAG: ${relativeName}] ${truncatedContent}`,
                        importanceScore: 0.7,
                        userId: 'default-user',
                    },
                });
                indexed++;
            } catch (err) {
                logger.error('Error indexing file', { filePath, error: err });
                errors++;
            }
        }

        res.json({ indexed, errors, folder: resolvedPath });
    } catch (error) {
        logger.error('RAG indexing error', { error });
        res.status(500).json({
            error: 'Indexierung fehlgeschlagen',
            details: error instanceof Error ? error.message : 'Unbekannter Fehler',
        });
    }
});

// GET /api/rag/search?q=query&folder=path - Search indexed RAG entries
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q as string;
        const folder = req.query.folder as string | undefined;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ error: 'Query parameter "q" ist erforderlich' });
        }

        const whereClause: any = {
            content: {
                startsWith: '[RAG:',
            },
            AND: {
                content: {
                    contains: query.trim(),
                },
            },
        };

        if (folder) {
            whereClause.AND = {
                content: {
                    contains: query.trim(),
                },
            };
        }

        const entries = await prisma.memoryEntry.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        const results = entries.map((entry) => {
            const match = entry.content.match(/^\[RAG: (.+?)\]\s*/);
            const filename = match ? match[1] : 'Unbekannt';
            const contentPreview = entry.content.replace(/^\[RAG: .+?\]\s*/, '').slice(0, 300);

            return {
                id: entry.id,
                filename,
                contentPreview,
                createdAt: entry.createdAt,
                importanceScore: entry.importanceScore,
            };
        });

        res.json({ results, query: query.trim(), total: results.length });
    } catch (error) {
        logger.error('RAG search error', { error });
        res.status(500).json({
            error: 'Suche fehlgeschlagen',
            details: error instanceof Error ? error.message : 'Unbekannter Fehler',
        });
    }
});

// GET /api/rag/status - Get total number of indexed RAG entries
router.get('/status', async (_req, res) => {
    try {
        const total = await prisma.memoryEntry.count({
            where: {
                content: {
                    startsWith: '[RAG:',
                },
            },
        });

        res.json({ totalIndexed: total });
    } catch (error) {
        logger.error('RAG status error', { error });
        res.status(500).json({
            error: 'Status konnte nicht abgerufen werden',
            details: error instanceof Error ? error.message : 'Unbekannter Fehler',
        });
    }
});

export { router as ragRoutes };
