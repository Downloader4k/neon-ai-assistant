import React, { useRef, useState, useEffect } from 'react';
import { Plus, Image as ImageIcon, FileText } from 'lucide-react';

interface AttachmentMenuProps {
    onSelectImage: (file: File) => void;
    onSelectFile: (file: File) => void;
    direction?: 'up' | 'down';
}

export const AttachmentMenu: React.FC<AttachmentMenuProps> = ({ onSelectImage, onSelectFile, direction = 'down' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
        const file = e.target.files?.[0];
        if (file) {
            if (type === 'image') onSelectImage(file);
            else onSelectFile(file);
            setIsOpen(false);
        }
        // Reset input
        e.target.value = '';
    };

    const positionClasses = direction === 'up'
        ? 'bottom-full mb-2'
        : 'top-full mt-2';

    return (
        <div className="relative hover:z-20" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-1 rounded-full transition-colors relative hover:z-10 ${isOpen
                    ? 'bg-bg-tertiary text-primary rotate-45'
                    : 'bg-transparent text-[#999] hover:text-[#f9ab00] hover:bg-transparent'
                    }`}
                title="Anhang hinzufügen"
            >
                <Plus size={20} />
            </button>

            {isOpen && (
                <div className={`absolute left-0 w-48 bg-[#252525] border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-[100] ${positionClasses}`}>
                    <button
                        onClick={() => imageInputRef.current?.click()}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-tertiary text-text-primary text-sm text-left transition-colors"
                    >
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                            <ImageIcon size={16} />
                        </div>
                        Foto hochladen
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-tertiary text-text-primary text-sm text-left transition-colors"
                    >
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                            <FileText size={16} />
                        </div>
                        Datei hochladen
                    </button>
                </div>
            )}

            <input
                type="file"
                ref={imageInputRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, 'image')}
            />
            <input
                type="file"
                ref={fileInputRef}
                accept=".txt,.pdf,.md,.ts,.js,.json" // Add more as needed
                className="hidden"
                onChange={(e) => handleFileChange(e, 'file')}
            />
        </div>
    );
};
