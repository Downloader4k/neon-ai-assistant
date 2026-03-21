/**
 * Speech-to-Text Service using Web Speech API
 */
export class SpeechRecognitionService {
    private recognition: any = null;
    private isListening = false;
    private onResultCallback?: (transcript: string, isFinal: boolean) => void;
    private onErrorCallback?: (error: string) => void;

    constructor() {
        this.initializeRecognition();
    }

    /**
     * Initialize Web Speech API
     */
    private initializeRecognition() {
        // Check browser support
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Speech Recognition not supported in this browser');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'de-DE'; // German by default

        // Event handlers
        this.recognition.onresult = (event: any) => {
            const result = event.results[event.results.length - 1];
            const transcript = result[0].transcript;
            const isFinal = result.isFinal;

            if (this.onResultCallback) {
                this.onResultCallback(transcript, isFinal);
            }
        };

        this.recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            if (this.onErrorCallback) {
                this.onErrorCallback(event.error);
            }
        };

        this.recognition.onend = () => {
            // Auto-restart if continuous listening is enabled
            if (this.isListening) {
                this.recognition.start();
            }
        };
    }

    /**
     * Start listening
     */
    start(
        onResult: (transcript: string, isFinal: boolean) => void,
        onError?: (error: string) => void
    ) {
        if (!this.recognition) {
            console.error('Speech recognition not initialized');
            return;
        }

        this.onResultCallback = onResult;
        this.onErrorCallback = onError;
        this.isListening = true;

        try {
            this.recognition.start();
        } catch (error) {
            console.error('Failed to start recognition:', error);
        }
    }

    /**
     * Stop listening
     */
    stop() {
        if (this.recognition && this.isListening) {
            this.isListening = false;
            this.recognition.stop();
        }
    }

    /**
     * Set language
     */
    setLanguage(lang: string) {
        if (this.recognition) {
            this.recognition.lang = lang;
        }
    }

    /**
     * Check if speech recognition is supported
     */
    static isSupported(): boolean {
        return !!(
            (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition
        );
    }

    /**
     * Get supported languages
     */
    static getSupportedLanguages(): string[] {
        return [
            'de-DE', // German
            'en-US', // English (US)
            'en-GB', // English (UK)
            'es-ES', // Spanish
            'fr-FR', // French
            'it-IT', // Italian
            'ja-JP', // Japanese
            'ko-KR', // Korean
            'zh-CN', // Chinese
        ];
    }
}

export const speechRecognitionService = new SpeechRecognitionService();
