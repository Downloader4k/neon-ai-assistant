import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { SpeechRecognitionService, speechRecognitionService } from '../services/SpeechRecognitionService';
import { TextToSpeechService, textToSpeechService } from '../services/TextToSpeechService';
import { useAppStore } from '../store/useAppStore';

interface VoiceControlsProps {
    onTranscript?: (text: string) => void;
}

export default function VoiceControls({ onTranscript }: VoiceControlsProps) {
    const [isListening, setIsListening] = useState(false);
    const [isTTSActive, setIsTTSActive] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [interimText, setInterimText] = useState('');
    const [sttSupported] = useState(() => SpeechRecognitionService.isSupported());
    const [ttsSupported] = useState(() => TextToSpeechService.isSupported());
    const lastMessageRef = useRef<string>('');
    const speakingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // TTS: Letzte AI-Antwort automatisch vorlesen wenn aktiv
    const conversations = useAppStore((s) => s.currentConversation);

    // Poll speaking state for visual feedback
    useEffect(() => {
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
            if (speakingPollRef.current) {
                clearInterval(speakingPollRef.current);
            }
        };
    }, [isTTSActive]);

    useEffect(() => {
        if (!isTTSActive || !conversations?.messages) return;

        const messages = conversations.messages;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.content !== lastMessageRef.current) {
            lastMessageRef.current = lastMsg.content;
            textToSpeechService.speak(lastMsg.content, {
                onEnd: () => setIsSpeaking(false),
                onError: () => setIsSpeaking(false),
            });
            setIsSpeaking(true);
        }
    }, [conversations?.messages, isTTSActive]);

    const toggleListening = useCallback(() => {
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

    const toggleTTS = useCallback(() => {
        if (!ttsSupported) return;

        if (isTTSActive) {
            textToSpeechService.stop();
            setIsTTSActive(false);
            setIsSpeaking(false);
        } else {
            setIsTTSActive(true);
        }
    }, [isTTSActive, ttsSupported]);

    // Aufraeumen beim Unmount
    useEffect(() => {
        return () => {
            speechRecognitionService.stop();
            textToSpeechService.stop();
        };
    }, []);

    return (
        <>
            <div className="flex items-center gap-1">
                {/* Spracheingabe (STT) */}
                {sttSupported && (
                    <button
                        onClick={toggleListening}
                        className={`voice-button ${isListening ? 'listening' : ''}`}
                        title={isListening ? 'Aufnahme beenden' : 'Sprachaufnahme starten'}
                    >
                        {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                        {isListening && <span className="recording-dot" />}
                    </button>
                )}

                {/* Sprachausgabe (TTS) */}
                {ttsSupported && (
                    <button
                        onClick={toggleTTS}
                        className={`voice-button ${isTTSActive ? 'tts-active' : ''} ${isSpeaking ? 'speaking' : ''}`}
                        title={isTTSActive ? 'Sprachausgabe deaktivieren' : 'Sprachausgabe aktivieren'}
                    >
                        {isTTSActive ? <Volume2 size={18} /> : <VolumeX size={18} />}
                    </button>
                )}
            </div>

            {/* Interim-Transkript anzeigen */}
            {interimText && (
                <div className="voice-interim">
                    {interimText}
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
