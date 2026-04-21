/**
 * NEON Memory System 2.0 - Gatekeeper
 *
 * Die EINZIGE erlaubte Tuer fuer Memory-Writes.
 * Niemand soll noch direkt `prisma.memoryEntry.create()` aufrufen.
 *
 * Pipeline beim Save:
 *   1. Type normalisieren (Legacy → Canonical)
 *   2. Content-Guard (Logs, Dumps, Fragmente raus)
 *   3. Duplikat-Check (exakt + semantisch)
 *   4. Konflikt-Resolver (replace | merge | append | skip)
 *   5. Minimum-Importance pro Type
 *   6. Speichern + Embedding + Tags
 *
 * Returns null wenn blockiert, sonst das gespeicherte Entry.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { embeddingService } from './EmbeddingService';
import { checkContent, normalizeForCompare } from './MemoryContentGuard';
import {
    MemoryType,
    TYPE_CONFIG,
    normalizeType,
} from './MemoryTypes';

export interface SaveMemoryInput {
    userId: string;
    type: MemoryType | string; // akzeptiert Legacy, normalisiert intern
    content: string;
    summary?: string;
    importance?: number;
    tags?: string[];
    sourceExtractionId?: string;
    /** Bypass-Duplikat-Check - nur fuer interne Migrations-Tools */
    skipDedup?: boolean;
}

export interface SaveMemoryResult {
    status: 'created' | 'replaced' | 'merged' | 'skipped' | 'blocked';
    entryId?: string;
    reason?: string;
    replacedId?: string;
}

/** Similarity-Threshold ab dem zwei Contents als dasselbe gelten */
const DEDUP_SIMILARITY_THRESHOLD = 0.92;

export class MemoryGatekeeper {
    private prisma: PrismaClient;
    private embed: typeof embeddingService;

    constructor(prisma: PrismaClient = new PrismaClient(), embed = embeddingService) {
        this.prisma = prisma;
        this.embed = embed;
    }

    async save(input: SaveMemoryInput): Promise<SaveMemoryResult> {
        const type = normalizeType(input.type);
        const cfg = TYPE_CONFIG[type];

        // 1. Content-Guard
        const guard = checkContent(input.content, cfg.maxLength);
        if (!guard.ok) {
            logger.info(`[Gatekeeper] blocked (${type}): ${guard.reason}`);
            return { status: 'blocked', reason: guard.reason };
        }

        // 2. Minimum-Importance
        const importance = Math.max(0, Math.min(1, input.importance ?? 0.5));
        if (importance < cfg.minImportance) {
            logger.info(`[Gatekeeper] skipped (${type}): importance ${importance.toFixed(2)} < min ${cfg.minImportance}`);
            return { status: 'skipped', reason: `low-importance:${importance.toFixed(2)}` };
        }

        const content = input.content.trim();
        const summary = input.summary ?? content.slice(0, 100);

        // 3. Duplikat-Check (nur wenn nicht gebypassed)
        if (!input.skipDedup) {
            const dup = await this.findDuplicate(input.userId, type, content);
            if (dup) {
                return this.resolveConflict(dup, { ...input, type, content, summary, importance });
            }
        }

        // 4. Neu anlegen
        return this.createNew({ ...input, type, content, summary, importance });
    }

    /** Exakter + semantischer Duplikat-Check. */
    private async findDuplicate(userId: string, type: MemoryType, content: string) {
        // 3a. Exakter Match (normalisiert)
        const normalized = normalizeForCompare(content);
        const candidates = await this.prisma.memoryEntry.findMany({
            where: { userId, type, isActive: true },
            select: { id: true, content: true, importanceScore: true, accessCount: true, createdAt: true },
            take: 200, // per-type shouldn't be huge
        });
        const exact = candidates.find(c => normalizeForCompare(c.content) === normalized);
        if (exact) return exact;

        // 3b. Semantisch (via Embedding-Search) - top 3, nur aktive gleichen Typs
        try {
            const similar = await this.embed.searchSimilar(content, 3, DEDUP_SIMILARITY_THRESHOLD);
            for (const s of similar) {
                const hit = candidates.find(c => c.id === s.id);
                if (hit) return hit;
            }
        } catch (e) {
            logger.warn('[Gatekeeper] embedding dedup failed, proceeding', { err: (e as Error).message });
        }
        return null;
    }

