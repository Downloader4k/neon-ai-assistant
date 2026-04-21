/**
 * NEON Memory System 2.0 - Intent Classifier
 *
 * Erkennt aus der User-Query, welche Memory-Types primaer relevant sind.
 * Keine LLM-Abhaengigkeit - schnelles Keyword-Matching.
 *
 * Beispiele:
 *   "wie alt bin ich?"     → FACT
 *   "was mache ich gerade?" → PROJECT + EPISODIC
 *   "welche Musik mag ich?" → PREFERENCE
 *   "hallo"                → (smalltalk, keine Retrieval)
 */

import { MemoryType, MEMORY_TYPE, ALL_MEMORY_TYPES } from './MemoryTypes';

export type QueryIntent =
    | 'SELF_FACT'        // Fakten ueber User (Name, Alter, Geburtstag, Wohnort)
    | 'PREFERENCE'       // Vorlieben, Interessen
    | 'CURRENT_WORK'     // Was arbeitest du gerade an?
    | 'RECENT_EVENT'     // Was hatten wir letztens besprochen?
    | 'SYSTEM_RULE'      // Wie sollst du dich verhalten?
    | 'GENERIC_QUERY'    // Offene Frage, kein klares Intent
    | 'SMALLTALK';       // Begruessung, triviale Aeusserung

export interface IntentResult {
    intent: QueryIntent;
    preferredTypes: MemoryType[];
    /** Wenn true, ueberhaupt kein Retrieval (Smalltalk) */
    skipRetrieval: boolean;
    /** Selbstvertrauen der Klassifikation [0,1] */
    confidence: number;
}

const PATTERNS: Array<{ re: RegExp; intent: QueryIntent; conf: number }> = [
    // SELF_FACT
    { re: /\b(wie\s*alt|geburtstag|geburtstag|wohn.*ich|wo wohne|mein(e)?\s*(name|adresse)|wie\s*heiße\s*ich|wer\s*bin\s*ich)\b/i, intent: 'SELF_FACT', conf: 0.9 },
    // PREFERENCE
    { re: /\b(mag\s*ich|mag mein|lieblings|mag gerne|bevorzug|präferier|präferenz|vorliebe|interessier|musikgeschmack)\b/i, intent: 'PREFERENCE', conf: 0.85 },
    // CURRENT_WORK
    { re: /\b(was\s*mach(e|st)\s*ich|arbeite\s*ich|projekt|baue\s*ich|entwickle|bau\s*an|aktuelles? projekt)\b/i, intent: 'CURRENT_WORK', conf: 0.85 },
    // RECENT_EVENT
    { re: /\b(letzt.*(mal|woche|tage)|gestern|vorhin|neulich|kürzlich|haben wir|habe ich dir|worueber (haben wir )?gesprochen|worueber\s*haben)\b/i, intent: 'RECENT_EVENT', conf: 0.8 },
    // SYSTEM_RULE
    { re: /\b(wie\s*(soll|sollst)\s*du|deine\s*(regel|anweisung)|merke\s*dir|nicht\s*vergessen|wichtig\s*für\s*dich)\b/i, intent: 'SYSTEM_RULE', conf: 0.85 },
    // SMALLTALK
    { re: /^\s*(hi|hey|hallo|moin|servus|na|guten (morgen|abend|tag)|danke|bitte|bis (später|dann))\s*[.!?]?\s*$/i, intent: 'SMALLTALK', conf: 0.95 },
];

const INTENT_TO_TYPES: Record<QueryIntent, MemoryType[]> = {
    SELF_FACT: [MEMORY_TYPE.FACT],
    PREFERENCE: [MEMORY_TYPE.PREFERENCE, MEMORY_TYPE.FACT],
    CURRENT_WORK: [MEMORY_TYPE.PROJECT, MEMORY_TYPE.EPISODIC],
    RECENT_EVENT: [MEMORY_TYPE.EPISODIC, MEMORY_TYPE.PROJECT],
    SYSTEM_RULE: [MEMORY_TYPE.INSTRUCTION],
    GENERIC_QUERY: [...ALL_MEMORY_TYPES],
    SMALLTALK: [],
};

export function classifyIntent(query: string): IntentResult {
    if (!query || !query.trim()) {
        return { intent: 'SMALLTALK', preferredTypes: [], skipRetrieval: true, confidence: 1 };
    }
    const q = query.trim();

    // Zu kurze Messages = Smalltalk (Schutz vor Memory-Dump bei "hi")
    if (q.split(/\s+/).length < 3 && !/\?/.test(q)) {
        return { intent: 'SMALLTALK', preferredTypes: [], skipRetrieval: true, confidence: 0.7 };
    }

    for (const p of PATTERNS) {
        if (p.re.test(q)) {
            const skip = p.intent === 'SMALLTALK';
            return {
                intent: p.intent,
                preferredTypes: INTENT_TO_TYPES[p.intent],
                skipRetrieval: skip,
                confidence: p.conf,
            };
        }
    }

    // Kein Match: generische Query, alle Types erlaubt aber Similarity-driven
    return {
        intent: 'GENERIC_QUERY',
        preferredTypes: INTENT_TO_TYPES.GENERIC_QUERY,
        skipRetrieval: false,
        confidence: 0.5,
    };
}
