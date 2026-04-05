import { presenceService, PresenceStatus } from '../presence/PresenceService';
import { prisma } from '../db/prisma';
import { logger } from '../../utils/logger';

// ─────────────────────────────────────────────────────────────
// PROACTIVITY SERVICE - Entscheidet wann NEON sich meldet
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
}

export interface ProactivityDecision {
    shouldMessage: boolean;
    message?: string;
    reason?: string;
    type?: string;
    priority?: string;
}

interface Candidate {
    score: number;
    message: string;
    reason: string;
    type: string;
    priority: string;
}

const MIN_SCORE = 0.5;

class ProactivityService {
    private loopInterval: NodeJS.Timeout | null = null;
    private isRunning = false;

    // IO-Instanz fuer WebSocket-Push
    private io: any = null;

    setIO(io: any): void {
        this.io = io;
    }

    /**
     * Proaktivitaets-Loop starten
     */
    startLoop(intervalMs: number = 2 * 60 * 1000): void {
        if (this.isRunning) {
            logger.warn('[Proactivity] Loop already running');
            return;
        }

        this.isRunning = true;

        // Erster Check nach 30 Sekunden (nicht sofort beim Start)
        setTimeout(() => {
            this.runCheck();
        }, 30 * 1000);

        // Danach regelmaessig
        this.loopInterval = setInterval(() => {
            this.runCheck();
        }, intervalMs);

        logger.info(`[Proactivity] Loop gestartet (Intervall: ${intervalMs / 1000}s)`);
    }

    /**
     * Loop stoppen
     */
    stopLoop(): void {
        if (this.loopInterval) {
            clearInterval(this.loopInterval);
            this.loopInterval = null;
        }
        this.isRunning = false;
        logger.info('[Proactivity] Loop gestoppt');
    }

    /**
     * Einen Check-Durchlauf fuer alle aktiven User
     */
    private async runCheck(): Promise<void> {
        try {
            const activeUsers = presenceService.getActiveUsers();

            for (const userId of activeUsers) {
                // Cooldown pruefen
                if (!presenceService.canSendProactive(userId)) {
                    continue;
                }

                const input = await this.buildInput(userId);
                if (!input) continue;

                const decision = this.decide(input);

                if (decision.shouldMessage && decision.message) {
                    await this.sendProactiveMessage(userId, decision);
                }
            }
        } catch (error) {
            logger.error('[Proactivity] Check-Fehler', { error });
        }
    }

    /**
     * Input fuer einen User zusammenbauen
     */
    private async buildInput(userId: string): Promise<ProactivityInput | null> {
        const presence = presenceService.getStatus(userId);
        if (!presence) return null;

        // User-Name laden
        let userName = 'User';
        try {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user) userName = user.name;
        } catch { /* ignore */ }

        // Heutige Todos zaehlen
        let todayTodos = 0;
        try {
            todayTodos = await prisma.todoItem.count({
                where: { userId, status: 'open' },
            });
        } catch { /* ignore */ }

