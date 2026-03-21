import { Router } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

/**
 * GET /api/voice/tts/voices
 * Available TTS voices (used by frontend Web Speech API)
 */
router.get('/tts/voices', (_req, res) => {
    // These map to Web Speech API voices available in the browser
    // The frontend handles TTS directly via the browser's SpeechSynthesis API
    res.json({
        info: 'TTS wird direkt im Browser via Web Speech API gehandhabt.',
        browserSupport: 'Chrome, Firefox, Edge, Safari',
    });
});

/**
 * POST /api/voice/stt/transcribe
 * Speech-to-Text via Whisper (optional backend transcription)
 *
 * Note: Primary STT is handled in the browser via Web Speech API.
 * This endpoint is for future Whisper integration for better accuracy.
 */
router.post('/stt/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Keine Audio-Datei gesendet' });
            return;
        }

        logger.info('STT request received', {
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
        });

        // Check if Ollama whisper model is available
        const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        try {
            const response = await fetch(`${ollamaUrl}/api/tags`);
            const data = await response.json() as { models?: Array<{ name: string }> };
            const hasWhisper = data.models?.some((m: { name: string }) => m.name.includes('whisper'));

            if (hasWhisper) {
                // TODO: Implement Ollama Whisper transcription
                res.json({
                    text: '',
                    source: 'whisper',
                    info: 'Whisper-Modell gefunden, Transcription noch nicht implementiert. Nutze Browser Web Speech API.',
                });
                return;
            }
        } catch {
            // Ollama not available
        }

        res.json({
            text: '',
            source: 'none',
            info: 'Backend-STT nicht verfuegbar. Browser Web Speech API wird als Fallback genutzt.',
        });

    } catch (error) {
        logger.error('STT error', { error });
        res.status(500).json({ error: 'STT-Verarbeitung fehlgeschlagen' });
    }
});

/**
 * GET /api/voice/status
 * Check voice capabilities
 */
router.get('/status', (_req, res) => {
    res.json({
        stt: {
            browser: true,  // Web Speech API (primary)
            whisper: false,  // Backend Whisper (not yet implemented)
        },
        tts: {
            browser: true,   // Web Speech API SpeechSynthesis
        },
    });
});

export default router;
