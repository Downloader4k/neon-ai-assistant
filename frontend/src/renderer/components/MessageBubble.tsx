import { Message, useAppStore } from '../store/useAppStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import 'highlight.js/styles/github-dark.css';
import { Copy, Check, Sparkles, User, Trash2, Bookmark, Calendar, Cpu, FileText, GitBranch, GraduationCap } from 'lucide-react';
import { useState, memo, useEffect, useRef } from 'react';
import { parseTwemoji } from '../utils/twemojiHelper';
import WeatherCard from './WeatherCard';

interface MessageBubbleProps {
    message: Message;
}

// Resolve image source: Base64 data-URL (live) or server path (persisted)
const BACKEND_URL = window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : window.location.origin;

function resolveImageSrc(content: string): string {
    if (!content) return '';
    // Already a data URL (base64) — use as-is
    if (content.startsWith('data:')) return content;
    // Already a full URL
    if (content.startsWith('http://') || content.startsWith('https://')) return content;
    // Relative path from server (e.g. /uploads/images/...)
    return `${BACKEND_URL}${content}`;
}

function MessageBubble({ message }: MessageBubbleProps) {
    const isUser = message.role === 'user';
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [showActions, setShowActions] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    const copyCode = (code: string, id: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(id);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    // Parse emojis after render
    useEffect(() => {
        if (contentRef.current) {
            parseTwemoji(contentRef.current);
        }
    }, [message.content]);

    const [saveSuccess, setSaveSuccess] = useState(false);
    const [deleteSuccess, setDeleteSuccess] = useState(false);
    const [forkSuccess, setForkSuccess] = useState(false);
    const [explainLevel, setExplainLevel] = useState<number | null>(null);

    const handleExplainLevel = async (level: number) => {
        setExplainLevel(level);
        const levelNames = ['Kind (5 Jahre)', 'Schueler (12 Jahre)', 'Student', 'Fachperson', 'Experte (PhD)'];
        const sendMessage = useAppStore.getState().sendMessage;
        const prompt = `Erklaere die folgende Antwort nochmal auf dem Niveau "${levelNames[level]}": "${message.content.substring(0, 500)}"`;
        sendMessage(prompt);
        setExplainLevel(null);
    };

    const handleDelete = async () => {
        try {
            const conv = useAppStore.getState().currentConversation;
            if (!conv) return;
            // Remove message from local state
            const updatedMessages = conv.messages.filter(m => m.id !== message.id);
            useAppStore.getState().setCurrentConversation({
                ...conv,
                messages: updatedMessages,
            });
            setDeleteSuccess(true);
            setTimeout(() => setDeleteSuccess(false), 1500);
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const handleFork = () => {
        const conv = useAppStore.getState().currentConversation;
        if (!conv) return;
        // Get messages up to and including this one
        const msgIndex = conv.messages.findIndex(m => m.id === message.id);
        if (msgIndex < 0) return;
        const forkedMessages = conv.messages.slice(0, msgIndex + 1).map(m => ({
            ...m,
            id: `fork-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }));
        // Create a forked conversation locally
        const forkedConv = {
            id: '', // new conversation, backend will assign
            title: `${conv.title} (Verzweigung)`,
            messages: forkedMessages,
        };
        useAppStore.getState().setCurrentConversation(forkedConv);
        useAppStore.getState().setActiveView('chat');
        setForkSuccess(true);
        setTimeout(() => setForkSuccess(false), 1500);
    };

    const handleSaveToMemory = async () => {
        try {
            const res = await fetch('/api/memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: useAppStore.getState().currentUser?.id || 'default-user',
                    content: message.content,
                    type: 'FACT',
                    importanceScore: 0.8,
                }),
            });
            if (res.ok) {
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2000);
            }
        } catch (err) {
            console.error('Save to memory failed:', err);
        }
    };

    return (
        <div
            className={`flex gap-4 items-start group animate-slide-up cursor-pointer ${isUser ? 'justify-end' : ''}`}
            onClick={() => setShowActions(!showActions)}
        >
            {/* No External Avatars anymore - Icon is INSIDE the bubble */}

            {/* Message Card */}
            <div className={`min-w-0 ${isUser ? '' : 'flex-1'}`}>
                {/* Content Card */}
                <div className={`relative px-5 py-4 min-w-[140px] ${isUser
                    ? 'bg-bg-secondary/40 backdrop-blur-md border border-white/15 rounded-3xl ml-auto max-w-[85%]' // User: Glass (more visible border)
                    : 'bg-bg-tertiary/40 backdrop-blur-md border border-white/5 rounded-3xl mr-auto max-w-[85%] shadow-lg shadow-accent-primary/15'     // AI: Different gray with glow
                    } ${showActions ? 'ring-2 ring-white/10' : ''}`}>

                    {/* Integrated Header: Icon + Name (RESTORED & FIXED) */}
                    <div className={`flex items-center gap-2 mb-2 pb-2 border-b border-white/5`}>
                        {/* Icon Container with fixed size to prevent shrinking/disappearing */}
                        <div className={`flex-shrink-0 flex items-center justify-center w-5 h-5 ${isUser ? 'text-accent-primary' : 'text-accent-secondary'}`}>
                            {isUser ? <User size={18} strokeWidth={2.5} /> : <Sparkles size={18} strokeWidth={2.5} />}
                        </div>

                        <span className={`text-xs font-bold whitespace-nowrap ${isUser ? 'text-accent-primary' : 'text-accent-secondary'}`}>
                            {isUser ? (useAppStore.getState().currentUser?.name || 'Du') : 'Neon'}
                        </span>
                    </div>

                    {/* Attachments Display */}
                    {message.attachments && message.attachments.length > 0 && (
                        <div className={`flex flex-wrap gap-3 mb-3 ${isUser ? 'justify-end' : ''}`}>
                            {message.attachments.map((att, i) => (
                                <div key={i} className="group/att relative rounded-lg overflow-hidden border border-border/50 bg-bg-tertiary/50">
                                    {att.type === 'image' ? (
                                        <img
                                            src={resolveImageSrc(att.content)}
                                            alt={att.name}
                                            className="max-w-[300px] max-h-[300px] object-cover transition-transform hover:scale-[1.02] cursor-pointer"
                                            onClick={() => window.open(resolveImageSrc(att.content), '_blank')}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-3 p-3 min-w-[200px]">
                                            <div className="p-2 rounded-lg bg-bg-primary/50">
                                                <FileText size={20} className="text-accent-primary" />
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-sm font-medium text-text-primary truncate">{att.name}</span>
                                                <span className="text-xs text-text-secondary uppercase">{att.type}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Markdown Content */}
                    <div
                        ref={contentRef}
                        className={`prose prose-base max-w-none
                        prose-p:my-3 prose-p:first:mt-0 prose-p:last:mb-0
                        prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                        prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                        prose-a:underline prose-a:transition-colors
                        prose-pre:bg-bg-tertiary prose-pre:border prose-pre:border-border prose-pre:my-4 prose-pre:rounded-lg
                        prose-ul:my-3 prose-ul:space-y-1 prose-ul:list-disc prose-ul:pl-4
                        prose-ol:my-3 prose-ol:space-y-1 prose-ol:list-decimal prose-ol:pl-4
                        prose-li:my-0
                        prose-strong:font-semibold
                        prose-em:italic
                        prose-blockquote:border-l-4 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:my-4 prose-blockquote:rounded-r-lg
                        prose-hr:border-solid prose-hr:border-t prose-hr:my-6 prose-hr:w-full
                        prose-invert prose-headings:text-text-primary prose-a:text-accent-primary hover:prose-a:underline prose-code:text-accent-secondary prose-code:bg-accent-light prose-li:marker:text-accent-primary prose-blockquote:border-accent-primary prose-blockquote:bg-bg-hover prose-hr:border-border/40
                    `}
                    >
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={{
                                code({ node, inline, className, children, ...props }: any) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const codeString = String(children).replace(/\n$/, '');
                                    const codeId = `code-${Math.random().toString(36)}`;

                                    if (!inline && match && match[1] === 'weather') {
                                        try {
                                            const weatherData = JSON.parse(codeString);
                                            return <WeatherCard data={weatherData} />;
                                        } catch (e) {
                                            // Fallback to code block if JSON is invalid (during streaming)
                                            return <pre className="text-xs text-red-400">Loading Weather Data...</pre>;
                                        }
                                    }

                                    if (!inline && match) {
                                        return (
                                            <div className="relative group/code my-4 -mx-5 rounded-lg overflow-hidden">
                                                {/* Header */}
                                                <div className="flex items-center justify-between px-4 py-2.5 bg-bg-hover border-b border-border">
                                                    <span className="text-xs text-text-secondary font-mono uppercase tracking-wide">
                                                        {match[1]}
                                                    </span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            copyCode(codeString, codeId);
                                                        }}
                                                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-bg-tertiary hover:bg-border rounded-md transition-colors"
                                                    >
                                                        {copiedCode === codeId ? (
                                                            <>
                                                                <Check className="w-3 h-3 text-green-400" />
                                                                <span className="text-green-400">Copied</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Copy className="w-3 h-3" />
                                                                Copy
                                                            </>
                                                        )}
                                                    </button>
                                                </div>

                                                {/* Code Block */}
                                                <pre className="!mt-0 !mb-0 !rounded-none !border-0 overflow-x-auto px-4 py-3">
                                                    <code className={className} {...props}>
                                                        {children}
                                                    </code>
                                                </pre>
                                            </div>
                                        );
                                    }

                                    return (
                                        <code className={`${className} text-accent-secondary bg-accent-light px-1.5 py-0.5 rounded-md text-sm font-mono`} {...props}>
                                            {children}
                                        </code>
                                    );
                                },
                            }}
                        >
                            {/* Temporarily disabled formatter to test if AI already formats well */}
                            {message.content}
                            {/* {improveTextFormatting(message.content)} */}
                        </ReactMarkdown>
                        {/* Actions Footer - inside bubble, only visible on click */}
                        {showActions && (
                            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between animate-fade-in">
                                {/* Left: Metadata */}
                                <div className="flex items-center gap-3 text-xs text-text-secondary">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5" />
                                        <span>{format(new Date(message.timestamp), 'dd.MM.yyyy • HH:mm', { locale: de })}</span>
                                    </div>
                                    {message.modelUsed && !isUser && (
                                        <div className="flex items-center gap-1.5">
                                            <Cpu className="w-3.5 h-3.5" />
                                            <span>{message.modelUsed || 'Ollama'}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Right: Action Buttons */}
                                <div className="flex items-center gap-2">
                                    {/* Explain Level Button */}
                                    {!isUser && (
                                        <div className="relative" style={{ display: 'inline-flex' }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExplainLevel(explainLevel !== null ? null : -1);
                                                }}
                                                className="p-1.5 hover:bg-bg-hover rounded-md transition-colors group/btn"
                                                title="Erklaer-Level aendern"
                                            >
                                                <GraduationCap className="w-4 h-4 text-text-secondary group-hover/btn:text-accent-primary transition-colors" />
                                            </button>
                                            {explainLevel === -1 && (
                                                <div
                                                    className="absolute bottom-full right-0 mb-2 p-2 bg-bg-secondary border border-border-subtle rounded-lg shadow-lg z-50 animate-fade-in"
                                                    style={{ minWidth: '180px' }}
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <div className="text-xs text-text-tertiary mb-1 px-1">Erklaer-Level:</div>
                                                    {['Kind (5)', 'Schueler (12)', 'Student', 'Fachperson', 'Experte (PhD)'].map((l, i) => (
                                                        <button
                                                            key={i}
                                                            className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-hover text-text-primary transition-colors"
                                                            onClick={() => { handleExplainLevel(i); setExplainLevel(null); }}
                                                        >
                                                            {'🎓'.repeat(i + 1)} {l}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {/* Fork Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleFork();
                                        }}
                                        className="p-1.5 hover:bg-bg-hover rounded-md transition-colors group/btn"
                                        title="Ab hier verzweigen"
                                    >
                                        {forkSuccess ? (
                                            <Check className="w-4 h-4 text-green-400" />
                                        ) : (
                                            <GitBranch className="w-4 h-4 text-text-secondary group-hover/btn:text-accent-primary transition-colors" />
                                        )}
                                    </button>
                                    {!isUser && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSaveToMemory();
                                            }}
                                            className="p-1.5 hover:bg-bg-hover rounded-md transition-colors group/btn"
                                            title="In Erinnerungen speichern"
                                        >
                                            {saveSuccess ? (
                                                <Check className="w-4 h-4 text-green-400" />
                                            ) : (
                                                <Bookmark className="w-4 h-4 text-text-secondary group-hover/btn:text-accent-primary transition-colors" />
                                            )}
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete();
                                        }}
                                        className="p-1.5 hover:bg-bg-hover rounded-md transition-colors group/btn"
                                        title="Nachricht löschen"
                                    >
                                        {deleteSuccess ? (
                                            <Check className="w-4 h-4 text-red-400" />
                                        ) : (
                                            <Trash2 className="w-4 h-4 text-text-secondary group-hover/btn:text-red-400 transition-colors" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>

        </div>
    );
}

// Memoize component for performance (like assistant-ui)
export default memo(MessageBubble);
