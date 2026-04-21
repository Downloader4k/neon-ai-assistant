/**
 * StreamingAudioPlayer
 *
 * Spielt MP3-Daten gapless ab, sobald sie eintreffen (Chunked HTTP Stream).
 * Nutzt MediaSource Extensions (MSE) mit audio/mpeg SourceBuffer.
 *
 * Vorteil: Deutlich niedrigere wahrgenommene Latenz als komplettes Blob abwarten,
 * weil der erste Sound beginnt sobald die ersten KB angekommen sind.
 *
 * Zusaetzlich unterstuetzt der Player eine Satz-Queue: Mehrere Streams
 * (z.B. Satz fuer Satz aus dem LLM) koennen gereiht werden; sie spielen
 * nahtlos hintereinander.
 */

export interface StreamingPlayerEvents {
    onStart?: () => void;                  // Erstes Byte wurde abgespielt
    onChunkAppended?: (bytes: number) => void;
    onSentenceEnd?: () => void;            // Ein Satz ist komplett abgespielt
    onAllEnded?: () => void;               // Queue ist leer und alles verklungen
    onError?: (err: Error) => void;
    onAudioElement?: (audio: HTMLAudioElement) => void; // fuer Analyser-Anbindung
}

type QueueItem = {
    url: string;
    body: any;
    init?: RequestInit;
};

class StreamingAudioPlayer {
    private audio: HTMLAudioElement | null = null;
    private mediaSource: MediaSource | null = null;
    private sourceBuffer: SourceBuffer | null = null;
    private queue: QueueItem[] = [];
    private pendingChunks: Uint8Array[] = [];
    private activeController: AbortController | null = null;
    private events: StreamingPlayerEvents = {};
    private playbackStarted = false;
    private closed = false;
    private endOfStreamCalled = false;
    private finishCalled = false;   // finish() wurde aufgerufen → nach Queue-Ende MediaSource schliessen
    private queueRunning = false;   // processQueue laeuft gerade

    /**
     * Startet den Player mit einer Liste von HTTP-Streams (meist Satz-fuer-Satz).
     * Jeder Eintrag ist ein fetch-Request an einen chunked-MP3-Endpunkt.
     */
    async start(items: QueueItem[], events: StreamingPlayerEvents = {}): Promise<HTMLAudioElement | null> {
        this.stop(); // vorheriges hart abbrechen
        this.events = events;
        this.queue = [...items];
        this.closed = false;
        this.endOfStreamCalled = false;
        this.finishCalled = false;
        this.queueRunning = false;
        this.pendingChunks = [];
        this.playbackStarted = false;

        if (!('MediaSource' in window) || !MediaSource.isTypeSupported('audio/mpeg')) {
            // Fallback: kompletten Stream sammeln und als normales Audio abspielen
            return this.fallbackFullDownload(items, events);
        }

        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.audio.crossOrigin = 'anonymous';

        this.mediaSource = new MediaSource();
        this.audio.src = URL.createObjectURL(this.mediaSource);

        const readyPromise = new Promise<void>((resolve) => {
            this.mediaSource!.addEventListener('sourceopen', () => {
                try {
                    this.sourceBuffer = this.mediaSource!.addSourceBuffer('audio/mpeg');
                    this.sourceBuffer.addEventListener('updateend', () => this.flushPending());
                    this.sourceBuffer.addEventListener('error', (e) => {
                        console.error('[StreamPlayer] SourceBuffer error', e);
                    });
                    resolve();
                } catch (err) {
                    console.error('[StreamPlayer] addSourceBuffer failed', err);
                    events.onError?.(err as Error);
                }
            }, { once: true });
        });

        this.audio.addEventListener('ended', () => {
            events.onAllEnded?.();
            this.cleanup();
        });
        this.audio.addEventListener('error', () => {
            events.onError?.(new Error('Audio-Wiedergabe fehlgeschlagen'));
        });

        events.onAudioElement?.(this.audio);

        await readyPromise;
        if (this.closed) return null;

        // Queue sequentiell abarbeiten
        this.processQueue().catch(err => {
            console.error('[StreamPlayer] Queue error', err);
            events.onError?.(err);
        });

        return this.audio;
    }