        // Heutige Kalender-Termine zaehlen
        let todayEvents = 0;
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            todayEvents = await prisma.calendarEvent.count({
                where: {
                    userId,
                    startDate: { gte: todayStart, lte: todayEnd },
                },
            });
        } catch { /* ignore */ }

        // Letzte Nachrichten zaehlen (heute)
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

        // Emotionalen Zustand laden
        let emotionalState: ProactivityInput['emotionalState'];
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
        };
    }

    /**
     * Entscheidung treffen ob und was gesendet wird
     */
    decide(input: ProactivityInput): ProactivityDecision {
        const candidates: Candidate[] = [];
        const hour = input.time.getHours();
        const todayKey = presenceService.getTodayKey('morning');
        const eveningKey = presenceService.getTodayKey('evening');

        // ─── Begruesssung nach Rueckkehr ───
        if (input.presence.previousState === 'offline' || input.presence.previousState === 'idle') {
            const idleMinutes = (Date.now() - input.presence.stateChangedAt) / 60000;
            if (idleMinutes < 5) { // Gerade erst zurueckgekommen
                candidates.push({
                    score: 0.8,
                    message: `Hey ${input.userName}! Schön, dass du wieder da bist. Willst du weitermachen, wo wir aufgehört haben?`,
                    reason: 'presence_return',
                    type: 'greeting',
                    priority: 'medium',
                });
            }
        }

        // ─── Morgen-Check-in (7-10 Uhr) ───
        if (hour >= 7 && hour < 10 && !presenceService.hasCheckinDone(input.userId, todayKey)) {
            let morningMsg = `Guten Morgen, ${input.userName}!`;

            if (input.todayEvents > 0 || input.todayTodos > 0) {
                const parts: string[] = [];
                if (input.todayTodos > 0) parts.push(`${input.todayTodos} offene Aufgabe${input.todayTodos > 1 ? 'n' : ''}`);
                if (input.todayEvents > 0) parts.push(`${input.todayEvents} Termin${input.todayEvents > 1 ? 'e' : ''}`);
                morningMsg += ` Du hast heute ${parts.join(' und ')}. Soll ich dir einen Überblick geben?`;
            } else {
                morningMsg += ' Ein freier Tag — willst du etwas Neues anfangen oder entspannen?';
            }

            candidates.push({
                score: 0.75,
                message: morningMsg,
                reason: 'morning_checkin',
                type: 'routine',
                priority: 'medium',
            });
        }

        // ─── Abend-Summary (19-21 Uhr) ───
        if (hour >= 19 && hour < 21 && !presenceService.hasCheckinDone(input.userId, eveningKey)) {
            candidates.push({
                score: 0.6,
                message: `Hey ${input.userName}, der Tag neigt sich. Soll ich dir zusammenfassen, was du heute geschafft hast?`,
                reason: 'evening_summary',
                type: 'routine',
                priority: 'low',
            });
        }

        // ─── Spaeter Abend (nach 23 Uhr) ───
        if (hour >= 23 || hour < 4) {
            const lateKey = presenceService.getTodayKey('late');
            if (!presenceService.hasCheckinDone(input.userId, lateKey)) {
                candidates.push({
                    score: 0.65,
                    message: `Es ist schon spät, ${input.userName}. Soll ich deine offenen Aufgaben für morgen sortieren?`,
                    reason: 'late_night',
                    type: 'care',
                    priority: 'low',
                });
            }
        }

        // ─── Emotionale Unterstuetzung ───
        if (input.emotionalState && input.emotionalState.sentiment === 'negative') {
            candidates.push({
                score: 0.85,
                message: `Du wirkst gerade etwas belastet, ${input.userName}. Soll ich dir helfen, deine Aufgaben zu strukturieren oder willst du einfach reden?`,
                reason: 'emotional_support',
                type: 'care',
                priority: 'high',
            });
        }

        // ─── Produktivitaets-Impuls (wenn lange nichts geschrieben) ───
        if (input.presence.state === 'available' && input.recentMessageCount === 0 &&
            input.todayTodos > 0 && hour >= 10 && hour < 18) {
            const prodKey = presenceService.getTodayKey('productivity');
            if (!presenceService.hasCheckinDone(input.userId, prodKey)) {
                candidates.push({
                    score: 0.5,
                    message: `Du hast noch ${input.todayTodos} offene Aufgabe${input.todayTodos > 1 ? 'n' : ''}. Willst du eine davon angehen?`,
                    reason: 'productivity_nudge',
                    type: 'suggestion',
                    priority: 'low',
                });
            }
        }

        // ─── Beste Kandidat waehlen ───
        if (candidates.length === 0) {
            return { shouldMessage: false };
        }

        // Nach Score sortieren, hoechster zuerst
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
        };
    }

    /**
     * Proaktive Nachricht senden (DB + WebSocket)
     */
    private async sendProactiveMessage(userId: string, decision: ProactivityDecision): Promise<void> {
        if (!decision.message) return;

        try {
            // Duplikat-Check: Gleiche Nachricht in den letzten 30 Minuten (egal ob gelesen oder nicht)?
            const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
            const existing = await prisma.proactiveMessage.findFirst({
                where: {
                    userId,
                    trigger: decision.reason || 'unknown',
                    createdAt: { gte: thirtyMinAgo },
                },
            });
            if (existing) {
                logger.debug(`[Proactivity] Duplikat verhindert für ${userId}: "${decision.reason}" (letzte vor ${Math.round((Date.now() - existing.createdAt.getTime()) / 1000)}s)`);
                return;
            }

            // In DB speichern
            const saved = await prisma.proactiveMessage.create({
                data: {
                    userId,
                    content: decision.message,
                    type: decision.type || 'suggestion',
                    trigger: decision.reason || 'unknown',
                    priority: decision.priority || 'medium',
                },
            });

            // Ueber WebSocket pushen (Echtzeit!)
            if (this.io) {
                this.io.to(`user:${userId}`).emit('proactive-message', {
                    id: saved.id,
                    content: decision.message,
                    type: decision.type,
                    reason: decision.reason,
                    priority: decision.priority,
                    createdAt: saved.createdAt,
                });
                logger.info(`[Proactivity] Nachricht gesendet an ${userId}: "${decision.reason}"`);
            }

            // Cooldown setzen
            presenceService.markProactiveSent(userId);

            // Check-in als erledigt markieren
            if (decision.reason === 'morning_checkin') {
                presenceService.markCheckinDone(userId, presenceService.getTodayKey('morning'));
            } else if (decision.reason === 'evening_summary') {
                presenceService.markCheckinDone(userId, presenceService.getTodayKey('evening'));
            } else if (decision.reason === 'late_night') {
                presenceService.markCheckinDone(userId, presenceService.getTodayKey('late'));
            } else if (decision.reason === 'productivity_nudge') {
                presenceService.markCheckinDone(userId, presenceService.getTodayKey('productivity'));
            }

        } catch (error) {
            logger.error('[Proactivity] Fehler beim Senden', { error, userId });
        }
    }

    /**
     * Manuell eine proaktive Nachricht ausloesen (z.B. bei Presence-Return)
     */
    async triggerForUser(userId: string): Promise<void> {
        if (!presenceService.canSendProactive(userId)) return;

        const input = await this.buildInput(userId);
        if (!input) return;

        const decision = this.decide(input);
        if (decision.shouldMessage && decision.message) {
            await this.sendProactiveMessage(userId, decision);
        }
    }
}

export const proactivityService = new ProactivityService();
