import React, { useEffect, useRef } from 'react';
import { MoreHorizontal, Pin } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { parseTwemoji } from '../utils/twemojiHelper';

interface ConversationItemProps {
    conv: any;
    isPinned: boolean;
    isActive: boolean;
    isEditing: boolean;
    editTitle: string;
    setEditTitle: (title: string) => void;
    saveRename: () => void;
    handleKeyDown: (e: React.KeyboardEvent) => void;
    onContextMenu: (e: React.MouseEvent, id: string) => void;
    setActiveView: (view: any) => void;
    setContextMenu: (menu: any) => void;
    contextMenuId: string | undefined;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
    conv,
    isPinned,
    isActive,
    isEditing,
    editTitle,
    setEditTitle,
    saveRename,
    handleKeyDown,
    onContextMenu,
    setActiveView,
    setContextMenu,
    contextMenuId
}) => {
    const titleRef = useRef<HTMLSpanElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    // Parse emojis in title
    useEffect(() => {
        if (titleRef.current && !isEditing) {
            parseTwemoji(titleRef.current);
        }
    }, [conv.title, isEditing]);

    useEffect(() => {
        if (isEditing && editInputRef.current) {
            editInputRef.current.focus();
        }
    }, [isEditing]);

    return (
        <div
            className={`conversation-item group mx-2 ${isActive ? 'active' : ''} ${isEditing ? 'border-[1px] border-solid border-[#e0e0e0] bg-bg-hover' : 'border border-transparent'}`}
            onClick={() => {
                if (!isEditing) {
                    useAppStore.getState().loadConversation(conv.id);
                    setActiveView('chat');
                }
            }}
            onContextMenu={(e) => onContextMenu(e, conv.id)}
        >
            {isEditing ? (
                <input
                    ref={editInputRef}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={saveRename}
                    onKeyDown={handleKeyDown}
                    className="ml-2 text-sm bg-transparent text-text-primary border-none outline-none w-full"
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span
                    ref={titleRef}
                    className="conversation-title truncate ml-2 text-sm select-none"
                >
                    {conv.title}
                </span>
            )}

            {/* Context Menu Trigger (Hide when editing) */}
            {!isEditing && (
                <button
                    className={`more-btn ml-auto p-1 text-text-tertiary hover:text-text-primary rounded-md hover:bg-bg-hover opacity-0 group-hover:opacity-100 transition-all ${contextMenuId === conv.id ? 'opacity-100' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, id: conv.id });
                    }}
                >
                    <MoreHorizontal size={16} />
                </button>
            )}

            {/* Pin Icon */}
            {isPinned && !isEditing && <Pin size={12} className="ml-1 text-accent opacity-80 flex-shrink-0" />}
        </div>
    );
};