    /**
     * Haengt ein weiteres Stueck an die Queue (z.B. wenn neue Saetze vom LLM reinkommen).
     */
    append(item: QueueItem): void {
        if (this.closed) return;
        this.queue.push(item);
        if (!this.queueRunning) {
            this.processQueue().catch(err => this.events.onError?.(err));
        }
    }

    /**
     * Signalisiert: keine weiteren Saetze mehr. Sobald die Queue leer ist und
     * der letzte Chunk abgespielt, wird endOfStream aufgerufen.
     */
    finish(): void {
        if (this.closed) return;
        this.finishCalled = true;
        // Falls Queue bereits fertig und nichts laeuft → sofort Stream schliessen
        if (!this.queueRunning && this.queue.length === 0 && !this.activeController) {
            this.signalEndOfStream();
        }
    }

    /**
     * Sofortiger Abbruch - Barge-in oder Stop-Button.
     */
    stop(): void {
        this.closed = true;
        try { this.activeController?.abort(); } catch { /* */ }
        this.activeController = null;
        this.queue = [];
        this.pendingChunks = [];
        if (this.audio) {
            try { this.audio.pause(); this.audio.src = ''; this.audio.load(); } catch { /* */ }
            this.audio = null;
        }
        if (this.mediaSource && this.mediaSource.readyState === 'open') {
            try { this.mediaSource.endOfStream(); } catch { /* */ }
        }
        this.mediaSource = null;
        this.sourceBuffer = null;
    }

    isActive(): boolean {
        return !this.closed && !!this.audio;
    }

    private async processQueue(): Promise<void> {
        if (this.queueRunning) return;
        this.queueRunning = true;
        try {
            while (this.queue.length > 0 && !this.closed) {
                const item = this.queue.shift()!;
                await this.streamItem(item);
                this.events.onSentenceEnd?.();
            }
        } finally {
            this.queueRunning = false;
        }
        // Queue leer → wenn finish() aufgerufen wurde, Stream sauber schliessen
        // (sonst feuert audio.onended nie und 'isSpeaking' bleibt haengen)
        if (this.finishCalled && !this.closed) {
            this.signalEndOfStream();
        }
    }

    private async streamItem(item: QueueItem): Promise<void> {
        const controller = new AbortController();
        this.activeController = controller;
        try {
            const res = await fetch(item.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.body),
                signal: controller.signal,
                ...item.init,
            });
            if (!res.ok || !res.body) throw new Error(`Stream HTTP ${res.status}`);

