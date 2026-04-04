/**
 * Bandit Selector - UCB1 Algorithm
 *
 * Multi-Armed Bandit for intelligent model selection.
 * Uses UCB1 (Upper Confidence Bound) to balance exploration vs exploitation.
 *
 * Each "arm" is a (domain, provider) pair.
 * The reward signal comes from user feedback:
 *   - "good" → reward 1.0
 *   - "bad" → reward 0.0
 *   - "wrong_model" → reward -0.5 (penalize)
 *   - no feedback → reward 0.5 (neutral)
 *
 * The algorithm automatically learns which provider works best
 * for each task type over time.
 */

import { logger } from '../../utils/logger';
import { AIProvider, MessageDomain } from './AIRouter';
import { routingLogger } from './RoutingLogger';

export interface BanditArm {
    provider: AIProvider;
    domain: MessageDomain;
    pulls: number;          // How many times this arm was chosen
    totalReward: number;    // Sum of rewards
    avgReward: number;      // Average reward
    ucb1Score: number;      // UCB1 score (higher = more worth exploring)
}

interface BanditConfig {
    explorationWeight: number;  // UCB1 exploration parameter (default: sqrt(2))
    minPullsBeforeUse: number;  // Minimum pulls before using bandit scores
    decayFactor: number;        // How much to decay old data (0-1, 1 = no decay)
}

const DEFAULT_CONFIG: BanditConfig = {
    explorationWeight: Math.SQRT2,
    minPullsBeforeUse: 5,
    decayFactor: 0.98,
};

class BanditSelector {
    private arms = new Map<string, BanditArm>();
    private totalPulls = 0;
    private config: BanditConfig;

    constructor(config?: Partial<BanditConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Get the recommended provider for a domain
     * Returns null if not enough data yet (fall back to default routing)
     */
    recommend(
        domain: MessageDomain,
        availableProviders: AIProvider[] = ['ollama', 'claude', 'hybrid']
    ): AIProvider | null {
        // Check if we have enough data
        const domainArms = availableProviders.map(p => ({
            provider: p,
            arm: this.arms.get(this.armKey(domain, p)),
        }));

        const totalDomainPulls = domainArms.reduce(
            (sum, a) => sum + (a.arm?.pulls || 0), 0
        );

        // Not enough data - let default routing decide
        if (totalDomainPulls < this.config.minPullsBeforeUse * availableProviders.length) {
            return null;
        }

        // Calculate UCB1 scores
        let bestProvider: AIProvider | null = null;
        let bestScore = -Infinity;

        for (const { provider, arm } of domainArms) {
            if (!arm || arm.pulls === 0) {
                // Unexplored arm gets infinite score (explore first)
                return provider;
            }

            const exploitation = arm.avgReward;
            const exploration = this.config.explorationWeight *
                Math.sqrt(Math.log(this.totalPulls) / arm.pulls);

            arm.ucb1Score = exploitation + exploration;

            if (arm.ucb1Score > bestScore) {
                bestScore = arm.ucb1Score;
                bestProvider = provider;
            }
        }

        if (bestProvider) {
            logger.debug(`[Bandit] Recommends ${bestProvider} for domain ${domain} (UCB1: ${bestScore.toFixed(3)})`);
        }

        return bestProvider;
    }

    /**
     * Record a reward for a (domain, provider) pair
     */
    recordReward(
        domain: MessageDomain,
        provider: AIProvider,
        reward: number
    ): void {
        const key = this.armKey(domain, provider);
        let arm = this.arms.get(key);

        if (!arm) {
            arm = {
                provider,
                domain,
                pulls: 0,
                totalReward: 0,
                avgReward: 0.5,
                ucb1Score: 0,
            };
            this.arms.set(key, arm);
        }

        arm.pulls++;
        arm.totalReward += reward;
        arm.avgReward = arm.totalReward / arm.pulls;
        this.totalPulls++;

        logger.debug(`[Bandit] Reward ${reward.toFixed(2)} for ${provider}/${domain} (avg: ${arm.avgReward.toFixed(3)}, pulls: ${arm.pulls})`);
    }

    /**
     * Convert user feedback to reward signal
     */
    feedbackToReward(feedback: 'good' | 'bad' | 'wrong_model' | undefined): number {
        switch (feedback) {
            case 'good': return 1.0;
            case 'bad': return 0.0;
            case 'wrong_model': return -0.5;
            default: return 0.5; // No feedback = neutral
        }
    }

    /**
     * Update arms from routing logger stats
     */
    updateFromStats(): void {
        const stats = routingLogger.getStats();

        for (const [key, score] of stats) {
            let arm = this.arms.get(key);
            if (!arm) {
                arm = {
                    provider: score.provider,
                    domain: score.domain,
                    pulls: 0,
                    totalReward: 0,
                    avgReward: 0.5,
                    ucb1Score: 0,
                };
                this.arms.set(key, arm);
            }

            // Update from stats
            arm.pulls = score.totalAttempts;

            const feedbackTotal = score.successes + score.failures + score.wrongModel;
            if (feedbackTotal > 0) {
                const reward = (score.successes * 1.0 + score.failures * 0.0 + score.wrongModel * -0.5) / feedbackTotal;
                arm.avgReward = reward;
                arm.totalReward = reward * feedbackTotal;
            }

            this.totalPulls = Math.max(this.totalPulls, arm.pulls);
        }

        logger.info(`[Bandit] Updated from stats: ${this.arms.size} arms, ${this.totalPulls} total pulls`);
    }

    /**
     * Apply time decay to all arms (makes recent feedback more important)
     */
    applyDecay(): void {
        for (const arm of this.arms.values()) {
            arm.totalReward *= this.config.decayFactor;
            arm.pulls = Math.max(1, Math.floor(arm.pulls * this.config.decayFactor));
            arm.avgReward = arm.pulls > 0 ? arm.totalReward / arm.pulls : 0.5;
        }
        this.totalPulls = Math.floor(this.totalPulls * this.config.decayFactor);
    }

    /**
     * Get all arm scores (for UI/debugging)
     */
    getScores(): BanditArm[] {
        return Array.from(this.arms.values()).sort((a, b) => {
            if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
            return b.ucb1Score - a.ucb1Score;
        });
    }

    /**
     * Get best provider per domain
     */
    getBestProviders(): Map<MessageDomain, { provider: AIProvider; score: number }> {
        const best = new Map<MessageDomain, { provider: AIProvider; score: number }>();

        for (const arm of this.arms.values()) {
            const current = best.get(arm.domain);
            if (!current || arm.avgReward > current.score) {
                best.set(arm.domain, { provider: arm.provider, score: arm.avgReward });
            }
        }

        return best;
    }

    private armKey(domain: MessageDomain, provider: AIProvider): string {
        return `${domain}:${provider}`;
    }
}

export const banditSelector = new BanditSelector();
