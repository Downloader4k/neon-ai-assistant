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
import { rateLimitMiddleware, sanitizeMiddleware } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for dev
}));
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        // Allow localhost and LAN IPs
        if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/)) {
            return callback(null, true);
        }
        callback(null, true); // Allow all origins in dev
    },
    credentials: true,
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // Serve static files from /public
app.use(express.urlencoded({ extended: true }));

// Security: Rate Limiting & Input Sanitization
app.use('/api', rateLimitMiddleware);
app.use('/api', sanitizeMiddleware);

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
import { selfTestRoutes } from './api/selfTestRoutes';

// API Routes
app.use('/api/skills/knowledge-base', knowledgeBaseRouter);
app.use('/api/skills', skillRoutes);
app.use('/api/selftest', selfTestRoutes);
app.use('/api', apiRoutes);

// Serve frontend build (production)
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// SPA fallback: serve index.html for all non-API routes
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
    }
    const indexPath = path.join(frontendDist, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            // Frontend not built yet — show fallback
            res.send('NEON AI Assistant — Frontend not built. Run: cd frontend && npm run build');
        }
    });
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
