import { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, Zap, MessageSquare, FileText, Image as ImageIcon, Send, X, CloudSun, Search, Code2, Gift, Globe, Brain, HelpCircle, Slash, ListTodo, ShoppingCart, ClipboardList, Calendar, type LucideIcon } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AttachmentMenu } from './AttachmentMenu';
import { EmojiMenu } from './EmojiMenu';

// --- Slash Commands (shared definition) ---
interface SlashCommand {
  command: string;
  args: string;
  description: string;
  icon: LucideIcon;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/wetter', args: '[stadt]', description: 'Wetter abfragen', icon: CloudSun },
  { command: '/suche', args: '[query]', description: 'Semantische Suche oeffnen', icon: Search },
  { command: '/code', args: '[sprache]', description: 'Code-Tools oeffnen', icon: Code2 },
  { command: '/kapsel', args: '[nachricht]', description: 'Schnell eine Zeitkapsel erstellen', icon: Gift },
  { command: '/recherche', args: '[thema]', description: 'Web-Recherche starten', icon: Globe },
  { command: '/memory', args: '[query]', description: 'Gedaechtnis durchsuchen', icon: Brain },
  { command: '/todo', args: '[aufgabe]', description: 'Todo erstellen', icon: ListTodo },
  { command: '/todos', args: '', description: 'Alle offenen Todos anzeigen', icon: ListTodo },
  { command: '/einkauf', args: '[artikel, ...]', description: 'Einkaufsliste: Artikel hinzufuegen', icon: ShoppingCart },
  { command: '/einkaufsliste', args: '', description: 'Einkaufsliste anzeigen', icon: ShoppingCart },
  { command: '/termin', args: '[beschreibung]', description: 'Termin erstellen', icon: Calendar },
  { command: '/termine', args: '', description: 'Naechste Termine anzeigen', icon: Calendar },
  { command: '/kalender', args: '', description: 'Kalender oeffnen', icon: Calendar },
  { command: '/listen', args: '', description: 'Listen-Manager oeffnen', icon: ClipboardList },
  { command: '/hilfe', args: '', description: 'Alle Commands anzeigen', icon: HelpCircle },
];

interface Attachment {
  type: 'image' | 'file';
  content: string;
  mimeType: string;
  name: string;
}

