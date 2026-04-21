/**
 * Routing Logger
 *
 * Logs every routing decision for the learning orchestrator.
 * Stores: message domain, chosen provider, complexity scores,
 * response time, and user feedback.
 */

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

        // Memory 2.0: Routing-Telemetrie gehoert NICHT in memory_entries.
        // Wir halten nur den In-Memory-Ring-Buffer (recentDecisions) und
        // schreiben ins Log-File. Fuer persistente Stats spaeter eine
        // dedizierte Tabelle (routing_decisions) anlegen.
        const id = `rt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        entry.id = id;
        logger.debug('[RoutingLogger] Decision logged (in-memory only)', {
            domain: decision.domain,
            provider: decision.chosenProvider,
            complexity: decision.complexityScore,
        });
        return id;
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

        // Feedback wird nur in-memory gehalten (siehe logDecision).
        logger.info(`[RoutingLogger] Feedback recorded: ${feedback} for message ${messageId}`);
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
     * Load historical decisions from database.
     * Memory 2.0: Routing-Logs werden nicht mehr persistiert - Stats starten leer.
     * Fuer persistente Historie spaeter eine eigene Tabelle (routing_decisions) anlegen.
     */
    async loadHistory(): Promise<void> {
        logger.info('[RoutingLogger] Memory 2.0: keine persistente Historie (in-memory only)');
    }
}

export const routingLogger = new RoutingLogger();
