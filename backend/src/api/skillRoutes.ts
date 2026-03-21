import { Router } from 'express';
import { userPreferenceService } from '../services/db/UserPreferenceService';

const router = Router();

// In-memory store for now, or fetch from DB/Config
const skills = [
    {
        id: 'knowledge-base',
        name: 'Wissensdatenbank (RAG)',
        version: '1.0.0',
        author: 'Neon Core',
        description: 'Ermöglicht das Speichern und Abrufen von Dokumenten (PDF, MD, TXT) für das Langzeitgedächtnis.',
        enabled: true,
        hasSettings: false
    },
    {
        id: 'weather',
        name: 'Wetter & Vorhersage',
        version: '1.0.0',
        author: 'Neon Core',
        description: 'Zeigt aktuelle Wetterdaten und Vorhersagen mit grafischen Karten an. Erkennt Fragen nach Wetter automatisch.',
        enabled: true,
        hasSettings: true
    }
];

/**
 * GET /api/skills
 * List available skills
 */
router.get('/', (_req, res) => {
    res.json({ skills }); // Return wrapped in object
});

/**
 * PATCH /api/skills/:id/toggle
 * Toggle skill enabled state
 */
router.patch('/:id/toggle', (req, res) => {
    const { id } = req.params;
    const skill = skills.find(s => s.id === id);
    if (skill) {
        skill.enabled = !skill.enabled;
        res.json({ success: true, skill });
    } else {
        res.status(404).json({ error: 'Skill not found' });
    }
});

/**
 * GET /api/skills/:id/settings
 * Get skill settings (stored as user preferences)
 */
router.get('/:id/settings', async (req, res) => {
    const { id } = req.params;
    const { userId = 'default-user' } = req.query; // Assume query param or default

    try {
        // Fetch preferences with category "skill:<skillId>"
        const category = `skill:${id}`;
        const settings = await userPreferenceService.getPreferences(userId as string, category);
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

/**
 * POST /api/skills/:id/settings
 * Save skill settings
 */
router.post('/:id/settings', async (req, res) => {
    const { id } = req.params;
    const { userId = 'default-user', settings } = req.body;

    try {
        const category = `skill:${id}`;
        
        // Save each setting
        for (const [key, value] of Object.entries(settings)) {
            await userPreferenceService.setPreference(
                userId, 
                key, // e.g. "location"
                String(value), 
                category
            );
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

export { router as skillRoutes };
