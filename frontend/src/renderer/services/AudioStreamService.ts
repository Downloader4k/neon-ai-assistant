/**
 * Audio Stream Service
 *
 * Captures microphone audio using Web Audio API and streams
 * PCM chunks via Socket.IO to the backend voice pipeline.
 *
 * Features:
 * - Real-time audio capture with AudioWorklet
 * - PCM conversion (Float32 → Int16)
 * - Volume level monitoring for waveform visualization
 * - Configurable sample rate and chunk size
 */

export interface AudioStreamConfig {
    sampleRate: number;
    channelCount: number;
    chunkDuration: number;    // ms per chunk (e.g., 30ms)
}

export type AudioStreamState = 'idle' | 'connecting' | 'streaming' | 'error';

const DEFAULT_CONFIG: AudioStreamConfig = {
    sampleRate: 16000,    // 16kHz for speech
    channelCount: 1,       // Mono
    chunkDuration: 30,     // 30ms chunks
};

class AudioStreamService {
    private config: AudioStreamConfig;
    private mediaStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private processorNode: ScriptProcessorNode | null = null;
    private state: AudioStreamState = 'idle';
    private socket: any = null;
    private volumeLevel = 0;
    private onVolumeChange?: (level: number) => void;
    private onStateChange?: (state: AudioStreamState) => void;

    constructor() {
        this.config = { ...DEFAULT_CONFIG };
    }

    /**
     * Start capturing and streaming audio
     */
    async start(
        socket: any,
        options?: {
            config?: Partial<AudioStreamConfig>;
            onVolumeChange?: (level: number) => void;
            onStateChange?: (state: AudioStreamState) => void;
        }
    ): Promise<void> {
        if (this.state === 'streaming') {
            console.warn('[AudioStream] Already streaming');
            return;
        }

        this.socket = socket;
        this.onVolumeChange = options?.onVolumeChange;
        this.onStateChange = options?.onStateChange;

        if (options?.config) {
            this.config = { ...this.config, ...options.config };
        }

        this.setState('connecting');

        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.config.sampleRate,
                    channelCount: this.config.channelCount,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            // Create AudioContext
            this.audioContext = new AudioContext({
                sampleRate: this.config.sampleRate,
            });

            // Create source from microphone
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Use ScriptProcessorNode for audio processing
            // (AudioWorklet would be better but requires separate file serving)
            const bufferSize = Math.round(this.config.sampleRate * this.config.chunkDuration / 1000);
            // Round to nearest power of 2
            const roundedBufferSize = Math.pow(2, Math.round(Math.log2(bufferSize)));
            this.processorNode = this.audioContext.createScriptProcessor(
                Math.max(256, Math.min(16384, roundedBufferSize)),
                1, // input channels
                1  // output channels
            );

            this.processorNode.onaudioprocess = (event) => {
                if (this.state !== 'streaming') return;

                const inputData = event.inputBuffer.getChannelData(0);

                // Calculate volume level (RMS)
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                this.volumeLevel = Math.sqrt(sum / inputData.length);
                this.onVolumeChange?.(this.volumeLevel);

                // Convert Float32 to Int16 PCM
                const int16 = this.float32ToInt16(inputData);

                // Send to backend via WebSocket
                if (this.socket?.connected) {
                    this.socket.emit('voice-audio-chunk', int16.buffer);
                }
            };

            // Connect the audio graph
            this.sourceNode.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);

            this.setState('streaming');
            console.log('[AudioStream] Started streaming');
        } catch (error) {
            console.error('[AudioStream] Failed to start:', error);
            this.setState('error');
            throw error;
        }
    }

    /**
     * Stop capturing and streaming
     */
    stop(): void {
        // Disconnect audio nodes
        if (this.processorNode) {
            this.processorNode.disconnect();
            this.processorNode = null;
        }

        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }

        // Close audio context
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
        }

        // Stop media stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        this.volumeLevel = 0;
        this.setState('idle');
        console.log('[AudioStream] Stopped');
    }

    /**
     * Convert Float32 audio to Int16 PCM buffer
     */
    private float32ToInt16(float32Array: Float32Array): Int16Array {
        const int16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16;
    }

    /**
     * Get current volume level (0-1)
     */
    getVolumeLevel(): number {
        return this.volumeLevel;
    }

    /**
     * Get current state
     */
    getState(): AudioStreamState {
        return this.state;
    }

    /**
     * Check if microphone is available
     */
    static async isAvailable(): Promise<boolean> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.some(d => d.kind === 'audioinput');
        } catch {
            return false;
        }
    }

    private setState(state: AudioStreamState): void {
        this.state = state;
        this.onStateChange?.(state);
    }
}

export const audioStreamService = new AudioStreamService();
