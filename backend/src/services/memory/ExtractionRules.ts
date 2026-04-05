/**
 * Extraction Rules - Rule-based pre-filter for memory extraction
 * 
 * Runs before LLM extraction to catch obvious patterns and reduce costs.
 */

export interface ExtractionRule {
    name: string;
    pattern: RegExp | ((text: string) => boolean);
    memoryType: 'FACT' | 'PREFERENCE' | 'PROJECT' | 'INSTRUCTION' | 'KNOWLEDGE' | 'NONE';
    confidence: number;
    extract: (text: string) => string | null;
}

export const EXTRACTION_RULES: ExtractionRule[] = [
    // ─── EXPLICIT REMEMBER ────────────────────────────────────
    {
        name: 'explicit_remember',
        pattern: /(?:merke|merke dir|speicher|wichtig|remember|vergiss nicht)/i,
        memoryType: 'INSTRUCTION',
        confidence: 0.95,
        extract: (text) => text.trim()
    },

    // ─── PREFERENCES ──────────────────────────────────────────
    {
        name: 'preference_theme',
        pattern: /(?:bevorzuge|möchte|mag|lieber?)\s+(?:dark|dunkel|hell|light)/i,
        memoryType: 'PREFERENCE',
        confidence: 0.9,
        extract: (text) => {
            const match = text.match(/(?:bevorzuge|möchte|mag|lieber?)\s+(dark|dunkel|hell|light)/i);
            return match ? `Nutzer bevorzugt ${match[1]}-Theme` : null;
        }
    },
    {
        name: 'preference_language',
        pattern: /(?:antworte|schreib|spreche?)\s+(?:auf|in)?\s*(deutsch|englisch|französisch)/i,
        memoryType: 'PREFERENCE',
        confidence: 0.9,
        extract: (text) => {
            const match = text.match(/(?:antworte|schreib|spreche?)\s+(?:auf|in)?\s*(deutsch|englisch|französisch)/i);
            return match ? `Nutzer möchte Antworten auf ${match[1]}` : null;
        }
    },

    // ─── PROJECTS ─────────────────────────────────────────────
    {
        name: 'project_mention',
        pattern: /(?:mein(?:e)?\s+(?:projekt|app|anwendung|system)|arbeite\s+an)\s+["']?([A-ZÄÖÜ][a-zäöüß\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+)*|[A-Z]{2,})/i,
        memoryType: 'PROJECT',
        confidence: 0.8,
        extract: (text) => {
            const match = text.match(/(?:mein(?:e)?\s+(?:projekt|app|anwendung|system)|arbeite\s+an)\s+["']?([A-ZÄÖÜ][a-zäöüß\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+)*|[A-Z]{2,})/i);
            if (!match) return null;
            const projectName = match[1].trim();
            return `Nutzer arbeitet an Projekt: ${projectName}`;
        }
    },

    // ─── TECH STACK ───────────────────────────────────────────
    {
        name: 'tech_stack',
        pattern: /(?:ich\s+)?(?:arbeite|nutze|verwende|programmiere|entwickle)\s+(?:mit|in)?\s*(typescript|javascript|python|java|rust|go|react|vue|angular|node\.?js|next\.?js|express|django|flask|fastapi)/i,
        memoryType: 'FACT',
        confidence: 0.85,
        extract: (text) => {
            const techs = text.match(/(typescript|javascript|python|java|rust|go|react|vue|angular|node\.?js|next\.?js|express|django|flask|fastapi)/gi);
            if (!techs) return null;
            const uniqueTechs = [...new Set(techs.map(t => t.toLowerCase()))];
            return `Nutzer nutzt: ${uniqueTechs.join(', ')}`;
        }
    },

    // ─── PERSONAL INFO ────────────────────────────────────────
    {
        name: 'personal_name',
        pattern: /(?:ich\s+heiße|mein\s+name\s+ist|ich\s+bin)\s+([A-ZÄÖÜ][a-zäöüß]+)/,
        memoryType: 'FACT',
        confidence: 0.95,
        extract: (text) => {
            const match = text.match(/(?:ich\s+heiße|mein\s+name\s+ist|ich\s+bin)\s+([A-ZÄÖÜ][a-zäöüß]+)/);
            return match ? `Nutzer heißt ${match[1]}` : null;
        }
    },
    {
        name: 'personal_age',
        pattern: /(?:ich\s+bin|bin)\s+(\d{1,2})\s+(?:jahre\s+alt|jahre)/i,
        memoryType: 'FACT',
        confidence: 0.9,
        extract: (text) => {
            const match = text.match(/(?:ich\s+bin|bin)\s+(\d{1,2})\s+(?:jahre\s+alt|jahre)/i);
            return match ? `Nutzer ist ${match[1]} Jahre alt` : null;
        }
    },
    {
        name: 'personal_location',
        pattern: /(?:ich\s+wohne|lebe|komme)\s+(?:in|aus)\s+([A-ZÄÖÜ][a-zäöüß]+)/,
        memoryType: 'FACT',
        confidence: 0.85,
        extract: (text) => {
            const match = text.match(/(?:ich\s+wohne|lebe|komme)\s+(?:in|aus)\s+([A-ZÄÖÜ][a-zäöüß]+)/);
            return match ? `Nutzer wohnt in ${match[1]}` : null;
        }
    },

    // ─── NEGATIVE FILTERS (Don't store) ──────────────────────

    // Temporal situations — NEVER store
    {
        name: 'temporal_activity',
        pattern: /(?:ist|sind|war)\s+(?:gerade|momentan|aktuell|beim|im)\s+(?:sport|einkaufen|kochen|training|fitness|arzt|schule|arbeit)/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    },
    {
        name: 'temporal_state',
        pattern: /(?:gerade|momentan|aktuell|jetzt)\s+(?:beim|im|am|bei|nicht da|unterwegs|weg)/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    },
    {
        name: 'temporal_plan',
        pattern: /(?:heute|morgen|gleich|später|nachher|bald)\s+(?:essen|machen|gehen|kommen|kochen|treffen)/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    },
    {
        name: 'temporal_waiting',
        pattern: /(?:wenn|sobald|falls)\s+.+(?:zurück|fertig|da ist|kommt|ankommt)/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    },
    {
        name: 'weather_data',
        pattern: /(?:wetter|temperatur|grad|regen|schnee|gewitter|sonnig|bewölkt|vorhersage|klima|luftfeuchtigkeit)/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    },
    {
        name: 'weather_location',
        pattern: /(?:wetter\s+(?:in|für|bei)|wie\s+(?:ist|wird)\s+(?:das\s+)?wetter)/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    },
    {
        name: 'weather_context',
        pattern: /(?:merke(?:\s+dir)?,?\s*dass\s+(?:es\s+)?(?:in\s+\w+\s+)?(?:regnet|schneit|gewittert|sonnig|bewölkt))/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    },
    {
        name: 'temperature_data',
        pattern: /(?:temperaturen?\s+(?:in|liegen|sind)|-\d+°|\d+°c|\d+\s+grad)/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    },
    {
        name: 'smalltalk_greeting',
        pattern: /^(?:hallo|hi|hey|wie\s+geht|guten\s+tag|morgen|servus|moin)[\s\?\!\.]*$/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    },
    {
        name: 'smalltalk_thanks',
        pattern: /^(?:danke|vielen\s+dank|thx|thanks|ok|okay|alles\s+klar)[\s\?\!\.]*$/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    },
    {
        name: 'smalltalk_goodbye',
        pattern: /^(?:tschüss|bye|auf\s+wiedersehen|ciao|bis\s+bald)[\s\?\!\.]*$/i,
        memoryType: 'NONE',
        confidence: 1.0,
        extract: () => null
    }
];

/**
 * Apply extraction rules to text.
 *
 * Negative (NONE) rules no longer abort the entire message. Instead they
 * act as content-level filters: if the *extracted* content itself matches a
 * negative pattern it is dropped, but other positive extractions from the
 * same message are kept.
 *
 * Example: "Ich bin 28 Jahre alt und gehe gleich essen"
 *   - personal_age  → extracts "Nutzer ist 28 Jahre alt"  ✓ kept
 *   - temporal_plan → matches "gleich essen", but "Nutzer ist 28 Jahre alt"
 *                     does not match the temporal pattern  ✓ not filtered
 */
export function applyExtractionRules(text: string): Array<{
    content: string;
    type: string;
    confidence: number;
    source: string;
}> {
    const results: Array<{ content: string; type: string; confidence: number; source: string }> = [];

    // Step 1: collect all NONE patterns that match the message text
    const matchedNonePatterns: RegExp[] = [];
    for (const rule of EXTRACTION_RULES) {
        if (rule.memoryType !== 'NONE') continue;
        const matches = rule.pattern instanceof RegExp
            ? rule.pattern.test(text)
            : rule.pattern(text);
        if (matches && rule.pattern instanceof RegExp) {
            matchedNonePatterns.push(rule.pattern);
        }
    }

    // Step 2: run positive rules and filter extracted content against NONE patterns
    for (const rule of EXTRACTION_RULES) {
        if (rule.memoryType === 'NONE') continue;

        const matches = rule.pattern instanceof RegExp
            ? rule.pattern.test(text)
            : rule.pattern(text);

        if (!matches) continue;

        const extracted = rule.extract(text);
        if (!extracted) continue;

        // Drop this extraction if the extracted content itself contains a blocked pattern
        const isBlocked = matchedNonePatterns.some(p => p.test(extracted));
        if (isBlocked) continue;

        results.push({
            content: extracted,
            type: rule.memoryType,
            confidence: rule.confidence,
            source: 'rule-based'
        });
    }

    return results;
}
