import { useState, useCallback, useEffect, useRef } from 'react';
import {
    X, Mic, MicOff, Volume2, VolumeX, ChevronDown,
    MessageSquare, Sparkles, User, Play, Square
} from 'lucide-react';
import { speechRecognitionService } from '../services/SpeechRecognitionService';
import { TextToSpeechService, textToSpeechService } from '../services/TextToSpeechService';
import { audioStreamService } from '../services/AudioStreamService';
import { useAppStore } from '../store/useAppStore';

interface VoiceChatModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface VoiceMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: Date;
}

interface VoiceInfo {
    name: string;
    shortName: string;
    locale: string;
    gender: string;
}

export default function VoiceChatModal({ isOpen, onClose }: VoiceChatModalProps) {
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [interimText, setInterimText] = useState('');
    const [messages, setMessages] = useState<VoiceMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [ttsEnabled, setTtsEnabled] = useState(true);
    const [backendAvailable, setBackendAvailable] = useState(false);
    const [availableVoices, setAvailableVoices] = useState<VoiceInfo[]>([]);
    const [currentVoice, setCurrentVoice] = useState('de-DE-ConradNeural');
    const [showVoicePicker, setShowVoicePicker] = useState(false);
    const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const voicePickerRef = useRef<HTMLDivElement>(null);
    const streamingBufferRef = useRef<string>('');

    const socket = useAppStore((s) => s.socket);
    const ttsSupported = TextToSpeechService.isSupported();

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Load backend status + voices on open
    useEffect(() => {
        if (!isOpen) return;

        fetch('/api/voice/status')
            .then(r => r.json())
            .then(data => {
                if (data.tts?.available || data.stt?.available) {
                    setBackendAvailable(true);
                }
                if (data.tts?.voice) {
                    setCurrentVoice(data.tts.voice);
                }
            })
            .catch(() => {});

        fetch('/api/voice/tts/voices')
            .then(r => r.json())
            .then(data => {
                // API returns { backend, currentVoice, voices: [...] }
                const voices = Array.isArray(data) ? data : data?.voices;
                if (Array.isArray(voices) && voices.length > 0) {
                    setAvailableVoices(voices);
                }
                if (data?.currentVoice) {
                    setCurrentVoice(data.currentVoice);
                }
            })
            .catch(() => {});
    }, [isOpen]);

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

    // Listen for AI responses from socket
    useEffect(() => {
        if (!socket || !isOpen) return;

        // Collect streamed chunks
        const handleChunk = (data: { chunk: string }) => {
            streamingBufferRef.current += data.chunk || '';
        };

        // On complete: use the collected buffer as the full response
        const handleComplete = () => {
            const fullText = streamingBufferRef.current.trim();
            streamingBufferRef.current = '';

            if (!fullText) {
                setIsProcessing(false);
                return;
            }

            const msg: VoiceMessage = {
                id: Date.now().toString(),
                role: 'assistant',
                text: fullText,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, msg]);
            setIsProcessing(false);

            // TTS: Text fuer Sprachausgabe bereinigen (Emojis, Sonderzeichen, Markdown entfernen)
            const ttsText = fullText
                // Emojis entfernen
                .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
                // CJK/Korean/sonstige unerwuenschte Zeichen
                .replace(/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g, '')
                // Markdown entfernen (**bold**, *italic*, `code`, # headers, - lists)
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\*(.*?)\*/g, '$1')
                .replace(/`([^`]*)`/g, '$1')
                .replace(/^#{1,6}\s+/gm, '')
                .replace(/^[-*]\s+/gm, '')
                // URLs entfernen
                .replace(/https?:\/\/\S+/g, '')
                // Mehrfache Leerzeichen/Zeilenumbrueche
                .replace(/\n{2,}/g, '. ')
                .replace(/\n/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();

            if (ttsEnabled && ttsText) {
                if (backendAvailable) {
                    // Backend TTS (Edge TTS mit gewaehlter Stimme)
                    console.log('[VoiceChat] TTS request for:', ttsText.substring(0, 60));
                    fetch('/api/voice/tts/synthesize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: ttsText }),
                    })
                        .then(r => {
                            console.log('[VoiceChat] TTS response status:', r.status, 'type:', r.headers.get('content-type'));
                            if (!r.ok) throw new Error(`TTS failed: ${r.status}`);
                            const contentType = r.headers.get('content-type') || '';
                            if (contentType.includes('json')) {
                                // Backend returned JSON (error or fallback info) instead of audio
                                console.log('[VoiceChat] TTS returned JSON, using browser fallback');
                                throw new Error('TTS returned JSON, not audio');
                            }
                            return r.arrayBuffer();
                        })
                        .then(buf => {
                            console.log('[VoiceChat] TTS audio size:', buf.byteLength);
                            if (buf.byteLength < 50) {
                                throw new Error('TTS audio too small');
                            }
                            setIsSpeaking(true);
                            const audio = new Audio();
                            audio.src = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
                            audio.onended = () => setIsSpeaking(false);
                            audio.onerror = () => { console.error('[VoiceChat] Audio playback error'); setIsSpeaking(false); };
                            audio.play().catch(err => { console.error('[VoiceChat] Audio play failed:', err); setIsSpeaking(false); });
                        })
                        .catch(err => {
                            console.warn('[VoiceChat] Backend TTS failed, trying browser:', err);
                            if (ttsSupported) {
                                setIsSpeaking(true);
                                textToSpeechService.speak(ttsText, {
                                    onEnd: () => setIsSpeaking(false),
                                    onError: () => setIsSpeaking(false),
                                });
                            }
                        });
                } else if (ttsSupported) {
                    setIsSpeaking(true);
                    textToSpeechService.speak(ttsText, {
                        onEnd: () => setIsSpeaking(false),
                        onError: () => setIsSpeaking(false),
                    });
                }
            }
        };

        socket.on('ai-response-chunk', handleChunk);
        socket.on('ai-response-complete', handleComplete);
        socket.on('voice-tts-start', () => setIsSpeaking(true));
        socket.on('voice-tts-end', () => setIsSpeaking(false));

        return () => {
            socket.off('ai-response-chunk', handleChunk);
            socket.off('ai-response-complete', handleComplete);
            socket.off('voice-tts-start');
            socket.off('voice-tts-end');
        };
    }, [socket, isOpen, ttsEnabled, backendAvailable, backendAvailable, ttsSupported]);


    // Send user message to AI
    const sendToAI = useCallback((text: string) => {
        if (!text.trim() || !socket) return;

        const msg: VoiceMessage = {
            id: Date.now().toString(),
            role: 'user',
            text: text.trim(),
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, msg]);
        setIsProcessing(true);

        const userId = useAppStore.getState().currentUser?.id || 'default-user';
        const conversationId = useAppStore.getState().currentConversation?.id;

        socket.emit('user-message', {
            message: text.trim(),
            conversationId,
            userId,
        });
    }, [socket]);

    // Accumulated transcript buffer
    const accumulatedTextRef = useRef<string>('');

    // Toggle mic: Click 1 = start listening, Click 2 = stop & send
    const toggleListening = useCallback(async () => {
        if (isListening) {
            // === STOP & SEND ===
            speechRecognitionService.stop();
            if (backendAvailable) {
                socket?.emit('voice-transcribe-buffer');
                audioStreamService.stop();
                setTimeout(() => socket?.emit('voice-session-end'), 2000);
            }
            setIsListening(false);

            // Send accumulated text
            const finalText = accumulatedTextRef.current.trim();
            accumulatedTextRef.current = '';
            setInterimText('');

            if (finalText) {
                sendToAI(finalText);
            }
        } else {
            // === START LISTENING ===
            accumulatedTextRef.current = '';
            setInterimText('');
            setIsListening(true);

            // Always use Browser Speech Recognition for input (works reliably)
            speechRecognitionService.start(
                (transcript: string, isFinal: boolean) => {
                    if (isFinal) {
                        // Accumulate final segments
                        accumulatedTextRef.current += (accumulatedTextRef.current ? ' ' : '') + transcript;
                        setInterimText(accumulatedTextRef.current);
                    } else {
                        // Show current interim + accumulated
                        const preview = accumulatedTextRef.current
                            ? accumulatedTextRef.current + ' ' + transcript
                            : transcript;
                        setInterimText(preview);
                    }
                },
                (error: string) => {
                    console.error('[VoiceChat] STT error:', error);
                    setIsListening(false);
                }
            );
        }
    }, [isListening, backendAvailable, socket, ttsEnabled, sendToAI]);


    // Listen for pipeline STT transcripts (accumulate, don't auto-send)
    useEffect(() => {
        if (!socket || !isOpen) return;
        const handleVoiceTranscript = (data: { text: string; isFinal: boolean }) => {
            if (data.isFinal && data.text) {
                accumulatedTextRef.current += (accumulatedTextRef.current ? ' ' : '') + data.text;
                setInterimText(accumulatedTextRef.current);
            } else if (data.text) {
                setInterimText(accumulatedTextRef.current ? accumulatedTextRef.current + ' ' + data.text : data.text);
            }
        };
        socket.on('voice-transcript', handleVoiceTranscript);
        return () => { socket.off('voice-transcript', handleVoiceTranscript); };
    }, [socket, isOpen]);

    // Select voice
    const selectVoice = useCallback((shortName: string) => {
        setCurrentVoice(shortName);
        setShowVoicePicker(false);
        // Stop any preview
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
            setPreviewingVoice(null);
        }
        fetch('/api/voice/tts/set-voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voice: shortName }),
        }).catch(() => {});
    }, []);

    // Test/preview a voice
    const testVoice = useCallback((shortName: string, name: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Don't select the voice

        // If already previewing this voice, stop it
        if (previewingVoice === shortName && previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
            setPreviewingVoice(null);
            return;
        }

        // Stop any current preview
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }

        setPreviewingVoice(shortName);

        // Pick a sample text based on locale
        const isGerman = shortName.startsWith('de');
        const sampleText = isGerman
            ? `Hallo, ich bin ${name.split(' (')[0]}. So klinge ich.`
            : `Hello, I am ${name.split(' (')[0]}. This is how I sound.`;

        fetch('/api/voice/tts/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sampleText, voice: shortName }),
        })
            .then(r => {
                if (!r.ok) throw new Error('TTS failed');
                return r.arrayBuffer();
            })
            .then(buf => {
                if (buf.byteLength < 100) {
                    setPreviewingVoice(null);
                    return;
                }
                const audio = new Audio();
                audio.src = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
                audio.onended = () => {
                    setPreviewingVoice(null);
                    previewAudioRef.current = null;
                };
                audio.onerror = () => {
                    setPreviewingVoice(null);
                    previewAudioRef.current = null;
                };
                previewAudioRef.current = audio;
                audio.play().catch(() => {
                    setPreviewingVoice(null);
                    previewAudioRef.current = null;
                });
            })
            .catch(() => {
                setPreviewingVoice(null);
            });
    }, [previewingVoice]);

    // Cleanup on close
    useEffect(() => {
        if (!isOpen) {
            speechRecognitionService.stop();
            textToSpeechService.stop();
            audioStreamService.stop();
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
            }
            setIsListening(false);
            setIsSpeaking(false);
            setInterimText('');
            setIsProcessing(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const voiceLabel = availableVoices.find(v => v.shortName === currentVoice)?.name?.split(' (')[0]
        || currentVoice.split('-').pop()?.replace('Neural', '') || 'Stimme';

    return (
        <div className="vcm-overlay" onClick={onClose}>
            <div className="vcm-modal" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="vcm-header">
                    <div className="vcm-header-left">
                        <Sparkles size={20} className="vcm-accent" />
                        <span className="vcm-title">NEON Voice Chat</span>
                    </div>
                    <div className="vcm-header-right">
                        {/* TTS Toggle */}
                        <button
                            className={`vcm-icon-btn ${ttsEnabled ? 'active' : ''}`}
                            onClick={() => setTtsEnabled(!ttsEnabled)}
                            title={ttsEnabled ? 'Sprachausgabe aus' : 'Sprachausgabe an'}
                        >
                            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        </button>

                        {/* Voice Picker */}
                        {availableVoices.length > 0 && (
                            <div className="vcm-voice-picker-wrap" ref={voicePickerRef}>
                                <button
                                    className="vcm-chip"
                                    onClick={() => setShowVoicePicker(!showVoicePicker)}
                                >
                                    <span className="vcm-voice-label">{voiceLabel}</span>
                                    <ChevronDown size={12} />
                                </button>

                                {showVoicePicker && (
                                    <div className="vcm-voice-dropdown">
                                        <div className="vcm-vd-header">Stimme waehlen</div>
                                        {['de', 'en'].map(lang => {
                                            const voices = availableVoices.filter(v => v.locale?.startsWith(lang));
                                            if (voices.length === 0) return null;
                                            return (
                                                <div key={lang}>
                                                    <div className="vcm-vd-group">{lang === 'de' ? 'Deutsch' : 'English'}</div>
                                                    {voices.map(v => (
                                                        <div key={v.shortName} className={`vcm-vd-item ${currentVoice === v.shortName ? 'active' : ''}`}>
                                                            <button
                                                                className="vcm-vd-select"
                                                                onClick={() => selectVoice(v.shortName)}
                                                            >
                                                                <span>{v.name}</span>
                                                                <span className="vcm-vd-gender">{v.gender === 'Male' ? '♂' : '♀'}</span>
                                                            </button>
                                                            <button
                                                                className={`vcm-vd-test ${previewingVoice === v.shortName ? 'playing' : ''}`}
                                                                onClick={(e) => testVoice(v.shortName, v.name, e)}
                                                                title="Vorhoeren"
                                                            >
                                                                {previewingVoice === v.shortName ? <Square size={12} /> : <Play size={12} />}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        <button className="vcm-icon-btn" onClick={onClose} title="Schliessen">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Chat Messages */}
                <div className="vcm-messages">
                    {messages.length === 0 && !isListening && (
                        <div className="vcm-empty">
                            <Mic size={48} className="vcm-empty-icon" />
                            <p>Druecke den Mikrofon-Button und sprich mit NEON</p>
                            <p className="vcm-empty-sub">Die Antwort kommt per Stimme zurueck</p>
                        </div>
                    )}

                    {messages.map(msg => (
                        <div key={msg.id} className={`vcm-msg ${msg.role}`}>
                            <div className="vcm-msg-icon">
                                {msg.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
                            </div>
                            <div className="vcm-msg-bubble">
                                <div className="vcm-msg-text">{msg.text}</div>
                                <div className="vcm-msg-time">
                                    {msg.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    ))}

                    {isProcessing && (
                        <div className="vcm-msg assistant">
                            <div className="vcm-msg-icon"><Sparkles size={16} /></div>
                            <div className="vcm-msg-bubble">
                                <div className="vcm-thinking">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Waveform / Mic Area */}
                <div className="vcm-mic-area">
                    {/* Interim text */}
                    {interimText && (
                        <div className="vcm-interim">
                            <MessageSquare size={14} />
                            <span>{interimText}</span>
                        </div>
                    )}

                    {/* Speaking indicator */}
                    {isSpeaking && (
                        <div className="vcm-speaking-indicator">
                            <Volume2 size={14} />
                            <span>NEON spricht...</span>
                        </div>
                    )}

                    {/* Big Mic Button with pulse rings */}
                    <div className="vcm-mic-wrap">
                        {isListening && (
                            <>
                                <div className="vcm-pulse-ring ring1" />
                                <div className="vcm-pulse-ring ring2" />
                                <div className="vcm-pulse-ring ring3" />
                            </>
                        )}
                        {isSpeaking && (
                            <>
                                <div className="vcm-speak-ring ring1" />
                                <div className="vcm-speak-ring ring2" />
                            </>
                        )}
                    <button
                        className={`vcm-mic-btn ${isListening ? 'active' : ''} ${isProcessing ? 'processing' : ''} ${isSpeaking ? 'speaking' : ''}`}
                        onClick={toggleListening}
                        disabled={isProcessing}
                        title={isListening ? 'Aufnahme beenden & senden' : 'Sprechen'}
                    >
                        {isListening ? <MicOff size={32} /> : <Mic size={32} />}
                    </button>
                    </div>

                    <div className="vcm-mic-hint">
                        {isListening
                            ? 'Hoere zu... Klicke erneut um zu senden'
                            : isProcessing
                            ? 'NEON denkt nach...'
                            : isSpeaking
                            ? 'NEON spricht...'
                            : 'Klicke zum Sprechen'}
                    </div>
                </div>
            </div>

            <style>{`
                .vcm-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    animation: vcm-fade-in 0.2s ease;
                    backdrop-filter: blur(4px);
                }
                .vcm-modal {
                    width: 480px;
                    max-width: 95vw;
                    height: 700px;
                    max-height: 90vh;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-subtle);
                    border-radius: 16px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    animation: vcm-slide-up 0.3s ease;
                }

                /* Header */
                .vcm-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--border-subtle);
                    background: var(--bg-secondary);
                    flex-shrink: 0;
                }
                .vcm-header-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .vcm-header-right {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .vcm-title {
                    font-weight: 600;
                    font-size: 0.95rem;
                    color: var(--text-primary);
                }
                .vcm-accent { color: #f9ab00; }

                .vcm-chip {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    font-size: 0.7rem;
                    border: 1px solid var(--border-subtle);
                    border-radius: 14px;
                    background: transparent;
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .vcm-chip:hover { border-color: #f9ab00; color: var(--text-primary); }
                .vcm-chip.active { background: rgba(249,171,0,0.15); color: #f9ab00; border-color: rgba(249,171,0,0.4); }

                .vcm-icon-btn {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: var(--radius-sm);
                    border: none;
                    background: transparent;
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .vcm-icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
                .vcm-icon-btn.active { color: #22c55e; }

                /* Voice Picker */
                .vcm-voice-picker-wrap { position: relative; }
                .vcm-voice-label {
                    max-width: 70px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .vcm-voice-dropdown {
                    position: absolute;
                    top: calc(100% + 6px);
                    right: 0;
                    min-width: 220px;
                    max-height: 280px;
                    overflow-y: auto;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-md);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    z-index: 110;
                    animation: vcm-fade-in 0.15s ease;
                }
                .vcm-vd-header {
                    padding: 10px 12px 6px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    border-bottom: 1px solid var(--border-subtle);
                }
                .vcm-vd-group {
                    padding: 8px 12px 4px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-tertiary);
                }
                .vcm-vd-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                    padding: 8px 12px;
                    border: none;
                    background: transparent;
                    color: var(--text-secondary);
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: all 0.15s;
                    text-align: left;
                }
                .vcm-vd-item {
                    display: flex;
                    align-items: center;
                    gap: 0;
                }
                .vcm-vd-item:hover { background: var(--bg-hover); }
                .vcm-vd-item.active { background: rgba(249,171,0,0.1); }
                .vcm-vd-select {
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
                .vcm-vd-item:hover .vcm-vd-select { color: var(--text-primary); }
                .vcm-vd-item.active .vcm-vd-select { color: #f9ab00; }
                .vcm-vd-gender { opacity: 0.5; font-size: 0.9rem; }
                .vcm-vd-test {
                    width: 30px;
                    height: 30px;
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
                .vcm-vd-test:hover {
                    background: rgba(249,171,0,0.15);
                    color: #f9ab00;
                }
                .vcm-vd-test.playing {
                    color: #f9ab00;
                    animation: vcm-pulse 1s ease-in-out infinite;
                }

                /* Messages */
                .vcm-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    min-height: 0;
                }
                .vcm-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    flex: 1;
                    color: var(--text-tertiary);
                    text-align: center;
                    gap: 8px;
                }
                .vcm-empty-icon { opacity: 0.2; }
                .vcm-empty p { font-size: 0.9rem; margin: 0; }
                .vcm-empty-sub { font-size: 0.75rem; opacity: 0.6; }

                .vcm-msg {
                    display: flex;
                    gap: 8px;
                    animation: vcm-msg-in 0.3s ease;
                }
                .vcm-msg.user { flex-direction: row-reverse; }
                .vcm-msg-icon {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    margin-top: 2px;
                }
                .vcm-msg.user .vcm-msg-icon {
                    background: rgba(99, 102, 241, 0.15);
                    color: #818cf8;
                }
                .vcm-msg.assistant .vcm-msg-icon {
                    background: rgba(249, 171, 0, 0.15);
                    color: #f9ab00;
                }
                .vcm-msg-bubble {
                    max-width: 80%;
                    padding: 10px 14px;
                    border-radius: 14px;
                    font-size: 0.88rem;
                    line-height: 1.5;
                }
                .vcm-msg.user .vcm-msg-bubble {
                    background: rgba(99, 102, 241, 0.12);
                    color: var(--text-primary);
                    border-bottom-right-radius: 4px;
                }
                .vcm-msg.assistant .vcm-msg-bubble {
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                    border-bottom-left-radius: 4px;
                }
                .vcm-msg-text { white-space: pre-wrap; word-break: break-word; }
                .vcm-msg-time {
                    font-size: 0.65rem;
                    color: var(--text-tertiary);
                    margin-top: 4px;
                }
                .vcm-msg.user .vcm-msg-time { text-align: right; }

                /* Thinking dots */
                .vcm-thinking {
                    display: flex;
                    gap: 4px;
                    padding: 4px 0;
                }
                .vcm-thinking span {
                    width: 8px;
                    height: 8px;
                    background: #f9ab00;
                    border-radius: 50%;
                    animation: vcm-bounce 1.4s ease-in-out infinite;
                }
                .vcm-thinking span:nth-child(2) { animation-delay: 0.16s; }
                .vcm-thinking span:nth-child(3) { animation-delay: 0.32s; }

                /* Mic Area */
                .vcm-mic-area {
                    padding: 16px;
                    border-top: 1px solid var(--border-subtle);
                    background: var(--bg-secondary);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                }
                /* Pulse ring wrapper */
                .vcm-mic-wrap {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 140px;
                    height: 140px;
                }
                .vcm-pulse-ring {
                    position: absolute;
                    border-radius: 50%;
                    border: 2px solid rgba(239, 68, 68, 0.4);
                    animation: vcm-ring-expand 2.4s ease-out infinite;
                }
                .vcm-pulse-ring.ring1 { width: 80px; height: 80px; animation-delay: 0s; }
                .vcm-pulse-ring.ring2 { width: 80px; height: 80px; animation-delay: 0.8s; }
                .vcm-pulse-ring.ring3 { width: 80px; height: 80px; animation-delay: 1.6s; }

                .vcm-speak-ring {
                    position: absolute;
                    border-radius: 50%;
                    border: 2px solid rgba(34, 197, 94, 0.4);
                    animation: vcm-ring-expand 2s ease-out infinite;
                }
                .vcm-speak-ring.ring1 { width: 80px; height: 80px; animation-delay: 0s; }
                .vcm-speak-ring.ring2 { width: 80px; height: 80px; animation-delay: 1s; }

                @keyframes vcm-ring-expand {
                    0% { transform: scale(1); opacity: 0.6; }
                    100% { transform: scale(2.2); opacity: 0; }
                }
                .vcm-interim {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 14px;
                    background: rgba(249, 171, 0, 0.08);
                    border: 1px solid rgba(249, 171, 0, 0.2);
                    border-radius: 20px;
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    font-style: italic;
                    max-width: 90%;
                    text-align: center;
                }
                .vcm-speaking-indicator {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 12px;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    border-radius: 20px;
                    font-size: 0.75rem;
                    color: #22c55e;
                    animation: vcm-pulse 1.5s ease-in-out infinite;
                }

                /* Big Mic Button */
                .vcm-mic-btn {
                    width: 72px;
                    height: 72px;
                    border-radius: 50%;
                    border: 3px solid var(--border-subtle);
                    background: var(--bg-primary);
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.3s;
                    position: relative;
                }
                .vcm-mic-btn:hover {
                    border-color: #f9ab00;
                    color: #f9ab00;
                    transform: scale(1.05);
                }
                .vcm-mic-btn.active {
                    background: rgba(239, 68, 68, 0.15);
                    border-color: #ef4444;
                    color: #ef4444;
                    animation: vcm-mic-pulse 1.5s ease-in-out infinite;
                }
                .vcm-mic-btn.processing {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .vcm-mic-btn.speaking {
                    border-color: #22c55e;
                    color: #22c55e;
                }

                .vcm-mic-hint {
                    font-size: 0.75rem;
                    color: var(--text-tertiary);
                    text-align: center;
                }

                /* Animations */
                @keyframes vcm-fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes vcm-slide-up {
                    from { opacity: 0; transform: translateY(30px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes vcm-msg-in {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes vcm-bounce {
                    0%, 80%, 100% { transform: scale(0); }
                    40% { transform: scale(1); }
                }
                @keyframes vcm-mic-pulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                    50% { box-shadow: 0 0 0 16px rgba(239, 68, 68, 0); }
                }
                @keyframes vcm-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
            `}</style>
        </div>
    );
}
