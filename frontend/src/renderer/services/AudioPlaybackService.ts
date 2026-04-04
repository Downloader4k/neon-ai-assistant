/**
 * Audio Playback Service
 *
 * Plays TTS audio received from the backend voice pipeline.
 * Supports chunked streaming playback for low-latency response.
 */

export type PlaybackState = 'idle' | 'buffering' | 'playing' | 'paused';

class AudioPlaybackService {
    private audioContext: AudioContext | null = null;
    private audioQueue: ArrayBuffer[] = [];
    private isPlaying = false;
    private state: PlaybackState = 'idle';
    private currentSource: AudioBufferSourceNode | null = null;
    private onStateChange?: (state: PlaybackState) => void;
    private onPlaybackEnd?: () => void;
    private gainNode: GainNode | null = null;
    private volume = 1.0;

    /**
     * Initialize the playback context
     */
    private getContext(): AudioContext {
        if (!this.audioContext) {
            this.audioContext = new AudioContext();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.volume;
            this.gainNode.connect(this.audioContext.destination);
        }
        return this.audioContext;
    }

    /**
     * Play audio data (MP3 or WAV buffer)
     */
    async play(audioData: ArrayBuffer, _format: 'mp3' | 'wav' = 'mp3'): Promise<void> {
        const ctx = this.getContext();

        // Resume context if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        try {
            this.setState('buffering');
            const audioBuffer = await ctx.decodeAudioData(audioData.slice(0)); // slice to avoid detach

            // Stop any current playback
            this.stopCurrent();

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.gainNode!);

            source.onended = () => {
                this.currentSource = null;
                this.isPlaying = false;
                this.setState('idle');
                this.onPlaybackEnd?.();

                // Play next queued audio
                this.playNext();
            };

            this.currentSource = source;
            this.isPlaying = true;
            this.setState('playing');
            source.start(0);
        } catch (error) {
            console.error('[AudioPlayback] Decode error:', error);
            this.setState('idle');
        }
    }

    /**
     * Queue audio for sequential playback (used for chunked TTS)
     */
    queueChunk(audioData: ArrayBuffer): void {
        this.audioQueue.push(audioData);

        // Start playing if not already
        if (!this.isPlaying) {
            this.playNext();
        }
    }

    /**
     * Play the next item in the queue
     */
    private async playNext(): Promise<void> {
        if (this.audioQueue.length === 0) return;

        const nextAudio = this.audioQueue.shift()!;
        await this.play(nextAudio);
    }

    /**
     * Receive chunked TTS data and assemble for playback
     * Called for each voice-tts-chunk event
     */
    private assemblyBuffer: Uint8Array[] = [];

    handleTTSChunk(data: {
        audio: ArrayBuffer;
        format: 'mp3' | 'wav';
        chunkIndex: number;
        totalChunks: number;
        isLast: boolean;
    }): void {
        if (data.chunkIndex === 0) {
            this.assemblyBuffer = [];
            this.setState('buffering');
        }

        this.assemblyBuffer.push(new Uint8Array(data.audio));

        if (data.isLast) {
            // All chunks received - assemble and play
            const totalLength = this.assemblyBuffer.reduce((sum, b) => sum + b.byteLength, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of this.assemblyBuffer) {
                combined.set(chunk, offset);
                offset += chunk.byteLength;
            }
            this.assemblyBuffer = [];

            this.play(combined.buffer, data.format);
        }
    }

    /**
     * Stop current playback
     */
    stop(): void {
        this.stopCurrent();
        this.audioQueue = [];
        this.assemblyBuffer = [];
        this.setState('idle');
    }

    private stopCurrent(): void {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch { /* already stopped */ }
            this.currentSource = null;
            this.isPlaying = false;
        }
    }

    /**
     * Pause/Resume
     */
    async pause(): Promise<void> {
        if (this.audioContext && this.isPlaying) {
            await this.audioContext.suspend();
            this.setState('paused');
        }
    }

    async resume(): Promise<void> {
        if (this.audioContext) {
            await this.audioContext.resume();
            if (this.isPlaying) {
                this.setState('playing');
            }
        }
    }

    /**
     * Set volume (0-1)
     */
    setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.gainNode) {
            this.gainNode.gain.value = this.volume;
        }
    }

    /**
     * Get current state
     */
    getState(): PlaybackState {
        return this.state;
    }

    isCurrentlyPlaying(): boolean {
        return this.isPlaying;
    }

    /**
     * Register callbacks
     */
    setCallbacks(callbacks: {
        onStateChange?: (state: PlaybackState) => void;
        onPlaybackEnd?: () => void;
    }): void {
        this.onStateChange = callbacks.onStateChange;
        this.onPlaybackEnd = callbacks.onPlaybackEnd;
    }

    private setState(state: PlaybackState): void {
        this.state = state;
        this.onStateChange?.(state);
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
        }
    }
}

export const audioPlaybackService = new AudioPlaybackService();
