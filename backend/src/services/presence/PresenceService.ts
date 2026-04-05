import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

// ─────────────────────────────────────────────────────────────
// PRESENCE SERVICE - Erkennt ob der User aktiv ist
// ─────────────────────────────────────────────────────────────

export type PresenceState =
    | 'offline'
    | 'idle'
    | 'available'
    | 'focused'
    | 'do_not_disturb';

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';

export interface PresenceContext {
    lastActivityAt: number;       // Timestamp der letzten Aktivitaet
    lastMessageAt: number;        // Timestamp der letzten Chat-Nachricht
    lastSocketConnectAt: number;  // Wann Socket zuletzt verbunden
    isSocketConnected: boolean;   // Aktuell verbunden?
    manualStatus?: PresenceState; // Manuell gesetzter Status
    messageCountLast30Min: number;// Nachrichten in den letzten 30 Min
}

export interface PresenceStatus {
    state: PresenceState;
    previousState: PresenceState;
    since: number;                // Seit wann in diesem State
    timeOfDay: TimeOfDay;
    stateChangedAt: number;       // Wann letzter State-Wechsel
}

interface UserPresenceData {
    context: PresenceContext;
    status: PresenceStatus;
    checkinsDone: Set<string>;    // z.B. 'morning-2026-04-05'
    lastProactiveAt: number;      // Wann letzte proaktive Nachricht
}

class PresenceService extends EventEmitter {
    private users: Map<string, UserPresenceData> = new Map();

    // Konfiguration
    private readonly IDLE_TIMEOUT_MS = 10 * 60 * 1000;     // 10 Min ohne Aktivitaet → idle
    private readonly OFFLINE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 Min ohne Aktivitaet → offline
    private readonly FOCUSED_MSG_THRESHOLD = 5;              // 5+ Nachrichten in 30 Min → focused
    private readonly PROACTIVE_COOLDOWN_MS = 15 * 60 * 1000; // Min. 15 Min zwischen proaktiven Nachrichten

    /**
     * User-Praesenz initialisieren oder aktualisieren bei Socket-Verbindung
     */
    registerUser(userId: string): void {
        const now = Date.now();
        const existing = this.users.get(userId);

        // Mindestens 2 Minuten offline gewesen, bevor wir "Rückkehr" melden
        const MIN_ABSENCE_FOR_RETURN_MS = 2 * 60 * 1000;

        if (existing) {
            const previousState = existing.status.state;
            const timeSinceDisconnect = now - existing.context.lastActivityAt;
            existing.context.isSocketConnected = true;
            existing.context.lastSocketConnectAt = now;
            existing.context.lastActivityAt = now;

            // State neu berechnen
            this.updateState(userId);

            // Nur als Rueckkehr emittieren wenn User mindestens 2 Min weg war
            if ((previousState === 'offline' || previousState === 'idle') &&
                existing.status.state === 'available' &&
                timeSinceDisconnect >= MIN_ABSENCE_FOR_RETURN_MS) {
                this.emit('presence-return', { userId, previousState, newState: existing.status.state });
            }
        } else {
            const status: PresenceStatus = {
                state: 'available',
                previousState: 'available', // Nicht 'offline' — verhindert dass decide() sofort Rückkehr-Trigger feuert
                since: now,
                timeOfDay: this.getTimeOfDay(),
                stateChangedAt: now,
            };

            this.users.set(userId, {
                context: {
                    lastActivityAt: now,
                    lastMessageAt: 0,
                    lastSocketConnectAt: now,
                    isSocketConnected: true,
                    messageCountLast30Min: 0,
                },
                status,
                checkinsDone: new Set(),
                lastProactiveAt: now, // Cooldown startet sofort — verhindert Spam nach Backend-Neustart
            });

            // KEIN presence-return bei Erstregistrierung — verhindert Spam
            logger.info(`[Presence] Neuer User ${userId} registriert, KEIN presence-return`);
        }

        logger.info(`[Presence] User ${userId} registered, state: ${this.getStatus(userId)?.state}`);
    }

    /**
     * User hat Socket getrennt
     */
    unregisterUser(userId: string): void {
        const data = this.users.get(userId);
        if (data) {
            data.context.isSocketConnected = false;
            this.updateState(userId);
        }
    }

