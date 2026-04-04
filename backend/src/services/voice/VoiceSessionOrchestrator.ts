/**
 * Voice Session Orchestrator
 *
 * Manages the full voice pipeline per client:
 * Audio In → VAD → STT → AI Router → TTS → Audio Out
 *
 * Each connected client with voice enabled gets a VoiceSession.
 * The orchestrator coordinates all voice services.
 */

import { Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { VADSession, VADEvent } from './VADService';
import { sttService, TranscriptionResult } from './STTService';
import { ttsService, TTSResult } from './TTSService';
import { DEFAULT_AUDIO_CONFIG, AudioConfig } from './AudioUtils';

export interface VoiceSessionConfig {
    audioConfig: AudioConfig;
    vadEnabled: boolean;
    sttEnabled: boolean;
    ttsEnabled: boolean;
    autoSend: boolean;          // Auto-send transcribed text as message
    interruptOnSpeech: boolean; // Stop TTS when user starts speaking
    language: string;
}

interface VoiceSession {
    socketId: string;
    userId: string;
    config: VoiceSessionConfig;
    vad: VADSession;
    isActive: boolean;
    isTTSPlaying: boolean;
    createdAt: Date;
    audioChunks: Buffer[];      // Buffer for incoming audio before VAD
}

const DEFAULT_SESSION_CONFIG: VoiceSessionConfig = {
    audioConfig: DEFAULT_AUDIO_CONFIG,
    vadEnabled: true,
    sttEnabled: true,
    ttsEnabled: true,
    autoSend: true,
    interruptOnSpeech: true,
    language: 'de',
};

class VoiceSessionOrchestrator {
    private sessions = new Map<string, VoiceSession>();
    private initialized = false;

    /**
     * Initialize voice services
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await sttService.initialize();
            await ttsService.initialize();
            this.initialized = true;
            logger.info('[VoiceOrchestrator] Initialized');
        } catch (error) {
            logger.error('[VoiceOrchestrator] Init failed', { error });
            throw error;
        }
    }

    /**
     * Create a voice session for a socket connection
     */
    createSession(
        socket: Socket,
        userId: string,
        config?: Partial<VoiceSessionConfig>
    ): void {
        const sessionConfig = { ...DEFAULT_SESSION_CONFIG, ...config };

        // Create VAD session with event handler
        const vad = new VADSession(
            (event) => this.handleVADEvent(socket, event),
            { adaptiveThreshold: true }
        );

        const session: VoiceSession = {
            socketId: socket.id,
            userId,
            config: sessionConfig,
            vad,
            isActive: true,
            isTTSPlaying: false,
            createdAt: new Date(),
            audioChunks: [],
        };

        this.sessions.set(socket.id, session);

        logger.info(`[VoiceOrchestrator] Session created for ${socket.id}`, {
            userId,
            vadEnabled: sessionConfig.vadEnabled,
            sttEnabled: sessionConfig.sttEnabled,
            ttsEnabled: sessionConfig.ttsEnabled,
        });

        // Notify client
        socket.emit('voice-session-started', {
            config: sessionConfig,
            sttStatus: sttService.getStatus(),
            ttsStatus: ttsService.getStatus(),
        });
    }

    /**
     * Process incoming audio chunk from client
     */
    processAudioChunk(socketId: string, audioData: Buffer): void {
        const session = this.sessions.get(socketId);
        if (!session || !session.isActive) return;

        if (session.config.vadEnabled) {
            // Feed audio to VAD for speech detection
            session.vad.processFrame(audioData);
        } else {
            // No VAD - buffer audio directly
            session.audioChunks.push(audioData);
        }
    }

    /**
     * Handle VAD events (speech detected/ended)
     */
    private async handleVADEvent(socket: Socket, event: VADEvent): Promise<void> {
        const session = this.sessions.get(socket.id);
        if (!session) return;

        switch (event.type) {
            case 'speech-start':
                socket.emit('voice-speech-start', { timestamp: event.timestamp });

                // Interrupt TTS if configured
                if (session.config.interruptOnSpeech && session.isTTSPlaying) {
                    socket.emit('voice-tts-stop', {});
                    session.isTTSPlaying = false;
                    logger.debug(`[VoiceOrchestrator] TTS interrupted by speech`);
                }
                break;

            case 'speech-end':
                socket.emit('voice-speech-end', {
                    timestamp: event.timestamp,
                    duration: event.duration,
                });

                // Transcribe the speech segment
                if (session.config.sttEnabled) {
                    await this.transcribeAndProcess(socket, session, event.audio);
                }
                break;

            case 'speech-chunk':
                // Real-time speech chunk - could be used for streaming STT
                break;
        }
    }

    /**
     * Transcribe audio and optionally send as message
     */
    private async transcribeAndProcess(
        socket: Socket,
        session: VoiceSession,
        audioData: Buffer
    ): Promise<void> {
        try {
            socket.emit('voice-transcribing', { status: 'started' });

            const result: TranscriptionResult = await sttService.transcribe(
                audioData,
                session.config.audioConfig
            );

            if (result.text && result.text.trim()) {
                socket.emit('voice-transcript', {
                    text: result.text.trim(),
                    isFinal: true,
                    backend: result.backend,
                    confidence: result.confidence,
                });

                logger.info(`[VoiceOrchestrator] Transcribed: "${result.text.trim()}"`, {
                    backend: result.backend,
                    duration: result.duration,
                });

                // Auto-send as chat message if configured
                if (session.config.autoSend) {
                    socket.emit('voice-auto-send', { text: result.text.trim() });
                }
            } else {
                socket.emit('voice-transcript', {
                    text: '',
                    isFinal: true,
                    backend: result.backend,
                    confidence: 0,
                });
            }

            socket.emit('voice-transcribing', { status: 'done' });
        } catch (error) {
            logger.error('[VoiceOrchestrator] Transcription failed', { error });
            socket.emit('voice-transcribing', { status: 'error' });
        }
    }

    /**
     * Synthesize and stream TTS audio to client
     * Called after AI response is complete
     */
    async synthesizeAndStream(
        socketId: string,
        text: string,
        socket: Socket
    ): Promise<void> {
        const session = this.sessions.get(socketId);
        if (!session || !session.config.ttsEnabled) return;

        try {
            session.isTTSPlaying = true;
            socket.emit('voice-tts-start', { textLength: text.length });

            const result: TTSResult = await ttsService.synthesize(text);

            if (result.audio.length > 0) {
                // Stream audio in chunks for smooth playback
                const chunkSize = 8192; // 8KB chunks
                const totalChunks = Math.ceil(result.audio.length / chunkSize);

                for (let i = 0; i < result.audio.length; i += chunkSize) {
                    // Check if session still active and TTS not interrupted
                    if (!session.isActive || !session.isTTSPlaying) {
                        logger.debug('[VoiceOrchestrator] TTS streaming interrupted');
                        break;
                    }

                    const chunk = result.audio.subarray(i, i + chunkSize);
                    socket.emit('voice-tts-chunk', {
                        audio: chunk,
                        format: result.format,
                        chunkIndex: Math.floor(i / chunkSize),
                        totalChunks,
                        isLast: i + chunkSize >= result.audio.length,
                    });
                }

                socket.emit('voice-tts-end', {
                    duration: result.duration,
                    backend: result.backend,
                });
            }

            session.isTTSPlaying = false;
        } catch (error) {
            logger.error('[VoiceOrchestrator] TTS failed', { error });
            session.isTTSPlaying = false;
            socket.emit('voice-tts-end', { error: true });
        }
    }

    /**
     * Handle manual transcription request (non-VAD mode)
     */
    async transcribeBuffer(socketId: string, socket: Socket): Promise<void> {
        const session = this.sessions.get(socketId);
        if (!session || session.audioChunks.length === 0) return;

        const audio = Buffer.concat(session.audioChunks);
        session.audioChunks = [];

        await this.transcribeAndProcess(socket, session, audio);
    }

    /**
     * Update session configuration
     */
    updateSession(socketId: string, config: Partial<VoiceSessionConfig>): void {
        const session = this.sessions.get(socketId);
        if (!session) return;

        session.config = { ...session.config, ...config };
        logger.info(`[VoiceOrchestrator] Session updated for ${socketId}`, config);
    }

    /**
     * End a voice session
     */
    endSession(socketId: string): void {
        const session = this.sessions.get(socketId);
        if (!session) return;

        session.isActive = false;
        session.vad.flush();
        this.sessions.delete(socketId);

        logger.info(`[VoiceOrchestrator] Session ended for ${socketId}`);
    }

    /**
     * Get session info
     */
    getSession(socketId: string): VoiceSession | undefined {
        return this.sessions.get(socketId);
    }

    /**
     * Get status of all voice services
     */
    getStatus() {
        return {
            initialized: this.initialized,
            activeSessions: this.sessions.size,
            stt: sttService.getStatus(),
            tts: ttsService.getStatus(),
        };
    }

    /**
     * Clean up all sessions
     */
    cleanup(): void {
        for (const [socketId] of this.sessions) {
            this.endSession(socketId);
        }
    }
}

export const voiceOrchestrator = new VoiceSessionOrchestrator();