    /** Entscheidet: replace | merge | append | skip basierend auf TYPE_CONFIG. */
    private async resolveConflict(
        existing: { id: string; content: string; importanceScore: number; accessCount: number; createdAt: Date },
        input: SaveMemoryInput & { type: MemoryType; content: string; summary: string; importance: number },
    ): Promise<SaveMemoryResult> {
        const cfg = TYPE_CONFIG[input.type];

        if (cfg.onDuplicate === 'append') {
            // EPISODIC: jedes Ereignis ist eigenstaendig, legen wir neu an
            return this.createNew(input);
        }

        if (cfg.onDuplicate === 'replace') {
            // Behalte Entry mit hoeherer importance × access. Neuer gewinnt bei Gleichstand.
            const existingScore = (existing.importanceScore ?? 0.5) * (1 + (existing.accessCount ?? 0) * 0.05);
            const newScore = input.importance * 1.0;
            if (newScore >= existingScore) {
                await this.prisma.memoryEntry.update({
                    where: { id: existing.id },
                    data: {
                        content: input.content,
                        summary: input.summary,
                        importanceScore: input.importance,
                        updatedAt: new Date(),
                        sourceExtractionId: input.sourceExtractionId ?? undefined,
                    },
                });
                // Embedding aktualisieren
                await this.reEmbed(existing.id, input.content);
                logger.info(`[Gatekeeper] replaced ${existing.id.slice(0, 8)} (${input.type})`);
                return { status: 'replaced', entryId: existing.id, replacedId: existing.id };
            } else {
                logger.info(`[Gatekeeper] skipped (${input.type}): existing has higher score`);
                return { status: 'skipped', reason: 'existing-better', entryId: existing.id };
            }
        }

        // onDuplicate === 'merge' (PROJECT): bestehender Content wird ergaenzt
        const mergedContent = this.mergeContents(existing.content, input.content, TYPE_CONFIG[input.type].maxLength);
        await this.prisma.memoryEntry.update({
            where: { id: existing.id },
            data: {
                content: mergedContent,
                summary: mergedContent.slice(0, 100),
                importanceScore: Math.max(existing.importanceScore, input.importance),
                updatedAt: new Date(),
            },
        });
        await this.reEmbed(existing.id, mergedContent);
        logger.info(`[Gatekeeper] merged ${existing.id.slice(0, 8)} (${input.type})`);
        return { status: 'merged', entryId: existing.id };
    }

    private mergeContents(oldC: string, newC: string, maxLen: number): string {
        // Wenn newC substring von oldC -> nur oldC behalten
        if (oldC.includes(newC)) return oldC;
        if (newC.includes(oldC)) return newC.slice(0, maxLen);
        const combined = `${oldC} | ${newC}`;
        return combined.slice(0, maxLen);
    }

    /** Neuen Eintrag erstellen + Embedding + Tags. */
    private async createNew(input: SaveMemoryInput & { type: MemoryType; content: string; summary: string; importance: number }): Promise<SaveMemoryResult> {
        try {
            const entry = await this.prisma.memoryEntry.create({
                data: {
                    userId: input.userId,
                    type: input.type,
                    content: input.content,
                    summary: input.summary,
                    importanceScore: input.importance,
                    sourceExtractionId: input.sourceExtractionId ?? undefined,
                },
            });

            // Embedding
            try {
                const vec = await this.embed.embed(input.content);
                await this.embed.storeEmbedding(entry.id, vec);
                await this.prisma.memoryEmbedding.create({
                    data: {
                        memoryEntryId: entry.id,
                        vector: JSON.stringify(vec),
                        modelName: 'nomic-embed-text',
                    },
                });
            } catch (e) {
                logger.warn('[Gatekeeper] embedding failed (entry saved anyway)', { err: (e as Error).message });
            }

            // Tags
            if (input.tags && input.tags.length) {
                for (const name of input.tags) {
                    const tag = await this.prisma.memoryTag.upsert({
                        where: { name },
                        update: {},
                        create: { name },
                    });
                    await this.prisma.memoryEntry.update({
                        where: { id: entry.id },
                        data: { tags: { connect: { id: tag.id } } },
                    });
                }
            }

            logger.info(`[Gatekeeper] created ${entry.id.slice(0, 8)} (${input.type}, imp=${input.importance.toFixed(2)})`);
            return { status: 'created', entryId: entry.id };
        } catch (e) {
            logger.error('[Gatekeeper] create failed', { err: (e as Error).message });
            return { status: 'blocked', reason: 'db-error' };
        }
    }

    private async reEmbed(entryId: string, content: string) {
        try {
            await this.embed.deleteEmbedding(entryId);
            const vec = await this.embed.embed(content);
            await this.embed.storeEmbedding(entryId, vec);
            await this.prisma.memoryEmbedding.deleteMany({ where: { memoryEntryId: entryId } });
            await this.prisma.memoryEmbedding.create({
                data: {
                    memoryEntryId: entryId,
                    vector: JSON.stringify(vec),
                    modelName: 'nomic-embed-text',
                },
            });
        } catch (e) {
            logger.warn('[Gatekeeper] re-embed failed', { err: (e as Error).message });
        }
    }

    /** Diagnostik: kann ein bestimmter Content gespeichert werden? (fuer UI / API) */
    wouldAccept(type: string, content: string, importance?: number): { ok: boolean; reason?: string } {
        const t = normalizeType(type);
        const cfg = TYPE_CONFIG[t];
        const guard = checkContent(content, cfg.maxLength);
        if (!guard.ok) return { ok: false, reason: guard.reason };
        if ((importance ?? 0.5) < cfg.minImportance) {
            return { ok: false, reason: `min-importance:${cfg.minImportance}` };
        }
        return { ok: true };
    }
}

export const memoryGatekeeper = new MemoryGatekeeper();
