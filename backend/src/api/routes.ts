import { Router } from 'express';
import { proactiveRoutes } from './proactiveRoutes';
import { uploadRoutes } from './uploadRoutes';
import { magicRoutes } from './magicRoutes';
import { adminRoutes } from './adminRoutes';
import voiceRoutes from './voice';
import { settingsRoutes } from './settingsRoutes';
import { memoryRoutes } from './memoryRoutes';
import { authMiddleware, adminAuthMiddleware } from '../middleware/auth';
import { memoryMonitor } from '../utils/performance';

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

// Geschuetzte Routes (Token-Auth wenn API_ACCESS_TOKEN gesetzt)
router.use('/proactive', authMiddleware, proactiveRoutes);
router.use('/upload', authMiddleware, uploadRoutes);
router.use('/voice', authMiddleware, voiceRoutes);
router.use('/magic', authMiddleware, magicRoutes);
router.use('/settings', authMiddleware, settingsRoutes);
router.use('/memory', authMiddleware, memoryRoutes);

// Admin-Routes (strenger geschuetzt)
router.use('/admin', adminAuthMiddleware, adminRoutes);

export { router };
