import { useState, useRef, useEffect } from 'react';
import { useAppStore, UserProfile } from '../store/useAppStore';
import { Plus, X, ChevronUp } from 'lucide-react';

const AVATAR_OPTIONS = [
    '👤', '👩‍💻', '🧑‍🎓', '🦊', '🐱', '🤖', '🎮', '🎨',
    '🎵', '🌟', '🔥', '💎', '🌈', '🚀', '⚡', '🦄',
    '🐉', '🎯', '💡', '🌙',
];

interface UserSwitcherProps {
    sidebarOpen: boolean;
}

export default function UserSwitcher({ sidebarOpen }: UserSwitcherProps) {
    const currentUser = useAppStore((s) => s.currentUser);
    const users = useAppStore((s) => s.users);
    const switchUser = useAppStore((s) => s.switchUser);
    const createUser = useAppStore((s) => s.createUser);

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAvatar, setNewAvatar] = useState('👤');

    const dropdownRef = useRef<HTMLDivElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        if (dropdownOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [dropdownOpen]);

    // Auto-focus name input in modal
    useEffect(() => {
        if (showCreateModal && nameInputRef.current) {
            nameInputRef.current.focus();
        }
    }, [showCreateModal]);

    const handleCreateUser = () => {
        if (!newName.trim()) return;
        createUser(newName.trim(), newAvatar);
        setNewName('');
        setNewAvatar('👤');
        setShowCreateModal(false);
    };

    const handleSelect = (user: UserProfile) => {
        switchUser(user.id);
        setDropdownOpen(false);
    };

    return (
        <>
            <div className="relative" ref={dropdownRef}>
                {/* Trigger Button */}
                <button
                    className={`user-switcher-btn w-full ${!sidebarOpen ? 'justify-center px-0' : ''}`}
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    title={sidebarOpen ? undefined : currentUser.name}
                >
                    <span className="user-avatar-display">{currentUser.avatar}</span>
                    {sidebarOpen && (
                        <>
                            <span className="flex-1 text-left text-sm text-text-primary truncate ml-2">
                                {currentUser.name}
                            </span>
                            <ChevronUp
                                size={14}
                                className={`text-text-tertiary transition-transform ${dropdownOpen ? '' : 'rotate-180'}`}
                            />
                        </>
                    )}
                </button>

                {/* Dropdown */}
                {dropdownOpen && (
                    <div className="user-dropdown">
                        <div className="user-dropdown-header">Profil wechseln</div>
                        <div className="user-dropdown-list">
                            {users.map((user) => (
                                <button
                                    key={user.id}
                                    className={`user-dropdown-item ${user.id === currentUser.id ? 'active' : ''}`}
                                    onClick={() => handleSelect(user)}
                                >
                                    <span className={`user-dropdown-avatar ${user.id === currentUser.id ? 'active-ring' : ''}`}>
                                        {user.avatar}
                                    </span>
                                    <span className="text-sm truncate">{user.name}</span>
                                </button>
                            ))}
                        </div>
                        <div className="user-dropdown-divider" />
                        <button
                            className="user-dropdown-item create-btn"
                            onClick={() => {
                                setDropdownOpen(false);
                                setShowCreateModal(true);
                            }}
                        >
                            <span className="user-dropdown-add-icon">
                                <Plus size={14} />
                            </span>
                            <span className="text-sm">Neues Profil</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Create Profile Modal */}
            {showCreateModal && (
                <div className="user-modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="user-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="user-modal-header">
                            <h3>Neues Profil erstellen</h3>
                            <button
                                className="user-modal-close"
                                onClick={() => setShowCreateModal(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="user-modal-body">
                            {/* Avatar Preview */}
                            <div className="user-modal-avatar-preview">
                                <span className="text-4xl">{newAvatar}</span>
                            </div>

                            {/* Name Input */}
                            <div className="user-modal-field">
                                <label className="user-modal-label">Name</label>
                                <input
                                    ref={nameInputRef}
                                    type="text"
                                    className="user-modal-input"
                                    placeholder="Name eingeben..."
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateUser();
                                        if (e.key === 'Escape') setShowCreateModal(false);
                                    }}
                                    maxLength={24}
                                />
                            </div>

                            {/* Avatar Picker */}
                            <div className="user-modal-field">
                                <label className="user-modal-label">Avatar</label>
                                <div className="user-modal-avatar-grid">
                                    {AVATAR_OPTIONS.map((emoji) => (
                                        <button
                                            key={emoji}
                                            className={`user-modal-avatar-option ${newAvatar === emoji ? 'selected' : ''}`}
                                            onClick={() => setNewAvatar(emoji)}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="user-modal-footer">
                            <button
                                className="user-modal-btn-cancel"
                                onClick={() => setShowCreateModal(false)}
                            >
                                Abbrechen
                            </button>
                            <button
                                className="user-modal-btn-create"
                                onClick={handleCreateUser}
                                disabled={!newName.trim()}
                            >
                                Erstellen
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .user-switcher-btn {
                    display: flex;
                    align-items: center;
                    padding: 0.5rem 0.6rem;
                    border-radius: var(--radius-sm);
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    transition: background 0.2s;
                    color: var(--text-primary);
                }
                .user-switcher-btn:hover {
                    background: var(--bg-hover);
                }
                .user-avatar-display {
                    font-size: 1.25rem;
                    line-height: 1;
                    flex-shrink: 0;
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    background: rgba(249, 171, 0, 0.1);
                }
                .user-dropdown {
                    position: absolute;
                    bottom: calc(100% + 8px);
                    left: 0;
                    right: 0;
                    min-width: 220px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-md);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                    z-index: 50;
                    overflow: hidden;
                    animation: userDropdownIn 0.15s ease-out;
                }
                @keyframes userDropdownIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .user-dropdown-header {
                    padding: 0.6rem 0.75rem;
                    font-size: 0.7rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-tertiary);
                }
                .user-dropdown-list {
                    max-height: 200px;
                    overflow-y: auto;
                }
                .user-dropdown-item {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    color: var(--text-secondary);
                    transition: all 0.15s;
                    text-align: left;
                }
                .user-dropdown-item:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                }
                .user-dropdown-item.active {
                    color: var(--accent-primary);
                    background: rgba(249, 171, 0, 0.05);
                }
                .user-dropdown-avatar {
                    font-size: 1.1rem;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    flex-shrink: 0;
                    background: rgba(255,255,255,0.03);
                    border: 2px solid transparent;
                }
                .user-dropdown-avatar.active-ring {
                    border-color: var(--accent-primary);
                    background: rgba(249, 171, 0, 0.1);
                }
                .user-dropdown-divider {
                    height: 1px;
                    background: var(--border-subtle);
                    margin: 0.25rem 0;
                }
                .user-dropdown-item.create-btn {
                    color: var(--accent-primary);
                }
                .user-dropdown-add-icon {
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    border: 1px dashed var(--accent-primary);
                    flex-shrink: 0;
                }

                /* Modal */
                .user-modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.6);
                    backdrop-filter: blur(4px);
                    z-index: 200;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.15s ease;
                }
                .user-modal {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-lg, 12px);
                    width: 380px;
                    max-width: 90vw;
                    box-shadow: 0 16px 48px rgba(0,0,0,0.5);
                    animation: modalSlideIn 0.2s ease-out;
                }
                @keyframes modalSlideIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .user-modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 1rem 1.25rem;
                    border-bottom: 1px solid var(--border-subtle);
                }
                .user-modal-header h3 {
                    font-size: 1rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin: 0;
                }
                .user-modal-close {
                    background: transparent;
                    border: none;
                    color: var(--text-tertiary);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: var(--radius-sm);
                    display: flex;
                    align-items: center;
                }
                .user-modal-close:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                }
                .user-modal-body {
                    padding: 1.25rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .user-modal-avatar-preview {
                    display: flex;
                    justify-content: center;
                    padding: 0.5rem 0;
                }
                .user-modal-field {
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                }
                .user-modal-label {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .user-modal-input {
                    padding: 0.55rem 0.75rem;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-sm);
                    color: var(--text-primary);
                    font-size: 0.9rem;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .user-modal-input:focus {
                    border-color: var(--accent-primary);
                }
                .user-modal-input::placeholder {
                    color: var(--text-tertiary);
                }
                .user-modal-avatar-grid {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 6px;
                }
                .user-modal-avatar-option {
                    font-size: 1.3rem;
                    width: 100%;
                    aspect-ratio: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: var(--radius-sm);
                    border: 2px solid transparent;
                    background: var(--bg-primary);
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .user-modal-avatar-option:hover {
                    background: var(--bg-hover);
                    border-color: rgba(249, 171, 0, 0.3);
                }
                .user-modal-avatar-option.selected {
                    border-color: var(--accent-primary);
                    background: rgba(249, 171, 0, 0.1);
                }
                .user-modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.5rem;
                    padding: 0.75rem 1.25rem;
                    border-top: 1px solid var(--border-subtle);
                }
                .user-modal-btn-cancel {
                    padding: 0.45rem 1rem;
                    font-size: 0.85rem;
                    border-radius: var(--radius-sm);
                    border: 1px solid var(--border-subtle);
                    background: transparent;
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .user-modal-btn-cancel:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                }
                .user-modal-btn-create {
                    padding: 0.45rem 1.25rem;
                    font-size: 0.85rem;
                    border-radius: var(--radius-sm);
                    border: none;
                    background: var(--accent-primary);
                    color: #000;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .user-modal-btn-create:hover:not(:disabled) {
                    filter: brightness(1.1);
                }
                .user-modal-btn-create:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
            `}</style>
        </>
    );
}
