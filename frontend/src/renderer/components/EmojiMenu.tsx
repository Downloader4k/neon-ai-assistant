import React, { useRef, useState, useEffect } from 'react';
import EmojiPicker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';
import { Smile } from 'lucide-react';

interface EmojiMenuProps {
    onEmojiClick: (emoji: string) => void;
    direction?: 'up' | 'down';
}

export const EmojiMenu: React.FC<EmojiMenuProps> = ({ onEmojiClick, direction = 'down' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleEmojiClick = (emojiData: EmojiClickData) => {
        onEmojiClick(emojiData.emoji);
        // Optional: Keep open or close? Usually keep open for multiple emojis helps, but typical "picker" closes. 
        // Let's keep it open or toggle? User didn't specify. Standard behavior often closes. 
        // But for "Menu", clicking one might be enough. Let's close it for now to be cleaner.
        setIsOpen(false);
    };

    const positionClasses = direction === 'up'
        ? 'bottom-full mb-2 origin-bottom-left'
        : 'top-full mt-2 origin-top-left';

    return (
        <div className="relative hover:z-20" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-1 rounded-full transition-colors relative hover:z-10 ${isOpen
                    ? 'bg-bg-tertiary text-primary'
                    : 'bg-transparent text-primary hover:bg-primary/10'
                    }`}
                title="Emoji auswählen"
            >
                {/* Yellow tone as requested ("gelber Farbton") */}
                <Smile size={20} />
            </button>

            {isOpen && (
                <div className={`absolute left-0 z-[100] ${positionClasses} animate-in fade-in zoom-in-95 duration-200`}>
                    <div className="shadow-2xl rounded-xl overflow-hidden border border-border emoji-picker-custom">
                        <EmojiPicker
                            onEmojiClick={handleEmojiClick}
                            theme={Theme.DARK}
                            emojiStyle={EmojiStyle.TWITTER}
                            lazyLoadEmojis={true}
                            width={300}
                            height={415}
                            searchDisabled={false}
                            searchPlaceholder="Suchen..."
                            previewConfig={{ showPreview: false }}
                            categories={[
                                { category: 'suggested' as any, name: 'Häufig' },
                                { category: 'smileys_people' as any, name: 'Smileys' },
                                { category: 'animals_nature' as any, name: 'Tiere & Natur' },
                                { category: 'food_drink' as any, name: 'Essen & Trinken' },
                                { category: 'travel_places' as any, name: 'Reisen' },
                                { category: 'activities' as any, name: 'Aktivitäten' },
                                { category: 'objects' as any, name: 'Objekte' },
                                { category: 'symbols' as any, name: 'Symbole' },
                                { category: 'flags' as any, name: 'Flaggen' }
                            ]}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
