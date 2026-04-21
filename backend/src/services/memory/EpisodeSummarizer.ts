/**
 * NEON Memory System 2.0 - Episode Summarizer
 *
 * Nach jeder Conversation: 1 EPISODIC-Memory statt 5 lose Fact-Snippets.
 * Format: "21.04.2026: Thorben arbeitet am Voice-Modus und testet neue Stimmen"
 *
 * Laeuft parallel zur normalen ExtractionService-Pipeline:
 *   - Extraction: holt einzelne Facts/Preferences/Projects heraus
 *   - Summarizer: schreibt EINEN Episode-Eintrag ueber die Session
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { memoryGatekeeper } from './MemoryGatekeeper';
import { MEMORY_TYPE } from './MemoryTypes';

export interface ConversationForSummary {
    id: string;
    userId: string;
    createdAt: Date;
    messages: Array<{ role: string; content: string }>;
}

const MIN_USER_MESSAGES = 2; // Unter 2 User-Messages lohnt sich kein Episode-Eintrag
const MAX_EPISODE_LENGTH = 400;

export class EpisodeSummarizer {
    private ollamaUrl: string;
    private model: string;
    private prisma: PrismaClient;

    constructor(
        prisma: PrismaClient = new PrismaClient(),
        ollamaUrl: string = 'http://localhost:11434',
        model: string = process.env.OLLAMA_MODEL || 'gemma3:12b',
    ) {
        this.prisma = prisma;
        this.ollamaUrl = ollamaUrl;
        this.model = model;
    }

    async summarize(conv: ConversationForSummary): Promise<string | null> {
        const userMessages = conv.messages.filter(m => m.role === 'user' || m.role === 'USER');
        if (userMessages.length < MIN_USER_MESSAGES) {
            logger.debug('[Episode] skip - too few user messages');
            return null;
        }

        // Erst Rule-Based (schnell, ohne LLM)
        const ruleBased = this.ruleBasedSummary(conv);
        if (ruleBased) {
            logger.debug('[Episode] rule-based summary used');
            return ruleBased;
        }

        // Fallback: LLM-Summary
        const llmSummary = await this.llmSummary(conv);
        return llmSummary;
    }

    /** Versucht eine kompakte Summary ohne LLM. */
    private ruleBasedSummary(conv: ConversationForSummary): string | null {
        const userMsgs = conv.messages
            .filter(m => (m.role === 'user' || m.role === 'USER') && m.content?.trim())
            .map(m => m.content.trim());
        if (userMsgs.length === 0) return null;

        // Stark strukturierte Pattern: wenn User nur Fragen stellt, ist's Smalltalk → skip
        const questionRatio = userMsgs.filter(m => m.includes('?')).length / userMsgs.length;
        if (questionRatio > 0.8) return null;

        // Sammle Topics: laengste Substantiv-Phrasen pro Nachricht
        const topics = userMsgs
            .map(m => this.extractTopicFragment(m))
            .filter((t): t is string => !!t);
        if (topics.length === 0) return null;

        const date = this.formatDate(conv.createdAt);
        // Nimm die 2 laengsten Topics
        const top = Array.from(new Set(topics)).sort((a, b) => b.length - a.length).slice(0, 2);
        const joined = top.join(' und ');
        const summary = `${date}: Sitzung zu ${joined}`.slice(0, MAX_EPISODE_LENGTH);
        if (summary.length < 25) return null;
        return summary;
    }

    private extractTopicFragment(msg: string): string | null {
        // Erste sinnvolle Phrase extrahieren: >3 Woerter, nicht nur Frage
        const cleaned = msg.replace(/\s+/g, ' ').trim();
        if (cleaned.length < 15) return null;
        // Nehme ersten Satz
        const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0];
        return firstSentence.slice(0, 120);
    }

    /** LLM-basierte Summary: 1 Satz ueber die Session. */
    private async llmSummary(conv: ConversationForSummary): Promise<string | null> {
        const lastN = conv.messages.slice(-20); // Letzte 20 Messages genuegen
        const transcript = lastN
            .map(m => `${(m.role || '').toUpperCase()}: ${m.content}`)
            .join('\n')
            .slice(0, 6000);

        const prompt = `Fasse die folgende Konversation in EINEM deutschen Satz (max 200 Zeichen) zusammen.
Format: "Thorben hat [Aktion] bzgl. [Thema]" oder "Sitzung zu [Thema]: [was passierte]".
KEINE Anfuehrungszeichen, KEINE Aufzaehlungen, KEINE Listen. Nur 1 Satz.
Wenn die Konversation zu banal ist (Smalltalk, Begruessung), antworte mit "SKIP".

KONVERSATION:
${transcript}

SATZ:`;

        try {
            const resp = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt,
                    stream: false,
                    options: { temperature: 0.2, num_predict: 120 },
                }),
            });
            const data = await resp.json() as any;
            const raw = (data.response || '').trim();
            if (!raw || raw.toUpperCase().startsWith('SKIP')) return null;

            // Bereinigen: Anfuehrungszeichen, Praefix-Wiederholung
            let clean = raw.replace(/^SATZ:\s*/i, '').replace(/^["„»]+|["“«]+$/g, '').trim();
            clean = clean.split('\n')[0].trim();
            if (clean.length < 25) return null;

            const date = this.formatDate(conv.createdAt);
            const prefixed = clean.startsWith(date) ? clean : `${date}: ${clean}`;
            return prefixed.slice(0, MAX_EPISODE_LENGTH);
        } catch (e) {
            logger.warn('[Episode] LLM summary failed', { err: (e as Error).message });
            return null;
        }
    }

    private formatDate(d: Date): string {
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    }

    /**
     * Erstellt EINE EPISODIC-Memory-Entry fuer die Conversation und speichert
     * ueber den Gatekeeper. Returns entryId oder null wenn nichts Sinnvolles rauskam.
     */
    async persistEpisodeForConversation(conversationId: string): Promise<string | null> {
        const conv = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: { orderBy: { timestamp: 'asc' } },
            },
        });
        if (!conv) {
            logger.warn('[Episode] conversation not found', { conversationId });
            return null;
        }

        const summary = await this.summarize({
            id: conv.id,
            userId: conv.userId,
            createdAt: conv.createdAt,
            messages: conv.messages.map(m => ({ role: m.role, content: m.content })),
        });
        if (!summary) {
            logger.debug('[Episode] no summary produced', { conversationId });
            return null;
        }

        const result = await memoryGatekeeper.save({
            userId: conv.userId,
            type: MEMORY_TYPE.EPISODIC,
            content: summary,
            summary: summary.slice(0, 100),
            importance: 0.55, // Mittlere Importance - spezifische Episoden, kein Fakt
            tags: ['episode', 'session'],
        });

        if (result.status === 'created' || result.status === 'replaced') {
            logger.info(`[Episode] ${result.status} ${result.entryId?.slice(0, 8)}: "${summary.slice(0, 80)}"`);
            return result.entryId || null;
        } else {
            logger.info(`[Episode] ${result.status}: ${result.reason || ''}`);
            return null;
        }
    }
}

export const episodeSummarizer = new EpisodeSummarizer();
