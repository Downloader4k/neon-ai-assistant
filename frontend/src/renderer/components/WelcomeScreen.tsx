import { useState, useEffect, useRef } from 'react';
import { Sparkles, Zap, MessageSquare, FileText, Image as ImageIcon, Send, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AttachmentMenu } from './AttachmentMenu';
import { EmojiMenu } from './EmojiMenu';

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
  const inputRef = useRef<HTMLInputElement>(null);

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
              <span className="greeting-text">Hallo {userName}!</span>
            </div>
            <h2 className="main-question fade-in">{greetingSubtext}</h2>
          </div>

          {/* Central Chat Input */}
          <div className="welcome-chat-input-container">
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
