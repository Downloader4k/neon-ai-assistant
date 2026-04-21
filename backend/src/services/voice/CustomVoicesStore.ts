/**
 * CustomVoicesStore
 *
 * Persistenter Speicher fuer vom User hinzugefuegte ElevenLabs-Voice-IDs.
 * Wird in backend/data/custom-voices.json gespeichert und ueber Backend-API CRUD verwaltet.
 * So sind die Stimmen auf jedem Geraet verfuegbar (nicht nur LocalStorage im Browser).
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

export interface CustomVoice {
    name: string;
    voiceId: string;
    locale?: string;
    gender?: string;
    addedAt: string; // ISO timestamp
}

class CustomVoicesStore {
    private filePath: string;
    private cache: CustomVoice[] | null = null;

    constructor() {
        // backend/data/custom-voices.json
        const dataDir = path.resolve(__dirname, '../../../data');
        this.filePath = path.join(dataDir, 'custom-voices.json');
        try {
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        } catch (err) {
            logger.warn('[CustomVoicesStore] data-Verzeichnis konnte nicht erstellt werden', { err });
        }
    }

    private load(): CustomVoice[] {
        if (this.cache) return this.cache;
        try {
            if (!fs.existsSync(this.filePath)) {
                this.cache = [];
                return this.cache;
            }
            const raw = fs.readFileSync(this.filePath, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data)) {
                this.cache = data.filter(v => v && typeof v.voiceId === 'string' && typeof v.name === 'string');
            } else {
                this.cache = [];
            }
        } catch (err) {
            logger.warn('[CustomVoicesStore] Konnte custom-voices.json nicht lesen', { err });
            this.cache = [];
        }
        return this.cache;
    }

    private save(list: CustomVoice[]): void {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf8');
            this.cache = list;
        } catch (err) {
            logger.error('[CustomVoicesStore] Speichern fehlgeschlagen', { err });
            throw err;
        }
    }

    list(): CustomVoice[] {
        return [...this.load()];
    }

    add(entry: Omit<CustomVoice, 'addedAt'>): CustomVoice {
        const name = (entry.name || '').trim();
        const voiceId = (entry.voiceId || '').trim();
        if (!voiceId) throw new Error('voiceId ist erforderlich');

        const current = this.load();
        const existing = current.find(v => v.voiceId === voiceId);
        if (existing) {
            // Update Name/locale/gender
            existing.name = name || existing.name;
            if (entry.locale) existing.locale = entry.locale;
            if (entry.gender) existing.gender = entry.gender;
            this.save(current);
            return existing;
        }

        const full: CustomVoice = {
            name: name || `Eigene Stimme ${current.length + 1}`,
            voiceId,
            locale: entry.locale || 'de-DE',
            gender: entry.gender || 'unknown',
            addedAt: new Date().toISOString(),
        };
        current.push(full);
        this.save(current);
        logger.info(`[CustomVoicesStore] Voice hinzugefuegt: ${full.name} (${full.voiceId})`);
        return full;
    }

    remove(voiceId: string): boolean {
        const current = this.load();
        const before = current.length;
        const next = current.filter(v => v.voiceId !== voiceId);
        if (next.length === before) return false;
        this.save(next);
        logger.info(`[CustomVoicesStore] Voice entfernt: ${voiceId}`);
        return true;
    }

    clear(): void {
        this.save([]);
    }
}

export const customVoicesStore = new CustomVoicesStore();
