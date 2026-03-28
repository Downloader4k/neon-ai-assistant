// @ts-ignore -- no type declarations available
import nspell from 'nspell';
import * as fs from 'fs';
import * as path from 'path';

export class SpellCheckService {
    private spell: nspell.NSpell | null = null;
    private initialized = false;

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Lokale Hunspell-Dateien laden
            const hunspellDir = path.join(__dirname, '../../../data/hunspell');
            const dicPath = path.join(hunspellDir, 'de_DE.dic');
            const affPath = path.join(hunspellDir, 'de_DE.aff');

            if (!fs.existsSync(dicPath) || !fs.existsSync(affPath)) {
                console.warn('[SpellCheckService] Hunspell files not found, spell checking disabled');
                return;
            }

            const dic = fs.readFileSync(dicPath, 'utf8');
            const aff = fs.readFileSync(affPath, 'utf8');

            this.spell = nspell(aff, dic);
            this.initialized = true;
            console.info('[SpellCheckService] German dictionary loaded from local files');
        } catch (error) {
            console.error('[SpellCheckService] Failed to load dictionary:', error);
        }
    }

    correct(text: string): string {
        if (!this.initialized || !this.spell) {
            return text;
        }

        // Phase 0: Fix mojibake / double-encoded UTF-8 (Latin-1 interpreted as UTF-8)
        text = this.fixMojibake(text);

        // Phase 1: Recover broken umlauts (U+FFFD replacement characters)
        text = this.recoverUmlauts(text);

        // Phase 2 (Standard-Wortkorrektur) deaktiviert:
        // nspell erkennt viele korrekte deutsche Woerter nicht und
        // ersetzt sie durch falsche Vorschlaege oder zerstoert Umlaute.
        return text;
    }

    /**
     * Fix mojibake: double-encoded or Latin-1→UTF-8 misinterpretation patterns.
     * These are common when UTF-8 bytes are re-interpreted as Latin-1 then encoded again.
     */
    private fixMojibake(text: string): string {
        // Common mojibake patterns for German umlauts (UTF-8 bytes read as Latin-1)
        const mojibakeMap: Record<string, string> = {
            '\u00c3\u00a4': '\u00e4', // ä
            '\u00c3\u00b6': '\u00f6', // ö
            '\u00c3\u00bc': '\u00fc', // ü
            '\u00c3\u009f': '\u00df', // ß
            '\u00c3\u0084': '\u00c4', // Ä
            '\u00c3\u0096': '\u00d6', // Ö
            '\u00c3\u009c': '\u00dc', // Ü
        };

        for (const [broken, fixed] of Object.entries(mojibakeMap)) {
            if (text.includes(broken)) {
                text = text.split(broken).join(fixed);
            }
        }

        // Also try: raw Latin-1 bytes that snuck through (single byte umlauts)
        // In Latin-1: ä=0xE4, ö=0xF6, ü=0xFC, ß=0xDF, Ä=0xC4, Ö=0xD6, Ü=0xDC
        // These would appear as U+00E4 etc in JavaScript strings if passed through correctly,
        // but could also appear as their raw codepoints if mishandled

        return text;
    }

    /**
     * Recover umlauts from encoding-corrupted text.
     * Handles multiple corruption patterns:
     * 1. U+FFFD replacement character
     * 2. \u00EF\u00BF\u00BD (FFFD bytes decoded as Latin-1)
     * 3. CP1252 mojibake for smart quotes etc.
     */
    private recoverUmlauts(text: string): string {
        // Normalize: replace Latin-1-decoded FFFD bytes (ï¿½) with actual U+FFFD
        const REPLACEMENT_LATIN1 = '\u00ef\u00bf\u00bd';
        text = text.split(REPLACEMENT_LATIN1).join('\ufffd');

        // Also handle CP1252 mojibake for common UTF-8 sequences:
        // Smart quotes: ' (E2 80 99) decoded as CP1252 → â€™
        text = text.replace(/\u00e2\u20ac\u2122/g, '\u2019'); // '
        text = text.replace(/\u00e2\u20ac\u0153/g, '\u201c'); // "
        text = text.replace(/\u00e2\u20ac\u009d/g, '\u201d'); // "
        text = text.replace(/\u00e2\u20ac\u201c/g, '\u2013'); // –
        text = text.replace(/\u00e2\u20ac\u201d/g, '\u2014'); // —

        if (!text.includes('\ufffd')) return text;

        // Match words that contain replacement characters
        const corruptWordRegex = /[a-zA-Z\u00c0-\u024f]*\ufffd[a-zA-Z\u00c0-\u024f\ufffd]*/g;
        const umlauts = ['\u00e4', '\u00f6', '\u00fc', '\u00df', '\u00c4', '\u00d6', '\u00dc']; // ä ö ü ß Ä Ö Ü

        return text.replace(corruptWordRegex, (corruptWord) => {
            const positions: number[] = [];
            for (let i = 0; i < corruptWord.length; i++) {
                if (corruptWord[i] === '\ufffd') positions.push(i);
            }

            // Try each umlaut combination for each position
            const tryUmlauts = (word: string, posIdx: number): string | null => {
                if (posIdx >= positions.length) {
                    if (this.spell?.correct(word) || this.spell?.correct(word.toLowerCase())) {
                        return word;
                    }
                    return null;
                }

                const pos = positions[posIdx];
                for (const u of umlauts) {
                    const candidate = word.substring(0, pos) + u + word.substring(pos + 1);
                    const result = tryUmlauts(candidate, posIdx + 1);
                    if (result) return result;
                }
                return null;
            };

            const recovered = tryUmlauts(corruptWord, 0);
            if (recovered) return recovered;

            // Fallback: remove replacement chars
            return corruptWord.replace(/\ufffd/g, '');
        });
    }

    isCorrect(word: string): boolean {
        if (!this.initialized || !this.spell) return true;
        return this.spell.correct(word);
    }

    suggest(word: string): string[] {
        if (!this.initialized || !this.spell) return [];
        return this.spell.suggest(word) || [];
    }
}

export const spellCheckService = new SpellCheckService();
