import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore, Attachment } from '../store/useAppStore';
import { Send, X } from 'lucide-react';
import { AttachmentMenu } from './AttachmentMenu';
import { EmojiMenu } from './EmojiMenu';
import VoiceControls from './VoiceControls';

export default function ChatInput() {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const sendMessage = useAppStore((state) => state.sendMessage);
    const isTyping = useAppStore((state) => state.isTyping);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [input]);

    const handleSend = () => {
        if ((input.trim() || attachments.length > 0) && !isTyping) {
            sendMessage(input.trim(), attachments);
            setInput('');
            setAttachments([]); // Clear attachments
        }
    };

    const handleImageSelect = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                setAttachments(prev => [...prev, {
                    type: 'image',
                    content: e.target!.result as string,
                    mimeType: file.type,
                    name: file.name
                }]);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleFileSelect = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                setAttachments(prev => [...prev, {
                    type: 'file',
                    content: e.target!.result as string,
                    mimeType: file.type || 'text/plain',
                    name: file.name
                }]);
            }
        };
        reader.readAsText(file);
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Spracheingabe: Transkript in Eingabefeld einfuegen
    const handleVoiceTranscript = useCallback((text: string) => {
        setInput(prev => prev ? prev + ' ' + text : text);
    }, []);

    const handleEmojiClick = (emoji: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setInput(prev => prev + emoji);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = input.substring(0, start) + emoji + input.substring(end);

        setInput(newValue);

        // Restore focus and cursor position after render
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + emoji.length, start + emoji.length);
        }, 0);
    };

    return (
        <div className="p-4">
            {/* Attachment Chips */}
            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2 px-1">
                    {attachments.map((att, index) => (
                        <div key={index} className="flex items-center gap-2 bg-bg-secondary border border-border px-3 py-1 rounded-full text-xs text-text-primary animate-in fade-in zoom-in-95">
                            <span className="truncate max-w-[150px]">{att.name}</span>
                            <button
                                onClick={() => removeAttachment(index)}
                                className="hover:text-red-400 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-3 bg-bg-tertiary border border-border rounded-xl p-2 transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
                <div className="pl-1 flex items-center gap-1">
                    <AttachmentMenu
                        onSelectImage={handleImageSelect}
                        onSelectFile={handleFileSelect}
                        direction="up"
                    />
                    <EmojiMenu
                        onEmojiClick={handleEmojiClick}
                        direction="up"
                    />
                    <VoiceControls onTranscript={handleVoiceTranscript} />
                </div>
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nachricht an NEON..."
                    disabled={isTyping}
                    autoFocus={true} // Ensure focus for typing immediately
                    className="flex-1 bg-transparent text-text-primary placeholder-text-secondary border-none px-5 py-4 resize-none focus:outline-none focus:ring-0 transition-all max-h-40 disabled:opacity-50 leading-6"
                    rows={1}
                />
                <button
                    onClick={handleSend}
                    disabled={(!input.trim() && attachments.length === 0) || isTyping}
                    className="h-10 w-10 flex items-center justify-center bg-transparent text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-colors"
                >
                    <Send className="w-5 h-5 drop-shadow-neon" />
                </button>
            </div>
            <div className="mt-2 text-xs text-text-secondary text-center">
                Enter zum Senden • Shift+Enter für neue Zeile
            </div>
        </div>
    );
}
