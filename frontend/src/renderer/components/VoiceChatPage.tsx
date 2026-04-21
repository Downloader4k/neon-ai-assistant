import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Mic, Volume2, VolumeX, Settings, Sliders, RefreshCw, Square, Repeat, Cpu } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { speechRecognitionService } from '../services/SpeechRecognitionService';
import { TextToSpeechService, textToSpeechService } from '../services/TextToSpeechService';
import { streamingAudioPlayer, splitIntoSentences } from '../services/StreamingAudioPlayer';
import { micMonitorService } from '../services/MicMonitorService';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceOption {
    name: string;
    shortName: string;
    locale: string;
    gender: string;
    backend: string;
}

// Ring-Konfiguration: baseRx, baseRy, startAngle, rotSpeed, color, strokeWidth, dashArray, opacity
const RING_CONFIG = [
    { rx: 56, ry: 50, angle: 0,   dir:  1, color: '#d4900a', sw: 3.5, dash: '90 30 70 25 60 35',  op: 0.95 },
    { rx: 48, ry: 55, angle: 72,  dir: -1, color: '#f9ab00', sw: 3.0, dash: '80 40 50 45 65 30',  op: 0.90 },
    { rx: 38, ry: 48, angle: 144, dir:  1, color: '#e8a409', sw: 2.5, dash: '60 35 50 40 45 30',  op: 0.80 },
    { rx: 55, ry: 40, angle: 216, dir: -1, color: '#c7850a', sw: 1.8, dash: '40 55 35 70 25 45',  op: 0.60 },
    { rx: 62, ry: 45, angle: 288, dir:  1, color: '#b07508', sw: 1.2, dash: '25 70 20 80 30 50',  op: 0.40 },
];

const SHADOW_CONFIG = [
    { rx: 60, ry: 52, angle: 10,  color: 'rgba(80,60,10,0.25)', sw: 4 },
    { rx: 52, ry: 58, angle: 130, color: 'rgba(70,50,5,0.2)',   sw: 3.5 },
    { rx: 45, ry: 60, angle: 250, color: 'rgba(60,45,5,0.18)',  sw: 3 },
];

const STREAK_CONFIG = [
    { rx: 50, ry: 53, angle: 30,  dash: '15 200', op: 0.85 },
    { rx: 44, ry: 56, angle: 200, dash: '12 210', op: 0.75 },
];

function Slider({ label, value, hint, onChange }: { label: string; value: number; hint?: string; onChange: (v: number) => void }) {
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>{label}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                    {value.toFixed(2)}{hint ? ` · ${hint}` : ''}
                </span>
            </div>
            <input
                type="range"
                min={0} max={1} step={0.05}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#f9ab00' }}
            />
        </div>
    );
}

