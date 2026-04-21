/**
 * Text-to-Speech Service
 *
 * Supports multiple TTS backends:
 * 1. Edge TTS (Microsoft free TTS - high quality, needs internet)
 * 2. Piper TTS (local binary - good quality, fully offline)
 * 3. Browser Web Speech API (fallback, handled by frontend)
 *
 * Returns audio data (MP3/WAV) that can be streamed to the frontend.
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Readable } from 'stream';
import axios from 'axios';
import { logger } from '../../utils/logger';
import { customVoicesStore } from './CustomVoicesStore';

export type TTSBackend = 'edge-tts' | 'elevenlabs' | 'piper' | 'browser';

export interface ElevenLabsVoiceSettings {
    stability: number;           // 0.0 – 1.0 (je niedriger, desto ausdrucksstaerker / emotionaler)
    similarity_boost: number;    // 0.0 – 1.0 (Aehnlichkeit zur Original-Stimme)
    style: number;               // 0.0 – 1.0 (Stil-/Emotion-Uebertragung, nur v2-Modelle)
    use_speaker_boost: boolean;  // Klarheit erhoehen
}

export type ElevenLabsPreset = 'standard' | 'warm' | 'dramatic' | 'whisper' | 'clear' | 'custom';

export interface TTSConfig {
    backend: TTSBackend;
    voice?: string;              // Voice name (e.g., 'de-DE-ConradNeural' or ElevenLabs voice_id)
    rate?: string;               // Speech rate (e.g., '+0%', '-10%')
    pitch?: string;              // Pitch adjustment (e.g., '+0Hz')
    volume?: string;             // Volume (e.g., '+0%')
    piperPath?: string;          // Path to piper binary
    piperModelPath?: string;     // Path to piper model
    outputFormat?: 'mp3' | 'wav';
    elevenLabsApiKey?: string;   // ElevenLabs API Key
    elevenLabsModel?: string;    // ElevenLabs model (e.g., 'eleven_multilingual_v2')
    elevenLabsVoiceSettings?: ElevenLabsVoiceSettings;
    elevenLabsPreset?: ElevenLabsPreset;
}

export const ELEVENLABS_PRESETS: Record<Exclude<ElevenLabsPreset, 'custom'>, ElevenLabsVoiceSettings> = {
    // Neutrale, verlaessliche Stimme
    standard: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    // Warm, freundlich, intim
    warm: { stability: 0.6, similarity_boost: 0.85, style: 0.35, use_speaker_boost: true },
    // Expressiv, emotional, dramatisch
    dramatic: { stability: 0.25, similarity_boost: 0.7, style: 0.85, use_speaker_boost: true },
    // Leise, intim, nah am Mikrofon - "Fluestern-Feel"
    whisper: { stability: 0.85, similarity_boost: 0.9, style: 0.15, use_speaker_boost: false },
    // Klar, praezise, nachrichtensprecher-aehnlich
    clear: { stability: 0.75, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true },
};

export interface TTSResult {
    audio: Buffer;
    format: 'mp3' | 'wav';
    duration?: number;
    backend: TTSBackend;
}

export interface TTSVoice {
    name: string;
    shortName: string;
    locale: string;
    gender: string;
    backend: TTSBackend;
}

const DEFAULT_CONFIG: TTSConfig = {
    backend: 'edge-tts',
    voice: 'de-DE-ConradNeural',
    rate: '+0%',
    pitch: '+0Hz',
    volume: '+0%',
    outputFormat: 'mp3',
    elevenLabsPreset: 'standard',
    elevenLabsVoiceSettings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
};

// Popular German and English voices for Edge TTS
const RECOMMENDED_VOICES: TTSVoice[] = [
    { name: 'Conrad (DE, maennlich)', shortName: 'de-DE-ConradNeural', locale: 'de-DE', gender: 'Male', backend: 'edge-tts' },
    { name: 'Katja (DE, weiblich)', shortName: 'de-DE-KatjaNeural', locale: 'de-DE', gender: 'Female', backend: 'edge-tts' },
    { name: 'Amala (DE, weiblich)', shortName: 'de-DE-AmalaNeural', locale: 'de-DE', gender: 'Female', backend: 'edge-tts' },
    { name: 'Killian (DE, maennlich)', shortName: 'de-DE-KillianNeural', locale: 'de-DE', gender: 'Male', backend: 'edge-tts' },
    { name: 'Guy (EN-US, maennlich)', shortName: 'en-US-GuyNeural', locale: 'en-US', gender: 'Male', backend: 'edge-tts' },
    { name: 'Jenny (EN-US, weiblich)', shortName: 'en-US-JennyNeural', locale: 'en-US', gender: 'Female', backend: 'edge-tts' },
    { name: 'Aria (EN-US, weiblich)', shortName: 'en-US-AriaNeural', locale: 'en-US', gender: 'Female', backend: 'edge-tts' },
    { name: 'Davis (EN-US, maennlich)', shortName: 'en-US-DavisNeural', locale: 'en-US', gender: 'Male', backend: 'edge-tts' },
];

// Standard-Voices fuer ElevenLabs (echte Voice-IDs, public - funktionieren auf jedem Account)
// Multilingual v2/v3 unterstuetzen Deutsch automatisch, auch wenn Voice urspruenglich englisch ist.
const ELEVENLABS_DEFAULT_VOICES: TTSVoice[] = [
    // Deutsche / stark deutsch klingende Stimmen (Multilingual)
    { name: 'Serena (multilingual, weiblich, warm)', shortName: 'pMsXgVXv3BLzUgSXRplE', locale: 'de-DE', gender: 'Female', backend: 'elevenlabs' },
    { name: 'Daniel (multilingual, maennlich, seriös)', shortName: 'onwK4e9ZLuTAKqWW03F9', locale: 'de-DE', gender: 'Male', backend: 'elevenlabs' },
    { name: 'Charlotte (multilingual, weiblich, sanft)', shortName: 'XB0fDUnXU5powFXDhCwa', locale: 'de-DE', gender: 'Female', backend: 'elevenlabs' },
    { name: 'Brian (multilingual, maennlich, warm)', shortName: 'nPczCjzI2devNBz1zQrb', locale: 'de-DE', gender: 'Male', backend: 'elevenlabs' },
    { name: 'Matilda (multilingual, weiblich, freundlich)', shortName: 'XrExE9yKIg1WjnnlVkGX', locale: 'de-DE', gender: 'Female', backend: 'elevenlabs' },
    { name: 'Bill (multilingual, maennlich, ruhig)', shortName: 'pqHfZKP75CvOlQylNhV4', locale: 'de-DE', gender: 'Male', backend: 'elevenlabs' },
    { name: 'Lily (multilingual, weiblich, jung)', shortName: 'pFZP5JQG7iQjIQuC4Bku', locale: 'de-DE', gender: 'Female', backend: 'elevenlabs' },
    { name: 'Grace (multilingual, weiblich, elegant)', shortName: 'oWAxZDx7w5VEj9dCyTzz', locale: 'de-DE', gender: 'Female', backend: 'elevenlabs' },
    { name: 'Clyde (multilingual, maennlich, charakterstark)', shortName: '2EiwWnXFnvU5JabPnv8n', locale: 'de-DE', gender: 'Male', backend: 'elevenlabs' },
    // Klassiker (englisch-dominant)
    { name: 'Rachel (EN, weiblich)', shortName: '21m00Tcm4TlvDq8ikWAM', locale: 'en-US', gender: 'Female', backend: 'elevenlabs' },
    { name: 'Adam (EN, maennlich)', shortName: 'pNInz6obpgDQGcFmaJgB', locale: 'en-US', gender: 'Male', backend: 'elevenlabs' },
    { name: 'Antoni (EN, maennlich)', shortName: 'ErXwobaYiN019PkySvjV', locale: 'en-US', gender: 'Male', backend: 'elevenlabs' },
    { name: 'Bella (EN, weiblich)', shortName: 'EXAVITQu4vr4xnSDxMaL', locale: 'en-US', gender: 'Female', backend: 'elevenlabs' },
    { name: 'Josh (EN, maennlich)', shortName: 'TxGEqnHWrfWFTfGW9XjX', locale: 'en-US', gender: 'Male', backend: 'elevenlabs' },
    { name: 'Arnold (EN, maennlich)', shortName: 'VR6AewLTigWG4xSOukaG', locale: 'en-US', gender: 'Male', backend: 'elevenlabs' },
    { name: 'Sam (EN, maennlich)', shortName: 'yoZ06aMxZJJ28mfd3POQ', locale: 'en-US', gender: 'Male', backend: 'elevenlabs' },
    { name: 'Domi (EN, weiblich)', shortName: 'AZnzlk1XvdvUeBnXmlld', locale: 'en-US', gender: 'Female', backend: 'elevenlabs' },
];

/**
 * Laedt die vom User ueber die UI hinzugefuegten ElevenLabs-Voices
 * (persistent in backend/data/custom-voices.json).
 */
