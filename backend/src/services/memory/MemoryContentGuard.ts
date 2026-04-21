/**
 * NEON Memory System 2.0 - Content Guard
 *
 * Haelt Muell aus der Datenbank raus.
 * Identische Regeln wie das Python-Cleanup-Script, aber als TypeScript-Modul
 * fuer live-use beim Save.
 */

export interface GuardResult {
    ok: boolean;
    reason?: string;
}

const JUNK_SUBSTRINGS = [
    '[ROUTING_LOG]',
    '[TOOL_EXEC]',
    '[TOOL_RESULT]',
    '[LLM_RAW]',
    '[LLM_DEBUG]',
    '[RAG:',
    'Traceback (most recent call last)',
    'at Object.',
    'at Function.',
    '\u0000', // Null bytes
];

const WIKI_MARKERS = ['Artikel\nDiskussion', 'Versionsgeschichte', 'Quelltext bearbeiten'];

const URL_ONLY_RE = /^https?:\/\/\S+$/;
const CODE_FENCE_COUNT = (s: string): number => (s.match(/```/g) || []).length;

/** Harter Cutoff - wenn content laenger ohne gute Summary = Dump */
export const MAX_CONTENT_LENGTH = 500;
export const MIN_WORDS = 3;

export function checkContent(content: string | null | undefined, maxLen = MAX_CONTENT_LENGTH): GuardResult {
    if (!content || !content.trim()) {
        return { ok: false, reason: 'empty' };
    }
    const c = content.trim();

    for (const marker of JUNK_SUBSTRINGS) {
        if (c.includes(marker)) {
            return { ok: false, reason: `contains-marker:${marker}` };
        }
    }

    // Wikipedia-Dump Heuristik
    const wikiHits = WIKI_MARKERS.filter(m => c.includes(m)).length;
    if (wikiHits >= 2) {
        return { ok: false, reason: 'wikipedia-dump' };
    }

    if (c.length > maxLen) {
        return { ok: false, reason: `too-long:${c.length}` };
    }

    if (CODE_FENCE_COUNT(c) >= 2 && c.length > 200) {
        return { ok: false, reason: 'code-block-dump' };
    }

    if (URL_ONLY_RE.test(c)) {
        return { ok: false, reason: 'url-only' };
    }

    const words = c.split(/\s+/).filter(Boolean);
    if (words.length < MIN_WORDS) {
        return { ok: false, reason: `fragment:${words.length}-words` };
    }

    return { ok: true };
}

/** Normalisiert Content fuer Deduplication-Vergleiche. */
export function normalizeForCompare(content: string): string {
    return content
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,!?;:"'()]/g, '')
        .trim();
}
