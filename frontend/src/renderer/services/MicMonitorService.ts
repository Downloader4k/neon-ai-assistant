/**
 * MicMonitorService
 *
 * Haelt EINEN Mic-Stream offen und liefert:
 *  - Live-Pegel (RMS) fuer Visualisierung
 *  - Frequenzband-Daten fuer Orb-Rings
 *  - Voice-Activity-Detection (einfache Energy-Based VAD mit adaptivem Schwellwert)
 *  - Speech-Start/-End Callbacks (fuer Barge-in und Auto-STT)
 *
 * Nutzt echoCancellation + noiseSuppression um Neons eigene TTS-Ausgabe
 * nicht als User-Speech zu interpretieren.
 *
 * WICHTIG: AudioContext und Stream bleiben zwischen start()/stop() erhalten
 * so wie es passt - wir vermeiden dauernd Mic-Permission-Requests.
 */

export interface MicMonitorConfig {
    silenceMs: number;           // ms Stille → Speech-End
    minSpeechMs: number;         // Minimale Sprech-Dauer fuer valid speech
    energyMultiplier: number;    // Wieviel ueber Background-Noise = Speech
    minEnergy: number;           // Harte Untergrenze (verhindert Trigger bei komplett stiller Umgebung)
    smoothing: number;           // Analyser smoothingTimeConstant
}

const DEFAULT_CONFIG: MicMonitorConfig = {
    silenceMs: 900,
    minSpeechMs: 250,
    energyMultiplier: 3.0,
    minEnergy: 0.018,
    smoothing: 0.7,
};

export interface MicMonitorEvents {
    onLevel?: (rms: number, bands: number[]) => void;
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
    onAnalyser?: (analyser: AnalyserNode, ctx: AudioContext) => void;
}

class MicMonitorService {
    private ctx: AudioContext | null = null;
    private stream: MediaStream | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private analyser: AnalyserNode | null = null;
    private rafId = 0;
    private cfg: MicMonitorConfig = { ...DEFAULT_CONFIG };
    private events: MicMonitorEvents = {};
    private backgroundRms = 0.01;
    private isSpeakingNow = false;
    private speechStartTs = 0;
    private silenceStartTs = 0;
    private running = false;
    private vadEnabled = true;

    async start(events: MicMonitorEvents = {}, config?: Partial<MicMonitorConfig>): Promise<void> {
        if (this.running) {
            // Schon aktiv - nur Events aktualisieren
            this.events = events;
            if (config) this.cfg = { ...this.cfg, ...config };
            return;
        }
        this.events = events;
        if (config) this.cfg = { ...this.cfg, ...config };

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
        } catch (err) {
            console.error('[MicMonitor] getUserMedia failed', err);
            throw err;
        }

        this.ctx = new AudioContext();
        this.source = this.ctx.createMediaStreamSource(this.stream);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = this.cfg.smoothing;
        this.source.connect(this.analyser);
        // KEIN connect zu ctx.destination - sonst hoert man sich selbst

        this.events.onAnalyser?.(this.analyser, this.ctx);

        this.running = true;
        this.isSpeakingNow = false;
        this.backgroundRms = 0.01;
        this.tick();
    }

    setEvents(events: MicMonitorEvents): void {
        this.events = events;
        if (this.analyser && this.ctx) {
            this.events.onAnalyser?.(this.analyser, this.ctx);
        }
    }

    /** VAD pausieren (z.B. waehrend Neon spricht → KEINE Barge-in-Trigger in den ersten ms) */
    setVadEnabled(enabled: boolean): void {
        this.vadEnabled = enabled;
        if (!enabled) {
            this.isSpeakingNow = false;
            this.silenceStartTs = 0;
        }
    }

    stop(): void {
        this.running = false;
        cancelAnimationFrame(this.rafId);
        try { this.source?.disconnect(); } catch { /* */ }
        try { this.analyser?.disconnect(); } catch { /* */ }
        try { this.ctx?.close(); } catch { /* */ }
        this.source = null;
        this.analyser = null;
        this.ctx = null;
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
    }

    getAnalyser(): AnalyserNode | null { return this.analyser; }
    isRunning(): boolean { return this.running; }
    /** Nur fuer MediaRecorder-Anbindung (Whisper-Flow). */
    getStream(): MediaStream | null { return this.stream; }

    private tick = (): void => {
        if (!this.running || !this.analyser) return;
        const freq = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(freq);

        // 5-Band Split fuer Orb-Rings
        const bands = [0, 0, 0, 0, 0];
        const bandSize = Math.floor(freq.length / 5);
        for (let i = 0; i < 5; i++) {
            let sum = 0;
            for (let j = i * bandSize; j < (i + 1) * bandSize; j++) sum += freq[j];
            bands[i] = (sum / bandSize) / 255;
        }

        // RMS aus Zeitbereich fuer zuverlaessigere VAD
        const time = new Uint8Array(this.analyser.fftSize);
        this.analyser.getByteTimeDomainData(time);
        let sumSq = 0;
        for (let i = 0; i < time.length; i++) {
            const v = (time[i] - 128) / 128;
            sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / time.length);

        this.events.onLevel?.(rms, bands);

        // Background-Rauschen IMMER schaetzen (auch wenn VAD gerade aus ist),
        // damit sich VAD beim Einschalten nicht sofort selbst ausloest.
        if (!this.isSpeakingNow) {
            this.backgroundRms = this.backgroundRms * 0.97 + rms * 0.03;
        }

        if (this.vadEnabled) this.processVad(rms);

        this.rafId = requestAnimationFrame(this.tick);
    };

    private processVad(rms: number): void {
        const threshold = Math.max(this.cfg.minEnergy, this.backgroundRms * this.cfg.energyMultiplier);
        const now = performance.now();

        if (rms > threshold) {
            if (!this.isSpeakingNow) {
                this.isSpeakingNow = true;
                this.speechStartTs = now;
                this.events.onSpeechStart?.();
            }
            this.silenceStartTs = 0;
        } else if (this.isSpeakingNow) {
            if (this.silenceStartTs === 0) this.silenceStartTs = now;
            if (now - this.silenceStartTs >= this.cfg.silenceMs) {
                const dur = now - this.speechStartTs;
                this.isSpeakingNow = false;
                this.silenceStartTs = 0;
                if (dur >= this.cfg.minSpeechMs) {
                    this.events.onSpeechEnd?.();
                }
            }
        }
    }
}

export const micMonitorService = new MicMonitorService();
export default MicMonitorService;
