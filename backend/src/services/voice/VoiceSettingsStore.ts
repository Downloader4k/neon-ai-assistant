/**
 * VoiceSettingsStore
 *
 * Persistente User-Voice-Einstellungen (Stimme + Style/Preset + Feinschliff).
 * Wird in backend/data/voice-settings.json gespeichert, sodass das Backend
 * beim Neustart die zuletzt gewaehlte Stimme + Style wiederherstellt.
 *
 * ENV-Variablen (TTS_VOICE, TTS_BACKEND, ...) haben Vorrang falls explizit gesetzt -
 * dann gewinnen die gespeicherten User-Settings.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';
import type { TTSBackend, ElevenLabsPreset, ElevenLabsVoiceSettings } from './TTSService';

export interface PersistedVoiceSettings {
    voice?: string;
    backend?: TTSBackend;
    preset?: ElevenLabsPreset;
    customSettings?: ElevenLabsVoiceSettings;
    updatedAt?: string;
}

class VoiceSettingsStore {
    private filePath: string;
    private cache: PersistedVoiceSettings | null = null;

    constructor() {
        const dataDir = path.resolve(__dirname, '../../../data');
        this.filePath = path.join(dataDir, 'voice-settings.json');
        try {
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        } catch (err) {
            logger.warn('[VoiceSettingsStore] data-Verzeichnis konnte nicht erstellt werden', { err });
        }
    }

    load(): PersistedVoiceSettings {
        if (this.cache) return this.cache;
        let loaded: PersistedVoiceSettings = {};
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf8');
                const data = JSON.parse(raw);
                if (data && typeof data === 'object') loaded = data;
            }
        } catch (err) {
            logger.warn('[VoiceSettingsStore] Konnte voice-settings.json nicht lesen', { err });
        }
        this.cache = loaded;
        return loaded;
    }

    save(next: PersistedVoiceSettings): void {
        const current = this.load() || {};
        const merged: PersistedVoiceSettings = {
            ...current,
            ...next,
            updatedAt: new Date().toISOString(),
        };
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(merged, null, 2), 'utf8');
            this.cache = merged;
            logger.info('[VoiceSettingsStore] Gespeichert', {
                voice: merged.voice,
                backend: merged.backend,
                preset: merged.preset,
            });
        } catch (err) {
            logger.error('[VoiceSettingsStore] Speichern fehlgeschlagen', { err });
        }
    }

    clear(): void {
        try {
            if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
            this.cache = {};
        } catch (err) {
            logger.warn('[VoiceSettingsStore] clear() fehlgeschlagen', { err });
        }
    }
}

export const voiceSettingsStore = new VoiceSettingsStore();
