import { Router } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger';
import { voiceOrchestrator } from '../services/voice/VoiceSessionOrchestrator';
import { sttService } from '../services/voice/STTService';
import { ttsService } from '../services/voice/TTSService';
import { customVoicesStore } from '../services/voice/CustomVoicesStore';
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
router.get('/tts/voices', async (req, res) => {
    try {
        const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
        const voices = await ttsService.getVoices(refresh);
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
        const { voice, backend } = req.body;
        if (!voice) {
            res.status(400).json({ error: 'Kein Voice-Name angegeben' });
            return;
        }
        await ttsService.setVoice(voice, backend);
        res.json({ success: true, voice, backend: backend || undefined });
    } catch (error) {
        logger.error('Failed to set TTS voice', { error });
        res.status(500).json({ error: 'Fehler beim Setzen der Stimme' });
    }
});

/**
 * GET /api/voice/tts/voices-all
 * Liefert sowohl Edge-TTS als auch ElevenLabs-Voices
 */
router.get('/tts/voices-all', async (req, res) => {
    try {
        const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
        const status = ttsService.getStatus();
        // Aktuelle Voices
        const current = await ttsService.getVoices(refresh);

        // Wenn beide Backends verfuegbar, die andere Liste auch liefern
        const otherBackend = status.backend === 'elevenlabs' ? 'edge-tts' : 'elevenlabs';
        let otherVoices: any[] = [];

        if (otherBackend === 'elevenlabs' && status.elevenLabsReady) {
            // ElevenLabs-Voices separat anfragen
            const prevBackend = status.backend;
            ttsService.updateConfig({ backend: 'elevenlabs' });
            try {
                otherVoices = await ttsService.getVoices(refresh);
            } catch (e) { /* ignore */ }
            // zurueckschalten
            ttsService.updateConfig({ backend: prevBackend });
            await ttsService.initialize();
        } else if (otherBackend === 'edge-tts') {
            const prevBackend = status.backend;
            ttsService.updateConfig({ backend: 'edge-tts' });
            try {
                otherVoices = await ttsService.getVoices(refresh);
            } catch (e) { /* ignore */ }
            ttsService.updateConfig({ backend: prevBackend });
            await ttsService.initialize();
        }

        res.json({
            currentBackend: status.backend,
            currentVoice: status.voice,
            elevenLabsReady: status.elevenLabsReady,
            voices: [...current, ...otherVoices],
        });
    } catch (error) {
        logger.error('Failed to get all voices', { error });
        res.status(500).json({ error: 'Fehler beim Laden der Stimmen' });
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
 * POST /api/voice/tts/stream
 * Streaming TTS: liefert MP3-Chunks sobald ElevenLabs sie erzeugt
 * (chunked transfer encoding). Der Client kann sofort abspielen -
 * deutlich niedrigere wahrgenommene Latenz als /synthesize.
 * Body: { text: string, voice?: string }
 */
router.post('/tts/synthesize-stream', async (req, res) => {
    try {
        const { text, voice } = req.body;
        if (!text) {
            res.status(400).json({ error: 'Kein Text angegeben' });
            return;
        }

        const { stream, backend, voiceId } = await ttsService.synthesizeStream(
            text,
            voice ? { voice } : undefined,
        );

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('X-TTS-Backend', backend);
        res.setHeader('X-TTS-Voice', voiceId);
        res.setHeader('Cache-Control', 'no-cache');
        // Wichtig: kein Buffering durch evtl. Reverse-Proxies
        res.setHeader('X-Accel-Buffering', 'no');

        let bytesSent = 0;
        stream.on('data', (chunk: Buffer) => {
            bytesSent += chunk.length;
            res.write(chunk);
        });
        stream.on('end', () => {
            logger.info(`[TTS] Stream fertig, ${(bytesSent / 1024).toFixed(1)}KB gesendet`);
            res.end();
        });
        stream.on('error', (err: any) => {
            logger.error('[TTS] Stream error', { err: err?.message || err });
            if (!res.headersSent) res.status(500);
            res.end();
        });

        // Client hat abgebrochen (z.B. Stop-Button, Barge-in) → Stream sauber beenden
        req.on('close', () => {
            try { (stream as any).destroy?.(); } catch { /* ignore */ }
        });
    } catch (error: any) {
        logger.error('TTS stream error', { error: error?.message || error });
        if (!res.headersSent) {
            res.status(500).json({ error: error?.message || 'TTS-Streaming fehlgeschlagen' });
        } else {
            res.end();
        }
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
 * GET /api/voice/tts/custom-voices
 * Liefert die persistent gespeicherten User-Custom-Voices (backend/data/custom-voices.json).
 */
router.get('/tts/custom-voices', (_req, res) => {
    try {
        res.json({ voices: customVoicesStore.list() });
    } catch (error) {
        logger.error('Custom-Voices lesen fehlgeschlagen', { error });
        res.status(500).json({ error: 'Custom-Voices lesen fehlgeschlagen' });
    }
});

/**
 * POST /api/voice/tts/custom-voices
 * Body: { name?: string, voiceId: string, locale?: string, gender?: string }
 * Fuegt eine Voice-ID hinzu (oder aktualisiert existing Eintrag mit gleicher voiceId).
 */
router.post('/tts/custom-voices', (req, res) => {
    try {
        const { name, voiceId, locale, gender } = req.body || {};
        if (!voiceId || typeof voiceId !== 'string') {
            res.status(400).json({ error: 'voiceId ist erforderlich' });
            return;
        }
        const entry = customVoicesStore.add({ name: name || '', voiceId, locale, gender });
        // Voice-Cache invalidieren damit die neue Stimme sofort in getVoices() auftaucht
        ttsService.clearVoicesCache();
        res.json({ success: true, voice: entry, voices: customVoicesStore.list() });
    } catch (error: any) {
        logger.error('Custom-Voice hinzufuegen fehlgeschlagen', { error });
        res.status(500).json({ error: error?.message || 'Custom-Voice hinzufuegen fehlgeschlagen' });
    }
});

/**
 * DELETE /api/voice/tts/custom-voices/:voiceId
 * Entfernt eine User-Custom-Voice aus der Liste.
 */
router.delete('/tts/custom-voices/:voiceId', (req, res) => {
    try {
        const { voiceId } = req.params;
        if (!voiceId) {
            res.status(400).json({ error: 'voiceId fehlt' });
            return;
        }
        const removed = customVoicesStore.remove(voiceId);
        ttsService.clearVoicesCache();
        res.json({ success: true, removed, voices: customVoicesStore.list() });
    } catch (error) {
        logger.error('Custom-Voice entfernen fehlgeschlagen', { error });
        res.status(500).json({ error: 'Custom-Voice entfernen fehlgeschlagen' });
    }
});

/**
 * POST /api/voice/tts/voice-settings
 * Voice-Feinschliff: Preset oder custom Stability/Style/SimilarityBoost/SpeakerBoost
 * Body: { preset?: 'standard'|'warm'|'dramatic'|'whisper'|'clear'|'custom', settings?: { stability, similarity_boost, style, use_speaker_boost } }
 */
router.post('/tts/voice-settings', async (req, res) => {
    try {
        const { preset, settings } = req.body || {};
        if (preset) {
            ttsService.setElevenLabsPreset(preset, settings);
        } else if (settings) {
            ttsService.updateConfig({
                elevenLabsPreset: 'custom',
                elevenLabsVoiceSettings: {
                    stability: settings.stability ?? 0.5,
                    similarity_boost: settings.similarity_boost ?? 0.75,
                    style: settings.style ?? 0.0,
                    use_speaker_boost: settings.use_speaker_boost ?? true,
                },
            });
        } else {
            res.status(400).json({ error: 'preset oder settings erforderlich' });
            return;
        }
        const status = ttsService.getStatus();
        res.json({
            success: true,
            preset: status.elevenLabsPreset,
            settings: status.elevenLabsVoiceSettings,
        });
    } catch (error) {
        logger.error('Voice settings error', { error });
        res.status(500).json({ error: 'Voice-Settings fehlgeschlagen' });
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
