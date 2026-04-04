/**
 * Skill Store / Plugin Marketplace Routes
 *
 * Endpoints:
 * - GET  /api/skill-store          - List all skills with metadata
 * - GET  /api/skill-store/:name    - Get skill details
 * - POST /api/skill-store/install  - Install from local path or GitHub
 * - POST /api/skill-store/uninstall - Uninstall a skill
 * - PATCH /api/skill-store/:name/toggle - Enable/disable
 * - POST /api/skill-store/:name/settings - Update settings
 * - POST /api/skill-store/:name/rate - Rate a skill
 */

import { Router } from 'express';
import { skillRegistry } from '../services/skills/SkillRegistry';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/skill-store
 * List all skills with full metadata
 */
router.get('/', async (_req, res) => {
    try {
        // Ensure registry is initialized
        await skillRegistry.initialize();

        const skills = skillRegistry.getAll().map(s => ({
            name: s.manifest.name,
            displayName: s.manifest.displayName || s.manifest.name,
            version: s.manifest.version,
            description: s.manifest.description,
            author: s.manifest.author,
            icon: s.manifest.icon,
            category: s.manifest.category || 'custom',
            tags: s.manifest.tags || [],
            permissions: s.manifest.permissions || [],
            triggers: s.manifest.triggers || [],
            settings: s.manifest.settings || [],
            source: s.manifest.source || 'local',
            verified: s.manifest.verified || false,
            rating: s.manifest.rating || 0,
            downloads: s.manifest.downloads || 0,
            enabled: s.enabled,
            installedAt: s.installedAt,
            userSettings: s.userSettings,
        }));

        res.json(skills);
    } catch (error) {
        logger.error('Failed to list skills', { error });
        res.status(500).json({ error: 'Fehler beim Laden der Skills' });
    }
});

/**
 * GET /api/skill-store/:name
 * Get skill details
 */
router.get('/:name', async (req, res) => {
    try {
        await skillRegistry.initialize();
        const skill = skillRegistry.get(req.params.name);

        if (!skill) {
            res.status(404).json({ error: 'Skill nicht gefunden' });
            return;
        }

        res.json({
            ...skill.manifest,
            enabled: skill.enabled,
            installPath: skill.installPath,
            installedAt: skill.installedAt,
            userSettings: skill.userSettings,
        });
    } catch (error) {
        logger.error('Failed to get skill', { error });
        res.status(500).json({ error: 'Fehler beim Laden des Skills' });
    }
});

/**
 * POST /api/skill-store/install
 * Install a skill from local path or GitHub URL
 * Body: { source: 'local' | 'github', path: string }
 */
router.post('/install', async (req, res) => {
    try {
        await skillRegistry.initialize();
        const { source, path: sourcePath } = req.body;

        if (!source || !sourcePath) {
            res.status(400).json({ error: 'source und path sind erforderlich' });
            return;
        }

        let result;
        if (source === 'github') {
            result = await skillRegistry.installFromGitHub(sourcePath);
        } else {
            result = await skillRegistry.installFromLocal(sourcePath);
        }

        if (result.success) {
            res.json({ success: true, message: 'Skill installiert' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        logger.error('Failed to install skill', { error });
        res.status(500).json({ error: 'Installation fehlgeschlagen' });
    }
});

/**
 * POST /api/skill-store/uninstall
 * Uninstall a skill
 * Body: { name: string }
 */
router.post('/uninstall', async (req, res) => {
    try {
        await skillRegistry.initialize();
        const { name } = req.body;

        if (!name) {
            res.status(400).json({ error: 'name ist erforderlich' });
            return;
        }

        const result = await skillRegistry.uninstall(name);

        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        logger.error('Failed to uninstall skill', { error });
        res.status(500).json({ error: 'Deinstallation fehlgeschlagen' });
    }
});

/**
 * PATCH /api/skill-store/:name/toggle
 * Enable or disable a skill
 */
router.patch('/:name/toggle', async (req, res) => {
    try {
        await skillRegistry.initialize();
        const skill = skillRegistry.get(req.params.name);

        if (!skill) {
            res.status(404).json({ error: 'Skill nicht gefunden' });
            return;
        }

        const newState = !skill.enabled;
        await skillRegistry.toggleSkill(req.params.name, newState);

        res.json({ success: true, enabled: newState });
    } catch (error) {
        logger.error('Failed to toggle skill', { error });
        res.status(500).json({ error: 'Toggle fehlgeschlagen' });
    }
});

/**
 * POST /api/skill-store/:name/settings
 * Update skill settings
 */
router.post('/:name/settings', async (req, res) => {
    try {
        await skillRegistry.initialize();
        const { settings } = req.body;

        if (!settings) {
            res.status(400).json({ error: 'settings Objekt ist erforderlich' });
            return;
        }

        await skillRegistry.updateSettings(req.params.name, settings);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to update skill settings', { error });
        res.status(500).json({ error: 'Settings-Update fehlgeschlagen' });
    }
});

/**
 * POST /api/skill-store/:name/rate
 * Rate a skill (1-5)
 */
router.post('/:name/rate', async (req, res) => {
    try {
        await skillRegistry.initialize();
        const { rating } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            res.status(400).json({ error: 'rating muss zwischen 1 und 5 liegen' });
            return;
        }

        await skillRegistry.rateSkill(req.params.name, rating);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to rate skill', { error });
        res.status(500).json({ error: 'Bewertung fehlgeschlagen' });
    }
});

export default router;
