import { presenceService, PresenceStatus } from '../presence/PresenceService';
import { prisma } from '../db/prisma';
import { logger } from '../../utils/logger';

// ─────────────────────────────────────────────────────────────
// PROACTIVITY SERVICE - Phase 2: Kontextbewusste AI-Nachrichten
// ─────────────────────────────────────────────────────────────

export interface ProactivityInput {
    userId: string;
    presence: PresenceStatus;
    time: Date;
    recentMessageCount: number;
    emotionalState?: {
        sentiment: string;
        dominantEmotion: string;
        intensity: string;
    };
    todayTodos: number;
    todayEvents: number;
    userName: string;
    // ── Phase 2: Erweiterter Kontext ──
    recentTopics: string[];          // Letzte Gesprächsthemen
    completedTodosToday: number;     // Heute erledigte Aufgaben
    lastConversationTitle?: string;  // Titel der letzten Konversation
    emotionHistory: string[];        // Stimmungsverlauf (letzte 5)
    dayStreak: number;               // Tage in Folge aktiv
    preferredGreeting?: string;      // Gelernte Begrüßungspräferenz
}

export interface ProactivityDecision {
    shouldMessage: boolean;
    message?: string;
    reason?: string;
    type?: string;
    priority?: string;
    useAI?: boolean;       // Phase 2: AI-generierte Nachricht
    aiContext?: string;    // Kontext für AI-Generierung
}

interface Candidate {
    score: number;
    message: string;
    reason: string;
    type: string;
    priority: string;
    useAI?: boolean;
    aiContext?: string;
}

const MIN_SCORE = 0.5;

// System-Prompt für kontextbewusste proaktive Nachrichten
const PROACTIVE_SYSTEM_PROMPT = `Du bist NEON, ein persönlicher KI-Begleiter. Du schreibst eine KURZE proaktive Nachricht an den User.

REGELN:
- Maximal 1-2 Sätze, natürlich und warm
- Auf Deutsch, Du-Form
- Kein Smalltalk, sei direkt aber freundlich
- Beziehe dich auf den gegebenen Kontext
- Keine Emojis im Text (werden vom UI hinzugefügt)
- Stelle eine konkrete Frage oder mache einen Vorschlag
- Sei nicht aufdringlich oder übertrieben enthusiastisch
- Klinge wie ein guter Freund, nicht wie ein Chatbot`;

class ProactivityService {
    private loopInterval: NodeJS.Timeout | null = null;
    private isRunning = false;
    private io: any = null;

    setIO(io: any): void {
        this.io = io;
    }

    // ── Loop-Verwaltung ──

    startLoop(intervalMs: number = 2 * 60 * 1000): void {
        if (this.isRunning) {
            logger.warn('[Proactivity] Loop already running');
            return;
        }

        this.isRunning = true;
        setTimeout(() => this.runCheck(), 30 * 1000);
        this.loopInterval = setInterval(() => this.runCheck(), intervalMs);
        logger.info(`[Proactivity] Loop gestartet (Intervall: ${intervalMs / 1000}s)`);
    }

    stopLoop(): void {
        if (this.loopInterval) {
            clearInterval(this.loopInterval);
            this.loopInterval = null;
        }
        this.isRunning = false;
    }

    // ── Haupt-Check ──

    private async runCheck(): Promise<void> {
        try {
            const activeUsers = presenceService.getActiveUsers();

            for (const userId of activeUsers) {
                if (!presenceService.canSendProactive(userId)) continue;

                const input = await this.buildInput(userId);
                if (!input) continue;

                const decision = this.decide(input);
                if (decision.shouldMessage) {
                    await this.sendProactiveMessage(userId, decision);
                }
            }
        } catch (error) {
            logger.error('[Proactivity] Check-Fehler', { error });
        }
    }

    // ── Phase 2: Erweiterter Kontext-Aufbau ──

    private async buildInput(userId: string): Promise<ProactivityInput | null> {
        const presence = presenceService.getStatus(userId);
        if (!presence) return null;

        // User-Name
        let userName = 'User';
        try {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user) userName = user.name;
        } catch { /* ignore */ }

