/**
 * NEON Memory System 2.0 - Composite Scorer
 *
 * Ersetzt das reine Importance-Scoring durch eine gewichtete Summe:
 *   Score = 0.5 × Importance
 *         + 0.2 × Recency
 *         + 0.2 × Access
 *         + 0.1 × Relevance (Similarity zur Query)
 *
 * Alle Sub-Scores sind auf [0, 1] normalisiert.
 */

import { MemoryType, TYPE_CONFIG } from './MemoryTypes';

export interface MemoryLike {
    id: string;
    type: string;
    importanceScore: number;
    accessCount: number;
    lastAccessedAt: Date | null;
    createdAt: Date;
}

export interface ScoringContext {
    /** Optional: Similarity vom Vector-Search (0..1). Default 0.5 wenn nicht da. */
    similarity?: number;
    /** Aktuelle Zeit fuer Recency-Berechnung. */
    now?: Date;
}

export const SCORE_WEIGHTS = {
    importance: 0.5,
    recency: 0.2,
    access: 0.2,
    relevance: 0.1,
};

/** Recency-Score: frische Eintraege = 1.0, verfallen exponentiell nach Type-HalfLife. */
export function recencyScore(entry: MemoryLike, now: Date = new Date()): number {
    const cfg = TYPE_CONFIG[entry.type as MemoryType];
    const halfLife = cfg?.halfLifeDays ?? 30;
    if (!isFinite(halfLife)) return 1.0; // FACT/INSTRUCTION verfallen nicht
    const anchor = entry.lastAccessedAt ?? entry.createdAt;
    const ageDays = (now.getTime() - new Date(anchor).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 0) return 1.0;
    return Math.pow(0.5, ageDays / halfLife); // 0..1, halbiert pro halfLife
}

/** Access-Score: logarithmisch saturierend. 0 accesses = 0, 10 = ~0.7, 100 = ~1.0 */
export function accessScore(entry: MemoryLike): number {
    const n = Math.max(0, entry.accessCount);
    return Math.min(1, Math.log10(n + 1) / 2); // log10(101)/2 ≈ 1.0
}

/** Relevance-Score: Similarity aus Vector-Search. Default 0.5 als neutral. */
export function relevanceScore(ctx: ScoringContext): number {
    if (ctx.similarity === undefined || ctx.similarity === null) return 0.5;
    return Math.max(0, Math.min(1, ctx.similarity));
}

/** Final Score: gewichtete Summe aller Sub-Scores. */
export function finalScore(entry: MemoryLike, ctx: ScoringContext = {}): number {
    const imp = Math.max(0, Math.min(1, entry.importanceScore ?? 0.5));
    const rec = recencyScore(entry, ctx.now);
    const acc = accessScore(entry);
    const rel = relevanceScore(ctx);
    return (
        SCORE_WEIGHTS.importance * imp +
        SCORE_WEIGHTS.recency * rec +
        SCORE_WEIGHTS.access * acc +
        SCORE_WEIGHTS.relevance * rel
    );
}

/** Einzelne Komponenten zurueckgeben (fuer Debugging/UI). */
export function scoreBreakdown(entry: MemoryLike, ctx: ScoringContext = {}) {
    return {
        importance: entry.importanceScore ?? 0.5,
        recency: recencyScore(entry, ctx.now),
        access: accessScore(entry),
        relevance: relevanceScore(ctx),
        final: finalScore(entry, ctx),
    };
}
