import { useState, useRef, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useAppStore, Message } from '../store/useAppStore';

function formatTimestamp(timestamp: Date | string): string {
    const date = new Date(timestamp);
    return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDateHeader(): string {
    return new Date().toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getRoleLabel(role: 'user' | 'assistant'): string {
    return role === 'user' ? 'Du' : 'NEON';
}

function buildMarkdown(title: string, messages: Message[]): string {
    const lines: string[] = [];
    lines.push(`# ${title}`);
    lines.push(`**Exportiert am:** ${formatDateHeader()}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const msg of messages) {
        const role = getRoleLabel(msg.role);
        const time = formatTimestamp(msg.timestamp);
        lines.push(`### ${role} — ${time}`);
        lines.push('');
        lines.push(msg.content);
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    return lines.join('\n');
}

function buildPlainText(title: string, messages: Message[]): string {
    const lines: string[] = [];
    lines.push(title);
    lines.push(`Exportiert am: ${formatDateHeader()}`);
    lines.push('');
    lines.push('='.repeat(50));
    lines.push('');

    for (const msg of messages) {
        const role = getRoleLabel(msg.role);
        const time = formatTimestamp(msg.timestamp);
        lines.push(`[${role}] ${time}`);
        lines.push(msg.content);
        lines.push('');
        lines.push('-'.repeat(50));
        lines.push('');
    }

    return lines.join('\n');
}

function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function sanitizeFilename(title: string): string {
    return title
        .replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 50) || 'unterhaltung';
}

export default function ExportDropdown() {
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const currentConversation = useAppStore((state) => state.currentConversation);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    if (!currentConversation || currentConversation.messages.length === 0) {
        return null;
    }

    const title = currentConversation.title || 'Unterhaltung';
    const messages = currentConversation.messages;
    const baseName = sanitizeFilename(title);

    const handleExportMarkdown = () => {
        const content = buildMarkdown(title, messages);
        downloadFile(content, `${baseName}.md`, 'text/markdown;charset=utf-8');
        setOpen(false);
    };

    const handleExportText = () => {
        const content = buildPlainText(title, messages);
        downloadFile(content, `${baseName}.txt`, 'text/plain;charset=utf-8');
        setOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setOpen(!open)}
                className="export-btn"
                title="Unterhaltung exportieren"
            >
                <Download size={18} />
            </button>

            {open && (
                <div className="export-dropdown">
                    <button
                        className="export-dropdown-item"
                        onClick={handleExportMarkdown}
                    >
                        Als Markdown exportieren
                    </button>
                    <button
                        className="export-dropdown-item"
                        onClick={handleExportText}
                    >
                        Als Text exportieren
                    </button>
                </div>
            )}

            <style>{`
                .export-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 36px;
                    height: 36px;
                    border-radius: var(--radius-sm, 6px);
                    border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
                    background: rgba(255, 255, 255, 0.03);
                    color: var(--text-secondary, #a0a0a0);
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .export-btn:hover {
                    background: var(--bg-hover, rgba(255,255,255,0.06));
                    color: var(--accent-primary, #f9ab00);
                    border-color: var(--accent-primary, #f9ab00);
                }

                .export-dropdown {
                    position: absolute;
                    top: calc(100% + 6px);
                    right: 0;
                    min-width: 220px;
                    background: var(--bg-secondary, #1a1a2e);
                    border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
                    border-radius: var(--radius-md, 8px);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                    overflow: hidden;
                    z-index: 50;
                    animation: fadeIn 0.15s ease-out;
                }

                .export-dropdown-item {
                    display: block;
                    width: 100%;
                    text-align: left;
                    padding: 0.6rem 1rem;
                    font-size: 0.875rem;
                    color: var(--text-secondary, #a0a0a0);
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .export-dropdown-item:hover {
                    background: var(--bg-hover, rgba(255,255,255,0.06));
                    color: var(--accent-primary, #f9ab00);
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
