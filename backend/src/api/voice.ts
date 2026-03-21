import { Router } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger';

const router = Router();

// Configure multer for audio uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

/**
 * Get available voices
 */
router.get('/tts/voices', (_req, res) => {
    // Placeholder voices
    const voices = [
        { id: 'alloy', name: 'Alloy', gender: 'neutral' },
        { id: 'echo', name: 'Echo', gender: 'male' },
        { id: 'fable', name: 'Fable', gender: 'male' },
        { id: 'onyx', name: 'Onyx', gender: 'male' },
        { id: 'nova', name: 'Nova', gender: 'female' },
        { id: 'shimmer', name: 'Shimmer', gender: 'female' },
    ];

    res.json(voices);
});

/**
 * Whisper STT endpoint (placeholder - requires Whisper installation)
 */
router.post('/stt/whisper', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No audio file provided' });
            return;
        }

        logger.info('Whisper STT request processed', {
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
        });

        // Placeholder response
        res.json({
            text: "Voice transcription is currently a placeholder. Backend integration with Whisper is required.",
            confidence: 0.99
        });

    } catch (error) {
        logger.error('Error processing voice request', { error });
        res.status(500).json({ error: 'Internal server error processing voice' });
    }
});

export default router;
