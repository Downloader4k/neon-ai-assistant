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
        if (!this.initialized || !this.spell) return text;
        
        const wordRegex = /[a-zA-ZäöüÄÖÜß]+/g;
        return text.replace(wordRegex, (word) => {
            // Kurze Wörter überspringen (meist Abkürzungen)
            if (word.length <= 2) return word;
            
            if (this.spell!.correct(word)) return word;
            
            const suggestions = this.spell!.suggest(word);
            if (suggestions && suggestions.length > 0) {
                const correction = suggestions[0];
                // Groß-/Kleinschreibung beibehalten
                if (word[0] === word[0].toUpperCase() && correction[0] !== correction[0].toUpperCase()) {
                    return correction.charAt(0).toUpperCase() + correction.slice(1);
                }
                return correction;
            }
            return word;
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