function loadUserCustomVoices(): TTSVoice[] {
    try {
        return customVoicesStore.list().map((v): TTSVoice => ({
            name: v.name,
            shortName: v.voiceId,
            locale: v.locale || 'de-DE',
            gender: v.gender || 'unknown',
            backend: 'elevenlabs',
        }));
    } catch (err) {
        logger.warn('[TTS] Konnte Custom-Voices nicht laden', { err });
        return [];
    }
}

class TTSService {
    private config: TTSConfig;
    private edgeTTS: MsEdgeTTS | null = null;
    private initialized = false;
    private cachedVoices: TTSVoice[] = [];

    constructor() {
        this.config = { ...DEFAULT_CONFIG };
    }

    /**
     * Initialize with configuration
     */
    async initialize(config?: Partial<TTSConfig>): Promise<void> {
        if (config) {
            this.config = { ...this.config, ...config };
        }

        // Auto-detect backend
        await this.autoDetectBackend();

        if (this.config.backend === 'edge-tts') {
            try {
                this.edgeTTS = new MsEdgeTTS();
                await this.edgeTTS.setMetadata(
                    this.config.voice || 'de-DE-ConradNeural',
                    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
                );
                logger.info(`[TTS] Edge TTS initialized with voice: ${this.config.voice}`);
            } catch (error) {
                logger.error('[TTS] Failed to initialize Edge TTS', { error });
                this.config.backend = 'browser';
            }
        }

        this.initialized = true;
        logger.info(`[TTS] Initialized with backend: ${this.config.backend}`);
    }

