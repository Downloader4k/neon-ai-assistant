import { useState, useEffect, useCallback } from 'react';
import { X, Check, Sparkles, MessageCircle, ArrowRight } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface ProactiveMessage {
    id: string;
    type: string;
    content: string;
    reason?: string;
    trigger?: string;
    priority?: string;
    createdAt: string;
}

export default function ProactiveNotifications() {
    const [messages, setMessages] = useState<ProactiveMessage[]>([]);
    const [fadeOut, setFadeOut] = useState<string | null>(null);
    const conversations = useAppStore((state) => state.conversations);
    const loadConversation = useAppStore((state) => state.loadConversation);
    const setActiveView = useAppStore((state) => state.setActiveView);
    const sendMessage = useAppStore((state) => state.sendMessage);

    const fetchPending = useCallback(async () => {
        try {
            const userId = localStorage.getItem('neon-current-user-id') || 'default-user';
            const res = await fetch(`/api/proactive/${userId}/pending`);

            if (!res.ok) {
                console.warn('[ProactiveNotifications] Fetch failed:', res.status);
                return;
            }

            const data = await res.json();
            console.log('[ProactiveNotifications] Fetched:', data?.length || 0, 'messages');

            if (Array.isArray(data) && data.length > 0) {
                setMessages((prev) => {
                    const existingIds = new Set(prev.map((m) => m.id));
                    const newMsgs = data.filter((m: ProactiveMessage) => !existingIds.has(m.id));
                    if (newMsgs.length === 0) return prev;
                    return [...prev, ...newMsgs];
                });
            }
        } catch (error) {
            console.warn('[ProactiveNotifications] Fetch error:', error);
        }
    }, []);

    useEffect(() => {
        // Sofort laden
        fetchPending();

        // Nochmal nach 5 Sekunden (falls Backend noch Nachricht generiert)
        const retryTimeout = setTimeout(fetchPending, 5000);

        // Danach alle 15 Sekunden polling
        const interval = setInterval(fetchPending, 15 * 1000);

        return () => {
            clearTimeout(retryTimeout);
            clearInterval(interval);
        };
    }, [fetchPending]);

    // WebSocket-Listener fuer Echtzeit-Push (nutzt den bestehenden Store-Socket)
    useEffect(() => {
        const handleProactiveMessage = (event: CustomEvent) => {
            const data = event.detail as ProactiveMessage;
            setMessages((prev) => {
                if (prev.some((m) => m.id === data.id)) return prev;
                return [...prev, data];
            });
        };

        window.addEventListener('proactive-message' as any, handleProactiveMessage as any);
        return () => window.removeEventListener('proactive-message' as any, handleProactiveMessage as any);
    }, []);

    const markAsRead = async (id: string) => {
        setFadeOut(id);

        setTimeout(async () => {
            try {
                await fetch(`/api/proactive/${id}/trigger`, { method: 'PATCH' });
            } catch { /* ignore */ }

            setMessages((prev) => prev.filter((m) => m.id !== id));
            setFadeOut(null);
        }, 300);
    };

    // Hauptaktion: Letzte Konversation öffnen oder Chat starten
    const handleAction = async (message: ProactiveMessage) => {
        const trigger = message.trigger || message.reason || '';

        if (trigger === 'presence_return' || trigger === 'morning_checkin') {
            // Letzte Konversation öffnen
            if (conversations.length > 0) {
                const lastConv = conversations[0]; // Sortiert nach letzter Aktivität
                loadConversation(lastConv.id);
                setActiveView('chat');
            }
        } else if (trigger === 'evening_summary') {
            // Tages-Summary anzeigen
            setActiveView('summary' as any);
        } else if (trigger === 'productivity_nudge') {
            // ToDo-Liste öffnen
            setActiveView('lists' as any);
        } else {
            // Fallback: Chat öffnen und Nachricht senden
            setActiveView('chat');
        }

        // Nachricht als gelesen markieren
        markAsRead(message.id);
    };

    // Duplikate nach ID filtern (Race Condition zwischen REST und WebSocket)
    const uniqueMessages = messages.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);

    if (uniqueMessages.length === 0) return null;

    const getActionLabel = (msg: ProactiveMessage) => {
        const trigger = msg.trigger || msg.reason || '';
        switch (trigger) {
            case 'presence_return': return 'Weitermachen';
            case 'morning_checkin': return 'Tagesplan ansehen';
            case 'evening_summary': return 'Zusammenfassung';
            case 'productivity_nudge': return 'Aufgaben öffnen';
            case 'emotional_support': return 'Erzähl mir mehr';
            case 'late_night': return 'Für morgen planen';
            case 'streak_celebration': return 'Weiter so!';
            default: return 'Verstanden';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'greeting': return '👋';
            case 'routine': return '📋';
            case 'care': return '💛';
            case 'suggestion': return '💡';
            case 'motivation': return '🔥';
            default: return '✨';
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: '80px',
            right: '24px',
            width: '380px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            pointerEvents: 'auto',
        }}>
            {uniqueMessages.map((message) => (
                <div
                    key={message.id}
                    style={{
                        background: 'linear-gradient(135deg, rgba(30, 30, 35, 0.98), rgba(25, 25, 30, 0.95))',
                        border: `2px solid ${message.priority === 'high' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(249, 171, 0, 0.5)'}`,
                        borderRadius: '16px',
                        padding: '16px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(249, 171, 0, 0.1)',
                        opacity: fadeOut === message.id ? 0 : 1,
                        transform: fadeOut === message.id ? 'translateX(20px)' : 'translateX(0)',
                        transition: 'opacity 0.3s, transform 0.3s',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '10px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sparkles style={{ width: '18px', height: '18px', color: '#f9ab00' }} />
                            <span style={{ fontWeight: 600, fontSize: '14px', color: '#f9ab00', letterSpacing: '0.5px' }}>NEON</span>
                            <span style={{ fontSize: '14px' }}>{getTypeIcon(message.type)}</span>
                        </div>
                        <button
                            onClick={() => markAsRead(message.id)}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#888', padding: '4px', borderRadius: '50%',
                                display: 'flex', alignItems: 'center',
                            }}
                        >
                            <X style={{ width: '16px', height: '16px' }} />
                        </button>
                    </div>

                    {/* Message */}
                    <p style={{
                        fontSize: '14px', color: '#e0e0e0', lineHeight: '1.5',
                        margin: '0 0 14px 0',
                    }}>
                        {message.content}
                    </p>

                    {/* Action Button */}
                    <button
                        onClick={() => handleAction(message)}
                        style={{
                            width: '100%', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '8px', padding: '8px 16px',
                            background: 'rgba(249, 171, 0, 0.15)',
                            border: '1px solid rgba(249, 171, 0, 0.3)',
                            borderRadius: '10px', color: '#f9ab00',
                            fontWeight: 500, fontSize: '13px', cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        <ArrowRight style={{ width: '14px', height: '14px' }} />
                        {getActionLabel(message)}
                    </button>
                </div>
            ))}
        </div>
    );
}
