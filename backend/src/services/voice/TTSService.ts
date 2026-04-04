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
import { logger } from '../../utils/logger';

export type TTSBackend = 'edge-tts' | 'piper' | 'browser';

export interface TTSConfig {
    backend: TTSBackend;
    voice?: string;              // Voice name (e.g., 'de-DE-ConradNeural')
    rate?: string;               // Speech rate (e.g., '+0%', '-10%')
    pitch?: string;              // Pitch adjustment (e.g., '+0Hz')
    volume?: string;             // Volume (e.g., '+0%')
    piperPath?: string;          // Path to piper binary
    piperModelPath?: string;     // Path to piper model
    outputFormat?: 'mp3' | 'wav';
}

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
        // Check env config
        const configuredBackend = process.env.TTS_BACKEND as TTSBackend | undefined;
        if (configuredBackend) {
            this.config.backend = configuredBackend;
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
    async getVoices(): Promise<TTSVoice[]> {
        if (this.cachedVoices.length > 0) {
            return this.cachedVoices;
        }

        // Return recommended voices + try to fetch full list
        this.cachedVoices = [...RECOMMENDED_VOICES];

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
     * Set voice
     */
    async setVoice(voiceName: string): Promise<void> {
        this.config.voice = voiceName;
        if (this.edgeTTS) {
            await this.edgeTTS.setMetadata(
                voiceName,
                OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
            );
        }
        logger.info(`[TTS] Voice changed to: ${voiceName}`);
    }

    /**
     * Get current status
     */
    getStatus(): { backend: TTSBackend; available: boolean; voice?: string } {
        return {
            backend: this.config.backend,
            available: this.config.backend !== 'browser',
            voice: this.config.voice,
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<TTSConfig>): void {
        this.config = { ...this.config, ...config };
        this.initialized = false;
    }

    getConfig(): TTSConfig {
        return { ...this.config };
    }
}

export const ttsService = new TTSService();
