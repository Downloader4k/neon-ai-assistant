import { Router } from 'express';
import { aiRouter } from '../services/router/AIRouter';
import { logger } from '../utils/logger';
import { PERSONALITIES, PersonalityMode } from '../services/prompts/PromptService';

const router = Router();

// In-memory personality store (per user). In production this would be in a DB.
const userPersonalities: Record<string, PersonalityMode> = {};

export function getUserPersonality(userId: string): PersonalityMode {
    return userPersonalities[userId] || 'freundlich';
}

// GET available personalities
router.get('/personalities', (_req, res) => {
    const list = Object.values(PERSONALITIES).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        icon: p.icon,
    }));
    res.json(list);
});

// GET current personality for a user
router.get('/personality/:userId', (req, res) => {
    const personality = getUserPersonality(req.params.userId);
    res.json({ personality });
});

// POST set personality for a user
router.post('/personality/:userId', (req, res) => {
    const { personality } = req.body;
    if (!personality || !PERSONALITIES[personality as PersonalityMode]) {
        return res.status(400).json({ error: 'Ungueltige Persoenlichkeit' });
    }
    userPersonalities[req.params.userId] = personality as PersonalityMode;
    logger.info('Personality updated', { userId: req.params.userId, personality });
    res.json({ success: true, personality });
});

// GET current settings
router.get('/', (_req, res) => {
    try {
        const aiConfig = aiRouter.getConfig();

        // Map internal config to frontend settings structure
        const settings = {
            ai: {
                defaultModel: aiConfig.complexityThreshold < 10 ? 'claude' : (aiConfig.complexityThreshold > 90 ? 'ollama' : 'auto'),
                complexityThreshold: aiConfig.complexityThreshold / 100, // Convert 0-100 to 0-1
                hybridMode: aiConfig.enableHybridMode,
                privacyMode: aiConfig.privacyMode,
                ollamaModel: aiConfig.ollamaModel,
                visionProvider: aiConfig.visionProvider || 'local',
                personality: getUserPersonality('default-user'),
                // These are stateless/env-based normally, but we return defaults
                temperature: 0.7,
                maxTokens: 2000,
            },
            // Other settings are client-side only for now or need DB persistence
            // returning blank/defaults for them, frontend handles merging
        };

        res.json(settings);
    } catch (error) {
        logger.error('Failed to get settings', { error });
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// GET available Ollama models
router.get('/models', async (_req, res) => {
    try {
        const { ollamaService } = await import('../services/ollama/OllamaService');
        const models = await ollamaService.listModels();
        res.json(models);
    } catch (error) {
        logger.error('Failed to fetch Ollama models', { error });
        res.status(500).json({ error: 'Failed to fetch Ollama models' });
    }
});

// POST update settings
router.post('/', (req, res) => {
    try {
        const { ai } = req.body;

        if (ai) {
            // Update AI Router config
            const updates: any = {};

            if (ai.complexityThreshold !== undefined) {
                updates.complexityThreshold = Math.round(ai.complexityThreshold * 100);
            }

            if (ai.hybridMode !== undefined) {
                updates.enableHybridMode = ai.hybridMode;
            }

            if (ai.privacyMode !== undefined) {
                updates.privacyMode = ai.privacyMode;
            }

            if (ai.ollamaModel !== undefined) {
                updates.ollamaModel = ai.ollamaModel;
            }

            if (ai.visionProvider !== undefined) {
                updates.visionProvider = ai.visionProvider;
            }

            // Handle "Default Model" selection as preset complexity thresholds
            if (ai.defaultModel) {
                if (ai.defaultModel === 'claude') {
                    updates.complexityThreshold = 0; // Always use Claude (logic inverted? No, < thresh = Ollama. So thresh 0 means everything > 0 => Claude? Wait.)
                    // Logic: complexity < threshold => Ollama. 
                    // To force Claude: threshold = 0 (so nothing is < 0)
                    // To force Ollama: threshold = 100 (so everything is < 100)
                    // BUT AIRouter logic:
                    // if (complexity < threshold) => Ollama
                    // else => Claude

                    // Force Claude: threshold = 0. (0 < 0 is false -> Claude)
                    updates.complexityThreshold = 0;
                } else if (ai.defaultModel === 'ollama') {
                    // Force Ollama: threshold = 100. (everything < 100 -> Ollama)
                    updates.complexityThreshold = 100;
                } else if (ai.defaultModel === 'auto') {
                    // Check if specific threshold was provided, otherwise default 30
                    if (ai.complexityThreshold === undefined) {
                        updates.complexityThreshold = 30;
                    }
                }
            }

            aiRouter.updateConfig(updates);
        }

        logger.info('Settings updated', { settings: req.body });
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to save settings', { error });
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

export { router as settingsRoutes };
