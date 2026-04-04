import { Router } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger';
import { voiceOrchestrator } from '../services/voice/VoiceSessionOrchestrator';
import { sttService } from '../services/voice/STTService';
import { ttsService } from '../services/voice/TTSService';
import { DEFAULT_AUDIO_CONFIG } from '../services/voice/AudioUtils';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

/**
 * GET /api/voice/status
 * Full voice system status
 */
router.get('/status', (_req, res) => {
    res.json(voiceOrchestrator.getStatus());
});

/**
 * GET /api/voice/tts/voices
 * Available TTS voices
 */
router.get('/tts/voices', async (_req, res) => {
    try {
        const voices = await ttsService.getVoices();
        const status = ttsService.getStatus();
        res.json({
            backend: status.backend,
            currentVoice: status.voice,
            voices,
        });
    } catch (error) {
        logger.error('Failed to get TTS voices', { error });
        res.status(500).json({ error: 'Fehler beim Laden der Stimmen' });
    }
});

/**
 * POST /api/voice/tts/set-voice
 * Change TTS voice
 */
router.post('/tts/set-voice', async (req, res) => {
    try {
        const { voice } = req.body;
        if (!voice) {
            res.status(400).json({ error: 'Kein Voice-Name angegeben' });
            return;
        }
        await ttsService.setVoice(voice);
        res.json({ success: true, voice });
    } catch (error) {
        logger.error('Failed to set TTS voice', { error });
        res.status(500).json({ error: 'Fehler beim Setzen der Stimme' });
    }
});

/**
 * POST /api/voice/tts/synthesize
 * Text-to-Speech synthesis (returns audio)
 */
router.post('/tts/synthesize', async (req, res) => {
    try {
        const { text, voice } = req.body;
        if (!text) {
            res.status(400).json({ error: 'Kein Text angegeben' });
            return;
        }

        const result = await ttsService.synthesize(text, voice ? { voice } : undefined);

        if (result.audio.length === 0) {
            res.json({
                backend: result.backend,
                info: 'Backend-TTS nicht verfuegbar, nutze Browser Web Speech API.',
            });
            return;
        }

        const contentType = result.format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
        res.set({
            'Content-Type': contentType,
            'Content-Length': result.audio.length.toString(),
            'X-TTS-Backend': result.backend,
            'X-TTS-Duration': (result.duration || 0).toString(),
        });
        res.send(result.audio);
    } catch (error) {
        logger.error('TTS synthesis error', { error });
        res.status(500).json({ error: 'TTS-Synthese fehlgeschlagen' });
    }
});

/**
 * POST /api/voice/stt/transcribe
 * Speech-to-Text via backend (Whisper)
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

        const sttStatus = sttService.getStatus();
        if (!sttStatus.available) {
            res.json({
                text: '',
                backend: 'browser',
                info: 'Backend-STT nicht verfuegbar. Browser Web Speech API wird als Fallback genutzt.',
            });
            return;
        }

        const result = await sttService.transcribe(req.file.buffer, DEFAULT_AUDIO_CONFIG);

        res.json({
            text: result.text,
            backend: result.backend,
            language: result.language,
            duration: result.duration,
            confidence: result.confidence,
        });
    } catch (error) {
        logger.error('STT error', { error });
        res.status(500).json({ error: 'STT-Verarbeitung fehlgeschlagen' });
    }
});

/**
 * POST /api/voice/config
 * Update voice pipeline configuration
 */
router.post('/config', async (req, res) => {
    try {
        const { stt, tts } = req.body;

        if (stt) {
            sttService.updateConfig(stt);
            await sttService.initialize();
        }

        if (tts) {
            ttsService.updateConfig(tts);
            await ttsService.initialize();
        }

        res.json({
            success: true,
            status: voiceOrchestrator.getStatus(),
        });
    } catch (error) {
        logger.error('Voice config error', { error });
        res.status(500).json({ error: 'Konfiguration fehlgeschlagen' });
    }
});

export default router;
