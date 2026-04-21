/**
 * NEON Memory System 2.0 - Canonical Memory Types
 *
 * Nur diese 5 Typen sind fuer Memory-Entries erlaubt.
 * Alles andere (KNOWLEDGE, RELATIONSHIP, BEHAVIOR, ...) ist deprecated
 * und wird beim Save vom MemoryGatekeeper auf einen der 5 gemappt.
 */

export const MEMORY_TYPE = {
    /** Dauerhafte, stabile Fakten (Name, Geburtstag, Wohnort) - keine Duplikate */
    FACT: 'FACT',
    /** Veraenderbare Vorlieben (Musikgeschmack, Interessen) - darf ueberschrieben werden */
    PREFERENCE: 'PREFERENCE',
    /** Laufende Projekte (wird aktualisiert, nicht dupliziert) */
    PROJECT: 'PROJECT',
    /** Ereignisse/Sessions mit Zeitbezug ("am XX wurde YY gemacht") */
    EPISODIC: 'EPISODIC',
    /** Systemregeln/Verhaltens-Anweisungen der KI - selten, keine Duplikate */
    INSTRUCTION: 'INSTRUCTION',
} as const;

export type MemoryType = typeof MEMORY_TYPE[keyof typeof MEMORY_TYPE];

export const ALL_MEMORY_TYPES: MemoryType[] = Object.values(MEMORY_TYPE) as MemoryType[];

/**
 * Mapping von deprecated/legacy types auf die kanonischen 5.
 * Wird vom Gatekeeper angewandt.
 */
export const LEGACY_TYPE_MAP: Record<string, MemoryType> = {
    KNOWLEDGE: MEMORY_TYPE.FACT,
    RELATIONSHIP: MEMORY_TYPE.FACT,
    BEHAVIOR: MEMORY_TYPE.PREFERENCE,
    EVENT: MEMORY_TYPE.EPISODIC,
    EPISODE: MEMORY_TYPE.EPISODIC,
};

export function normalizeType(raw: string | undefined | null): MemoryType {
    if (!raw) return MEMORY_TYPE.FACT;
    const upper = raw.toUpperCase();
    if (ALL_MEMORY_TYPES.includes(upper as MemoryType)) return upper as MemoryType;
    if (upper in LEGACY_TYPE_MAP) return LEGACY_TYPE_MAP[upper];
    return MEMORY_TYPE.FACT; // Default fallback
}

/**
 * Eigenschaften pro Type - Half-Life in Tagen, Dedup-Strategie.
 */
export interface MemoryTypeConfig {
    /** Verfallszeit in Tagen. Infinity = nie */
    halfLifeDays: number;
    /** Bei Duplikat: merge (kombinieren), replace (neuer gewinnt), append (beide behalten) */
    onDuplicate: 'merge' | 'replace' | 'append';
    /** Maximale Content-Laenge */
    maxLength: number;
    /** Minimale Importance fuer diesen Type */
    minImportance: number;
}

export const TYPE_CONFIG: Record<MemoryType, MemoryTypeConfig> = {
    FACT: {
        halfLifeDays: Infinity, // Fakten verfallen nicht
        onDuplicate: 'replace',  // Neuester gewinnt (z.B. Wohnort geaendert)
        maxLength: 300,
        minImportance: 0.5,
    },
    PREFERENCE: {
        halfLifeDays: 180,
        onDuplicate: 'replace',
        maxLength: 300,
        minImportance: 0.4,
    },
    PROJECT: {
        halfLifeDays: 30,
        onDuplicate: 'merge', // Update statt neue Eintraege
        maxLength: 400,
        minImportance: 0.4,
    },
    EPISODIC: {
        halfLifeDays: 90,
        onDuplicate: 'append', // Jedes Ereignis ist einzigartig
        maxLength: 500,
        minImportance: 0.3,
    },
    INSTRUCTION: {
        halfLifeDays: Infinity,
        onDuplicate: 'replace',
        maxLength: 250,
        minImportance: 0.6,
    },
};
