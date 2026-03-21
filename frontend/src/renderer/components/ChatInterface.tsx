// import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';
import SearchingIndicator from './SearchingIndicator';

export default function ChatInterface() {
    const currentConversation = useAppStore((state) => state.currentConversation);
    // Use local messages only if they belong to current conversation, otherwise empty
    const messages = currentConversation?.messages || [];
    const isTyping = useAppStore((state) => state.isTyping);
    const searchStatus = useAppStore((state) => state.searchStatus);

    return (
        <div className="flex flex-col h-full bg-bg-primary overflow-hidden relative">
            {/* Header is handled by App.tsx */}

            <div className="flex-1 overflow-hidden relative flex flex-col">
                <MessageList messages={messages} />

                {/* Searching Indicator (like ChatGPT Thinking) */}
                {searchStatus && (
                    <div className="w-full max-w-4xl mx-auto px-6 py-2">
                        <SearchingIndicator query={searchStatus} />
                    </div>
                )}

                {/* Floating Typing Indicator if needed, or inside MessageList */}
                {isTyping && !searchStatus && (
                    <div className="w-full max-w-4xl mx-auto px-6 py-2">
                        <TypingIndicator />
                    </div>
                )}
            </div>

            <div className="border-t border-border bg-bg-secondary/50 backdrop-blur-md w-full">
                <div className="max-w-4xl mx-auto w-full">
                    <ChatInput />
                </div>
            </div>
        </div>
    );
}
