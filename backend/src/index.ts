import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer } from 'http';
import { router as apiRoutes } from './api/routes';
import { initializeWebSocket } from './api/websocket';
import { connectDatabase } from './services/db/prisma';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // Serve static files from /public
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`, {
        query: req.query,
        ip: req.ip,
    });
    next();
});

import knowledgeBaseRouter from './skills/knowledgeBase/routes';
import { skillRoutes } from './api/skillRoutes';

// API Routes
app.use('/api/skills/knowledge-base', knowledgeBaseRouter);
app.use('/api/skills', skillRoutes);
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (_req, res) => {
    res.send('Neon AI Assistant Backend Running');
});

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket
initializeWebSocket(httpServer);

// Initialize things
(async () => {
    try {
        // Assuming embeddingService is imported or defined elsewhere if needed
        // await embeddingService.initialize();
        // await chromaService.connect(); // Connect on demand
    } catch (error) {
        logger.error('Failed to initialize services', { error });
    }
})();

// Start server
async function start() {
    try {
        // Connect to database
        await connectDatabase();

        // Ensure default user exists
        const { ensureDefaultUser } = await import('./services/db/userService');
        await ensureDefaultUser();

        // Initialize semantic search (non-blocking if fails)
        try {
            const { semanticSearchService } = await import('./services/search/SemanticSearchService');
            await semanticSearchService.initialize();
            logger.info('Semantic search service initialized');
        } catch (error) {
            logger.warn('Semantic search service failed to initialize (will continue without it)', { error });
        }

        // Initialize Spell Checker
        try {
            const { spellCheckService } = await import('./services/spellcheck/SpellCheckService');
            await spellCheckService.initialize();
            logger.info('Spell check service initialized');
        } catch (error) {
            logger.warn('Spell check service failed to initialize (will continue without it)', { error });
        }

        // Start Scheduler (Background Jobs)
        try {
            const { schedulerService } = await import('./services/SchedulerService');
            schedulerService.start();
            logger.info('Scheduler service started');
        } catch (error) {
            logger.error('Failed to start scheduler', { error });
        }

        // Start HTTP server
        httpServer.listen(PORT, () => {
            logger.info(`🚀 NEON Backend running on http://${HOST}:${PORT}`);
            logger.info(`📡 WebSocket server ready`);
            logger.info(`🎨 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (error) {
        logger.error('Failed to start server', { error });
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
    process.exit(1);
});

// Start the server
start();