            const reader = res.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (this.closed) { reader.cancel().catch(() => {}); break; }
                if (value && value.byteLength > 0) {
                    this.appendChunk(value);
                    this.events.onChunkAppended?.(value.byteLength);
                }
            }
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                console.warn('[StreamPlayer] streamItem error', err);
            }
        } finally {
            if (this.activeController === controller) this.activeController = null;
        }
    }

    private appendChunk(chunk: Uint8Array): void {
        this.pendingChunks.push(chunk);
        this.flushPending();
        if (!this.playbackStarted && this.audio) {
            this.playbackStarted = true;
            this.audio.play().then(() => this.events.onStart?.()).catch(err => {
                console.warn('[StreamPlayer] play() rejected', err);
            });
        }
    }

    private flushPending(): void {
        if (!this.sourceBuffer || this.sourceBuffer.updating) return;
        if (this.pendingChunks.length === 0) return;
        try {
            const next = this.pendingChunks.shift()!;
            // Kopie in ein frisches ArrayBuffer damit TS den BufferSource akzeptiert
            const copy = new Uint8Array(next.byteLength);
            copy.set(next);
            this.sourceBuffer.appendBuffer(copy.buffer);
        } catch (err: any) {
            if (err?.name === 'QuotaExceededError') {
                // Buffer voll - bestehenden Bereich vor current-time entfernen
                try {
                    const audio = this.audio;
                    if (audio && this.sourceBuffer.buffered.length > 0) {
                        const start = this.sourceBuffer.buffered.start(0);
                        const removeEnd = Math.max(start, audio.currentTime - 5);
                        if (removeEnd > start) this.sourceBuffer.remove(start, removeEnd);
                    }
                } catch { /* ignore */ }
            } else {
                console.error('[StreamPlayer] appendBuffer error', err);
            }
        }
    }

    private signalEndOfStream(): void {
        if (this.endOfStreamCalled || !this.mediaSource) return;
        this.endOfStreamCalled = true;

        // Warten bis wirklich alle Chunks angehaengt sind, dann MediaSource schliessen.
        const tryEnd = () => {
            if (this.closed || !this.mediaSource) return;
            const buffering = this.pendingChunks.length > 0
                || (this.sourceBuffer && this.sourceBuffer.updating);
            if (buffering) {
                setTimeout(tryEnd, 40);
                return;
            }
            try {
                if (this.mediaSource.readyState === 'open') {
                    this.mediaSource.endOfStream();
                }
            } catch (err) {
                console.warn('[StreamPlayer] endOfStream error', err);
            }

            // Safety-Net: falls audio 'ended' nicht innerhalb 2s feuert
            // (MediaSource-Quirks bei kurzen Streams) → onAllEnded manuell ausloesen.
            setTimeout(() => {
                if (this.closed) return;
                const audio = this.audio;
                if (audio && !audio.ended && (audio.paused || audio.currentTime === 0)) {
                    // Kein Ton mehr angekommen, nichts spielt → als beendet werten
                    this.events.onAllEnded?.();
                    this.cleanup();
                } else if (audio && !audio.ended) {
                    // Audio laeuft noch → auf natuerliches Ende warten, aber mit Timeout
                    const watchdog = setTimeout(() => {
                        if (!this.closed && audio && !audio.ended) {
                            console.warn('[StreamPlayer] Watchdog: erzwungenes Ende');
                            this.events.onAllEnded?.();
                            this.cleanup();
                        }
                    }, 15000);
                    audio.addEventListener('ended', () => clearTimeout(watchdog), { once: true });
                }
            }, 2000);
        };
        tryEnd();
    }

    private cleanup(): void {
        this.audio = null;
        this.mediaSource = null;
        this.sourceBuffer = null;
        this.pendingChunks = [];
    }

    // Fallback fuer Browser ohne audio/mpeg MSE-Support
    private async fallbackFullDownload(items: QueueItem[], events: StreamingPlayerEvents): Promise<HTMLAudioElement | null> {
        console.warn('[StreamPlayer] MSE audio/mpeg nicht unterstuetzt, nutze Fallback');
        for (const item of items) {
            if (this.closed) break;
            try {
                const controller = new AbortController();
                this.activeController = controller;
                const res = await fetch(item.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item.body),
                    signal: controller.signal,
                });
                const buf = await res.arrayBuffer();
                if (this.closed) return null;
                const audio = new Audio();
                audio.src = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
                this.audio = audio;
                events.onAudioElement?.(audio);
                events.onStart?.();
                await new Promise<void>((resolve) => {
                    audio.onended = () => { events.onSentenceEnd?.(); resolve(); };
                    audio.onerror = () => resolve();
                    audio.play().catch(() => resolve());
                });
            } catch { /* abort */ }
        }
        events.onAllEnded?.();
        this.cleanup();
        return null;
    }
}

/**
 * Zerlegt Text in halbwegs natuerliche Satz-Chunks fuer Streaming-TTS.
 * Ziel: kurze erste Einheit (so schnell spricht Neon los), danach groebere Chunks.
 */
export function splitIntoSentences(text: string, minFirstChunk = 30): string[] {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];
    // Satzgrenzen: . ? ! gefolgt von Leerzeichen/Ende, oder ; / : fuer laengere Saetze
    const pieces = cleaned.match(/[^.!?;:]+[.!?;:]+(\s|$)|[^.!?;:]+$/g) || [cleaned];
    const out: string[] = [];
    let buffer = '';
    for (const p of pieces) {
        const piece = p.trim();
        if (!piece) continue;
        if (out.length === 0 && buffer.length + piece.length < minFirstChunk) {
            // Ersten Chunk klein halten, aber minimal Fuellung
            buffer += (buffer ? ' ' : '') + piece;
            if (buffer.length >= minFirstChunk || /[.!?]$/.test(buffer)) {
                out.push(buffer);
                buffer = '';
            }
        } else {
            if (buffer) { out.push(buffer); buffer = ''; }
            out.push(piece);
        }
    }
    if (buffer) out.push(buffer);
    return out;
}

export const streamingAudioPlayer = new StreamingAudioPlayer();
export default StreamingAudioPlayer;
