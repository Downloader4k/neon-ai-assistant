import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import MessageList from './MessageList';
import ChatInput, { ChatInputHandle } from './ChatInput';
import TypingIndicator from './TypingIndicator';
import SearchingIndicator from './SearchingIndicator';
import ExportDropdown from './ExportDropdown';
import { Upload, Mic } from 'lucide-react';

export default function ChatInterface() {
    const currentConversation = useAppStore((state) => state.currentConversation);
    const setActiveView = useAppStore((state) => state.setActiveView);
    // Use local messages only if they belong to current conversation, otherwise empty
    const messages = currentConversation?.messages || [];
    const isTyping = useAppStore((state) => state.isTyping);
    const searchStatus = useAppStore((state) => state.searchStatus);

    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounterRef = useRef(0);
    const chatInputRef = useRef<ChatInputHandle>(null);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDragOver(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDragOver(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0 && chatInputRef.current) {
            chatInputRef.current.addFiles(files);
        }
    }, []);

    return (
        <div
            className="flex flex-col h-full bg-bg-primary overflow-hidden relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Drag-and-Drop Overlay */}
            {isDragOver && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg-primary/80 backdrop-blur-sm transition-all duration-200 animate-in fade-in">
                    <div className="flex flex-col items-center gap-4 p-10 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                            <Upload className="w-8 h-8 text-primary drop-shadow-neon" />
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-medium text-text-primary">
                                Datei hier ablegen
                            </p>
                            <p className="text-sm text-text-secondary mt-1">
                                Bilder, PDFs und Textdateien werden unterstützt
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Header with Export */}
            {currentConversation && currentConversation.messages.length > 0 && (
                <div className="chat-header-bar">
                    <span className="chat-header-title">{currentConversation.title || 'Unterhaltung'}</span>
                    <div className="chat-header-actions">
                        <button
                            className="chat-voice-btn"
                            onClick={() => setActiveView('voice')}
                            title="Voice Chat oeffnen"
                        >
                            <Mic size={16} />
                            <span>Voice</span>
                        </button>
                        <ExportDropdown />
                    </div>
                    <style>{`
                        .chat-header-bar {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            padding: 0.5rem 1.5rem;
                            border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
                            background: var(--bg-secondary, #1a1a2e);
                            flex-shrink: 0;
                        }
                        .chat-header-title {
                            font-size: 0.875rem;
                            font-weight: 500;
                            color: var(--text-secondary, #a0a0a0);
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                            flex: 1;
                            margin-right: 0.75rem;
                        }
                        .chat-header-actions {
                            display: flex;
                            align-items: center;
                            gap: 0.5rem;
                        }
                        .chat-voice-btn {
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            padding: 6px 12px;
                            background: transparent;
                            border: 1px solid rgba(249,171,0,0.2);
                            border-radius: 8px;
                            color: #f9ab00;
                            font-size: 13px;
                            font-weight: 500;
                            cursor: pointer;
                            transition: all 0.2s;
                        }
                        .chat-voice-btn:hover {
                            background: rgba(249,171,0,0.1);
                            border-color: rgba(249,171,0,0.4);
                        }
                    `}</style>
                </div>
            )}

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
                    <ChatInput ref={chatInputRef} />
                </div>
            </div>
        </div>
    );
}