export default function VoiceChatPage() {
    const [voiceState, setVoiceState] = useState<VoiceState>('idle');
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [interimText, setInterimText] = useState('');
    const [ttsEnabled, setTtsEnabled] = useState(true);
    const [statusText, setStatusText] = useState('Klicke auf den Orb um zu starten');
    const [backendAvailable, setBackendAvailable] = useState(false);

    // Voice-Picker State
    const [voices, setVoices] = useState<VoiceOption[]>([]);
    const [currentVoice, setCurrentVoice] = useState<string>('');
    const [currentBackend, setCurrentBackend] = useState<string>('edge-tts');
    const [showVoicePicker, setShowVoicePicker] = useState(false);
    const [elevenLabsReady, setElevenLabsReady] = useState(false);
    const [isRefreshingVoices, setIsRefreshingVoices] = useState(false);

    // Voice-Mode Features
    const [continuousMode, setContinuousMode] = useState(false);   // Hands-free: nach TTS wieder zuhoeren
    const [useLocalWhisper, setUseLocalWhisper] = useState(false); // Backend-Whisper statt Browser Web Speech
    const [whisperAvailable, setWhisperAvailable] = useState(false);
    const [micLevel, setMicLevel] = useState(0);                   // Live Mic-Pegel (0..1)
    const continuousModeRef = useRef(false);
    const useLocalWhisperRef = useRef(false);
    const autoRestartPendingRef = useRef(false); // verhindert doppeltes Auto-Restart

    // Barge-in Schutzzeit: Erste 400ms nach TTS-Start KEINE VAD-Trigger (Einschwingen)
    const bargeinArmedRef = useRef(false);

    // MediaRecorder fuer Whisper-STT
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    // Hinweis: Stimmen kommen ausschliesslich aus dem ElevenLabs-Account
    // (GET /v1/voices - dafuer braucht der API-Key die Permission "voices_read").
    // Es gibt KEIN UI-Hinzufuegen; Stimmen werden nur auf elevenlabs.io gepflegt.

    // Voice-Settings State (Preset + Feinschliff)
    type PresetKey = 'standard' | 'warm' | 'dramatic' | 'whisper' | 'clear' | 'custom';
    const [preset, setPreset] = useState<PresetKey>('standard');
    const [stability, setStability] = useState(0.5);
    const [similarity, setSimilarity] = useState(0.75);
    const [style, setStyle] = useState(0.0);
    const [speakerBoost, setSpeakerBoost] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const voicePickerRef = useRef<HTMLDivElement>(null);

    // Audio-Analyse Refs
    const ringGroupRefs = useRef<(SVGGElement | null)[]>([]);
    const ringEllipseRefs = useRef<(SVGEllipseElement | null)[]>([]);
    const shadowGroupRefs = useRef<(SVGGElement | null)[]>([]);
    const streakGroupRefs = useRef<(SVGGElement | null)[]>([]);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const animFrameRef = useRef<number>(0);
    const ringAnglesRef = useRef<number[]>(RING_CONFIG.map(r => r.angle));
    const isSpeakingRef = useRef(false);
    const smoothLevelsRef = useRef<number[]>([0, 0, 0, 0, 0]);
    // Aktuell abspielendes TTS-Audio (damit der Stop-Button es unterbrechen kann)
    const currentAudioRef = useRef<HTMLAudioElement | null>(null);
    // Fuer Animations-Loop: laeuft auch beim Zuhoeren, damit Orb live Mic-Pegel zeigt
    const isListeningRef = useRef(false);

    // Store: chat-bezogene Konversation verwenden
    const currentConversation = useAppStore((s) => s.currentConversation);
    const storeIsTyping = useAppStore((s) => s.isTyping);
    const sendStoreMessage = useAppStore((s) => s.sendMessage);
    const setActiveView = useAppStore((s) => s.setActiveView);
    const ttsSupported = TextToSpeechService.isSupported();

    // Nachrichten kommen direkt aus der Store-Konversation
    const messages = currentConversation?.messages || [];
    const isProcessing = storeIsTyping;
    const hasActiveChat = !!currentConversation;

    // Track previous typing state fuer TTS-Trigger
    const prevTypingRef = useRef(false);
    const spokenMessageIdsRef = useRef<Set<string>>(new Set());

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Backend-Status + Voices laden
    useEffect(() => {
        fetch('/api/voice/status')
            .then(r => r.json())
            .then(data => {
                if (data.tts?.available || data.stt?.available) {
                    setBackendAvailable(true);
                }
                if (data.tts?.voice) setCurrentVoice(data.tts.voice);
                if (data.tts?.backend) setCurrentBackend(data.tts.backend);
                if (data.tts?.elevenLabsReady) setElevenLabsReady(true);
                // Whisper verfuegbar? (faster-whisper, whisper-cpp oder whisper-api)
                if (data.stt?.available && data.stt?.backend !== 'browser') {
                    setWhisperAvailable(true);
                }
            })
            .catch(() => {});

        // Alle verfuegbaren Voices laden (Edge + ElevenLabs falls vorhanden)
        loadVoices(false);

        // Persistente Settings aus LocalStorage laden
        try {
            const saved = JSON.parse(localStorage.getItem('neon-voice-prefs') || '{}');
            if (typeof saved.continuousMode === 'boolean') setContinuousMode(saved.continuousMode);
            if (typeof saved.useLocalWhisper === 'boolean') setUseLocalWhisper(saved.useLocalWhisper);
        } catch { /* ignore */ }
    }, []);

    // Prefs persistieren
    useEffect(() => {
        try {
            localStorage.setItem('neon-voice-prefs', JSON.stringify({ continuousMode, useLocalWhisper }));
        } catch { /* ignore */ }
        continuousModeRef.current = continuousMode;
        useLocalWhisperRef.current = useLocalWhisper;
    }, [continuousMode, useLocalWhisper]);

    // Keine Custom-Voice Add/Remove Logik mehr - alles ueber ElevenLabs Account

    const loadVoices = useCallback(async (forceRefresh: boolean) => {
        if (forceRefresh) setIsRefreshingVoices(true);
        // Nur ElevenLabs-Stimmen uebernehmen (keine Microsoft/Edge-TTS)
        const keepOnlyElevenLabs = (list: VoiceOption[]) =>
            list.filter(v => v.backend === 'elevenlabs');
        try {
            const url = `/api/voice/tts/voices-all${forceRefresh ? '?refresh=1' : ''}`;
            const res = await fetch(url);
            const data = await res.json();
            if (Array.isArray(data.voices)) setVoices(keepOnlyElevenLabs(data.voices));
            if (data.currentVoice) setCurrentVoice(data.currentVoice);
            if (data.currentBackend) setCurrentBackend(data.currentBackend);
            if (data.elevenLabsReady) setElevenLabsReady(true);
        } catch {
            // Fallback: nur aktuelle Voices
            try {
                const res = await fetch('/api/voice/tts/voices');
                const data = await res.json();
                const list = Array.isArray(data) ? data : data?.voices;
                if (Array.isArray(list)) setVoices(keepOnlyElevenLabs(list));
            } catch { /* ignore */ }
        } finally {
            if (forceRefresh) setIsRefreshingVoices(false);
        }
    }, []);

    // Klick ausserhalb schliesst Picker
    useEffect(() => {
        if (!showVoicePicker) return;
        const onClick = (e: MouseEvent) => {
            if (voicePickerRef.current && !voicePickerRef.current.contains(e.target as Node)) {
                setShowVoicePicker(false);
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [showVoicePicker]);

    // Klick ausserhalb schliesst Voice-Settings
    useEffect(() => {
        if (!showSettings) return;
        const onClick = (e: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setShowSettings(false);
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [showSettings]);

    // Aktuelle Voice-Settings vom Backend laden (zeigt aktiven Preset/Werte)
    useEffect(() => {
        fetch('/api/voice/status')
            .then(r => r.json())
            .then(data => {
                const tts = data?.tts;
                if (!tts) return;
                if (tts.elevenLabsPreset) setPreset(tts.elevenLabsPreset);
                if (tts.elevenLabsVoiceSettings) {
                    setStability(tts.elevenLabsVoiceSettings.stability);
                    setSimilarity(tts.elevenLabsVoiceSettings.similarity_boost);
                    setStyle(tts.elevenLabsVoiceSettings.style);
                    setSpeakerBoost(tts.elevenLabsVoiceSettings.use_speaker_boost);
                }
            })
            .catch(() => {});
    }, []);

    const applyPreset = useCallback(async (newPreset: PresetKey) => {
        try {
            const res = await fetch('/api/voice/tts/voice-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preset: newPreset }),
            });
            const data = await res.json();
            setPreset(newPreset);
            if (data.settings) {
                setStability(data.settings.stability);
                setSimilarity(data.settings.similarity_boost);
                setStyle(data.settings.style);
                setSpeakerBoost(data.settings.use_speaker_boost);
            }
        } catch (err) {
            console.warn('[VoiceChatPage] Preset setzen fehlgeschlagen:', err);
        }
    }, []);

    const applyCustomSettings = useCallback(async (next: Partial<{ stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean }>) => {
        const merged = {
            stability: next.stability ?? stability,
            similarity_boost: next.similarity_boost ?? similarity,
            style: next.style ?? style,
            use_speaker_boost: next.use_speaker_boost ?? speakerBoost,
        };
        if (next.stability !== undefined) setStability(next.stability);
        if (next.similarity_boost !== undefined) setSimilarity(next.similarity_boost);
        if (next.style !== undefined) setStyle(next.style);
        if (next.use_speaker_boost !== undefined) setSpeakerBoost(next.use_speaker_boost);
        setPreset('custom');
        try {
            await fetch('/api/voice/tts/voice-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preset: 'custom', settings: merged }),
            });
        } catch (err) {
            console.warn('[VoiceChatPage] Custom-Settings fehlgeschlagen:', err);
        }
    }, [stability, similarity, style, speakerBoost]);

    const changeVoice = useCallback(async (voice: VoiceOption) => {
        try {
            await fetch('/api/voice/tts/set-voice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voice: voice.shortName, backend: voice.backend }),
            });
            setCurrentVoice(voice.shortName);
            setCurrentBackend(voice.backend);
            setShowVoicePicker(false);
        } catch (err) {
            console.warn('[VoiceChatPage] Voice wechseln fehlgeschlagen:', err);
        }
    }, []);

    // VoiceState aktualisieren
    useEffect(() => {
        if (isSpeaking) {
            setVoiceState('speaking');
            setStatusText(continuousMode
                ? 'Einfach reinsprechen, um Neon zu unterbrechen...'
                : '');
        } else if (isProcessing) {
            setVoiceState('thinking');
            setStatusText('Neon denkt nach...');
        } else if (isListening) {
            setVoiceState('listening');
            setStatusText(interimText || (useLocalWhisper ? 'Whisper hoert zu...' : ''));
        } else {
            setVoiceState('idle');
            if (continuousMode) setStatusText('Hands-Free aktiv - Orb tippen um zu starten');
        }
    }, [isListening, isProcessing, isSpeaking, interimText, continuousMode, useLocalWhisper]);

    // TTS-Events fuer NeonAvatar
    useEffect(() => {
        if (isSpeaking) {
            window.dispatchEvent(new CustomEvent('neon-tts-start'));
        } else {
            window.dispatchEvent(new CustomEvent('neon-tts-end'));
        }
    }, [isSpeaking]);

    // ===== Audio-Analyse Animation Loop =====
    const animateRings = useCallback(() => {
        const analyser = analyserRef.current;
        let levels: number[];

        if (analyser) {
            // Echte Audio-Frequenzdaten
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            const bandSize = Math.floor(data.length / 5);
            levels = [];
            for (let i = 0; i < 5; i++) {
                let sum = 0;
                for (let j = i * bandSize; j < (i + 1) * bandSize; j++) {
                    sum += data[j];
                }
                levels.push(sum / bandSize / 255);
            }
        } else if (isSpeakingRef.current) {
            // Fallback: simulierte Werte fuer Browser-TTS
            const t = Date.now() / 1000;
            levels = [
                0.4 + 0.3 * Math.sin(t * 3.1),
                0.3 + 0.4 * Math.sin(t * 2.7 + 1),
                0.5 + 0.3 * Math.sin(t * 4.2 + 2),
                0.3 + 0.3 * Math.sin(t * 1.9 + 3),
                0.2 + 0.3 * Math.sin(t * 3.6 + 4),
            ];
        } else if (isListeningRef.current) {
            // Sanftes Atmen waehrend Zuhoerens (kein Mic-Input)
            const t = Date.now() / 1000;
            const breathe = 0.15 + 0.1 * Math.sin(t * 1.5);
            levels = [breathe, breathe * 0.8, breathe, breathe * 0.7, breathe * 0.6];
        } else {
            // Nicht speaking → zurueck auf 0
            levels = [0, 0, 0, 0, 0];
        }

        // Smooth interpolation
        const smooth = smoothLevelsRef.current;
        const lerp = isSpeakingRef.current ? 0.18 : 0.08;
        for (let i = 0; i < 5; i++) {
            smooth[i] += (levels[i] - smooth[i]) * lerp;
        }

        // Ringe bewegen — nur wenn Level > 0
        const anyMovement = smooth.some(v => v > 0.005);

        for (let i = 0; i < 5; i++) {
            const level = smooth[i];
            const cfg = RING_CONFIG[i];

            // Rotation: proportional zur Lautstaerke in diesem Band
            ringAnglesRef.current[i] += cfg.dir * level * 4;

            const g = ringGroupRefs.current[i];
            if (g) {
                g.setAttribute('transform', `rotate(${ringAnglesRef.current[i]}, 100, 100)`);
            }

            const el = ringEllipseRefs.current[i];
            if (el) {
                el.setAttribute('rx', String(cfg.rx + level * 10));
                el.setAttribute('ry', String(cfg.ry + level * 10));
                el.setAttribute('stroke-dashoffset', String(level * 80));
                el.setAttribute('opacity', String(cfg.op + level * 0.15));
            }
        }

        // Shadow-Ringe (gedaempft)
        for (let i = 0; i < 3; i++) {
            const avgLevel = (smooth[i] + smooth[i + 1]) / 2;
            const g = shadowGroupRefs.current[i];
            if (g) {
                const baseAngle = SHADOW_CONFIG[i].angle;
                const currentAngle = baseAngle + avgLevel * 30;
                g.setAttribute('transform', `rotate(${currentAngle}, 100, 100)`);
            }
        }

        // Streak-Highlights
        for (let i = 0; i < 2; i++) {
            const level = smooth[i * 2];
            const g = streakGroupRefs.current[i];
            if (g) {
                const baseAngle = STREAK_CONFIG[i].angle;
                g.setAttribute('transform', `rotate(${baseAngle + level * 60}, 100, 100)`);
                const el = g.querySelector('ellipse');
                if (el) {
                    el.setAttribute('opacity', String(level > 0.1 ? STREAK_CONFIG[i].op : 0));
                }
            }
        }

        // Weiterlaufen solange Speaking, Listening oder noch Restbewegung
        if (isSpeakingRef.current || isListeningRef.current || anyMovement) {
            animFrameRef.current = requestAnimationFrame(animateRings);
        }
    }, []);

    const startAnimLoop = useCallback(() => {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(animateRings);
    }, [animateRings]);

    // Cleanup
    useEffect(() => {
        return () => cancelAnimationFrame(animFrameRef.current);
    }, []);

    // ===== Audio mit Analyser verbinden =====
    const connectAudioAnalyser = useCallback((audioElement: HTMLAudioElement) => {
        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new AudioContext();
            }
            const ctx = audioCtxRef.current;
            const source = ctx.createMediaElementSource(audioElement);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.7;
            source.connect(analyser);
            analyser.connect(ctx.destination);
            analyserRef.current = analyser;
        } catch (err) {
            console.warn('[VoiceChatPage] AudioAnalyser setup failed:', err);
            analyserRef.current = null;
        }
    }, []);

    // ===== TTS mit Streaming =====
    // Satz-fuer-Satz Streaming: Backend liefert per /tts/synthesize-stream
    // chunked MP3 sobald ElevenLabs die ersten Bytes rausschreibt.
    // Der StreamingAudioPlayer haengt sie ueber MediaSource gapless aneinander.
    const speakText = useCallback(async (text: string) => {
        if (!ttsEnabled || !text.trim()) return;

        if (backendAvailable) {
            try {
                const sentences = splitIntoSentences(text);
                if (sentences.length === 0) return;

                const items = sentences.map(s => ({
                    url: '/api/voice/tts/synthesize-stream',
                    body: { text: s },
                }));

                // Speaking-State sofort setzen damit UI reagiert
                setIsSpeaking(true);
                isSpeakingRef.current = true;
                bargeinArmedRef.current = false;
                // Nach kurzer Einschwingzeit Barge-in scharfschalten
                window.setTimeout(() => { bargeinArmedRef.current = true; }, 400);

                await streamingAudioPlayer.start(items, {
                    onAudioElement: (audio) => {
                        currentAudioRef.current = audio;
                        // TTS-Analyser fuer Orb-Visualisierung
                        connectAudioAnalyser(audio);
                        startAnimLoop();
                    },
                    onAllEnded: () => {
                        setIsSpeaking(false);
                        isSpeakingRef.current = false;
                        analyserRef.current = null;
                        currentAudioRef.current = null;
                        bargeinArmedRef.current = false;
                    },
                    onError: (err) => {
                        console.warn('[VoiceChatPage] Streaming TTS error', err);
                        setIsSpeaking(false);
                        isSpeakingRef.current = false;
                        analyserRef.current = null;
                        currentAudioRef.current = null;
                        bargeinArmedRef.current = false;
                    },
                });
                streamingAudioPlayer.finish(); // Queue abschliessen
                return;
            } catch (err) {
                console.warn('[VoiceChatPage] Streaming TTS failed, fallback:', err);
                setIsSpeaking(false);
                isSpeakingRef.current = false;
            }
        }

        // Browser-TTS Fallback (simulierte Animation)
        if (ttsSupported) {
            setIsSpeaking(true);
            isSpeakingRef.current = true;
            analyserRef.current = null;
            startAnimLoop();

            textToSpeechService.speak(text, {
                onEnd: () => {
                    setIsSpeaking(false);
                    isSpeakingRef.current = false;
                },
                onError: () => {
                    setIsSpeaking(false);
                    isSpeakingRef.current = false;
                },
            });
        }
    }, [ttsEnabled, backendAvailable, ttsSupported, connectAudioAnalyser, startAnimLoop]);

    // TTS-Wiedergabe hart abbrechen (Stop-Button oder Barge-in)
    const stopSpeaking = useCallback(() => {
        streamingAudioPlayer.stop();
        currentAudioRef.current = null;
        bargeinArmedRef.current = false;
        // Browser-TTS Fallback abbrechen (falls gerade aktiv)
        try {
            if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        } catch { /* ignore */ }
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        analyserRef.current = null;
    }, []);

    // ===== Voice Input — nutzt den globalen Store, sodass Nachrichten in die aktuelle Chat-Konversation gehen =====
    const handleSendVoice = useCallback((text: string) => {
        if (!text.trim()) return;
        setInterimText('');
        sendStoreMessage(text);
    }, [sendStoreMessage]);

    // ===== Whisper-Flow: MediaRecorder auf dem MicMonitor-Stream =====
    const startWhisperRecording = useCallback(() => {
        const stream = micMonitorService.getStream();
        if (!stream) {
            console.warn('[VoiceChatPage] Kein Mic-Stream verfuegbar fuer Whisper');
            return false;
        }
        try {
            recordedChunksRef.current = [];
            const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                : '';
            const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
            rec.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
            };
            rec.start(250); // alle 250ms ein Chunk
            mediaRecorderRef.current = rec;
            return true;
        } catch (err) {
            console.warn('[VoiceChatPage] MediaRecorder start failed', err);
            return false;
        }
    }, []);

    const stopWhisperAndTranscribe = useCallback(async (): Promise<string> => {
        const rec = mediaRecorderRef.current;
        if (!rec) return '';
        const stopped = new Promise<void>(resolve => { rec.onstop = () => resolve(); });
        try { rec.stop(); } catch { /* */ }
        await stopped;
        mediaRecorderRef.current = null;
        const blob = new Blob(recordedChunksRef.current, { type: rec.mimeType || 'audio/webm' });
        recordedChunksRef.current = [];
        if (blob.size < 1000) return ''; // zu kurz
        try {
            const fd = new FormData();
            fd.append('audio', blob, 'speech.webm');
            const res = await fetch('/api/voice/stt/transcribe', { method: 'POST', body: fd });
            const data = await res.json();
            return (data?.text || '').trim();
        } catch (err) {
            console.warn('[VoiceChatPage] Whisper-Transcribe fehlgeschlagen', err);
            return '';
        }
    }, []);

    // Wenn die AI fertig geantwortet hat: letzte Assistant-Nachricht sprechen
    useEffect(() => {
        const wasTyping = prevTypingRef.current;
        prevTypingRef.current = storeIsTyping;

        // Nur bei Uebergang "typing → not typing"
        if (wasTyping && !storeIsTyping && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === 'assistant' && !spokenMessageIdsRef.current.has(lastMsg.id)) {
                spokenMessageIdsRef.current.add(lastMsg.id);
                if (lastMsg.content.trim()) {
                    speakText(lastMsg.content);
                }
            }
        }
    }, [storeIsTyping, messages, speakText]);

    const stopListening = useCallback(() => {
        if (useLocalWhisperRef.current) {
            // Whisper-Aufnahme verwerfen
            const rec = mediaRecorderRef.current;
            if (rec) { try { rec.stop(); } catch { /* */ } mediaRecorderRef.current = null; }
            recordedChunksRef.current = [];
        } else {
            speechRecognitionService.stop();
        }
        setIsListening(false);
        setInterimText('');
    }, []);

    const startListening = useCallback(() => {
        if (useLocalWhisperRef.current) {
            // Whisper-Pfad: MediaRecorder auf MicMonitor-Stream, Speech-End via MicMonitor-VAD
            const ok = startWhisperRecording();
            if (!ok) {
                setStatusText('Mikrofon nicht verfuegbar');
                return;
            }
            setIsListening(true);
            setInterimText('');
            setStatusText('Ich hoere zu...');
        } else {
            // Browser Web Speech API Pfad
            speechRecognitionService.start(
                (transcript: string, isFinal: boolean) => {
                    if (isFinal && transcript.trim()) {
                        speechRecognitionService.stop();
                        setIsListening(false);
                        setInterimText('');
                        handleSendVoice(transcript.trim());
                    } else if (!isFinal) {
                        setInterimText(transcript);
                    }
                },
                (error: string) => {
                    console.warn('[VoiceChatPage] Speech error:', error);
                    setIsListening(false);
                    setStatusText('Spracherkennung fehlgeschlagen');
                }
            );
            setIsListening(true);
        }
    }, [handleSendVoice, startWhisperRecording]);

    const toggleListening = useCallback(() => {
        if (isListening) {
            stopListening();
            setStatusText('Klicke auf den Orb um zu starten');
        } else {
            startListening();
        }
    }, [isListening, stopListening, startListening]);

    // Anti-Echo: Sobald Neon spricht oder denkt, Browser-STT ausschalten.
    // Bei Whisper-Modus: MediaRecorder pausieren.
    useEffect(() => {
        if ((isSpeaking || isProcessing) && isListening) {
            stopListening();
        }
    }, [isSpeaking, isProcessing, isListening, stopListening]);

    // ========== MicMonitor Lifecycle ==========
    // Ein einziger Mic-Stream fuer: Live-Pegel Visualisierung, VAD (Barge-in, Whisper-Endpoint)
    // Laeuft solange VoiceChatPage gemountet ist.
    useEffect(() => {
        let cancelled = false;

        const handleSpeechStart = () => {
            // Barge-in: User spricht waehrend Neon noch spricht -> Neon unterbrechen
            if (isSpeakingRef.current && bargeinArmedRef.current) {
                console.log('[VoiceChatPage] Barge-in erkannt, Neon wird gestoppt');
                stopSpeaking();
                // Direkt in Listening wechseln damit der User weiter sprechen kann
                window.setTimeout(() => {
                    if (!isSpeakingRef.current) startListening();
                }, 120);
            }
        };

        const handleSpeechEnd = () => {
            // Whisper-Modus: MediaRecorder stoppen + transkribieren + senden
            if (useLocalWhisperRef.current && mediaRecorderRef.current) {
                stopWhisperAndTranscribe().then(text => {
                    setIsListening(false);
                    if (text) {
                        setInterimText('');
                        handleSendVoice(text);
                    } else {
                        setStatusText('Nichts verstanden. Klicke um es nochmal zu versuchen.');
                    }
                });
            }
            // Browser-STT-Modus: Web Speech API handhabt End-Detection selbst (isFinal)
        };

        const events = {
            onLevel: (rms: number) => setMicLevel(rms),
            onAnalyser: (analyser: AnalyserNode) => {
                if (!isSpeakingRef.current) analyserRef.current = analyser;
            },
            onSpeechStart: handleSpeechStart,
            onSpeechEnd: handleSpeechEnd,
        };

        if (micMonitorService.isRunning()) {
            // Nur Callbacks aktualisieren, Stream weiterlaufen lassen (keine Permission-Neu-Anfrage)
            micMonitorService.setEvents(events);
        } else {
            micMonitorService.start(events).catch(err => {
                console.warn('[VoiceChatPage] MicMonitor konnte nicht gestartet werden:', err);
            });
        }

        return () => {
            cancelled = true;
            void cancelled;
            // WICHTIG: micMonitorService NICHT hier stoppen - sonst restarten
            // alle deps-Changes den Stream. Cleanup passiert im separaten unmount-Effect.
        };
    }, [stopSpeaking, startListening, stopWhisperAndTranscribe, handleSendVoice]);

    // Mic-Stream beim Verlassen der Voice-Seite komplett schliessen
    useEffect(() => {
        return () => { micMonitorService.stop(); };
    }, []);

    // MicMonitor VAD nur scharf wenn:
    //   - User gerade NICHT per Orb-Klick im Listening-Modus ist (sonst doppeltes Senden)
    //   - aktiv gesprochen werden soll: Whisper-Listening ODER Barge-in waehrend Speaking
    useEffect(() => {
        const shouldVad =
            (useLocalWhisper && isListening)     // Whisper-Endpoint-Detection
            || (isSpeaking && bargeinArmedRef.current); // Barge-in
        micMonitorService.setVadEnabled(shouldVad);
    }, [useLocalWhisper, isListening, isSpeaking]);

    // Waehrend User zuhoert: Orb-Ringe reagieren auf Mic-Pegel
    // Waehrend Neon spricht: Orb-Ringe reagieren auf TTS-Audio
    useEffect(() => {
        isListeningRef.current = isListening;
        if (isListening && !isSpeaking) {
            const a = micMonitorService.getAnalyser();
            if (a) analyserRef.current = a;
            startAnimLoop();
        } else if (!isListening && !isSpeaking) {
            // Analyser freigeben wenn nichts laeuft
            if (analyserRef.current === micMonitorService.getAnalyser()) {
                analyserRef.current = null;
            }
        }
    }, [isListening, isSpeaking, startAnimLoop]);

    // Continuous Mode: Nach TTS-Ende automatisch wieder zuhoeren
    const prevSpeakingRef = useRef(false);
    useEffect(() => {
        const wasSpeaking = prevSpeakingRef.current;
        prevSpeakingRef.current = isSpeaking;

        if (wasSpeaking && !isSpeaking && continuousModeRef.current && !isProcessing) {
            if (!autoRestartPendingRef.current) {
                autoRestartPendingRef.current = true;
                window.setTimeout(() => {
                    autoRestartPendingRef.current = false;
                    // Nur starten wenn wir nicht bereits zuhoeren und Neon nicht wieder spricht
                    if (!isSpeakingRef.current) startListening();
                }, 300);
            }
        }
    }, [isSpeaking, isProcessing, startListening]);

    const handleOrbClick = () => {
        if (isProcessing || isSpeaking) return;
        toggleListening();
    };

    // Glow nur bei Speaking/Thinking sichtbar
    const glowStd = voiceState === 'speaking' ? 6 : voiceState === 'thinking' ? 4 : 2.5;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            height: '100%',
            background: 'var(--bg-primary)',
            padding: '2rem 1rem',
            position: 'relative',
        }}>
            {/* Back Button — zurueck zum Chat oder zur Startseite */}
            <button
                onClick={() => setActiveView(hasActiveChat ? 'chat' : 'welcome')}
                style={{
                    position: 'absolute', top: 16, left: 16,
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'transparent', border: 'none',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    fontSize: 14, padding: '8px 12px', borderRadius: 8,
                    transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
                <ArrowLeft size={18} />
                {hasActiveChat ? 'Zum Chat' : 'Zurueck'}
            </button>

            {/* Chat-Kontext-Badge */}
            {hasActiveChat && currentConversation && (
                <div style={{
                    position: 'absolute',
                    top: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(249,171,0,0.08)',
                    border: '1px solid rgba(249,171,0,0.2)',
                    borderRadius: 20,
                    padding: '5px 14px',
                    fontSize: 12,
                    color: '#f9ab00',
                    maxWidth: 300,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                }} title={currentConversation.title}>
                    ✦ {currentConversation.title || 'Aktueller Chat'}
                </div>
            )}

            {/* Obere rechte Action-Leiste: Voice-Picker + TTS Toggle */}
            <div style={{
                position: 'absolute', top: 16, right: 16,
                display: 'flex', alignItems: 'center', gap: 8,
            }}>
                {/* Voice Picker */}
                <div ref={voicePickerRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowVoicePicker(v => !v)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'transparent',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer', fontSize: 13,
                            padding: '6px 12px', borderRadius: 8,
                            transition: 'all 0.2s',
                            maxWidth: 220,
                        }}
                    >
                        <Settings size={14} />
                        <span style={{
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {voices.find(v => v.shortName === currentVoice)?.name || 'Stimme waehlen'}
                        </span>
                    </button>

                    {showVoicePicker && (
                        <div style={{
                            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                            width: 320, maxHeight: 420, overflowY: 'auto',
                            background: 'var(--bg-secondary, #1a1a2e)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 12, padding: 8,
                            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                            zIndex: 100,
                        }}>
                            {/* Kopfzeile mit Refresh */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                                padding: '4px 6px 8px', borderBottom: '1px solid var(--border-subtle)',
                                marginBottom: 6,
                            }}>
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                    Deutsche Stimmen
                                </span>
                                <button
                                    onClick={() => loadVoices(true)}
                                    disabled={isRefreshingVoices}
                                    title="Stimmen aus ElevenLabs-Account neu laden"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        background: 'transparent',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: 6, padding: '3px 8px',
                                        color: isRefreshingVoices ? 'var(--text-tertiary)' : '#f9ab00',
                                        fontSize: 11, cursor: isRefreshingVoices ? 'wait' : 'pointer',
                                    }}
                                >
                                    <RefreshCw
                                        size={11}
                                        style={{
                                            animation: isRefreshingVoices ? 'spin 1s linear infinite' : 'none',
                                        }}
                                    />
                                    {isRefreshingVoices ? 'Lade...' : 'Aktualisieren'}
                                </button>
                            </div>

                            {!elevenLabsReady && (
                                <div style={{
                                    padding: '8px 10px', marginBottom: 6,
                                    fontSize: 11, color: 'var(--text-tertiary)',
                                    background: 'rgba(249,171,0,0.06)',
                                    border: '1px solid rgba(249,171,0,0.15)',
                                    borderRadius: 8, lineHeight: 1.4,
                                }}>
                                    Fuer ElevenLabs-Stimmen: <code>ELEVENLABS_API_KEY</code> in der Backend-.env setzen.
                                </div>
                            )}

                            {/* Gruppen: nur ElevenLabs, nur deutsche Stimmen */}
                            {['elevenlabs'].map(backend => {
                                const group = voices.filter(v =>
                                    v.backend === backend &&
                                    (v.locale?.startsWith('de') || v.locale === 'de')
                                );
                                if (group.length === 0) return null;
                                return (
                                    <div key={backend} style={{ marginBottom: 6 }}>
                                        <div style={{
                                            padding: '6px 10px', fontSize: 10,
                                            fontWeight: 600, textTransform: 'uppercase',
                                            letterSpacing: 0.5,
                                            color: backend === 'elevenlabs' ? '#f9ab00' : 'var(--text-tertiary)',
                                        }}>
                                            ElevenLabs
                                        </div>
                                        {group.map(v => {
                                            const isActive = v.shortName === currentVoice;
                                            return (
                                                <button
                                                    key={`${v.backend}-${v.shortName}`}
                                                    onClick={() => changeVoice(v)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        width: '100%', textAlign: 'left',
                                                        padding: '8px 10px',
                                                        background: isActive ? 'rgba(249,171,0,0.12)' : 'transparent',
                                                        border: 'none', borderRadius: 6,
                                                        color: isActive ? '#f9ab00' : 'var(--text-primary)',
                                                        fontSize: 13, cursor: 'pointer',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onMouseEnter={e => {
                                                        if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                                                    }}
                                                    onMouseLeave={e => {
                                                        if (!isActive) e.currentTarget.style.background = 'transparent';
                                                    }}
                                                >
                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {v.name}
                                                    </span>
                                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                        {v.locale}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}

                            {voices.length === 0 && (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                                    Keine Stimmen verfuegbar
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Voice-Style / Preset Button */}
                {elevenLabsReady && currentBackend === 'elevenlabs' && (
                    <div ref={settingsRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowSettings(v => !v)}
                            title="Sprechstil anpassen"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: 'transparent',
                                border: '1px solid var(--border-subtle)',
                                color: showSettings ? '#f9ab00' : 'var(--text-secondary)',
                                cursor: 'pointer', fontSize: 13,
                                padding: '6px 10px', borderRadius: 8,
                                transition: 'all 0.2s',
                            }}
                        >
                            <Sliders size={14} />
                            <span style={{ fontSize: 12, textTransform: 'capitalize' }}>
                                {preset === 'whisper' ? 'Fluestern'
                                    : preset === 'dramatic' ? 'Dramatisch'
                                    : preset === 'warm' ? 'Warm'
                                    : preset === 'clear' ? 'Klar'
                                    : preset === 'custom' ? 'Custom'
                                    : 'Standard'}
                            </span>
                        </button>

                        {showSettings && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                                width: 320,
                                background: 'var(--bg-secondary, #1a1a2e)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 12, padding: 12,
                                boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                                zIndex: 100,
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#f9ab00', marginBottom: 8 }}>
                                    Sprechstil
                                </div>
                                {/* Preset Buttons */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                                    {([
                                        { key: 'standard', label: 'Standard', desc: 'Neutral' },
                                        { key: 'warm', label: 'Warm', desc: 'Freundlich' },
                                        { key: 'dramatic', label: 'Dramatisch', desc: 'Emotional' },
                                        { key: 'whisper', label: 'Fluestern', desc: 'Leise, intim' },
                                        { key: 'clear', label: 'Klar', desc: 'Nachrichten' },
                                    ] as Array<{ key: PresetKey; label: string; desc: string }>).map(p => {
                                        const isActive = preset === p.key;
                                        return (
                                            <button
                                                key={p.key}
                                                onClick={() => applyPreset(p.key)}
                                                style={{
                                                    padding: '8px 10px',
                                                    background: isActive ? 'rgba(249,171,0,0.15)' : 'transparent',
                                                    border: isActive ? '1px solid rgba(249,171,0,0.5)' : '1px solid var(--border-subtle)',
                                                    borderRadius: 8,
                                                    color: isActive ? '#f9ab00' : 'var(--text-primary)',
                                                    fontSize: 12, cursor: 'pointer',
                                                    textAlign: 'left',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                <div style={{ fontWeight: 600 }}>{p.label}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{p.desc}</div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Advanced Toggle */}
                                <button
                                    onClick={() => setShowAdvanced(v => !v)}
                                    style={{
                                        width: '100%', padding: '6px 8px',
                                        background: 'transparent',
                                        border: '1px dashed var(--border-subtle)',
                                        borderRadius: 6,
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11, cursor: 'pointer',
                                        marginBottom: showAdvanced ? 10 : 0,
                                    }}
                                >
                                    {showAdvanced ? 'Feinschliff ausblenden' : 'Feinschliff anzeigen'}
                                </button>

                                {showAdvanced && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <Slider
                                            label="Stabilitaet"
                                            value={stability}
                                            hint={stability < 0.35 ? 'ausdrucksstark' : stability > 0.7 ? 'monoton' : 'ausgewogen'}
                                            onChange={v => applyCustomSettings({ stability: v })}
                                        />
                                        <Slider
                                            label="Aehnlichkeit"
                                            value={similarity}
                                            hint={similarity > 0.8 ? 'sehr nah am Original' : 'frei'}
                                            onChange={v => applyCustomSettings({ similarity_boost: v })}
                                        />
                                        <Slider
                                            label="Stil / Emotion"
                                            value={style}
                                            hint={style > 0.6 ? 'stark' : style < 0.2 ? 'neutral' : 'mittel'}
                                            onChange={v => applyCustomSettings({ style: v })}
                                        />
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={speakerBoost}
                                                onChange={e => applyCustomSettings({ use_speaker_boost: e.target.checked })}
                                                style={{ accentColor: '#f9ab00' }}
                                            />
                                            Speaker Boost (Klarheit)
                                        </label>
                                    </div>
                                )}

                                <div style={{
                                    marginTop: 10, padding: '6px 8px', fontSize: 10,
                                    color: 'var(--text-tertiary)', lineHeight: 1.5,
                                    background: 'rgba(249,171,0,0.05)', borderRadius: 6,
                                }}>
                                    Tipp: Im Text kannst du Audio-Tags wie <code>[whispering]</code>, <code>[sighs]</code>, <code>[laughs]</code> nutzen (Eleven-v3-Modelle).
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Continuous Mode Toggle */}
                <button
                    onClick={() => setContinuousMode(v => !v)}
                    title={continuousMode
                        ? 'Hands-Free: Nach Neons Antwort startet das Mikrofon automatisch'
                        : 'Continuous-Mode aktivieren (Hands-Free)'}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: continuousMode ? 'rgba(249,171,0,0.12)' : 'transparent',
                        border: `1px solid ${continuousMode ? 'rgba(249,171,0,0.5)' : 'var(--border-subtle)'}`,
                        color: continuousMode ? '#f9ab00' : 'var(--text-tertiary)',
                        cursor: 'pointer', fontSize: 13,
                        padding: '6px 10px', borderRadius: 8,
                        transition: 'all 0.2s',
                    }}
                >
                    <Repeat size={14} />
                    {continuousMode ? 'Hands-Free' : 'Einzeln'}
                </button>

                {/* Whisper-Toggle (nur wenn Backend verfuegbar) */}
                {whisperAvailable && (
                    <button
                        onClick={() => setUseLocalWhisper(v => !v)}
                        title={useLocalWhisper
                            ? 'Lokale Whisper-STT aktiv (Backend)'
                            : 'Auf Whisper (Backend, lokal) umschalten'}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: useLocalWhisper ? 'rgba(249,171,0,0.12)' : 'transparent',
                            border: `1px solid ${useLocalWhisper ? 'rgba(249,171,0,0.5)' : 'var(--border-subtle)'}`,
                            color: useLocalWhisper ? '#f9ab00' : 'var(--text-tertiary)',
                            cursor: 'pointer', fontSize: 13,
                            padding: '6px 10px', borderRadius: 8,
                            transition: 'all 0.2s',
                        }}
                    >
                        <Cpu size={14} />
                        {useLocalWhisper ? 'Whisper' : 'Browser'}
                    </button>
                )}

                {/* TTS Toggle */}
                <button
                    onClick={() => setTtsEnabled(!ttsEnabled)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        color: ttsEnabled ? '#f9ab00' : 'var(--text-tertiary)',
                        cursor: 'pointer', fontSize: 13,
                        padding: '6px 12px', borderRadius: 8,
                        transition: 'all 0.2s',
                    }}
                >
                    {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    {ttsEnabled ? 'Sprache an' : 'Sprache aus'}
                </button>
            </div>

            {/* ===== ORB: Komplett statisch, bewegt sich nur bei Speaking ===== */}
            <div
                onClick={handleOrbClick}
                style={{
                    marginTop: '8vh',
                    width: 200, height: 200,
                    cursor: isProcessing ? 'wait' : 'pointer',
                    position: 'relative',
                }}
            >
                <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    <defs>
                        <filter id="vg1" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur in="SourceGraphic" stdDeviation={glowStd} result="b" />
                            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <filter id="vg2" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur in="SourceGraphic" stdDeviation={glowStd * 0.6} result="b" />
                            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>

                    {/* Shadow rings — statisch, leichte Bewegung bei Audio */}
                    {SHADOW_CONFIG.map((cfg, i) => (
                        <g key={`shadow-${i}`}
                           ref={el => { shadowGroupRefs.current[i] = el; }}
                           transform={`rotate(${cfg.angle}, 100, 100)`}>
                            <ellipse cx="100" cy="100" rx={cfg.rx} ry={cfg.ry}
                                fill="none" stroke={cfg.color} strokeWidth={cfg.sw} strokeLinecap="round" />
                        </g>
                    ))}

                    {/* Bright rings — statisch, Audio-reaktiv */}
                    {RING_CONFIG.map((cfg, i) => (
                        <g key={`ring-${i}`}
                           filter={i < 3 ? 'url(#vg1)' : 'url(#vg2)'}
                           ref={el => { ringGroupRefs.current[i] = el; }}
                           transform={`rotate(${cfg.angle}, 100, 100)`}>
                            <ellipse cx="100" cy="100" rx={cfg.rx} ry={cfg.ry}
                                ref={el => { ringEllipseRefs.current[i] = el; }}
                                fill="none" stroke={cfg.color} strokeWidth={cfg.sw}
                                strokeLinecap="round" strokeDasharray={cfg.dash}
                                opacity={cfg.op} />
                        </g>
                    ))}

                    {/* Highlight streaks — nur sichtbar bei Audio */}
                    {STREAK_CONFIG.map((cfg, i) => (
                        <g key={`streak-${i}`}
                           filter="url(#vg1)"
                           ref={el => { streakGroupRefs.current[i] = el; }}
                           transform={`rotate(${cfg.angle}, 100, 100)`}>
                            <ellipse cx="100" cy="100" rx={cfg.rx} ry={cfg.ry}
                                fill="none" stroke="#ffc530" strokeWidth="1.5"
                                strokeLinecap="round" strokeDasharray={cfg.dash}
                                opacity="0" />
                        </g>
                    ))}

                    {/* Thinking: rotierender Ladeindikator */}
                    {voiceState === 'thinking' && (
                        <g filter="url(#vg1)">
                            <ellipse cx="100" cy="100" rx="68" ry="68" fill="none"
                                stroke="#f9ab00" strokeWidth="2" strokeLinecap="round"
                                strokeDasharray="20 180" opacity="0.5">
                                <animateTransform attributeName="transform" type="rotate"
                                    from="0 100 100" to="360 100 100" dur="1.2s" repeatCount="indefinite" />
                            </ellipse>
                        </g>
                    )}

                    {/* Listening: sanftes Atmen */}
                    {voiceState === 'listening' && (
                        <circle cx="100" cy="100" r="70" fill="none" stroke="#f9ab00" strokeWidth="1" opacity="0.2">
                            <animate attributeName="r" values="65;75;65" dur="2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.15;0.3;0.15" dur="2s" repeatCount="indefinite" />
                        </circle>
                    )}
                </svg>

                {/* Mic-Hinweis */}
                {voiceState === 'idle' && (
                    <div style={{
                        position: 'absolute', bottom: -8, left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(15,15,25,0.9)',
                        border: '1px solid rgba(249,171,0,0.2)',
                        borderRadius: 20, padding: '4px 14px',
                        display: 'flex', alignItems: 'center', gap: 6,
                        color: '#f9ab00', fontSize: 12, whiteSpace: 'nowrap',
                    }}>
                        <Mic size={14} />
                        Antippen
                    </div>
                )}

                {voiceState === 'listening' && (
                    <div style={{
                        position: 'absolute', bottom: -8, left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(249,171,0,0.15)',
                        border: '1px solid rgba(249,171,0,0.4)',
                        borderRadius: 20, padding: '4px 14px',
                        display: 'flex', alignItems: 'center', gap: 8,
                        color: '#f9ab00', fontSize: 12, whiteSpace: 'nowrap',
                    }}>
                        <Mic size={14} />
                        Hoere zu
                        {/* Live Mic-Pegel als 5-Balken Meter */}
                        <span style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end', height: 12 }}>
                            {[0, 1, 2, 3, 4].map(i => {
                                const thr = 0.04 + i * 0.04;
                                const active = micLevel >= thr;
                                return (
                                    <span key={i} style={{
                                        width: 3,
                                        height: 4 + i * 2,
                                        borderRadius: 1,
                                        background: active ? '#f9ab00' : 'rgba(249,171,0,0.25)',
                                        transition: 'background 80ms',
                                    }} />
                                );
                            })}
                        </span>
                    </div>
                )}

                {/* Stop-Button: bricht die TTS-Wiedergabe sofort ab */}
                {isSpeaking && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation(); // Orb-Click nicht triggern
                            stopSpeaking();
                        }}
                        title="Neon stoppen"
                        style={{
                            position: 'absolute', bottom: -8, left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(249,171,0,0.18)',
                            border: '1px solid rgba(249,171,0,0.5)',
                            borderRadius: 20, padding: '5px 14px',
                            display: 'flex', alignItems: 'center', gap: 6,
                            color: '#f9ab00', fontSize: 12, fontWeight: 600,
                            whiteSpace: 'nowrap', cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(249,171,0,0.25)',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(249,171,0,0.28)';
                            e.currentTarget.style.borderColor = 'rgba(249,171,0,0.7)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(249,171,0,0.18)';
                            e.currentTarget.style.borderColor = 'rgba(249,171,0,0.5)';
                        }}
                    >
                        <Square size={12} fill="#f9ab00" />
                        Stopp
                    </button>
                )}
            </div>

            {/* Status Text */}
            <div style={{
                marginTop: 32, fontSize: 15,
                color: voiceState === 'thinking' ? '#f9ab00' : 'var(--text-tertiary)',
                minHeight: 24, textAlign: 'center', maxWidth: 500,
                transition: 'color 0.3s',
            }}>
                {statusText}
            </div>

            {/* Transcript */}
            <div style={{
                marginTop: 32, width: '100%', maxWidth: 600,
                flex: 1, overflowY: 'auto', padding: '0 16px',
                display: 'flex', flexDirection: 'column', gap: 12,
            }}>
                {messages.map(msg => (
                    <div key={msg.id} style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}>
                        <span style={{
                            fontSize: 11, color: 'var(--text-tertiary)',
                            marginBottom: 4, fontWeight: 500,
                        }}>
                            {msg.role === 'user' ? 'Du' : 'Neon'}
                        </span>
                        <div style={{
                            background: msg.role === 'user'
                                ? 'rgba(249,171,0,0.1)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${msg.role === 'user'
                                ? 'rgba(249,171,0,0.2)' : 'var(--border-subtle)'}`,
                            borderRadius: 12, padding: '10px 16px',
                            fontSize: 14,
                            color: msg.role === 'user' ? '#f9ab00' : 'var(--text-primary)',
                            maxWidth: '85%', lineHeight: 1.5,
                        }}>
                            {msg.content}
                        </div>
                    </div>
                ))}

                {isProcessing && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500 }}>Neon</span>
                        <div style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 12, padding: '10px 16px',
                            fontSize: 14, color: 'var(--text-tertiary)',
                        }}>
                            <span style={{ animation: 'voice-dots 1.4s infinite' }}>...</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <style>{`
                @keyframes voice-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
                @keyframes voice-dots {
                    0%, 20% { opacity: 0.3; }
                    40% { opacity: 0.6; }
                    60% { opacity: 1; }
                    80%, 100% { opacity: 0.3; }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
