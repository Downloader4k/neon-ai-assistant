import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check } from 'lucide-react';

interface ProactiveMessage {
    id: string;
    type: string;
    content: string;
    createdAt: string;
}

export default function ProactiveNotifications() {
    const [messages, setMessages] = useState<ProactiveMessage[]>([]);
    const [visible, setVisible] = useState(false);
    const retryCount = useRef(0);

    const fetchPending = async () => {
        try {
            // Stop retrying if too many failures
            if (retryCount.current > 3) return;

            // Assuming default user
            const userId = localStorage.getItem('userId') || 'default-user';

            const res = await fetch(`http://localhost:3001/api/proactive/${userId}/pending`);

            if (!res.ok) {
                retryCount.current += 1;
                return;
            }

            const data = await res.json();
            retryCount.current = 0; // Reset on success

            if (Array.isArray(data) && data.length > 0) {
                setMessages(data);
                setVisible(true);
            }
        } catch (error) {
            console.error('Failed to fetch proactive messages', error);
            retryCount.current += 1;
        }
    };

    const markAsRead = async (id: string) => {
        try {
            await fetch(`http://localhost:3001/api/proactive/${id}/trigger`, {
                method: 'PATCH',
            });
            setMessages((prev) => prev.filter((m) => m.id !== id));
        } catch (error) {
            console.error('Failed to mark message', error);
        }
    };

    useEffect(() => {
        // Initial fetch
        fetchPending();

        // Loop every 5 min
        const interval = setInterval(() => {
            fetchPending();
        }, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    if (!visible || messages.length === 0) {
        return null;
    }

    return (
        <div className="fixed top-20 right-6 w-96 z-50">
            {messages.map((message) => (
                <div
                    key={message.id}
                    className="mb-3 bg-bg-secondary border-2 border-primary rounded-lg p-4 shadow-2xl animate-slide-in"
                >
                    <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Bell className="w-5 h-5 text-primary" />
                            <span className="font-medium">NEON</span>
                        </div>
                        <button
                            onClick={() => markAsRead(message.id)}
                            className="text-text-secondary hover:text-text-primary"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <p className="text-sm text-text-primary mb-3">{message.content}</p>

                    <button
                        onClick={() => markAsRead(message.id)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 text-black font-medium rounded-lg transition-colors"
                    >
                        <Check className="w-4 h-4" />
                        Verstanden
                    </button>
                </div>
            ))}
        </div>
    );
}