export default function WelcomeScreen({ onStartChat }: { onStartChat: (msg?: string, attachments?: Attachment[]) => void }) {
  const currentUser = useAppStore((s) => s.currentUser);
  const userName = currentUser?.name || 'User';
  const [inputValue, setInputValue] = useState('');
  const [greetingSubtext, setGreetingSubtext] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const setActiveView = useAppStore((s) => s.setActiveView);

  // Slash command filtering
  const filteredCommands = useMemo(() => {
    if (!showSlashMenu) return [];
    const typed = inputValue.toLowerCase();
    if (typed === '/') return SLASH_COMMANDS;
    const commandPart = typed.split(' ')[0];
    return SLASH_COMMANDS.filter(cmd => cmd.command.startsWith(commandPart));
  }, [inputValue, showSlashMenu]);

  // Detect slash at start of input
  useEffect(() => {
    if (inputValue.startsWith('/') && inputValue.indexOf(' ') === -1) {
      setShowSlashMenu(true);
      setSelectedIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, [inputValue]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, selectedIndex]);

  // Scroll selected into view
  useEffect(() => {
    if (showSlashMenu && menuRef.current) {
      const items = menuRef.current.querySelectorAll('[data-slash-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, showSlashMenu]);

  const selectSlashCommand = (cmd: SlashCommand) => {
    setShowSlashMenu(false);
    // Navigate commands
    const navTargets: Record<string, string> = { '/suche': 'search', '/code': 'code', '/memory': 'memory', '/kapsel': 'capsules', '/listen': 'lists' };
    if (navTargets[cmd.command]) {
      setInputValue('');
      setActiveView(navTargets[cmd.command] as any);
      return;
    }
    // Hilfe: just start chat with /hilfe
    if (cmd.command === '/hilfe') {
      onStartChat('/hilfe');
      setInputValue('');
      return;
    }
    // Prefill commands: put command + space in input
    if (cmd.args) {
      setInputValue(cmd.command + ' ');
      inputRef.current?.focus();
    } else {
      onStartChat(cmd.command);
      setInputValue('');
    }
  };

  // Random greeting questions
  useEffect(() => {
    const questions = [
      "Womit fangen wir an?",
      "Wie kann ich dir heute helfen?",
      "Bist du bereit?",
      "Was steht heute an?",
      "Lass uns etwas erschaffen."
    ];
    setGreetingSubtext(questions[Math.floor(Math.random() * questions.length)]);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inputValue.trim() || attachments.length > 0) {
      onStartChat(inputValue.trim(), attachments);
    }
  };

  const handleImageSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setAttachments(prev => [...prev, {
          type: 'image',
          content: e.target!.result as string, // Base64
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
          content: e.target!.result as string, // Text content
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
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSlashCommand(filteredCommands[selectedIndex]);
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
      handleSubmit();
    }
  };

  const handleEmojiClick = (emoji: string) => {
    const input = inputRef.current;
    if (!input) {
      setInputValue(prev => prev + emoji);
      return;
    }

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const newValue = inputValue.substring(0, start) + emoji + inputValue.substring(end);

    setInputValue(newValue);

    // Restore focus and cursor position after render
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  const suggestions = [
    { icon: Zap, text: 'Erstelle einen Projektplan für eine Web-App', category: 'Produktivität' },
    { icon: FileText, text: 'Erkläre mir Quantencomputing einfach', category: 'Lernen' },
    { icon: ImageIcon, text: 'Generiere ein Logo für mein Startup', category: 'Kreativ' },
    { icon: MessageSquare, text: 'Hilf mir beim Debugging meines Codes', category: 'Programmieren' },
  ];

  return (
    <div className="welcome-container">
      <div className="welcome-content">

        {/* Content Wrapper for Left Alignment (matching Input width) */}
        <div className="content-wrapper">

          {/* Header: Logo + Small Greeting -> Large Question */}
          <div className="welcome-header-modern">
            <div className="greeting-row">
              <Sparkles size={32} className="greeting-icon" />
              <span className="greeting-text">Hallo {userName}</span>
            </div>
            <h2 className="main-question fade-in">{greetingSubtext}</h2>
          </div>

          {/* Central Chat Input */}
          <div className="welcome-chat-input-container" style={{ position: 'relative' }}>
            {/* Attachment Chips */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 px-2">
                {attachments.map((att, index) => (
                  <div key={index} className="flex items-center gap-2 bg-bg-secondary border border-border px-3 py-1 rounded-full text-sm text-text-primary animate-in fade-in zoom-in-95">
                    <span className="truncate max-w-[150px]">{att.name}</span>
                    <button
                      onClick={() => removeAttachment(index)}
                      className="hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Slash Command Menu */}
            {showSlashMenu && filteredCommands.length > 0 && (
              <div ref={menuRef} className="slash-command-menu" style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 -4px 24px rgba(0,0,0,0.4)', zIndex: 50, maxHeight: 520, overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px 6px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)' }}>
                  <Slash size={14} />
                  <span>Befehle</span>
                </div>
                {filteredCommands.map((cmd, index) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.command}
                      data-slash-item
                      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 14px', border: 'none', background: index === selectedIndex ? 'var(--bg-hover, rgba(255,255,255,0.05))' : 'transparent', cursor: 'pointer', textAlign: 'left', borderLeft: index === selectedIndex ? '2px solid var(--accent-primary)' : '2px solid transparent' }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => selectSlashCommand(cmd)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, background: 'rgba(249,171,0,0.1)', color: 'var(--accent-primary)', flexShrink: 0 }}>
                        <Icon size={18} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {cmd.command}
                          {cmd.args && <span style={{ fontWeight: 400, color: 'var(--text-tertiary, #888)', fontSize: 13 }}> {cmd.args}</span>}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cmd.description}</span>
                      </div>
                    </button>
                  );
                })}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 11, color: 'var(--text-tertiary, #666)', borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.15)' }}>
                  <kbd style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 18, padding: '0 4px', fontSize: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-secondary)' }}>&uarr;&darr;</kbd> navigieren
                  <kbd style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 18, padding: '0 4px', fontSize: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-secondary)' }}>&crarr;</kbd> auswaehlen
                  <kbd style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 18, padding: '0 4px', fontSize: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-secondary)' }}>Esc</kbd> schliessen
                </div>
              </div>
            )}

            <div className="relative flex items-center gap-2 bg-bg-secondary rounded-[24px] p-2 pr-4 border border-transparent focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-sm">
              <div className="pl-1 flex items-center gap-1">
                <AttachmentMenu
                  onSelectImage={handleImageSelect}
                  onSelectFile={handleFileSelect}
                />
                <EmojiMenu onEmojiClick={handleEmojiClick} />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Frag mich etwas..."
                className="welcome-chat-input clean-input flex-1 text-lg placeholder-text-tertiary"
              />
              <button
                onClick={() => handleSubmit()}
                disabled={!inputValue.trim() && attachments.length === 0}
                className="p-2 bg-transparent text-primary rounded-full hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send size={20} className="drop-shadow-neon" />
              </button>
            </div>
          </div>

          {/* Quick Start Pills - Left aligned */}
          <div className="suggestions-pills">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                className="suggestion-pill"
                onClick={() => {
                  setInputValue(suggestion.text);
                  // Focus input after clicking pill
                  const inputElement = document.querySelector('.welcome-chat-input') as HTMLInputElement;
                  if (inputElement) inputElement.focus();
                }}
              >
                <suggestion.icon size={16} className="pill-icon" />
                <span className="pill-text">{suggestion.category}</span>
              </button>
            ))}
          </div>

        </div>

        {/* Features - Removed as requested 'nur noch...' implies minimal */}
      </div>

      <style>{`
        .welcome-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100%;
          padding: 2rem;
          background: var(--bg-primary); /* Darker background */
        }

        .welcome-content {
          width: 100%;
          animation: fadeIn 0.6s ease-out;
        }

        /* Wrapper to align Header, Input, and Grid */
        .content-wrapper {
            max-width: 48rem;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
        }

        .welcome-header-modern {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          margin-bottom: 1rem;
          padding-left: 0.5rem;
          /* FIX: Disable text selection and cursor blinking on static text */
          user-select: none;
          cursor: default;
          caret-color: transparent; 
        }

        .greeting-row {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 0.25rem;
        }

        .greeting-icon {
            color: var(--accent-primary);
        }

        .greeting-text {
            font-size: 1.5rem;
            font-weight: 500;
            color: var(--text-secondary); /* More subtle greeting color */
            caret-color: transparent; /* Extra safety */
        }

        .main-question {
            font-size: 2rem;
            font-weight: 600;
            color: var(--text-tertiary);
            line-height: 1.2;
            caret-color: transparent; /* Extra safety */
        }

        /* Input Styles */
        .welcome-chat-input-container {
            width: 100%;
            margin: 0 0 2rem 0;
        }

        .welcome-chat-input {
            width: 100%;
            padding: 0.5rem;
            font-size: 1.125rem;
            color: var(--text-primary);
        }

        /* Removed old input styles as we use inline classes now for flex container */

        .welcome-chat-input:focus {
            background: var(--bg-tertiary);
            box-shadow: 0 0 0 2px var(--bg-tertiary);
        }
        
        .welcome-chat-input::placeholder {
            color: var(--text-tertiary);
        }


        
        .welcome-send-btn:hover:not(:disabled) {
            background: var(--bg-hover);
        }
        
        .welcome-send-btn:disabled {
            background: transparent;
            color: var(--text-tertiary);
            cursor: not-allowed;
            opacity: 0.5;
        }

        /* Pills Grid */
        .suggestions-pills {
          display: flex;
          flex-wrap: wrap;
          justify-content: center; /* Centered relative to input */
          gap: 0.75rem;
          padding-left: 0;
        }

        .suggestion-pill {
          background: var(--bg-card); /* Restore Card BG */
          border: 1px solid var(--border-subtle);
          border-radius: 999px;
          padding: 0.6rem 1.2rem; /* Slightly larger padding for 'premium' feel */
          display: flex;
          align-items: center;
          gap: 0.75rem;
          transition: all 0.2s;
          cursor: pointer;
          color: var(--text-primary); /* Brighter text again */
          font-size: 0.9rem;
          font-weight: 500;
          box-shadow: var(--shadow-sm); /* Subtle depth */
        }

        .suggestion-pill:hover {
          background: var(--bg-tertiary);
          border-color: var(--accent-primary); /* Restore accent hover */
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
        }

        .pill-icon {
            color: var(--accent-primary); /* Restore accent icon color */
            opacity: 1;
        }

        .features-list {
            display: none;
        }

        @media (max-width: 768px) {
          .welcome-title {
            font-size: 2.5rem;
          }

          .suggestions-grid {
            grid-template-columns: 1fr;
          }

          .features-list {
            flex-direction: column;
            align-items: center;
            gap: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
