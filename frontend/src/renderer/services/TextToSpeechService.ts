/**
 * Text-to-Speech Service using Web Speech API
 */
export class TextToSpeechService {
    private synth: SpeechSynthesis | null = null;
    private voices: SpeechSynthesisVoice[] = [];
    private selectedVoice: SpeechSynthesisVoice | null = null;

    constructor() {
        this.initialize();
    }

    /**
     * Initialize TTS
     */
    private initialize() {
        if ('speechSynthesis' in window) {
            this.synth = window.speechSynthesis;
            this.loadVoices();

            // Voices may load asynchronously
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = () => {
                    this.loadVoices();
                };
            }
        } else {
            console.error('Text-to-Speech not supported in this browser');
        }
    }

    /**
     * Load available voices
     */
    private loadVoices() {
        if (this.synth) {
            this.voices = this.synth.getVoices();

            // Try to select a German voice by default
            const germanVoice = this.voices.find(
                (voice) => voice.lang.startsWith('de-')
            );

            if (germanVoice) {
                this.selectedVoice = germanVoice;
            } else if (this.voices.length > 0) {
                this.selectedVoice = this.voices[0];
            }
        }
    }

    /**
     * Speak text
     */
    speak(
        text: string,
        options: {
            rate?: number; // 0.1 - 10 (default: 1)
            pitch?: number; // 0 - 2 (default: 1)
            volume?: number; // 0 - 1 (default: 1)
            voice?: SpeechSynthesisVoice;
            onEnd?: () => void;
            onError?: (error: any) => void;
        } = {}
    ) {
        if (!this.synth) {
            console.error('TTS not available');
            return;
        }

        // Cancel any ongoing speech
        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // Set voice
        utterance.voice = options.voice || this.selectedVoice;

        // Set parameters
        utterance.rate = options.rate ?? 1.0;
        utterance.pitch = options.pitch ?? 1.0;
        utterance.volume = options.volume ?? 1.0;

        // Event handlers
        if (options.onEnd) {
            utterance.onend = options.onEnd;
        }

        if (options.onError) {
            utterance.onerror = options.onError;
        }

        // Speak
        this.synth.speak(utterance);
    }

    /**
     * Stop speaking
     */
    stop() {
        if (this.synth) {
            this.synth.cancel();
        }
    }

    /**
     * Pause speaking
     */
    pause() {
        if (this.synth) {
            this.synth.pause();
        }
    }

    /**
     * Resume speaking
     */
    resume() {
        if (this.synth) {
            this.synth.resume();
        }
    }

    /**
     * Check if currently speaking
     */
    isSpeaking(): boolean {
        return this.synth?.speaking ?? false;
    }

    /**
     * Get available voices
     */
    getVoices(): SpeechSynthesisVoice[] {
        return this.voices;
    }

    /**
     * Get voices by language
     */
    getVoicesByLanguage(lang: string): SpeechSynthesisVoice[] {
        return this.voices.filter((voice) => voice.lang.startsWith(lang));
    }

    /**
     * Set voice
     */
    setVoice(voice: SpeechSynthesisVoice) {
        this.selectedVoice = voice;
    }

    /**
     * Get selected voice
     */
    getSelectedVoice(): SpeechSynthesisVoice | null {
        return this.selectedVoice;
    }

    /**
     * Check if TTS is supported
     */
    static isSupported(): boolean {
        return 'speechSynthesis' in window;
    }
}

export const textToSpeechService = new TextToSpeechService();
