import { Router } from 'express';
import { proactiveRoutes } from './proactiveRoutes';
import { uploadRoutes } from './uploadRoutes';

import { magicRoutes } from './magicRoutes';
import { adminRoutes } from './adminRoutes';
import voiceRoutes from './voice';

const router = Router();

// Mount sub-routes
router.use('/proactive', proactiveRoutes);
router.use('/upload', uploadRoutes);
router.use('/voice', voiceRoutes);

router.use('/magic', magicRoutes);
router.use('/admin', adminRoutes);
import { settingsRoutes } from './settingsRoutes';
router.use('/settings', settingsRoutes);

import { memoryRoutes } from './memoryRoutes';
router.use('/memory', memoryRoutes);

// Health check
router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

export { router };
