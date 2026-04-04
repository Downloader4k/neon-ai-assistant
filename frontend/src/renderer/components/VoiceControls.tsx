import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, ChevronDown, Play, Square } from 'lucide-react';
import { SpeechRecognitionService, speechRecognitionService } from '../services/SpeechRecognitionService';
import { TextToSpeechService, textToSpeechService } from '../services/TextToSpeechService';
import { audioStreamService, AudioStreamState } from '../services/AudioStreamService';
import { audioPlaybackService, PlaybackState } from '../services/AudioPlaybackService';
import { useAppStore } from '../store/useAppStore';

interface VoiceControlsProps {
    onTranscript?: (text: string) => void;
}

type VoiceMode = 'browser' | 'pipeline';  // browser = Web Speech API, pipeline = Backend Voice Pipeline

export default function VoiceControls({ onTranscript }: VoiceControlsProps) {
    const [isListening, setIsListening] = useState(false);
    const [isTTSActive, setIsTTSActive] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [interimText, setInterimText] = useState('');
    const [sttSupported] = useState(() => SpeechRecognitionService.isSupported());
    const [ttsSupported] = useState(() => TextToSpeechService.isSupported());
    const [voiceMode, setVoiceMode] = useState<VoiceMode>('pipeline');
    const [pipelineState, setPipelineState] = useState<AudioStreamState>('idle');
    const [, setPlaybackState] = useState<PlaybackState>('idle');
    const [, setVolumeLevel] = useState(0);
    const [, setBackendAvailable] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [showVoicePicker, setShowVoicePicker] = useState(false);
    const [availableVoices, setAvailableVoices] = useState<{ name: string; shortName: string; locale: string; gender: string }[]>([]);
    const [currentVoice, setCurrentVoice] = useState('de-DE-ConradNeural');
    const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const voicePickerRef = useRef<HTMLDivElement>(null);

    const lastMessageRef = useRef<string>('');
    const speakingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);

    const socket = useAppStore((s) => s.socket);
    const conversations = useAppStore((s) => s.currentConversation);

    // Check backend voice availability on mount + load voices
    useEffect(() => {
        fetch('/api/voice/status')
            .then(r => r.json())
            .then(data => {
                if (data.tts?.available || data.stt?.available) {
                    setBackendAvailable(true);
                } else {
                    // Backend nicht verfuegbar, Fallback auf Browser
                    setVoiceMode('browser');
                }
                if (data.tts?.voice) {
                    setCurrentVoice(data.tts.voice);
                }
            })
            .catch(() => {
                // Backend nicht erreichbar, Fallback auf Browser
                setVoiceMode('browser');
            });

        fetch('/api/voice/tts/voices')
            .then(r => r.json())
            .then(data => {
                const voices = Array.isArray(data) ? data : data?.voices;
                if (Array.isArray(voices) && voices.length > 0) {
                    setAvailableVoices(voices);
                }
                if (data?.currentVoice) {
                    setCurrentVoice(data.currentVoice);
                }
            })
            .catch(() => {});
    }, []);

    // Close voice picker on outside click
    useEffect(() => {
        if (!showVoicePicker) return;
        const handleClick = (e: MouseEvent) => {
            if (voicePickerRef.current && !voicePickerRef.current.contains(e.target as Node)) {
                setShowVoicePicker(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showVoicePicker]);

    // Setup Socket listeners for voice pipeline events
    useEffect(() => {
        if (!socket) return;

        const handleSessionStarted = (data: any) => {
            console.log('[Voice] Session started', data);
        };

        const handleTranscript = (data: { text: string; isFinal: boolean; backend: string }) => {
            if (data.text && data.isFinal && onTranscript) {
                onTranscript(data.text);
                setInterimText('');
            } else if (data.text && !data.isFinal) {
                setInterimText(data.text);
            }
        };

        const handleTranscribing = (data: { status: string }) => {
            setIsTranscribing(data.status === 'started');
        };

        const handleSpeechStart = () => {
            // Visual feedback: user is speaking
        };

        const handleSpeechEnd = () => {
            // Speech segment ended, waiting for transcription
        };

        const handleTTSChunk = (data: any) => {
            audioPlaybackService.handleTTSChunk(data);
        };

        const handleTTSStart = () => {
            setIsSpeaking(true);
        };

        const handleTTSEnd = () => {
            setIsSpeaking(false);
        };

        const handleTTSStop = () => {
            audioPlaybackService.stop();
            setIsSpeaking(false);
        };

        const handleAutoSend = (data: { text: string }) => {
            // Auto-send the transcribed text as a user message
            if (data.text && socket) {
                const userId = useAppStore.getState().currentUser?.id || 'default-user';
                const conversationId = useAppStore.getState().currentConversation?.id;
                socket.emit('user-message', {
                    message: data.text,
                    conversationId,
                    userId,
                });
            }
        };

        socket.on('voice-session-started', handleSessionStarted);
        socket.on('voice-transcript', handleTranscript);
        socket.on('voice-transcribing', handleTranscribing);
        socket.on('voice-speech-start', handleSpeechStart);
        socket.on('voice-speech-end', handleSpeechEnd);
        socket.on('voice-tts-chunk', handleTTSChunk);
        socket.on('voice-tts-start', handleTTSStart);
        socket.on('voice-tts-end', handleTTSEnd);
        socket.on('voice-tts-stop', handleTTSStop);
        socket.on('voice-auto-send', handleAutoSend);

        return () => {
            socket.off('voice-session-started', handleSessionStarted);
            socket.off('voice-transcript', handleTranscript);
            socket.off('voice-transcribing', handleTranscribing);
            socket.off('voice-speech-start', handleSpeechStart);
            socket.off('voice-speech-end', handleSpeechEnd);
            socket.off('voice-tts-chunk', handleTTSChunk);
            socket.off('voice-tts-start', handleTTSStart);
            socket.off('voice-tts-end', handleTTSEnd);
            socket.off('voice-tts-stop', handleTTSStop);
            socket.off('voice-auto-send', handleAutoSend);
        };
    }, [socket, onTranscript]);

    // Setup audio playback callbacks
    useEffect(() => {
        audioPlaybackService.setCallbacks({
            onStateChange: setPlaybackState,
            onPlaybackEnd: () => setIsSpeaking(false),
        });
    }, []);

    // Browser TTS: Poll speaking state
    useEffect(() => {
        if (voiceMode !== 'browser') return;

        if (isTTSActive) {
            speakingPollRef.current = setInterval(() => {
                setIsSpeaking(textToSpeechService.isSpeaking());
            }, 200);
        } else {
            if (speakingPollRef.current) {
                clearInterval(speakingPollRef.current);
                speakingPollRef.current = null;
            }
            setIsSpeaking(false);
        }
        return () => {
            if (speakingPollRef.current) clearInterval(speakingPollRef.current);
        };
    }, [isTTSActive, voiceMode]);

    // Auto-read last AI message (works in both browser and pipeline mode)
    useEffect(() => {
        if (!isTTSActive || !conversations?.messages) return;

        const messages = conversations.messages;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.content !== lastMessageRef.current) {
            lastMessageRef.current = lastMsg.content;

            // Clean text for TTS (remove emojis, markdown, etc.)
            const ttsText = lastMsg.content
                .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
                .replace(/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g, '')
                .replace(/```[\s\S]*?```/g, ' Code-Block. ')
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\*(.*?)\*/g, '$1')
                .replace(/`([^`]*)`/g, '$1')
                .replace(/^#{1,6}\s+/gm, '')
                .replace(/^[-*]\s+/gm, '')
                .replace(/https?:\/\/\S+/g, '')
                .replace(/\n{2,}/g, '. ')
                .replace(/\n/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();

            if (!ttsText) return;

            if (voiceMode === 'pipeline') {
                // Backend TTS (Edge TTS - bessere Stimmen)
                fetch('/api/voice/tts/synthesize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: ttsText }),
                })
                    .then(r => {
                        if (!r.ok) throw new Error('TTS failed');
                        const ct = r.headers.get('content-type') || '';
                        if (ct.includes('json')) throw new Error('TTS returned JSON');
                        return r.arrayBuffer();
                    })
                    .then(buf => {
                        if (buf.byteLength < 50) throw new Error('Audio too small');
                        setIsSpeaking(true);
                        const audio = new Audio();
                        audio.src = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
                        audio.onended = () => setIsSpeaking(false);
                        audio.onerror = () => setIsSpeaking(false);
                        audio.play().catch(() => setIsSpeaking(false));
                    })
                    .catch(() => {
                        // Fallback: Browser TTS
                        setIsSpeaking(true);
                        textToSpeechService.speak(ttsText, {
                            onEnd: () => setIsSpeaking(false),
                            onError: () => setIsSpeaking(false),
                        });
                    });
            } else {
                // Browser TTS
                setIsSpeaking(true);
                textToSpeechService.speak(ttsText, {
                    onEnd: () => setIsSpeaking(false),
                    onError: () => setIsSpeaking(false),
                });
            }
        }
    }, [conversations?.messages, isTTSActive, voiceMode]);

    // Waveform animation for pipeline mode
    useEffect(() => {
        if (voiceMode !== 'pipeline' || pipelineState !== 'streaming') {
            cancelAnimationFrame(animFrameRef.current);
            return;
        }

        const canvas = waveformCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            const level = audioStreamService.getVolumeLevel();
            const w = canvas.width;
            const h = canvas.height;

            ctx.clearRect(0, 0, w, h);

            // Draw waveform bars
            const barCount = 20;
            const barWidth = w / barCount - 2;

            for (let i = 0; i < barCount; i++) {
                const barLevel = Math.min(1, level * (3 + Math.random() * 2));
                const barHeight = Math.max(2, barLevel * h * 0.8);
                const x = i * (barWidth + 2) + 1;
                const y = (h - barHeight) / 2;

                ctx.fillStyle = barLevel > 0.1 ? '#f9ab00' : '#333';
                ctx.fillRect(x, y, barWidth, barHeight);
            }

            animFrameRef.current = requestAnimationFrame(draw);
        };

        animFrameRef.current = requestAnimationFrame(draw);

        return () => cancelAnimationFrame(animFrameRef.current);
    }, [voiceMode, pipelineState]);

    // Toggle listening (browser mode)
    const toggleListeningBrowser = useCallback(() => {
        if (!sttSupported) return;

        if (isListening) {
            speechRecognitionService.stop();
            setIsListening(false);
            setInterimText('');
        } else {
            setIsListening(true);
            speechRecognitionService.start(
                (transcript, isFinal) => {
                    if (isFinal && onTranscript) {
                        onTranscript(transcript);
                        setInterimText('');
                    } else {
                        setInterimText(transcript);
                    }
                },
                (error) => {
                    console.error('STT Fehler:', error);
                    setIsListening(false);
                    setInterimText('');
                }
            );
        }
    }, [isListening, sttSupported, onTranscript]);

    // Toggle listening (pipeline mode)
    const toggleListeningPipeline = useCallback(async () => {
        if (pipelineState === 'streaming') {
            audioStreamService.stop();
            socket?.emit('voice-session-end');
            setPipelineState('idle');
            setIsListening(false);
            setInterimText('');
        } else {
            try {
                const userId = useAppStore.getState().currentUser?.id || 'default-user';

                // Start voice session on backend
                socket?.emit('voice-session-start', {
                    userId,
                    config: { autoSend: false, ttsEnabled: isTTSActive },
                });

                // Start audio streaming
                await audioStreamService.start(socket, {
                    onVolumeChange: setVolumeLevel,
                    onStateChange: setPipelineState,
                });

                setIsListening(true);
            } catch (error) {
                console.error('[Voice] Pipeline start failed:', error);
                setPipelineState('error');
            }
        }
    }, [pipelineState, socket, isTTSActive]);

    // Toggle TTS
    const toggleTTS = useCallback(() => {
        if (voiceMode === 'browser') {
            if (!ttsSupported) return;
            if (isTTSActive) {
                textToSpeechService.stop();
                setIsTTSActive(false);
                setIsSpeaking(false);
            } else {
                setIsTTSActive(true);
            }
        } else {
            if (isTTSActive) {
                audioPlaybackService.stop();
                setIsTTSActive(false);
                setIsSpeaking(false);
            } else {
                setIsTTSActive(true);
            }
        }
    }, [isTTSActive, ttsSupported, voiceMode]);

    // Set voice on backend
    const selectVoice = useCallback((shortName: string) => {
        setCurrentVoice(shortName);
        setShowVoicePicker(false);
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
            setPreviewingVoice(null);
        }
        fetch('/api/voice/tts/set-voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voice: shortName }),
        }).catch(err => console.error('[Voice] Set voice failed:', err));
    }, []);

    // Test/preview a voice
    const testVoice = useCallback((shortName: string, name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (previewingVoice === shortName && previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
            setPreviewingVoice(null);
            return;
        }
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
        setPreviewingVoice(shortName);
        const isGerman = shortName.startsWith('de');
        const sampleText = isGerman
            ? `Hallo, ich bin ${name.split(' (')[0]}. So klinge ich.`
            : `Hello, I am ${name.split(' (')[0]}. This is how I sound.`;
        fetch('/api/voice/tts/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sampleText, voice: shortName }),
        })
            .then(r => { if (!r.ok) throw new Error('TTS failed'); return r.arrayBuffer(); })
            .then(buf => {
                if (buf.byteLength < 100) { setPreviewingVoice(null); return; }
                const audio = new Audio();
                audio.src = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
                audio.onended = () => { setPreviewingVoice(null); previewAudioRef.current = null; };
                audio.onerror = () => { setPreviewingVoice(null); previewAudioRef.current = null; };
                previewAudioRef.current = audio;
                audio.play().catch(() => { setPreviewingVoice(null); previewAudioRef.current = null; });
            })
            .catch(() => setPreviewingVoice(null));
    }, [previewingVoice]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            speechRecognitionService.stop();
            textToSpeechService.stop();
            audioStreamService.stop();
            audioPlaybackService.destroy();
        };
    }, []);

    const toggleListening = voiceMode === 'browser' ? toggleListeningBrowser : toggleListeningPipeline;

    return (
        <>
            <div className="flex items-center gap-1">
                {/* Spracheingabe (STT) */}
                {(sttSupported || voiceMode === 'pipeline') && (
                    <button
                        onClick={toggleListening}
                        className={`voice-button ${isListening ? 'listening' : ''} ${isTranscribing ? 'transcribing' : ''}`}
                        title={isListening ? 'Aufnahme beenden' : 'Sprachaufnahme starten'}
                    >
                        {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                        {isListening && <span className="recording-dot" />}
                    </button>
                )}

                {/* Sprachausgabe (TTS) */}
                {(ttsSupported || voiceMode === 'pipeline') && (
                    <button
                        onClick={toggleTTS}
                        className={`voice-button ${isTTSActive ? 'tts-active' : ''} ${isSpeaking ? 'speaking' : ''}`}
                        title={isTTSActive ? 'Sprachausgabe deaktivieren' : 'Sprachausgabe aktivieren'}
                    >
                        {isTTSActive ? <Volume2 size={18} /> : <VolumeX size={18} />}
                    </button>
                )}

                {/* Stimmenauswahl (nur im Pipeline-Modus wenn Voices vorhanden) */}
                {availableVoices.length > 0 && (
                    <div className="voice-picker-wrapper" ref={voicePickerRef}>
                        <button
                            onClick={() => setShowVoicePicker(!showVoicePicker)}
                            className="voice-button voice-picker-btn"
                            title="Stimme waehlen"
                        >
                            <span className="voice-picker-label">
                                {availableVoices.find(v => v.shortName === currentVoice)?.name?.split(' (')[0] || currentVoice.split('-').pop()?.replace('Neural', '')}
                            </span>
                            <ChevronDown size={12} />
                        </button>

                        {showVoicePicker && (
                            <div className="voice-picker-dropdown">
                                <div className="voice-picker-header">Stimme waehlen</div>
                                {/* Deutsche Stimmen */}
                                <div className="voice-picker-group">Deutsch</div>
                                {availableVoices.filter(v => v.locale?.startsWith('de')).map(v => (
                                    <div key={v.shortName} className={`voice-picker-item ${currentVoice === v.shortName ? 'active' : ''}`}>
                                        <button className="voice-picker-select" onClick={() => selectVoice(v.shortName)}>
                                            <span className="voice-picker-name">{v.name}</span>
                                            <span className="voice-picker-gender">{v.gender === 'Male' ? '♂' : '♀'}</span>
                                        </button>
                                        <button
                                            className={`voice-picker-test ${previewingVoice === v.shortName ? 'playing' : ''}`}
                                            onClick={(e) => testVoice(v.shortName, v.name, e)}
                                            title="Vorhoeren"
                                        >
                                            {previewingVoice === v.shortName ? <Square size={11} /> : <Play size={11} />}
                                        </button>
                                    </div>
                                ))}
                                {/* Englische Stimmen */}
                                {availableVoices.some(v => v.locale?.startsWith('en')) && (
                                    <>
                                        <div className="voice-picker-group">English</div>
                                        {availableVoices.filter(v => v.locale?.startsWith('en')).map(v => (
                                            <div key={v.shortName} className={`voice-picker-item ${currentVoice === v.shortName ? 'active' : ''}`}>
                                                <button className="voice-picker-select" onClick={() => selectVoice(v.shortName)}>
                                                    <span className="voice-picker-name">{v.name}</span>
                                                    <span className="voice-picker-gender">{v.gender === 'Male' ? '♂' : '♀'}</span>
                                                </button>
                                                <button
                                                    className={`voice-picker-test ${previewingVoice === v.shortName ? 'playing' : ''}`}
                                                    onClick={(e) => testVoice(v.shortName, v.name, e)}
                                                    title="Vorhoeren"
                                                >
                                                    {previewingVoice === v.shortName ? <Square size={11} /> : <Play size={11} />}
                                                </button>
                                            </div>
                                        ))}
                                    </>
                                )}
                                {/* Sonstige Stimmen */}
                                {availableVoices.some(v => !v.locale?.startsWith('de') && !v.locale?.startsWith('en')) && (
                                    <>
                                        <div className="voice-picker-group">Andere</div>
                                        {availableVoices.filter(v => !v.locale?.startsWith('de') && !v.locale?.startsWith('en')).map(v => (
                                            <div key={v.shortName} className={`voice-picker-item ${currentVoice === v.shortName ? 'active' : ''}`}>
                                                <button className="voice-picker-select" onClick={() => selectVoice(v.shortName)}>
                                                    <span className="voice-picker-name">{v.name}</span>
                                                    <span className="voice-picker-gender">{v.gender === 'Male' ? '♂' : '♀'}</span>
                                                </button>
                                                <button
                                                    className={`voice-picker-test ${previewingVoice === v.shortName ? 'playing' : ''}`}
                                                    onClick={(e) => testVoice(v.shortName, v.name, e)}
                                                    title="Vorhoeren"
                                                >
                                                    {previewingVoice === v.shortName ? <Square size={11} /> : <Play size={11} />}
                                                </button>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Waveform Visualization (Pipeline Mode) */}
            {voiceMode === 'pipeline' && pipelineState === 'streaming' && (
                <div className="voice-waveform">
                    <canvas
                        ref={waveformCanvasRef}
                        width={200}
                        height={30}
                        style={{ width: '100%', height: '30px' }}
                    />
                </div>
            )}

            {/* Interim-Transkript anzeigen */}
            {interimText && (
                <div className="voice-interim">
                    {isTranscribing && <span className="voice-transcribing-indicator" />}
                    {interimText}
                </div>
            )}

            {/* Transcribing indicator */}
            {isTranscribing && !interimText && (
                <div className="voice-interim">
                    <span className="voice-transcribing-indicator" />
                    Transkribiere...
                </div>
            )}

            {/* Mode Indicator */}
            {voiceMode === 'pipeline' && (isListening || isTTSActive) && (
                <div className="voice-mode-indicator">
                    Voice-Pipeline aktiv
                </div>
            )}

            <style>{`
                .voice-button {
                    width: 36px;
                    height: 36px;
                    border-radius: var(--radius-sm);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-secondary);
                    background: transparent;
                    transition: all 0.2s;
                    position: relative;
                    border: none;
                    cursor: pointer;
                }
                .voice-button:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                }

                /* Pipeline mode button */
                .voice-mode-btn {
                    width: 28px;
                    height: 28px;
                }
                .voice-mode-btn.pipeline-active {
                    color: #f9ab00;
                    background: rgba(249, 171, 0, 0.12);
                }

                /* Recording state */
                .voice-button.listening {
                    background: rgba(239, 68, 68, 0.15);
                    color: #ef4444;
                }
                .voice-button.listening::before {
                    content: '';
                    position: absolute;
                    inset: -4px;
                    border: 2px solid #ef4444;
                    border-radius: var(--radius-sm);
                    animation: pulse-ring 1.5s ease-out infinite;
                }
                .recording-dot {
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    width: 8px;
                    height: 8px;
                    background: #ef4444;
                    border-radius: 50%;
                    animation: blink-dot 1s ease-in-out infinite;
                }

                /* Transcribing state */
                .voice-button.transcribing {
                    background: rgba(249, 171, 0, 0.15);
                    color: #f9ab00;
                }

                /* TTS active state */
                .voice-button.tts-active {
                    color: #22c55e;
                }

                /* TTS speaking animation */
                .voice-button.speaking {
                    animation: speak-pulse 0.8s ease-in-out infinite alternate;
                }
                .voice-button.speaking::after {
                    content: '';
                    position: absolute;
                    inset: -3px;
                    border: 2px solid #22c55e;
                    border-radius: var(--radius-sm);
                    animation: pulse-ring 1.2s ease-out infinite;
                }

                /* Waveform */
                .voice-waveform {
                    position: absolute;
                    bottom: 100%;
                    left: 0;
                    right: 0;
                    padding: 4px 8px;
                    margin-bottom: 2px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-sm);
                }

                .voice-interim {
                    position: absolute;
                    bottom: 100%;
                    left: 0;
                    right: 0;
                    padding: 8px 12px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-sm);
                    margin-bottom: 4px;
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    font-style: italic;
                    animation: fade-in 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .voice-transcribing-indicator {
                    width: 8px;
                    height: 8px;
                    background: #f9ab00;
                    border-radius: 50%;
                    animation: blink-dot 0.8s ease-in-out infinite;
                    flex-shrink: 0;
                }

                .voice-mode-indicator {
                    position: absolute;
                    bottom: calc(100% + 4px);
                    right: 0;
                    padding: 2px 8px;
                    background: rgba(249, 171, 0, 0.1);
                    border: 1px solid rgba(249, 171, 0, 0.3);
                    border-radius: 12px;
                    font-size: 0.7rem;
                    color: #f9ab00;
                    white-space: nowrap;
                }

                /* Voice Picker */
                .voice-picker-wrapper {
                    position: relative;
                }
                .voice-picker-btn {
                    width: auto !important;
                    padding: 4px 8px !important;
                    gap: 4px;
                    font-size: 0.7rem;
                    border: 1px solid var(--border-subtle) !important;
                    border-radius: 14px !important;
                }
                .voice-picker-label {
                    max-width: 80px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .voice-picker-dropdown {
                    position: absolute;
                    bottom: calc(100% + 8px);
                    right: 0;
                    min-width: 220px;
                    max-height: 320px;
                    overflow-y: auto;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-md);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                    z-index: 100;
                    animation: fade-in 0.15s ease;
                }
                .voice-picker-header {
                    padding: 10px 12px 6px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    border-bottom: 1px solid var(--border-subtle);
                }
                .voice-picker-group {
                    padding: 8px 12px 4px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-tertiary);
                }
                .voice-picker-item {
                    display: flex;
                    align-items: center;
                    width: 100%;
                    background: transparent;
                    transition: all 0.15s;
                }
                .voice-picker-item:hover {
                    background: var(--bg-hover);
                }
                .voice-picker-item.active {
                    background: rgba(249, 171, 0, 0.1);
                }
                .voice-picker-select {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 4px 8px 12px;
                    border: none;
                    background: transparent;
                    color: var(--text-secondary);
                    font-size: 0.8rem;
                    cursor: pointer;
                    text-align: left;
                    transition: color 0.15s;
                }
                .voice-picker-item:hover .voice-picker-select { color: var(--text-primary); }
                .voice-picker-item.active .voice-picker-select { color: #f9ab00; }
                .voice-picker-test {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: none;
                    background: transparent;
                    color: var(--text-tertiary);
                    cursor: pointer;
                    border-radius: var(--radius-sm);
                    margin-right: 4px;
                    flex-shrink: 0;
                    transition: all 0.15s;
                }
                .voice-picker-test:hover {
                    background: rgba(249, 171, 0, 0.15);
                    color: #f9ab00;
                }
                .voice-picker-test.playing {
                    color: #f9ab00;
                }
                .voice-picker-name {
                    flex: 1;
                    text-align: left;
                }
                .voice-picker-gender {
                    font-size: 0.9rem;
                    opacity: 0.6;
                    margin-left: 8px;
                }

                @keyframes pulse-ring {
                    0% { transform: scale(0.95); opacity: 1; }
                    100% { transform: scale(1.1); opacity: 0; }
                }
                @keyframes blink-dot {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                @keyframes speak-pulse {
                    from { transform: scale(1); }
                    to { transform: scale(1.08); }
                }
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </>
    );
}
