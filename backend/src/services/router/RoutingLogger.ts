/**
 * Routing Logger
 *
 * Logs every routing decision for the learning orchestrator.
 * Stores: message domain, chosen provider, complexity scores,
 * response time, and user feedback.
 */

import { prisma } from '../db/prisma';
import { logger } from '../../utils/logger';
import { AIProvider, MessageDomain } from './AIRouter';

export interface RoutingDecision {
    id?: string;
    timestamp: Date;
    userId: string;
    conversationId?: string;
    messageId?: string;
    domain: MessageDomain;
    chosenProvider: AIProvider;
    complexityScore: number;
    selfConfidence: number;
    responseTimeMs: number;
    feedback?: 'good' | 'bad' | 'wrong_model';
    feedbackTimestamp?: Date;
}

export interface ModelScore {
    provider: AIProvider;
    domain: MessageDomain;
    totalAttempts: number;
    successes: number;       // good feedback count
    failures: number;        // bad feedback count
    wrongModel: number;      // wrong_model feedback count
    avgResponseTimeMs: number;
    score: number;           // UCB1 score
    lastUpdated: Date;
}

class RoutingLogger {
    private recentDecisions: RoutingDecision[] = [];
    private maxRecentDecisions = 500;

    /**
     * Log a routing decision
     */
    async logDecision(decision: Omit<RoutingDecision, 'id' | 'timestamp'>): Promise<string> {
        const entry: RoutingDecision = {
            ...decision,
            timestamp: new Date(),
        };

        // Store in memory for quick access
        this.recentDecisions.push(entry);
        if (this.recentDecisions.length > this.maxRecentDecisions) {
            this.recentDecisions.shift();
        }

        // Persist to database
        try {
            const dbEntry = await prisma.memoryEntry.create({
                data: {
                    userId: decision.userId || 'system',
                    type: 'INSTRUCTION',
                    content: `[ROUTING_LOG] domain=${decision.domain} provider=${decision.chosenProvider} complexity=${decision.complexityScore.toFixed(2)} confidence=${decision.selfConfidence.toFixed(2)} responseTime=${decision.responseTimeMs}ms`,
                    importanceScore: 0.1, // Low importance - just metrics
                    isActive: true,
                },
            });

            entry.id = dbEntry.id;
            logger.debug('[RoutingLogger] Decision logged', {
                domain: decision.domain,
                provider: decision.chosenProvider,
                complexity: decision.complexityScore,
            });

            return dbEntry.id;
        } catch (error) {
            logger.error('[RoutingLogger] Failed to persist decision', { error });
            return '';
        }
    }

    /**
     * Record user feedback for a routing decision
     */
    async recordFeedback(
        messageId: string,
        feedback: 'good' | 'bad' | 'wrong_model'
    ): Promise<void> {
        // Find the decision in memory
        const decision = this.recentDecisions.find(d => d.messageId === messageId);
        if (decision) {
            decision.feedback = feedback;
            decision.feedbackTimestamp = new Date();
        }

        // Update in database
        try {
            if (decision?.id) {
                await prisma.memoryEntry.update({
                    where: { id: decision.id },
                    data: {
                        content: `[ROUTING_LOG] domain=${decision.domain} provider=${decision.chosenProvider} complexity=${decision.complexityScore.toFixed(2)} confidence=${decision.selfConfidence.toFixed(2)} responseTime=${decision.responseTimeMs}ms feedback=${feedback}`,
                    },
                });
            }

            logger.info(`[RoutingLogger] Feedback recorded: ${feedback} for message ${messageId}`);
        } catch (error) {
            logger.error('[RoutingLogger] Failed to record feedback', { error });
        }
    }

    /**
     * Get routing statistics per domain and provider
     */
    getStats(): Map<string, ModelScore> {
        const stats = new Map<string, ModelScore>();

        for (const decision of this.recentDecisions) {
            const key = `${decision.domain}:${decision.chosenProvider}`;

            if (!stats.has(key)) {
                stats.set(key, {
                    provider: decision.chosenProvider,
                    domain: decision.domain,
                    totalAttempts: 0,
                    successes: 0,
                    failures: 0,
                    wrongModel: 0,
                    avgResponseTimeMs: 0,
                    score: 0.5,
                    lastUpdated: new Date(),
                });
            }

            const s = stats.get(key)!;
            s.totalAttempts++;

            // Update avg response time
            s.avgResponseTimeMs =
                (s.avgResponseTimeMs * (s.totalAttempts - 1) + decision.responseTimeMs) /
                s.totalAttempts;

            // Update feedback counts
            if (decision.feedback === 'good') s.successes++;
            if (decision.feedback === 'bad') s.failures++;
            if (decision.feedback === 'wrong_model') s.wrongModel++;

            s.lastUpdated = decision.timestamp;
        }

        return stats;
    }

    /**
     * Get recent decisions (for debugging/UI)
     */
    getRecentDecisions(limit: number = 50): RoutingDecision[] {
        return this.recentDecisions.slice(-limit);
    }

    /**
     * Load historical decisions from database
     */
    async loadHistory(): Promise<void> {
        try {
            const entries = await prisma.memoryEntry.findMany({
                where: {
                    content: { startsWith: '[ROUTING_LOG]' },
                },
                orderBy: { createdAt: 'desc' },
                take: this.maxRecentDecisions,
            });

            for (const entry of entries.reverse()) {
                const match = entry.content.match(
                    /domain=(\w+) provider=(\w+) complexity=([\d.]+) confidence=([\d.]+) responseTime=(\d+)ms(?:\s+feedback=(\w+))?/
                );

                if (match) {
                    this.recentDecisions.push({
                        id: entry.id,
                        timestamp: entry.createdAt,
                        userId: entry.userId,
                        domain: match[1] as MessageDomain,
                        chosenProvider: match[2] as AIProvider,
                        complexityScore: parseFloat(match[3]),
                        selfConfidence: parseFloat(match[4]),
                        responseTimeMs: parseInt(match[5]),
                        feedback: match[6] as any,
                    });
                }
            }

            logger.info(`[RoutingLogger] Loaded ${this.recentDecisions.length} historical decisions`);
        } catch (error) {
            logger.error('[RoutingLogger] Failed to load history', { error });
        }
    }
}

export const routingLogger = new RoutingLogger();