    /**
     * Aktivitaet melden (Nachricht gesendet, Seite navigiert, etc.)
     */
    recordActivity(userId: string, type: 'message' | 'navigation' | 'interaction' = 'interaction'): void {
        const data = this.users.get(userId);
        if (!data) return;

        const now = Date.now();
        data.context.lastActivityAt = now;

        if (type === 'message') {
            data.context.lastMessageAt = now;
            data.context.messageCountLast30Min++;

            // Reset counter nach 30 Min
            setTimeout(() => {
                if (data.context.messageCountLast30Min > 0) {
                    data.context.messageCountLast30Min--;
                }
            }, 30 * 60 * 1000);
        }

        const previousState = data.status.state;
        this.updateState(userId);

        // State-Wechsel emittieren (NICHT presence-return — das macht nur registerUser mit 2-Min-Check)
        if (previousState !== data.status.state) {
            this.emit('state-change', {
                userId,
                previousState,
                newState: data.status.state,
            });
        }
    }

    /**
     * Manuellen Status setzen (z.B. Do Not Disturb)
     */
    setManualStatus(userId: string, status: PresenceState | undefined): void {
        const data = this.users.get(userId);
        if (!data) return;

        data.context.manualStatus = status;
        this.updateState(userId);
    }

    /**
     * Aktuellen Status abfragen
     */
    getStatus(userId: string): PresenceStatus | null {
        const data = this.users.get(userId);
        if (!data) return null;

        // Vor Abfrage State aktualisieren
        this.updateState(userId);
        return data.status;
    }

    /**
     * Pruefen ob Check-in schon gemacht wurde
     */
    hasCheckinDone(userId: string, checkinKey: string): boolean {
        const data = this.users.get(userId);
        if (!data) return false;
        return data.checkinsDone.has(checkinKey);
    }

    /**
     * Check-in als erledigt markieren
     */
    markCheckinDone(userId: string, checkinKey: string): void {
        const data = this.users.get(userId);
        if (!data) return;
        data.checkinsDone.add(checkinKey);
    }

    /**
     * Letzte proaktive Nachricht Timestamp
     */
    getLastProactiveAt(userId: string): number {
        return this.users.get(userId)?.lastProactiveAt || 0;
    }

    /**
     * Proaktive Nachricht als gesendet markieren
     */
    markProactiveSent(userId: string): void {
        const data = this.users.get(userId);
        if (data) {
            data.lastProactiveAt = Date.now();
        }
    }

    /**
     * Cooldown pruefen
     */
    canSendProactive(userId: string): boolean {
        const data = this.users.get(userId);
        if (!data) return false;

        // Nicht bei DND
        if (data.status.state === 'do_not_disturb') return false;

        // Nicht wenn offline
        if (data.status.state === 'offline') return false;

        // Cooldown
        const timeSinceLast = Date.now() - data.lastProactiveAt;
        return timeSinceLast >= this.PROACTIVE_COOLDOWN_MS;
    }

    /**
     * State aus Context berechnen
     */
    private updateState(userId: string): void {
        const data = this.users.get(userId);
        if (!data) return;

        const now = Date.now();
        const previousState = data.status.state;

        let newState: PresenceState;

        // 1. Manueller Status hat Vorrang
        if (data.context.manualStatus) {
            newState = data.context.manualStatus;
        }
        // 2. Socket nicht verbunden → offline
        else if (!data.context.isSocketConnected) {
            newState = 'offline';
        }
        // 3. Lange keine Aktivitaet → offline
        else if (now - data.context.lastActivityAt > this.OFFLINE_TIMEOUT_MS) {
            newState = 'offline';
        }
        // 4. Mittlere Inaktivitaet → idle
        else if (now - data.context.lastActivityAt > this.IDLE_TIMEOUT_MS) {
            newState = 'idle';
        }
        // 5. Viele Nachrichten → focused
        else if (data.context.messageCountLast30Min >= this.FOCUSED_MSG_THRESHOLD) {
            newState = 'focused';
        }
        // 6. Sonst → available
        else {
            newState = 'available';
        }

        // Update Status
        if (newState !== previousState) {
            data.status.previousState = previousState;
            data.status.stateChangedAt = now;
            data.status.since = now;
        }

        data.status.state = newState;
        data.status.timeOfDay = this.getTimeOfDay();
    }

    /**
     * Tageszeit bestimmen
     */
    getTimeOfDay(): TimeOfDay {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 18) return 'day';
        if (hour >= 18 && hour < 22) return 'evening';
        return 'night';
    }

    /**
     * Alle aktiven User IDs
     */
    getActiveUsers(): string[] {
        const active: string[] = [];
        for (const [userId, data] of this.users) {
            if (data.status.state !== 'offline') {
                active.push(userId);
            }
        }
        return active;
    }

    /**
     * Heute-Key fuer Check-ins (z.B. 'morning-2026-04-05')
     */
    getTodayKey(prefix: string): string {
        const today = new Date().toISOString().split('T')[0];
        return `${prefix}-${today}`;
    }
}

export const presenceService = new PresenceService();
