import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useAppStore, Attachment } from '../store/useAppStore';
import {
    Send, X, FileText, CloudSun, Search, Code2, Gift, Globe, Brain, HelpCircle, Slash,
    ListTodo, ShoppingCart, ClipboardList, Calendar,
    type LucideIcon
} from 'lucide-react';
import { AttachmentMenu } from './AttachmentMenu';
import { EmojiMenu } from './EmojiMenu';
// VoiceControls wurde entfernt — Voice-Chat ist jetzt eine eigene Seite

export interface ChatInputHandle {
    addFiles: (files: File[]) => void;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = ['application/pdf', 'text/plain', 'text/markdown', 'application/json', 'text/csv'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// --- Slash Commands Definition ---
interface SlashCommand {
    command: string;
    args: string;
    description: string;
    icon: LucideIcon;
    action: 'prefill' | 'navigate' | 'execute';
    target?: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
    {
        command: '/wetter',
        args: '[stadt]',
        description: 'Wetter abfragen',
        icon: CloudSun,
        action: 'prefill',
    },
    {
        command: '/suche',
        args: '[query]',
        description: 'Semantische Suche oeffnen',
        icon: Search,
        action: 'navigate',
        target: 'search',
    },
    {
        command: '/code',
        args: '[sprache]',
        description: 'Code-Tools oeffnen',
        icon: Code2,
        action: 'navigate',
        target: 'code',
    },
    {
        command: '/kapsel',
        args: '[nachricht]',
        description: 'Schnell eine Zeitkapsel erstellen',
        icon: Gift,
        action: 'execute',
    },
    {
        command: '/recherche',
        args: '[thema]',
        description: 'Web-Recherche starten',
        icon: Globe,
        action: 'prefill',
    },
    {
        command: '/memory',
        args: '[query]',
        description: 'Gedaechtnis durchsuchen',
        icon: Brain,
        action: 'navigate',
        target: 'memory',
    },
    {
        command: '/todo',
        args: '[aufgabe]',
        description: 'Todo erstellen oder anzeigen',
        icon: ListTodo,
        action: 'prefill',
    },
    {
        command: '/todos',
        args: '',
        description: 'Alle offenen Todos anzeigen',
        icon: ListTodo,
        action: 'prefill',
    },
    {
        command: '/einkauf',
        args: '[artikel, ...]',
        description: 'Einkaufsliste: Artikel hinzufuegen',
        icon: ShoppingCart,
        action: 'prefill',
    },
    {
        command: '/einkaufsliste',
        args: '',
        description: 'Einkaufsliste anzeigen',
        icon: ShoppingCart,
        action: 'prefill',
    },
    {
        command: '/termin',
        args: '[beschreibung]',
        description: 'Termin erstellen',
        icon: Calendar,
        action: 'prefill',
    },
    {
        command: '/termine',
        args: '',
        description: 'Naechste Termine anzeigen',
        icon: Calendar,
        action: 'prefill',
    },
    {
        command: '/kalender',
        args: '',
        description: 'Kalender oeffnen',
        icon: Calendar,
        action: 'navigate',
        target: 'calendar',
    },
    {
        command: '/listen',
        args: '',
        description: 'Listen-Manager oeffnen',
        icon: ClipboardList,
        action: 'navigate',
        target: 'lists',
    },
    {
        command: '/hilfe',
        args: '',
        description: 'Alle Commands anzeigen',
        icon: HelpCircle,
        action: 'execute',
    },
];

const ChatInput = forwardRef<ChatInputHandle>((_props, ref) => {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const sendMessage = useAppStore((state) => state.sendMessage);
    const isTyping = useAppStore((state) => state.isTyping);
    const setActiveView = useAppStore((state) => state.setActiveView);

    // Expose addFiles to parent via ref
    useImperativeHandle(ref, () => ({
        addFiles: (files: File[]) => {
            files.forEach(file => processFile(file));
        }
    }));

    // Filter commands based on current input
    const filteredCommands = useMemo(() => {
        if (!showSlashMenu) return [];
        const typed = input.toLowerCase();
        if (typed === '/') return SLASH_COMMANDS;
        const commandPart = typed.split(' ')[0];
        return SLASH_COMMANDS.filter(cmd =>
            cmd.command.startsWith(commandPart)
        );
    }, [input, showSlashMenu]);

    // Detect slash at start of input
    useEffect(() => {
        if (input.startsWith('/') && input.indexOf(' ') === -1) {
            setShowSlashMenu(true);
            setSelectedIndex(0);
        } else {
            setShowSlashMenu(false);
        }
    }, [input]);

    // Keep selected index in bounds
    useEffect(() => {
        if (selectedIndex >= filteredCommands.length) {
            setSelectedIndex(Math.max(0, filteredCommands.length - 1));
        }
    }, [filteredCommands.length, selectedIndex]);

    // Scroll selected item into view
    useEffect(() => {
        if (showSlashMenu && menuRef.current) {
            const items = menuRef.current.querySelectorAll('[data-slash-item]');
            items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex, showSlashMenu]);

    const processFile = useCallback((file: File) => {
        if (file.size > MAX_FILE_SIZE) {
            alert(`Datei "${file.name}" ist zu gross. Maximale Groesse: 10 MB.`);
            return;
        }

        const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
        const isAllowedFile = ALLOWED_FILE_TYPES.includes(file.type);

        if (!isImage && !isAllowedFile) {
            alert(`Dateityp "${file.type || 'unbekannt'}" wird nicht unterstuetzt.\nErlaubt: PNG, JPG, GIF, WebP, PDF, TXT, MD, JSON, CSV`);
            return;
        }

        const progressKey = file.name + Date.now();
        setUploadProgress(prev => ({ ...prev, [progressKey]: 0 }));

        const progressInterval = setInterval(() => {
            setUploadProgress(prev => {
                const current = prev[progressKey] ?? 0;
                if (current >= 90) {
                    clearInterval(progressInterval);
                    return prev;
                }
                return { ...prev, [progressKey]: current + 10 };
            });
        }, 50);

        if (isImage) {
            const reader = new FileReader();
            reader.onload = (e) => {
                clearInterval(progressInterval);
                setUploadProgress(prev => {
                    const next = { ...prev };
                    delete next[progressKey];
                    return next;
                });
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
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                clearInterval(progressInterval);
                setUploadProgress(prev => {
                    const next = { ...prev };
                    delete next[progressKey];
                    return next;
                });
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
        }
    }, []);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [input]);

    // --- Slash Command Execution ---
    const executeCommand = useCallback((cmd: SlashCommand, extraArgs?: string) => {
        setShowSlashMenu(false);

        switch (cmd.action) {
            case 'navigate':
                if (cmd.target) {
                    setActiveView(cmd.target as any);
                }
                setInput('');
                break;

            case 'prefill': {
                const args = extraArgs || '';
                let message = '';
                if (cmd.command === '/wetter') {
                    message = args
                        ? `Wie ist das Wetter in ${args}?`
                        : `Wie ist das aktuelle Wetter?`;
                } else if (cmd.command === '/recherche') {
                    message = args
                        ? `Recherchiere im Web: ${args}`
                        : '';
                } else if (cmd.command === '/todo') {
                    // Send as slash command directly so SkillProcessor picks it up
                    message = args ? `/todo ${args}` : '';
                } else if (cmd.command === '/todos') {
                    message = '/todos';
                } else if (cmd.command === '/einkauf') {
                    message = args ? `/einkauf ${args}` : '';
                } else if (cmd.command === '/einkaufsliste') {
                    message = '/einkaufsliste';
                }
                if (message) {
                    sendMessage(message);
                    setActiveView('chat');
                    setInput('');
                } else {
                    // Just set prefix so user can continue typing
                    setInput(cmd.command + ' ');
                }
                break;
            }

            case 'execute': {
                if (cmd.command === '/kapsel') {
                    const msg = extraArgs || '';
                    if (msg) {
                        sendMessage(`Erstelle eine Zeitkapsel mit folgendem Inhalt: ${msg}`);
                        setActiveView('chat');
                        setInput('');
                    } else {
                        setActiveView('capsules');
                        setInput('');
                    }
                } else if (cmd.command === '/hilfe') {
                    const helpLines = SLASH_COMMANDS
                        .map(c => `**${c.command}** ${c.args} — ${c.description}`)
                        .join('\n');
                    const helpMessage = `Hier sind alle verfuegbaren Slash-Commands:\n\n${helpLines}`;
                    const store = useAppStore.getState();
                    store.addMessage({
                        id: Date.now().toString(),
                        role: 'assistant',
                        content: helpMessage,
                        timestamp: new Date(),
                    });
                    setActiveView('chat');
                    setInput('');
                }
                break;
            }
        }
    }, [sendMessage, setActiveView]);

    const selectCommand = useCallback((cmd: SlashCommand) => {
        if (cmd.args && cmd.action !== 'navigate') {
            // Command takes arguments -- fill input with prefix
            setInput(cmd.command + ' ');
            setShowSlashMenu(false);
            textareaRef.current?.focus();
        } else {
            executeCommand(cmd);
        }
    }, [executeCommand]);

    const handleSend = () => {
        if ((input.trim() || attachments.length > 0) && !isTyping) {
            const trimmed = input.trim();

            // Check if input is a slash command with args
            if (trimmed.startsWith('/')) {
                const spaceIndex = trimmed.indexOf(' ');
                const commandStr = spaceIndex > -1 ? trimmed.substring(0, spaceIndex) : trimmed;
                const args = spaceIndex > -1 ? trimmed.substring(spaceIndex + 1).trim() : '';
                const cmd = SLASH_COMMANDS.find(c => c.command === commandStr);
                if (cmd) {
                    executeCommand(cmd, args);
                    setAttachments([]);
                    return;
                }
            }

            sendMessage(trimmed, attachments);
            setInput('');
            setAttachments([]);
        }
    };

    const handleImageSelect = (file: File) => {
        processFile(file);
    };

    const handleFileSelect = (file: File) => {
        processFile(file);
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Slash menu keyboard navigation
        if (showSlashMenu && filteredCommands.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < filteredCommands.length - 1 ? prev + 1 : 0
                );
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev > 0 ? prev - 1 : filteredCommands.length - 1
                );
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                selectCommand(filteredCommands[selectedIndex]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowSlashMenu(false);
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

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

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + emoji.length, start + emoji.length);
        }, 0);
    };

    const isUploading = Object.keys(uploadProgress).length > 0;

    return (
        <div className="p-4 relative">
            {/* Slash Command Dropdown */}
            {showSlashMenu && filteredCommands.length > 0 && (
                <div
                    ref={menuRef}
                    className="slash-command-menu"
                >
                    <div className="slash-menu-header">
                        <Slash size={14} />
                        <span>Befehle</span>
                    </div>
                    {filteredCommands.map((cmd, index) => {
                        const Icon = cmd.icon;
                        return (
                            <button
                                key={cmd.command}
                                data-slash-item
                                className={`slash-command-item ${index === selectedIndex ? 'selected' : ''}`}
                                onMouseEnter={() => setSelectedIndex(index)}
                                onClick={() => selectCommand(cmd)}
                            >
                                <div className="slash-command-icon">
                                    <Icon size={18} />
                                </div>
                                <div className="slash-command-info">
                                    <span className="slash-command-name">
                                        {cmd.command}
                                        {cmd.args && (
                                            <span className="slash-command-args"> {cmd.args}</span>
                                        )}
                                    </span>
                                    <span className="slash-command-desc">{cmd.description}</span>
                                </div>
                            </button>
                        );
                    })}
                    <div className="slash-menu-footer">
                        <kbd>&uarr;&darr;</kbd> navigieren <kbd>&crarr;</kbd> auswaehlen <kbd>Esc</kbd> schliessen
                    </div>
                </div>
            )}

            {/* Attachment Previews */}
            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 px-1">
                    {attachments.map((att, index) => (
                        <div
                            key={index}
                            className="relative group animate-in fade-in zoom-in-95 duration-200"
                        >
                            {att.type === 'image' ? (
                                <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-bg-secondary">
                                    <img
                                        src={att.content}
                                        alt={att.name}
                                        className="w-full h-full object-cover"
                                    />
                                    <button
                                        onClick={() => removeAttachment(index)}
                                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
                                    >
                                        <X size={10} />
                                    </button>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-white truncate">
                                        {att.name}
                                    </div>
                                </div>
                            ) : (
                                <div className="relative flex items-center gap-2 bg-bg-secondary border border-border px-3 py-2 rounded-lg">
                                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                                        <FileText size={16} />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-xs text-text-primary truncate max-w-[120px]">{att.name}</span>
                                        <span className="text-[10px] text-text-secondary">
                                            {formatFileSize(att.content.length)}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => removeAttachment(index)}
                                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Upload Progress */}
            {isUploading && (
                <div className="mb-2 px-1">
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span>Datei wird verarbeitet...</span>
                    </div>
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
                </div>
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nachricht an NEON..."
                    disabled={isTyping}
                    autoFocus={true}
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
                Enter zum Senden &bull; Shift+Enter fuer neue Zeile &bull; <span className="text-primary/70">/</span> fuer Befehle
            </div>

            <style>{`
                .slash-command-menu {
                    position: absolute;
                    bottom: 100%;
                    left: 16px;
                    right: 16px;
                    margin-bottom: 8px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-subtle);
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.4);
                    z-index: 50;
                    max-height: 520px;
                    overflow-y: auto;
                    animation: slashMenuIn 0.15s ease-out;
                }

                @keyframes slashMenuIn {
                    from {
                        opacity: 0;
                        transform: translateY(8px) scale(0.98);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                .slash-menu-header {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 10px 14px 6px;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--accent-primary);
                }

                .slash-command-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: 100%;
                    padding: 10px 14px;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    transition: background 0.1s;
                    text-align: left;
                }

                .slash-command-item:hover,
                .slash-command-item.selected {
                    background: var(--bg-hover, rgba(255, 255, 255, 0.05));
                }

                .slash-command-item.selected {
                    border-left: 2px solid var(--accent-primary);
                }

                .slash-command-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 34px;
                    height: 34px;
                    border-radius: 8px;
                    background: rgba(249, 171, 0, 0.1);
                    color: var(--accent-primary);
                    flex-shrink: 0;
                }

                .slash-command-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    min-width: 0;
                }

                .slash-command-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .slash-command-args {
                    font-weight: 400;
                    color: var(--text-tertiary, #888);
                    font-size: 13px;
                }

                .slash-command-desc {
                    font-size: 12px;
                    color: var(--text-secondary);
                }

                .slash-menu-footer {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 14px;
                    font-size: 11px;
                    color: var(--text-tertiary, #666);
                    border-top: 1px solid var(--border-subtle);
                    background: rgba(0, 0, 0, 0.15);
                }

                .slash-menu-footer kbd {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 20px;
                    height: 18px;
                    padding: 0 4px;
                    font-size: 10px;
                    font-family: inherit;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid var(--border-subtle);
                    border-radius: 4px;
                    color: var(--text-secondary);
                }
            `}</style>
        </div>
    );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;
