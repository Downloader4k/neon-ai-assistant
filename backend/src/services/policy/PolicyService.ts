import { logger } from '../../utils/logger';

export interface NeonPolicy {
    // 1. Model & Cost Control
    allowClaude: boolean;          // Can we use expensive models?

    // 2. Core Behavior (Hard Rules)
    honestyRequired: boolean;      // Must admit ignorance? (No guessing)
    forbidSpeculation: boolean;    // Block guessing entirely?
    emotionalDomainsLocalOnly: boolean; // Keep feelings local (Privacy)?

    // 3. Tone & Style (Dynamic Injection)
    responseStyle: 'calm' | 'analytical' | 'empathetic' | 'concise' | 'creative';

    // 4. Output Constraints
    maxSentenceLength?: number;    // Soft limit for conciseness
    forbiddenPhrases?: string[];   // e.g. ["As an AI...", "I apologize"]
}

export type PolicyContext = 'coding' | 'chat' | 'planning' | 'emotional' | 'default';

export class PolicyService {

    /**
     * STANDARD POLICY
     * Balanced for general assistance.
     */
    private readonly STANDARD_POLICY: NeonPolicy = {
        allowClaude: true,
        honestyRequired: true,
        forbidSpeculation: false, // Educated guesses allowed
        emotionalDomainsLocalOnly: true,
        responseStyle: 'calm',
        forbiddenPhrases: ["Als KI-Modell", "As an AI language model"]
    };

    /**
     * CODING POLICY (Strict)
     * Focused on correctness, no fluff.
     */
    private readonly CODING_POLICY: NeonPolicy = {
        allowClaude: true, // Need smart model for code
        honestyRequired: true,
        forbidSpeculation: true, // Code must work
        emotionalDomainsLocalOnly: true,
        responseStyle: 'concise',
        forbiddenPhrases: ["Ich hoffe das hilft"]
    };

    /**
     * EMOTIONAL POLICY (Soft)
     * Focused on empathy and conversation.
     */
    private readonly EMOTIONAL_POLICY: NeonPolicy = {
        allowClaude: false, // Keep personal talks local!
        honestyRequired: false, // Social white lies allowed? (Maybe not, strict honesty is key for Neon)
        forbidSpeculation: false,
        emotionalDomainsLocalOnly: true,
        responseStyle: 'empathetic',
        forbiddenPhrases: []
    };

    /**
     * PLANNING POLICY
     * Analytical, structured, long-term thinking.
     */
    private readonly PLANNING_POLICY: NeonPolicy = {
        allowClaude: true,
        honestyRequired: true,
        forbidSpeculation: false,
        emotionalDomainsLocalOnly: true,
        responseStyle: 'analytical',
        forbiddenPhrases: []
    };

    /**
     * Get the appropriate policy for a given context.
     * @param contextType - The type of interaction detected by the Router.
     */
    public getPolicy(contextType: PolicyContext): NeonPolicy {
        logger.info(`[PolicyService] Selecting policy for context: ${contextType}`);

        switch (contextType) {
            case 'coding':
                return this.CODING_POLICY;
            case 'emotional':
                return this.EMOTIONAL_POLICY;
            case 'planning':
                return this.PLANNING_POLICY;
            case 'chat':
                return this.EMOTIONAL_POLICY; // Chat often implies social/emotional connection
            default:
                return this.STANDARD_POLICY;
        }
    }

    /**
     * Enforce Policy Rules (Pre-Check)
     * Can be used to block actions before they happen.
     */
    public enforcePreCheck(policy: NeonPolicy, action: 'use_claude' | 'speculate'): boolean {
        if (action === 'use_claude' && !policy.allowClaude) {
            logger.warn('[PolicyService] Blocked Claude usage due to policy restriction.');
            return false;
        }
        return true;
    }
}

export const policyService = new PolicyService();
