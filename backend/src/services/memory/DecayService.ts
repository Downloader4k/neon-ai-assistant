
import { prisma } from '../db/prisma';
import { logger } from '../../utils/logger';

export class DecayService {
    // Half-life in days for different memory types
    private DECAY_CONFIG: Record<string, { halfLife: number }> = {
        FACT: { halfLife: 60 },
        PREFERENCE: { halfLife: 90 },
        PROJECT: { halfLife: 30 },
        INSTRUCTION: { halfLife: 0 }, // Never decays
        KNOWLEDGE: { halfLife: 120 },
        // Fallback
        DEFAULT: { halfLife: 45 }
    };

    /**
     * Calculate new importance score based on time since created/last accessed
     */
    calculateDecay(score: number, type: string, lastActive: Date): number {
        const config = this.DECAY_CONFIG[type] || this.DECAY_CONFIG.DEFAULT;
        if (config.halfLife === 0) return score; // No decay

        const now = new Date();
        const daysSince = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24);

        // Formula: score * (0.5 ^ (days / halfLife))
        const decayFactor = Math.pow(0.5, daysSince / config.halfLife);
        return score * decayFactor;
    }

    /**
     * Run the daily decay process
     */
    async runDailyDecay(): Promise<{ updated: number; removed: number }> {
        logger.info('[DecayService] Starting daily memory decay...');

        try {
            const allEntries = await prisma.memoryEntry.findMany({
                where: { isActive: true },
                select: { id: true, type: true, importanceScore: true, lastAccessedAt: true, createdAt: true }
            });

            let updated = 0;
            let removed = 0;

            for (const entry of allEntries) {
                // Use lastAccessedAt or createdAt as anchor
                const lastActive = entry.lastAccessedAt || entry.createdAt;
                const newScore = this.calculateDecay(entry.importanceScore, entry.type, lastActive);

                // Thresholds
                if (newScore < 0.1) {
                    // Soft delete (forget)
                    await prisma.memoryEntry.update({
                        where: { id: entry.id },
                        data: { isActive: false }
                    });
                    removed++;
                } else if (Math.abs(newScore - entry.importanceScore) > 0.01) {
                    // Update score if changed significantly
                    await prisma.memoryEntry.update({
                        where: { id: entry.id },
                        data: { importanceScore: newScore }
                    });
                    updated++;
                }
            }

            logger.info(`[DecayService] Completed. Updated: ${updated}, Forgotten: ${removed}`);
            return { updated, removed };

        } catch (error) {
            logger.error('[DecayService] Error running decay:', error);
            throw error;
        }
    }

    /**
     * Boost importance when a memory is accessed
     */
    async boostOnAccess(entryId: string): Promise<void> {
        try {
            const entry = await prisma.memoryEntry.findUnique({ where: { id: entryId } });
            if (!entry) return;

            const BOOST_AMOUNT = 0.1; // 10% boost
            const newScore = Math.min(1.0, entry.importanceScore + BOOST_AMOUNT);

            await prisma.memoryEntry.update({
                where: { id: entryId },
                data: {
                    importanceScore: newScore,
                    accessCount: { increment: 1 },
                    lastAccessedAt: new Date()
                }
            });
        } catch (error) {
            logger.error(`[DecayService] Failed to boost memory ${entryId}:`, error);
        }
    }
}

export const decayService = new DecayService();
