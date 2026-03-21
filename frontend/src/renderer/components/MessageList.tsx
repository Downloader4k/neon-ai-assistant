import { useEffect, useRef } from 'react';
import { Message } from '../store/useAppStore';
import MessageBubble from './MessageBubble';

interface MessageListProps {
    messages: Message[];
}

export default function MessageList({ messages }: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="h-full overflow-y-auto scrollbar-thin">
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
                {messages.map((message, index) => (
                    <div key={message.id || index} className="group/message">
                        <MessageBubble message={message} />
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
