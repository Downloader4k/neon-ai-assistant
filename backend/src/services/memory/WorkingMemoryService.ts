/**
 * WorkingMemoryService - In-memory session management
 * 
 * Layer 1 of the 5-layer memory architecture.
 * Stores the current conversation context during an active session.
 * 
 * Features:
 * - Live conversation tracking (last N messages)
 * - Session timeout detection (5 minutes)
 * - Automatic context compression when limit exceeded
 */

export interface WorkingMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

export interface SessionInfo {
    sessionId: string;
    userId: string;
    messages: WorkingMessage[];
    startedAt: Date;
    lastActivityAt: Date;
}

export class WorkingMemoryService {
    private sessions: Map<string, SessionInfo> = new Map();
    private maxMessagesPerSession: number = 15;
    private sessionTimeoutMs: number = 5 * 60 * 1000; // 5 minutes

    constructor() {
        // Start cleanup interval for expired sessions
        setInterval(() => this.cleanupExpiredSessions(), 60000); // Every minute
    }

    /**
     * Start or get existing session
     */
    getOrCreateSession(sessionId: string, userId: string): SessionInfo {
        let session = this.sessions.get(sessionId);

        if (!session) {
            session = {
                sessionId,
                userId,
                messages: [],
                startedAt: new Date(),
                lastActivityAt: new Date()
            };
            this.sessions.set(sessionId, session);
            console.log(`[WorkingMemory] New session: ${sessionId}`);
        } else {
            session.lastActivityAt = new Date();
        }

        return session;
    }

    /**
     * Add message to working memory
     */
    addMessage(sessionId: string, message: WorkingMessage): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.error(`[WorkingMemory] Session not found: ${sessionId}`);
            return;
        }

        session.messages.push(message);
        session.lastActivityAt = new Date();

        // Compress if exceeds limit (keep most recent)
        if (session.messages.length > this.maxMessagesPerSession) {
            const removed = session.messages.length - this.maxMessagesPerSession;
            session.messages = session.messages.slice(removed);
            console.log(`[WorkingMemory] Compressed session ${sessionId}: removed ${removed} messages`);
        }
    }

    /**
     * Get conversation history for a session
     */
    getHistory(sessionId: string): WorkingMessage[] {
        const session = this.sessions.get(sessionId);
        return session ? [...session.messages] : [];
    }

    /**
     * Get last N messages from session
     */
    getRecentMessages(sessionId: string, count: number): WorkingMessage[] {
        const session = this.sessions.get(sessionId);
        if (!session) return [];

        return session.messages.slice(-count);
    }

    /**
     * Check if session is active (not timed out)
     */
    isSessionActive(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) return false;

        const timeSinceLastActivity = Date.now() - session.lastActivityAt.getTime();
        return timeSinceLastActivity < this.sessionTimeoutMs;
    }

    /**
     * End session and return final state
     */
    endSession(sessionId: string): SessionInfo | null {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        this.sessions.delete(sessionId);
        console.log(`[WorkingMemory] Session ended: ${sessionId}`);
        return session;
    }

    /**
     * Clean up expired sessions
     */
    private cleanupExpiredSessions(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [sessionId, session] of this.sessions.entries()) {
            const timeSinceLastActivity = now - session.lastActivityAt.getTime();

            if (timeSinceLastActivity > this.sessionTimeoutMs) {
                this.sessions.delete(sessionId);
                cleaned++;
                console.log(`[WorkingMemory] Session expired: ${sessionId}`);
            }
        }

        if (cleaned > 0) {
            console.log(`[WorkingMemory] Cleaned ${cleaned} expired sessions`);
        }
    }

    /**
     * Get all active sessions (for debugging)
     */
    getActiveSessions(): SessionInfo[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Clear all sessions (for reset)
     */
    clearAll(): void {
        this.sessions.clear();
        console.log('[WorkingMemory] All sessions cleared');
    }
}

// Singleton instance
export const workingMemoryService = new WorkingMemoryService();