        // Offene Todos
        let todayTodos = 0;
        try {
            todayTodos = await prisma.todoItem.count({
                where: { userId, status: 'open' },
            });
        } catch { /* ignore */ }

        // Heute erledigte Todos
        let completedTodosToday = 0;
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            completedTodosToday = await prisma.todoItem.count({
                where: {
                    userId,
                    status: 'done',
                    updatedAt: { gte: todayStart },
                },
            });
        } catch { /* ignore */ }

        // Kalender-Termine heute
        let todayEvents = 0;
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            todayEvents = await prisma.calendarEvent.count({
                where: { userId, startDate: { gte: todayStart, lte: todayEnd } },
            });
        } catch { /* ignore */ }

        // Nachrichten heute
        let recentMessageCount = 0;
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            recentMessageCount = await prisma.message.count({
                where: {
                    conversation: { userId },
                    role: 'user',
                    timestamp: { gte: oneDayAgo },
                },
            });
        } catch { /* ignore */ }

        // Phase 2: Letzte Konversation + Themen
        let lastConversationTitle: string | undefined;
        let recentTopics: string[] = [];
        try {
            const recentConvs = await prisma.conversation.findMany({
                where: { userId },
                orderBy: { updatedAt: 'desc' },
                take: 5,
                select: { title: true },
            });
            if (recentConvs.length > 0) {
                lastConversationTitle = recentConvs[0].title || undefined;
                recentTopics = recentConvs
                    .map(c => c.title)
                    .filter((t): t is string => !!t && t !== 'Neue Unterhaltung');
            }
        } catch { /* ignore */ }

        // Phase 2: Emotionaler Zustand + Verlauf
        let emotionalState: ProactivityInput['emotionalState'];
        let emotionHistory: string[] = [];
        try {
            const { emotionService } = await import('../magic/EmotionService');
            const mood = await emotionService.getOverallMood(userId, 1);
            if (mood) {
                emotionalState = {
                    sentiment: mood.averageSentiment,
                    dominantEmotion: mood.topEmotion || 'neutral',
                    intensity: mood.score > 0.5 ? 'high' : mood.score > 0.2 ? 'medium' : 'low',
                };
            }
            // Stimmungsverlauf der letzten 3 Tage
            const history = await emotionService.getEmotionHistory(userId, 3);
            emotionHistory = history
                .slice(-5)
                .map((h: any) => h.sentiment || 'neutral');
        } catch { /* ignore */ }

        // Phase 2: Aktivitäts-Streak (Tage in Folge mit Nachrichten)
        let dayStreak = 0;
        try {
            const days = 14;
            for (let i = 0; i < days; i++) {
                const dayStart = new Date();
                dayStart.setDate(dayStart.getDate() - i);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(dayStart);
                dayEnd.setHours(23, 59, 59, 999);

                const count = await prisma.message.count({
                    where: {
                        conversation: { userId },
                        role: 'user',
                        timestamp: { gte: dayStart, lte: dayEnd },
                    },
                });
                if (count > 0) {
                    dayStreak++;
                } else if (i > 0) { // Heute darf noch leer sein
                    break;
                }
            }
        } catch { /* ignore */ }

        return {
            userId,
            presence,
            time: new Date(),
            recentMessageCount,
            emotionalState,
            todayTodos,
            todayEvents,
            userName,
            recentTopics,
            completedTodosToday,
            lastConversationTitle,
            emotionHistory,
            dayStreak,
        };
    }

    // ── Phase 2: Intelligentere Entscheidungslogik ──

    decide(input: ProactivityInput): ProactivityDecision {
        const candidates: Candidate[] = [];
        const hour = input.time.getHours();
        const todayKey = presenceService.getTodayKey('morning');
        const eveningKey = presenceService.getTodayKey('evening');

        // ─── Begrüßung nach Rückkehr (AI-generiert) ───
        // Nur auslösen wenn der User tatsächlich kürzlich zurückgekehrt ist (State-Wechsel < 5 Min)
        // UND der vorherige State offline/idle war
        const stateChangedMinutesAgo = (Date.now() - input.presence.stateChangedAt) / 60000;
        const wasAbsent = input.presence.previousState === 'offline' || input.presence.previousState === 'idle';
        if (wasAbsent && stateChangedMinutesAgo < 5 && input.presence.state === 'available') {
            const returnKey = presenceService.getTodayKey('presence_return');
            if (!presenceService.hasCheckinDone(input.userId, returnKey)) {
                const contextParts: string[] = [];
                contextParts.push(`User: ${input.userName}`);
                contextParts.push(`Tageszeit: ${this.getTimeOfDayLabel(hour)}`);
                if (input.lastConversationTitle) {
                    contextParts.push(`Letztes Thema: "${input.lastConversationTitle}"`);
                }
                if (input.todayTodos > 0) {
                    contextParts.push(`${input.todayTodos} offene Aufgaben`);
                }
                if (input.completedTodosToday > 0) {
                    contextParts.push(`${input.completedTodosToday} heute erledigt`);
                }
                if (input.dayStreak > 2) {
                    contextParts.push(`${input.dayStreak} Tage Streak`);
                }
                if (input.emotionalState) {
                    contextParts.push(`Stimmung: ${input.emotionalState.sentiment}`);
                }

                candidates.push({
                    score: 0.8,
                    message: '',
                    reason: 'presence_return',
                    type: 'greeting',
                    priority: 'medium',
                    useAI: true,
                    aiContext: `Begrüße den User nach seiner Rückkehr. Beziehe dich auf seinen Kontext.\n${contextParts.join('\n')}`,
                });
            }
        }

        // ─── Morgen-Check-in (7-10 Uhr, AI-generiert) ───
        if (hour >= 7 && hour < 10 && !presenceService.hasCheckinDone(input.userId, todayKey)) {
            const contextParts: string[] = [];
            contextParts.push(`User: ${input.userName}`);
            if (input.todayTodos > 0) contextParts.push(`${input.todayTodos} offene Aufgaben`);
            if (input.todayEvents > 0) contextParts.push(`${input.todayEvents} Termine heute`);
            if (input.dayStreak > 2) contextParts.push(`${input.dayStreak} Tage Streak — erwähne das lobend`);
            if (input.emotionalState?.sentiment === 'negative') {
                contextParts.push('Stimmung gestern war negativ — sei besonders einfühlsam');
            }

            candidates.push({
                score: 0.75,
                message: '',
                reason: 'morning_checkin',
                type: 'routine',
                priority: 'medium',
                useAI: true,
                aiContext: `Morgendliche Begrüßung. Gib einen kurzen Ausblick auf den Tag.\n${contextParts.join('\n')}`,
            });
        }

        // ─── Abend-Summary (19-21 Uhr, AI-generiert) ───
        if (hour >= 19 && hour < 21 && !presenceService.hasCheckinDone(input.userId, eveningKey)) {
            const contextParts: string[] = [];
            contextParts.push(`User: ${input.userName}`);
            if (input.completedTodosToday > 0) contextParts.push(`${input.completedTodosToday} Aufgaben heute erledigt`);
            if (input.todayTodos > 0) contextParts.push(`${input.todayTodos} noch offen`);
            if (input.recentMessageCount > 0) contextParts.push(`${input.recentMessageCount} Nachrichten heute`);
            if (input.recentTopics.length > 0) contextParts.push(`Themen heute: ${input.recentTopics.slice(0, 3).join(', ')}`);

            candidates.push({
                score: 0.6,
                message: '',
                reason: 'evening_summary',
                type: 'routine',
                priority: 'low',
                useAI: true,
                aiContext: `Abend-Rückblick. Fasse zusammen was der User heute geschafft hat und frage ob er Feierabend macht.\n${contextParts.join('\n')}`,
            });
        }

        // ─── Später Abend (nach 23 Uhr) ───
        if (hour >= 23 || hour < 4) {
            const lateKey = presenceService.getTodayKey('late');
            if (!presenceService.hasCheckinDone(input.userId, lateKey)) {
                candidates.push({
                    score: 0.65,
                    message: '',
                    reason: 'late_night',
                    type: 'care',
                    priority: 'low',
                    useAI: true,
                    aiContext: `Es ist spät (${hour} Uhr). User: ${input.userName}. Erinnere sanft daran, dass es spät ist. ${input.todayTodos > 0 ? `${input.todayTodos} offene Aufgaben können morgen erledigt werden.` : ''}`,
                });
            }
        }

        // ─── Emotionale Unterstützung (AI-generiert) ───
        if (input.emotionalState && input.emotionalState.sentiment === 'negative') {
            const contextParts: string[] = [];
            contextParts.push(`User: ${input.userName}`);
            contextParts.push(`Dominante Emotion: ${input.emotionalState.dominantEmotion}`);
            contextParts.push(`Intensität: ${input.emotionalState.intensity}`);
            if (input.emotionHistory.length > 0) {
                contextParts.push(`Stimmungsverlauf: ${input.emotionHistory.join(' → ')}`);
            }

            candidates.push({
                score: 0.85,
                message: '',
                reason: 'emotional_support',
                type: 'care',
                priority: 'high',
                useAI: true,
                aiContext: `Der User scheint belastet. Biete einfühlsam Unterstützung an, ohne aufdringlich zu sein. Frage ob er reden will oder Hilfe bei Aufgaben braucht.\n${contextParts.join('\n')}`,
            });
        }

        // ─── Produktivitäts-Impuls ───
        if (input.presence.state === 'available' && input.recentMessageCount === 0 &&
            input.todayTodos > 0 && hour >= 10 && hour < 18) {
            const prodKey = presenceService.getTodayKey('productivity');
            if (!presenceService.hasCheckinDone(input.userId, prodKey)) {
                candidates.push({
                    score: 0.5,
                    message: '',
                    reason: 'productivity_nudge',
                    type: 'suggestion',
                    priority: 'low',
                    useAI: true,
                    aiContext: `Sanfter Produktivitäts-Impuls. User: ${input.userName}. ${input.todayTodos} offene Aufgaben. Der User war heute noch nicht aktiv. Motiviere kurz ohne Druck.`,
                });
            }
        }

        // ─── Streak-Feier (alle 7 Tage) ───
        if (input.dayStreak > 0 && input.dayStreak % 7 === 0) {
            const streakKey = presenceService.getTodayKey(`streak-${input.dayStreak}`);
            if (!presenceService.hasCheckinDone(input.userId, streakKey)) {
                candidates.push({
                    score: 0.7,
                    message: '',
                    reason: 'streak_celebration',
                    type: 'motivation',
                    priority: 'medium',
                    useAI: true,
                    aiContext: `Feiere den ${input.dayStreak}-Tage-Streak von ${input.userName}! Kurz und motivierend.`,
                });
            }
        }

        // ─── Beste Kandidat wählen ───
        if (candidates.length === 0) {
            return { shouldMessage: false };
        }

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];

        if (best.score < MIN_SCORE) {
            return { shouldMessage: false };
        }

        return {
            shouldMessage: true,
            message: best.message,
            reason: best.reason,
            type: best.type,
            priority: best.priority,
            useAI: best.useAI,
            aiContext: best.aiContext,
        };
    }

    // ── Phase 2: AI-Nachricht generieren ──

    private async generateAIMessage(userId: string, context: string, fallbackUserName: string): Promise<string> {
        try {
            const { aiRouter } = await import('../router/AIRouter');

            const response = await aiRouter.route(
                context,
                [], // Keine Konversationshistorie nötig
                'ollama', // Lokal für Speed + Privatsphäre
                PROACTIVE_SYSTEM_PROMPT
            );

            if (response?.content && response.content.trim().length > 5) {
                // Anführungszeichen entfernen falls die AI welche generiert
                let msg = response.content.trim();
                msg = msg.replace(/^["']|["']$/g, '');
                logger.info(`[Proactivity] AI-Nachricht generiert für ${userId}: "${msg.substring(0, 50)}..."`);
                return msg;
            }
        } catch (error) {
            logger.warn('[Proactivity] AI-Generierung fehlgeschlagen, nutze Fallback', { error: (error as Error).message });
        }

        // Fallback: Statische Nachricht
        return `Hey ${fallbackUserName}! Schön, dass du da bist.`;
    }

    // ── Nachricht senden (DB + WebSocket) ──

    private async sendProactiveMessage(userId: string, decision: ProactivityDecision): Promise<void> {
        try {
            // Duplikat-Check: Gleicher Trigger in letzten 30 Minuten?
            const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
            const existing = await prisma.proactiveMessage.findFirst({
                where: {
                    userId,
                    trigger: decision.reason || 'unknown',
                    createdAt: { gte: thirtyMinAgo },
                },
            });
            if (existing) {
                logger.debug(`[Proactivity] Duplikat verhindert: "${decision.reason}"`);
                return;
            }

            // Phase 2: AI-generierte Nachricht oder statischer Fallback
            let content = decision.message || '';
            if (decision.useAI && decision.aiContext) {
                // User-Name für Fallback laden
                let userName = 'User';
                try {
                    const user = await prisma.user.findUnique({ where: { id: userId } });
                    if (user) userName = user.name;
                } catch { /* ignore */ }

                content = await this.generateAIMessage(userId, decision.aiContext, userName);
            }

            if (!content || content.trim().length === 0) return;

            // In DB speichern
            const saved = await prisma.proactiveMessage.create({
                data: {
                    userId,
                    content,
                    type: decision.type || 'suggestion',
                    trigger: decision.reason || 'unknown',
                    priority: decision.priority || 'medium',
                },
            });

            // WebSocket Push
            if (this.io) {
                this.io.to(`user:${userId}`).emit('proactive-message', {
                    id: saved.id,
                    content,
                    type: decision.type,
                    trigger: decision.reason,
                    reason: decision.reason,
                    priority: decision.priority,
                    createdAt: saved.createdAt,
                });
                logger.info(`[Proactivity] Nachricht gesendet an ${userId}: "${decision.reason}" (AI: ${!!decision.useAI})`);
            }

            // Cooldown + Checkin markieren
            presenceService.markProactiveSent(userId);
            this.markCheckinForReason(decision.reason, userId);

        } catch (error) {
            logger.error('[Proactivity] Fehler beim Senden', { error, userId });
        }
    }

    private markCheckinForReason(reason: string | undefined, userId: string): void {
        const map: Record<string, string> = {
            'presence_return': 'presence_return',
            'morning_checkin': 'morning',
            'evening_summary': 'evening',
            'late_night': 'late',
            'productivity_nudge': 'productivity',
        };
        const key = reason ? map[reason] : undefined;
        if (key) {
            presenceService.markCheckinDone(userId, presenceService.getTodayKey(key));
        }
        // Streak-Feier markieren
        if (reason?.startsWith('streak_')) {
            presenceService.markCheckinDone(userId, presenceService.getTodayKey(reason));
        }
    }

    private getTimeOfDayLabel(hour: number): string {
        if (hour >= 5 && hour < 10) return 'Morgen';
        if (hour >= 10 && hour < 12) return 'Vormittag';
        if (hour >= 12 && hour < 14) return 'Mittag';
        if (hour >= 14 && hour < 18) return 'Nachmittag';
        if (hour >= 18 && hour < 21) return 'Abend';
        return 'Nacht';
    }

    // ── Öffentliche Methoden ──

    async triggerForUser(userId: string): Promise<void> {
        if (!presenceService.canSendProactive(userId)) return;

        const input = await this.buildInput(userId);
        if (!input) return;

        const decision = this.decide(input);
        if (decision.shouldMessage) {
            await this.sendProactiveMessage(userId, decision);
        }
    }
}

export const proactivityService = new ProactivityService();
