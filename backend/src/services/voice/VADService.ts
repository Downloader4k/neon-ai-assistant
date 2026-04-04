/**
 * Voice Activity Detection (VAD) Service
 *
 * Server-side VAD for processing audio chunks from the WebSocket pipeline.
 * Uses energy-based detection with adaptive thresholds.
 *
 * For production use, Silero VAD (via ONNX) would be ideal.
 * This implementation provides a practical energy-based alternative.
 */

import { logger } from '../../utils/logger';
import { calculateRMS } from './AudioUtils';

export interface VADConfig {
    energyThreshold: number;       // RMS threshold for speech detection
    silenceDuration: number;       // ms of silence before speech end
    speechPadding: number;         // ms of padding around speech
    minSpeechDuration: number;     // minimum ms for valid speech
    adaptiveThreshold: boolean;    // auto-adjust threshold
}

export interface VADState {
    isSpeaking: boolean;
    speechStart: number | null;
    silenceStart: number | null;
    speechBuffer: Buffer[];
    backgroundNoise: number;
    frameCount: number;
}

export type VADEvent =
    | { type: 'speech-start'; timestamp: number }
    | { type: 'speech-end'; timestamp: number; audio: Buffer; duration: number }
    | { type: 'speech-chunk'; audio: Buffer };

const DEFAULT_CONFIG: VADConfig = {
    energyThreshold: 400,
    silenceDuration: 800,        // 800ms silence = end of speech
    speechPadding: 300,          // 300ms padding
    minSpeechDuration: 500,      // Min 500ms for valid speech
    adaptiveThreshold: true,
};

export class VADSession {
    private config: VADConfig;
    private state: VADState;
    private onEvent: (event: VADEvent) => void;
    private preSpeechBuffer: Buffer[] = [];
    private maxPreBufferFrames = 10;  // Keep ~10 frames (~300ms at 30ms/frame) before speech

    constructor(onEvent: (event: VADEvent) => void, config?: Partial<VADConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.onEvent = onEvent;
        this.state = {
            isSpeaking: false,
            speechStart: null,
            silenceStart: null,
            speechBuffer: [],
            backgroundNoise: 200,
            frameCount: 0,
        };
    }

    /**
     * Process an audio frame (chunk of PCM data)
     * Typically called with 30ms frames (480 samples at 16kHz)
     */
    processFrame(pcmData: Buffer): void {
        const now = Date.now();
        const rms = calculateRMS(pcmData);
        this.state.frameCount++;

        // Adaptive threshold: update background noise estimate
        if (this.config.adaptiveThreshold && !this.state.isSpeaking) {
            // Exponential moving average of background noise
            this.state.backgroundNoise =
                this.state.backgroundNoise * 0.95 + rms * 0.05;
        }

        const threshold = this.config.adaptiveThreshold
            ? Math.max(this.config.energyThreshold, this.state.backgroundNoise * 2.5)
            : this.config.energyThreshold;

        const isSpeech = rms > threshold;

        if (isSpeech) {
            if (!this.state.isSpeaking) {
                // Speech start
                this.state.isSpeaking = true;
                this.state.speechStart = now;
                this.state.silenceStart = null;

                // Include pre-speech buffer for smooth audio
                this.state.speechBuffer = [...this.preSpeechBuffer];

                this.onEvent({ type: 'speech-start', timestamp: now });
                logger.debug(`[VAD] Speech started (RMS: ${rms.toFixed(0)}, threshold: ${threshold.toFixed(0)})`);
            }

            // Reset silence counter
            this.state.silenceStart = null;
            this.state.speechBuffer.push(pcmData);

            // Emit speech chunk for real-time processing
            this.onEvent({ type: 'speech-chunk', audio: pcmData });

        } else {
            if (this.state.isSpeaking) {
                // In speech but silence detected
                if (!this.state.silenceStart) {
                    this.state.silenceStart = now;
                }

                // Still add to buffer (padding)
                this.state.speechBuffer.push(pcmData);

                // Check if silence duration exceeded
                if (now - this.state.silenceStart >= this.config.silenceDuration) {
                    // Speech ended
                    const duration = now - (this.state.speechStart || now);

                    if (duration >= this.config.minSpeechDuration) {
                        // Valid speech segment
                        const audio = Buffer.concat(this.state.speechBuffer);

                        this.onEvent({
                            type: 'speech-end',
                            timestamp: now,
                            audio,
                            duration,
                        });

                        logger.debug(`[VAD] Speech ended (duration: ${duration}ms, size: ${(audio.length / 1024).toFixed(1)}KB)`);
                    } else {
                        logger.debug(`[VAD] Speech too short (${duration}ms), discarded`);
                    }

                    // Reset state
                    this.state.isSpeaking = false;
                    this.state.speechStart = null;
                    this.state.silenceStart = null;
                    this.state.speechBuffer = [];
                }
            } else {
                // Not speaking - maintain pre-speech buffer
                this.preSpeechBuffer.push(pcmData);
                if (this.preSpeechBuffer.length > this.maxPreBufferFrames) {
                    this.preSpeechBuffer.shift();
                }
            }
        }
    }

    /**
     * Force end current speech segment (e.g., on disconnect)
     */
    flush(): void {
        if (this.state.isSpeaking && this.state.speechBuffer.length > 0) {
            const now = Date.now();
            const duration = now - (this.state.speechStart || now);
            const audio = Buffer.concat(this.state.speechBuffer);

            this.onEvent({
                type: 'speech-end',
                timestamp: now,
                audio,
                duration,
            });
        }

        this.reset();
    }

    /**
     * Reset VAD state
     */
    reset(): void {
        this.state = {
            isSpeaking: false,
            speechStart: null,
            silenceStart: null,
            speechBuffer: [],
            backgroundNoise: 200,
            frameCount: 0,
        };
        this.preSpeechBuffer = [];
    }

    /**
     * Get current state info
     */
    getState(): { isSpeaking: boolean; backgroundNoise: number; frameCount: number } {
        return {
            isSpeaking: this.state.isSpeaking,
            backgroundNoise: this.state.backgroundNoise,
            frameCount: this.state.frameCount,
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<VADConfig>): void {
        this.config = { ...this.config, ...config };
    }
}
