/**
 * Speech-to-Text Service
 *
 * Supports multiple STT backends:
 * 1. Whisper.cpp (local binary - best quality)
 * 2. OpenAI-compatible API (configurable endpoint)
 * 3. Browser Web Speech API (fallback, handled by frontend)
 *
 * The service receives audio data (PCM/WAV) and returns transcribed text.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../../utils/logger';
import { pcmToWav, DEFAULT_AUDIO_CONFIG, AudioConfig } from './AudioUtils';

export type STTBackend = 'whisper-cpp' | 'faster-whisper' | 'whisper-api' | 'browser';

export interface STTConfig {
    backend: STTBackend;
    whisperCppPath?: string;        // Path to whisper.cpp binary (main or whisper-cli)
    whisperModelPath?: string;      // Path to whisper model (.bin file)
    whisperApiUrl?: string;         // OpenAI-compatible API endpoint
    whisperApiKey?: string;         // API key for Whisper API
    language?: string;              // e.g., 'de', 'en', 'auto'
    translateToEnglish?: boolean;   // Translate to English
}

export interface TranscriptionResult {
    text: string;
    language?: string;
    duration?: number;
    backend: STTBackend;
    confidence?: number;
}

const DEFAULT_CONFIG: STTConfig = {
    backend: 'browser',
    language: 'de',
};

class STTService {
    private config: STTConfig;
    private initialized = false;

    constructor() {
        this.config = { ...DEFAULT_CONFIG };
    }

    /**
     * Initialize with configuration
     */
    async initialize(config?: Partial<STTConfig>): Promise<void> {
        if (config) {
            this.config = { ...this.config, ...config };
        }

        // Auto-detect backend if not specified
        if (this.config.backend === 'browser') {
            await this.autoDetectBackend();
        }

        // Validate configuration
        if (this.config.backend === 'faster-whisper') {
            if (!this.config.whisperCppPath || !fs.existsSync(this.config.whisperCppPath)) {
                logger.warn('[STT] faster-whisper script not found, falling back to browser');
                this.config.backend = 'browser';
            }
        } else if (this.config.backend === 'whisper-cpp') {
            if (!this.config.whisperCppPath || !fs.existsSync(this.config.whisperCppPath)) {
                logger.warn('[STT] Whisper.cpp binary not found, falling back to browser');
                this.config.backend = 'browser';
            } else if (!this.config.whisperModelPath || !fs.existsSync(this.config.whisperModelPath)) {
                logger.warn('[STT] Whisper model not found, falling back to browser');
                this.config.backend = 'browser';
            }
        }

        this.initialized = true;
        logger.info(`[STT] Initialized with backend: ${this.config.backend}`);
    }

    /**
     * Auto-detect available STT backend
     */
    private async autoDetectBackend(): Promise<void> {
        // Check for faster-whisper (Python) first - easiest to install
        const pythonScript = path.join(__dirname, '../../../scripts/whisper_transcribe.py');
        if (fs.existsSync(pythonScript)) {
            try {
                const pythonCheck = await new Promise<boolean>((resolve) => {
                    const proc = spawn('python', ['-c', 'import faster_whisper; print("ok")']);
                    let out = '';
                    proc.stdout.on('data', (d) => { out += d.toString(); });
                    proc.on('close', (code) => resolve(code === 0 && out.includes('ok')));
                    proc.on('error', () => resolve(false));
                    setTimeout(() => { proc.kill(); resolve(false); }, 10000);
                });
                if (pythonCheck) {
                    this.config.backend = 'faster-whisper';
                    this.config.whisperCppPath = pythonScript; // Reuse field for script path
                    logger.info('[STT] Found faster-whisper (Python), using as backend');
                    return;
                }
            } catch {
                // Continue to next check
            }
        }

        // Check for whisper.cpp binary
        const whisperPaths = [
            process.env.WHISPER_CPP_PATH,
            path.join(os.homedir(), 'whisper.cpp', 'main'),
            path.join(os.homedir(), 'whisper.cpp', 'build', 'bin', 'whisper-cli'),
            '/usr/local/bin/whisper',
            'C:\\whisper\\main.exe',
            path.join(process.cwd(), 'whisper', 'main'),
        ].filter(Boolean) as string[];

        for (const whisperPath of whisperPaths) {
            if (fs.existsSync(whisperPath)) {
                this.config.backend = 'whisper-cpp';
                this.config.whisperCppPath = whisperPath;
                logger.info(`[STT] Found whisper.cpp at: ${whisperPath}`);

                // Look for model file
                const modelPaths = [
                    process.env.WHISPER_MODEL_PATH,
                    path.join(path.dirname(whisperPath), '..', 'models', 'ggml-base.bin'),
                    path.join(path.dirname(whisperPath), '..', 'models', 'ggml-small.bin'),
                    path.join(os.homedir(), 'whisper.cpp', 'models', 'ggml-base.bin'),
                ].filter(Boolean) as string[];

                for (const modelPath of modelPaths) {
                    if (fs.existsSync(modelPath)) {
                        this.config.whisperModelPath = modelPath;
                        logger.info(`[STT] Found whisper model at: ${modelPath}`);
                        return;
                    }
                }
                break;
            }
        }

        // Check for OpenAI-compatible API
        if (process.env.WHISPER_API_URL) {
            this.config.backend = 'whisper-api';
            this.config.whisperApiUrl = process.env.WHISPER_API_URL;
            this.config.whisperApiKey = process.env.WHISPER_API_KEY;
            logger.info(`[STT] Using Whisper API at: ${this.config.whisperApiUrl}`);
            return;
        }

        logger.info('[STT] No local STT backend found, using browser fallback');
    }

    /**
     * Transcribe audio data
     * @param audioData - PCM or WAV buffer
     * @param audioConfig - Audio format configuration
     */
    async transcribe(
        audioData: Buffer,
        audioConfig: AudioConfig = DEFAULT_AUDIO_CONFIG
    ): Promise<TranscriptionResult> {
        if (!this.initialized) {
            await this.initialize();
        }

        switch (this.config.backend) {
            case 'whisper-cpp':
                return this.transcribeWhisperCpp(audioData, audioConfig);
            case 'faster-whisper':
                return this.transcribeFasterWhisper(audioData, audioConfig);
            case 'whisper-api':
                return this.transcribeWhisperApi(audioData, audioConfig);
            default:
                return {
                    text: '',
                    backend: 'browser',
                    confidence: 0,
                };
        }
    }

    /**
     * Transcribe using local Whisper.cpp binary
     */
    private async transcribeWhisperCpp(
        audioData: Buffer,
        audioConfig: AudioConfig
    ): Promise<TranscriptionResult> {
        const startTime = Date.now();

        // Write WAV to temp file
        const tempFile = path.join(os.tmpdir(), `neon-stt-${Date.now()}.wav`);
        const wavData = pcmToWav(audioData, audioConfig);
        fs.writeFileSync(tempFile, wavData);

        try {
            const args = [
                '-m', this.config.whisperModelPath!,
                '-f', tempFile,
                '-l', this.config.language || 'de',
                '--no-timestamps',
                '-t', '4',  // 4 threads
            ];

            if (this.config.translateToEnglish) {
                args.push('--translate');
            }

            const result = await new Promise<string>((resolve, reject) => {
                const proc = spawn(this.config.whisperCppPath!, args);
                let stdout = '';
                let stderr = '';

                proc.stdout.on('data', (data) => { stdout += data.toString(); });
                proc.stderr.on('data', (data) => { stderr += data.toString(); });

                proc.on('close', (code) => {
                    if (code === 0) {
                        resolve(stdout.trim());
                    } else {
                        reject(new Error(`Whisper.cpp exited with code ${code}: ${stderr}`));
                    }
                });

                proc.on('error', reject);

                // Timeout after 30 seconds
                setTimeout(() => {
                    proc.kill();
                    reject(new Error('Whisper.cpp timeout'));
                }, 30000);
            });

            const duration = (Date.now() - startTime) / 1000;
            logger.info(`[STT] Whisper.cpp transcribed in ${duration.toFixed(2)}s`);

            return {
                text: result.replace(/^\[.*?\]\s*/gm, '').trim(),  // Remove timestamps
                language: this.config.language,
                duration,
                backend: 'whisper-cpp',
                confidence: 0.9,
            };
        } finally {
            // Cleanup temp file
            try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
        }
    }

    /**
     * Transcribe using faster-whisper (Python)
     */
    private async transcribeFasterWhisper(
        audioData: Buffer,
        audioConfig: AudioConfig
    ): Promise<TranscriptionResult> {
        const startTime = Date.now();
        const tempFile = path.join(os.tmpdir(), `neon-stt-${Date.now()}.wav`);
        const wavData = pcmToWav(audioData, audioConfig);
        fs.writeFileSync(tempFile, wavData);

        try {
            const scriptPath = this.config.whisperCppPath!; // Reused for script path
            const args = [scriptPath, tempFile, '--language', this.config.language || 'de'];

            const result = await new Promise<string>((resolve, reject) => {
                const proc = spawn('python', args);
                let stdout = '';
                let stderr = '';

                proc.stdout.on('data', (data) => { stdout += data.toString(); });
                proc.stderr.on('data', (data) => { stderr += data.toString(); });

                proc.on('close', (code) => {
                    if (code === 0 && stdout.trim()) {
                        resolve(stdout.trim());
                    } else {
                        reject(new Error(`faster-whisper exited with code ${code}: ${stderr}`));
                    }
                });

                proc.on('error', reject);

                // Timeout after 60 seconds (first run downloads model)
                setTimeout(() => {
                    proc.kill();
                    reject(new Error('faster-whisper timeout'));
                }, 60000);
            });

            // Parse JSON output
            const parsed = JSON.parse(result);
            const duration = (Date.now() - startTime) / 1000;

            logger.info(`[STT] faster-whisper transcribed in ${duration.toFixed(2)}s: "${parsed.text?.substring(0, 50)}..."`);

            return {
                text: parsed.text || '',
                language: parsed.language || this.config.language,
                duration,
                backend: 'faster-whisper',
                confidence: 0.9,
            };
        } catch (error) {
            logger.error('[STT] faster-whisper error', { error });
            throw error;
        } finally {
            try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
        }
    }

    /**
     * Transcribe using OpenAI-compatible Whisper API
     */
    private async transcribeWhisperApi(
        audioData: Buffer,
        audioConfig: AudioConfig
    ): Promise<TranscriptionResult> {
        const startTime = Date.now();
        const wavData = pcmToWav(audioData, audioConfig);

        try {
            const formData = new FormData();
            const blob = new Blob([wavData], { type: 'audio/wav' });
            formData.append('file', blob, 'audio.wav');
            formData.append('model', 'whisper-1');
            if (this.config.language) {
                formData.append('language', this.config.language);
            }

            const headers: Record<string, string> = {};
            if (this.config.whisperApiKey) {
                headers['Authorization'] = `Bearer ${this.config.whisperApiKey}`;
            }

            const response = await fetch(`${this.config.whisperApiUrl}/v1/audio/transcriptions`, {
                method: 'POST',
                headers,
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`Whisper API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as { text: string; language?: string };
            const duration = (Date.now() - startTime) / 1000;

            logger.info(`[STT] Whisper API transcribed in ${duration.toFixed(2)}s`);

            return {
                text: data.text || '',
                language: data.language || this.config.language,
                duration,
                backend: 'whisper-api',
                confidence: 0.85,
            };
        } catch (error) {
            logger.error('[STT] Whisper API error', { error });
            throw error;
        }
    }

    /**
     * Get current backend info
     */
    getStatus(): { backend: STTBackend; available: boolean; modelInfo?: string } {
        return {
            backend: this.config.backend,
            available: this.config.backend !== 'browser',
            modelInfo: this.config.backend === 'faster-whisper'
                ? 'faster-whisper (Python)'
                : this.config.whisperModelPath
                    ? path.basename(this.config.whisperModelPath)
                    : undefined,
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<STTConfig>): void {
        this.config = { ...this.config, ...config };
        this.initialized = false;
    }

    getConfig(): STTConfig {
        return { ...this.config };
    }
}

export const sttService = new STTService();