    /**
     * Auto-detect available TTS backend
     */
    private async autoDetectBackend(): Promise<void> {
        // ElevenLabs API Key laden (falls vorhanden)
        if (!this.config.elevenLabsApiKey && process.env.ELEVENLABS_API_KEY) {
            this.config.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        }
        if (!this.config.elevenLabsModel) {
            this.config.elevenLabsModel = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
        }

        // Check env config
        const configuredBackend = process.env.TTS_BACKEND as TTSBackend | undefined;
        if (configuredBackend) {
            this.config.backend = configuredBackend;
            return;
        }

        // ElevenLabs bevorzugen wenn API-Key gesetzt
        if (this.config.elevenLabsApiKey) {
            this.config.backend = 'elevenlabs';
            logger.info('[TTS] ElevenLabs API-Key gefunden → Backend: elevenlabs');
            return;
        }

        // Check for Piper binary
        if (this.config.piperPath || process.env.PIPER_PATH) {
            const piperPath = this.config.piperPath || process.env.PIPER_PATH!;
            if (fs.existsSync(piperPath)) {
                this.config.backend = 'piper';
                this.config.piperPath = piperPath;
                logger.info(`[TTS] Found Piper at: ${piperPath}`);
                return;
            }
        }

        // Default to Edge TTS (free, high quality)
        this.config.backend = 'edge-tts';
    }

    /**
     * Synthesize speech from text
     */
    /**
     * Clean text for TTS: remove emojis, markdown, URLs, special chars
     */
    private cleanTextForTTS(text: string): string {
        return text
            // Emojis entfernen (alle Unicode Emoji-Bloecke)
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
            // CJK und andere unerwuenschte Zeichen
            .replace(/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g, '')
            // Markdown: **bold**, *italic*, `code`, ```codeblocks```, # headers, - lists
            .replace(/```[\s\S]*?```/g, ' Code-Block. ')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`([^`]*)`/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^[-*]\s+/gm, '')
            // URLs
            .replace(/https?:\/\/\S+/g, '')
            // Sonderzeichen die komisch vorgelesen werden
            .replace(/[~^|\\<>{}[\]]/g, '')
            // Mehrfache Leerzeichen/Zeilenumbrueche
            .replace(/\n{2,}/g, '. ')
            .replace(/\n/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    async synthesize(text: string, options?: Partial<TTSConfig>): Promise<TTSResult> {
        if (!this.initialized) {
            await this.initialize();
        }

        // Clean text before synthesis
        text = this.cleanTextForTTS(text);
        if (!text) {
            return { audio: Buffer.alloc(0), format: 'mp3', backend: 'browser' };
        }

        const config = { ...this.config, ...options };

        switch (config.backend) {
            case 'edge-tts':
                return this.synthesizeEdgeTTS(text, config);
            case 'elevenlabs':
                return this.synthesizeElevenLabs(text, config);
            case 'piper':
                return this.synthesizePiper(text, config);
            default:
                return {
                    audio: Buffer.alloc(0),
                    format: 'mp3',
                    backend: 'browser',
                };
        }
    }

    /**
     * Synthesize using ElevenLabs API
     */
    private async synthesizeElevenLabs(text: string, config: TTSConfig): Promise<TTSResult> {
        const startTime = Date.now();
        const apiKey = config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            throw new Error('ElevenLabs API-Key fehlt (ELEVENLABS_API_KEY)');
        }

        // ElevenLabs erwartet eine voice_id. Wenn voice wie 'de-DE-ConradNeural' aussieht → Default-ID nutzen
        let voiceId = config.voice || '21m00Tcm4TlvDq8ikWAM'; // Rachel default
        if (voiceId.includes('-') && voiceId.length < 30) {
            // sieht nach Edge-TTS-Stil aus → Default nehmen
            voiceId = '21m00Tcm4TlvDq8ikWAM';
        }

        const model = config.elevenLabsModel || 'eleven_multilingual_v2';

        // Voice-Settings aufloesen: Preset hat Vorrang, sonst custom-Settings, sonst Standard
        const preset = config.elevenLabsPreset || 'standard';
        let settings: ElevenLabsVoiceSettings;
        if (preset === 'custom' && config.elevenLabsVoiceSettings) {
            settings = config.elevenLabsVoiceSettings;
        } else if (preset !== 'custom') {
            settings = ELEVENLABS_PRESETS[preset];
        } else {
            settings = ELEVENLABS_PRESETS.standard;
        }

        // Beim Fluester-Preset fuegen wir einen Audio-Tag hinzu (v3+ Modelle interpretieren ihn,
        // v2-Modelle ignorieren ihn). Tag wird vor jedem Satz eingefuegt.
        let finalText = text;
        if (preset === 'whisper' && !/\[whispers?\]/i.test(text)) {
            finalText = `[whispering] ${text}`;
        }

        try {
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                {
                    text: finalText,
                    model_id: model,
                    voice_settings: settings,
                },
                {
                    headers: {
                        'xi-api-key': apiKey,
                        'Content-Type': 'application/json',
                        'Accept': 'audio/mpeg',
                    },
                    responseType: 'arraybuffer',
                    timeout: 30000,
                }
            );

            const audio = Buffer.from(response.data);
            const duration = (Date.now() - startTime) / 1000;

            logger.info(`[TTS] ElevenLabs synthesized ${text.length} chars in ${duration.toFixed(2)}s (${(audio.length / 1024).toFixed(1)}KB)`);

            return {
                audio,
                format: 'mp3',
                duration,
                backend: 'elevenlabs',
            };
        } catch (error: any) {
            const errMsg = error.response?.data
                ? Buffer.from(error.response.data).toString('utf8')
                : error.message;
            logger.error('[TTS] ElevenLabs error', { error: errMsg, status: error.response?.status });
            throw new Error(`ElevenLabs TTS fehlgeschlagen: ${errMsg}`);
        }
    }

    /**
     * Streaming-Variante: Liefert die ElevenLabs-MP3-Daten als Node-Readable,
     * sobald die ersten Bytes generiert werden. So kann der Client den Ton
     * abspielen waehrend der Rest noch synthetisiert wird (deutlich niedrigere Latenz).
     *
     * Nur fuer backend='elevenlabs' verfuegbar.
     */
    async synthesizeStream(text: string, options?: Partial<TTSConfig>): Promise<{ stream: Readable; backend: TTSBackend; voiceId: string }> {
        if (!this.initialized) {
            await this.initialize();
        }
        text = this.cleanTextForTTS(text);
        if (!text) {
            return { stream: Readable.from([]), backend: 'browser', voiceId: '' };
        }

        const config = { ...this.config, ...options };
        if (config.backend !== 'elevenlabs') {
            // Nicht-Streaming-Backends: einfach synthesize() und als ein Chunk streamen
            const result = await this.synthesize(text, options);
            return {
                stream: Readable.from([result.audio]),
                backend: result.backend,
                voiceId: config.voice || '',
            };
        }

        const apiKey = config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            throw new Error('ElevenLabs API-Key fehlt (ELEVENLABS_API_KEY)');
        }

        let voiceId = config.voice || '21m00Tcm4TlvDq8ikWAM';
        if (voiceId.includes('-') && voiceId.length < 30) {
            voiceId = '21m00Tcm4TlvDq8ikWAM';
        }
        const model = config.elevenLabsModel || 'eleven_multilingual_v2';

        const preset = config.elevenLabsPreset || 'standard';
        let settings: ElevenLabsVoiceSettings;
        if (preset === 'custom' && config.elevenLabsVoiceSettings) {
            settings = config.elevenLabsVoiceSettings;
        } else if (preset !== 'custom') {
            settings = ELEVENLABS_PRESETS[preset];
        } else {
            settings = ELEVENLABS_PRESETS.standard;
        }

        let finalText = text;
        if (preset === 'whisper' && !/\[whispers?\]/i.test(text)) {
            finalText = `[whispering] ${text}`;
        }

        const startTime = Date.now();
        try {
            // ElevenLabs Stream-Endpoint: optimize_streaming_latency reduziert
            // die Time-to-first-byte drastisch (3 = gutes Qualitaets/Latenz-Verhaeltnis)
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=3`,
                {
                    text: finalText,
                    model_id: model,
                    voice_settings: settings,
                },
                {
                    headers: {
                        'xi-api-key': apiKey,
                        'Content-Type': 'application/json',
                        'Accept': 'audio/mpeg',
                    },
                    responseType: 'stream',
                    timeout: 60000,
                }
            );

            const ttfb = Date.now() - startTime;
            logger.info(`[TTS] ElevenLabs stream started in ${ttfb}ms (${text.length} chars, voice ${voiceId})`);

            return {
                stream: response.data as Readable,
                backend: 'elevenlabs',
                voiceId,
            };
        } catch (error: any) {
            const errMsg = error.response?.data?.toString?.() || error.message;
            logger.error('[TTS] ElevenLabs stream error', { error: errMsg, status: error.response?.status });
            throw new Error(`ElevenLabs Stream-TTS fehlgeschlagen: ${errMsg}`);
        }
    }

    /**
     * Synthesize using Edge TTS (Microsoft free TTS)
     */
    private async synthesizeEdgeTTS(text: string, config: TTSConfig): Promise<TTSResult> {
        const startTime = Date.now();

        try {
            // Re-initialize if voice changed
            if (config.voice !== this.config.voice || !this.edgeTTS) {
                this.edgeTTS = new MsEdgeTTS();
                await this.edgeTTS.setMetadata(
                    config.voice || 'de-DE-ConradNeural',
                    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
                );
            }

            const { audioStream } = this.edgeTTS.toStream(text);
            const chunks: Buffer[] = [];

            return new Promise<TTSResult>((resolve, reject) => {
                audioStream.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                });

                audioStream.on('end', () => {
                    const audio = Buffer.concat(chunks);
                    const duration = (Date.now() - startTime) / 1000;

                    logger.info(`[TTS] Edge TTS synthesized ${text.length} chars in ${duration.toFixed(2)}s (${(audio.length / 1024).toFixed(1)}KB)`);

                    resolve({
                        audio,
                        format: 'mp3',
                        duration,
                        backend: 'edge-tts',
                    });
                });

                audioStream.on('error', (error: Error) => {
                    logger.error('[TTS] Edge TTS stream error', { error });
                    reject(error);
                });
            });
        } catch (error) {
            logger.error('[TTS] Edge TTS synthesis error', { error });
            throw error;
        }
    }

    /**
     * Synthesize using Piper TTS (local)
     */
    private async synthesizePiper(text: string, config: TTSConfig): Promise<TTSResult> {
        const startTime = Date.now();
        const outputFile = path.join(os.tmpdir(), `neon-tts-${Date.now()}.wav`);

        try {
            const args = [
                '--model', config.piperModelPath || '',
                '--output_file', outputFile,
            ];

            await new Promise<void>((resolve, reject) => {
                const proc = spawn(config.piperPath!, args, { stdio: ['pipe', 'pipe', 'pipe'] });

                // Send text to stdin
                proc.stdin.write(text);
                proc.stdin.end();

                let stderr = '';
                proc.stderr.on('data', (data) => { stderr += data.toString(); });

                proc.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Piper exited with code ${code}: ${stderr}`));
                    }
                });

                proc.on('error', reject);

                setTimeout(() => {
                    proc.kill();
                    reject(new Error('Piper timeout'));
                }, 30000);
            });

            const audio = fs.readFileSync(outputFile);
            const duration = (Date.now() - startTime) / 1000;

            logger.info(`[TTS] Piper synthesized ${text.length} chars in ${duration.toFixed(2)}s`);

            return {
                audio,
                format: 'wav',
                duration,
                backend: 'piper',
            };
        } finally {
            try { fs.unlinkSync(outputFile); } catch { /* ignore */ }
        }
    }

    /**
     * Get available voices
     */
    async getVoices(forceRefresh = false): Promise<TTSVoice[]> {
        if (forceRefresh) {
            this.cachedVoices = [];
        }
        if (this.cachedVoices.length > 0) {
            return this.cachedVoices;
        }

        // Return recommended voices + try to fetch full list
        this.cachedVoices = [...RECOMMENDED_VOICES];

        // ElevenLabs: User-Custom-Voices (UI) + Account-Voices (API) + Default-Voices
        if (this.config.backend === 'elevenlabs') {
            const apiKey = this.config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
            const customVoices = loadUserCustomVoices();

            if (!apiKey) {
                // Kein Key: nur UI-Custom + Default
                const customIds = new Set(customVoices.map(v => v.shortName));
                this.cachedVoices = [
                    ...customVoices,
                    ...ELEVENLABS_DEFAULT_VOICES.filter(v => !customIds.has(v.shortName)),
                ];
                return this.cachedVoices;
            }
            try {
                const r = await axios.get('https://api.elevenlabs.io/v1/voices', {
                    headers: { 'xi-api-key': apiKey },
                    timeout: 10000,
                });
                const accountVoices = (r.data?.voices || []).map((v: any): TTSVoice => ({
                    name: v.name + (v.labels?.gender ? ` (${v.labels.gender})` : ''),
                    shortName: v.voice_id,
                    locale: v.labels?.language || v.fine_tuning?.language || 'en',
                    gender: v.labels?.gender || 'unknown',
                    backend: 'elevenlabs',
                }));
                // UI-Custom + Account-Voices + Default-Voices (duplikatfrei)
                const seen = new Set<string>();
                const merged: TTSVoice[] = [];
                for (const list of [customVoices, accountVoices, ELEVENLABS_DEFAULT_VOICES]) {
                    for (const v of list) {
                        if (seen.has(v.shortName)) continue;
                        seen.add(v.shortName);
                        merged.push(v);
                    }
                }
                this.cachedVoices = merged;
                logger.info(`[TTS] ElevenLabs: ${customVoices.length} custom + ${accountVoices.length} account + ${merged.length - customVoices.length - accountVoices.length} default`);
            } catch (error: any) {
                // API-Fehler (z.B. missing voices_read) ist OK - UI-Custom + Default trotzdem zeigen
                logger.warn('[TTS] ElevenLabs Voices API Fehler, nutze UI-Custom + Default', { error: error.message });
                const customIds = new Set(customVoices.map(v => v.shortName));
                this.cachedVoices = [
                    ...customVoices,
                    ...ELEVENLABS_DEFAULT_VOICES.filter(v => !customIds.has(v.shortName)),
                ];
            }
            return this.cachedVoices;
        }

        if (this.config.backend === 'edge-tts') {
            try {
                const ttsInstance = new MsEdgeTTS();
                const allVoices = await ttsInstance.getVoices();
                const germanVoices = allVoices
                    .filter((v: any) => v.Locale?.startsWith('de-') || v.Locale?.startsWith('en-'))
                    .map((v: any): TTSVoice => ({
                        name: `${v.FriendlyName || v.ShortName}`,
                        shortName: v.ShortName,
                        locale: v.Locale,
                        gender: v.Gender,
                        backend: 'edge-tts',
                    }));

                if (germanVoices.length > 0) {
                    this.cachedVoices = germanVoices;
                }
                ttsInstance.close();
            } catch (error) {
                logger.warn('[TTS] Failed to fetch Edge TTS voices, using defaults', { error });
            }
        }

        return this.cachedVoices;
    }

    /**
     * Set voice (optional: auch Backend wechseln)
     */
    async setVoice(voiceName: string, backend?: TTSBackend): Promise<void> {
        if (backend && backend !== this.config.backend) {
            this.config.backend = backend;
            this.cachedVoices = []; // Voice-Cache invalidieren
            if (backend === 'edge-tts') {
                this.edgeTTS = null; // wird bei naechster Synthese neu initialisiert
            }
        }
        this.config.voice = voiceName;
        if (this.config.backend === 'edge-tts' && this.edgeTTS) {
            await this.edgeTTS.setMetadata(
                voiceName,
                OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
            );
        }
        logger.info(`[TTS] Voice changed to: ${voiceName} (backend: ${this.config.backend})`);
    }

    /**
     * Get current status
     */
    getStatus(): {
        backend: TTSBackend;
        available: boolean;
        voice?: string;
        elevenLabsReady?: boolean;
        elevenLabsPreset?: ElevenLabsPreset;
        elevenLabsVoiceSettings?: ElevenLabsVoiceSettings;
        elevenLabsModel?: string;
    } {
        const preset = this.config.elevenLabsPreset || 'standard';
        const settings = preset === 'custom'
            ? (this.config.elevenLabsVoiceSettings || ELEVENLABS_PRESETS.standard)
            : ELEVENLABS_PRESETS[preset];
        return {
            backend: this.config.backend,
            available: this.config.backend !== 'browser',
            voice: this.config.voice,
            elevenLabsReady: !!(this.config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY),
            elevenLabsPreset: preset,
            elevenLabsVoiceSettings: settings,
            elevenLabsModel: this.config.elevenLabsModel || 'eleven_multilingual_v2',
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<TTSConfig>): void {
        const backendChanged = config.backend && config.backend !== this.config.backend;
        this.config = { ...this.config, ...config };
        this.initialized = false;
        if (backendChanged) {
            // Voice-Cache und Edge-Instanz invalidieren damit beim naechsten Aufruf
            // die richtigen Stimmen geladen werden
            this.cachedVoices = [];
            this.edgeTTS = null;
        }
    }

    /**
     * Preset-Wrapper: setzt Preset und (bei 'custom') die Feinschliff-Einstellungen
     */
    setElevenLabsPreset(preset: ElevenLabsPreset, customSettings?: Partial<ElevenLabsVoiceSettings>): void {
        this.config.elevenLabsPreset = preset;
        if (preset === 'custom' && customSettings) {
            const base = this.config.elevenLabsVoiceSettings || ELEVENLABS_PRESETS.standard;
            this.config.elevenLabsVoiceSettings = { ...base, ...customSettings };
        } else if (preset !== 'custom') {
            this.config.elevenLabsVoiceSettings = { ...ELEVENLABS_PRESETS[preset] };
        }
    }

    getConfig(): TTSConfig {
        return { ...this.config };
    }

    /**
     * Voice-Cache invalidieren (z.B. wenn eine Custom-Voice per UI hinzugefuegt/entfernt wurde).
     */
    clearVoicesCache(): void {
        this.cachedVoices = [];
    }
}

export const ttsService = new TTSService();
