import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export interface Attachment {
    type: 'image' | 'file';
    content: string;
    mimeType: string;
    name: string;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    attachments?: Attachment[];
    timestamp: Date;
    modelUsed?: string;
}

export interface Conversation {
    id: string;
    title: string;
    messages: Message[];
    userId?: string;
}

export interface UserProfile {
    id: string;
    name: string;
    avatar: string;
}

export type ViewMode = 'welcome' | 'chat' | 'admin' | 'memory' | 'search' | 'settings' | 'skills' | 'emotions' | 'predictive' | 'code' | 'capsules' | 'summary' | 'chains' | 'canvas' | 'rag' | 'discover';

export type PersonalityMode = 'freundlich' | 'sachlich' | 'sarkastisch' | 'lehrer' | 'pirat';

export interface PersonalityInfo {
    id: PersonalityMode;
    name: string;
    description: string;
    icon: string;
}

export const PERSONALITY_LIST: PersonalityInfo[] = [
    { id: 'sachlich', name: 'Sachlich', description: 'Neutral, praezise, keine Emoticons', icon: 'Scale' },
    { id: 'freundlich', name: 'Freundlich', description: 'Warm, hilfsbereit, ermutigend', icon: 'Smile' },
    { id: 'sarkastisch', name: 'Sarkastisch', description: 'Witzig, ironisch, aber hilfreich', icon: 'Laugh' },
    { id: 'lehrer', name: 'Lehrer', description: 'Erklaert ausfuehrlich, Gegenfragen', icon: 'GraduationCap' },
    { id: 'pirat', name: 'Pirat', description: 'Spricht wie ein Pirat, Arrr!', icon: 'Skull' },
];

// Load persisted users from localStorage
const loadPersistedUsers = (): UserProfile[] => {
    try {
        const stored = localStorage.getItem('neon-users');
        if (stored) return JSON.parse(stored);
    } catch {}
    const defaults: UserProfile[] = [{ id: 'default-user', name: 'Thorben', avatar: '👤' }];
    localStorage.setItem('neon-users', JSON.stringify(defaults));
    return defaults;
};

const loadCurrentUserId = (): string => {
    return localStorage.getItem('neon-current-user-id') || 'default-user';
};

interface AppState {
    socket: Socket | null;
    currentConversation: Conversation | null;
    conversations: Conversation[];
    isConnected: boolean;
    isTyping: boolean;
    currentProvider: string | null;
    searchStatus: string | null;
    searchModalOpen: boolean;
    isLearningMode: boolean;
    activeView: ViewMode;

    // New Feature: Pinned Chats
    pinnedIds: string[];

    // Multi-User
    currentUser: UserProfile;
    users: UserProfile[];

    initializeSocket: () => void;
    sendMessage: (message: string, attachments?: Attachment[]) => void;
    setCurrentConversation: (conversation: Conversation | null) => void;
    loadConversation: (conversationId: string) => void;
    loadConversations: () => void;
    deleteConversation: (conversationId: string) => void;
    addMessage: (message: Message) => void;
    updateLastMessage: (content: string, model?: string) => void;
    setSearchModalOpen: (open: boolean) => void;
    toggleLearningMode: () => void;
    setActiveView: (view: ViewMode) => void;

    // New Actions
    togglePinConversation: (id: string) => void;
    renameConversation: (id: string, newTitle: string) => void;

    // Multi-User Actions
    switchUser: (userId: string) => void;
    createUser: (name: string, avatar: string) => void;

    // Personality
    personality: PersonalityMode;
    setPersonality: (personality: PersonalityMode) => void;
}

// Auto-detect backend URL: use current hostname for network access
const SOCKET_URL = window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`  // Dev: Vite proxy or direct
    : window.location.origin;                     // Prod: same origin

const _initialUsers = loadPersistedUsers();
const _initialUserId = loadCurrentUserId();
const _initialCurrentUser = _initialUsers.find(u => u.id === _initialUserId) || _initialUsers[0];

export const useAppStore = create<AppState>((set, get) => ({
    socket: null,
    currentConversation: null,
    conversations: [],
    isConnected: false,
    isTyping: false,
    currentProvider: null,
    searchStatus: null,
    searchModalOpen: false,
    isLearningMode: false,
    activeView: 'welcome',
    pinnedIds: JSON.parse(localStorage.getItem('pinnedIds') || '[]'),
    currentUser: _initialCurrentUser,
    users: _initialUsers,
    personality: (localStorage.getItem('neon-personality') as PersonalityMode) || 'freundlich',

    initializeSocket: () => {
        const socket = io(SOCKET_URL);

        socket.on('connect', () => {
            console.log('Connected to backend');
            set({ isConnected: true, socket });
            // Register user for notifications
            socket.emit('register-user', { userId: get().currentUser.id });
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from backend');
            set({ isConnected: false });
        });

        // Debug Logging
        socket.on('debug:log', (data: { type: string, content: string, timestamp: string }) => {
            console.groupCollapsed(`🤖 AI Debug: ${data.type} (${new Date(data.timestamp).toLocaleTimeString()})`);
            console.log(data.content);
            console.groupEnd();
        });

        socket.on('ai-response-chunk', ({ chunk, provider }) => {
            // Detect and handle search status (don't add to message)
            // Check for search indicators (handle both \n and \\n)
            const normalizedChunk = chunk.replace(/\\n/g, '\n');

            if (normalizedChunk.includes('🔍') || chunk.includes('🔍')) {
                const match = chunk.match(/🔍.*?:.*?"(.+?)"/);
                set({ searchStatus: match ? match[1] : 'Recherchiere...' });
                return; // Don't add this chunk to the message
            }

            // Clear search status when any normal content arrives
            if (get().searchStatus) {
                set({ searchStatus: null });
            }

            // Only add normal content chunks to message
            get().updateLastMessage(chunk, provider);
            set({ currentProvider: provider });
        });

        socket.on('conversations-list', (conversations) => {
            set({ conversations });
        });

        socket.on('conversation-updated', ({ id, title }) => {
            set((state) => {
                const nextConversations = state.conversations.map(c =>
                    c.id === id ? { ...c, title } : c
                );

                // CRITICAL: Also update currentConversation if it's the one that changed
                let nextCurrent = state.currentConversation;
                if (nextCurrent && nextCurrent.id === id) {
                    nextCurrent = { ...nextCurrent, title };
                }

                return {
                    conversations: nextConversations,
                    currentConversation: nextCurrent
                };
            });
        });

        socket.on('ai-response-complete', ({ conversationId, provider }) => {
            console.log('Response complete', { conversationId, provider });
            set({ isTyping: false, currentProvider: null });

            // Update conversation ID if it's a new conversation
            const current = get().currentConversation;
            if (current && !current.id) {
                set({
                    currentConversation: {
                        ...current,
                        id: conversationId,
                    },
                });
                // Reload list to show new conversation immediately
                get().loadConversations();
            }
        });

        socket.on('typing-indicator', ({ isTyping }) => {
            set({ isTyping });
        });

        socket.on('conversation-data', (conversation) => {
            set({ currentConversation: conversation });
        });

        socket.on('error', ({ message }) => {
            console.error('Socket error:', message);
            set({ isTyping: false });
        });

        set({ socket });
    },

    sendMessage: (message: string, attachments?: Attachment[]) => {
        const { socket, currentConversation, isLearningMode, currentUser, personality } = get();
        if (!socket) return;

        // Construct payload
        const payload = {
            message,
            attachments,
            conversationId: currentConversation?.id,
            userId: currentUser.id,
            isLearning: isLearningMode,
            personality: personality,
        };

        // Emit
        socket.emit('user-message', payload);

        // Add user message immediately
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: message,
            attachments,
            timestamp: new Date(),
        };

        // Create or update conversation
        let conversation = currentConversation;
        if (!conversation) {
            conversation = {
                id: '', // Will be set by backend
                title: message.slice(0, 50),
                messages: [userMessage],
            };
            set({ currentConversation: conversation });
        } else {
            // IMMUTABLE UPDATE: Create new array
            const updatedMessages = [...conversation.messages, userMessage];
            set({
                currentConversation: {
                    ...conversation,
                    messages: updatedMessages
                }
            });
        }

        // Don't create AI message immediately - let updateLastMessage create it on first chunk
        // This prevents empty bubble from appearing before AI starts responding
        set({ isTyping: true });
    },

    setCurrentConversation: (conversation) => {
        set({ currentConversation: conversation });
    },

    loadConversation: (conversationId) => {
        const { socket } = get();
        if (!socket) return;
        socket.emit('get-conversation', { conversationId });
    },

    loadConversations: () => {
        const { socket, currentUser } = get();
        if (!socket) return;
        socket.emit('get-conversations', { userId: currentUser.id });
    },

    deleteConversation: (conversationId: string) => {
        const { socket } = get();
        if (!socket) return;

        // Optimistic update
        set((state) => {
            const newPinnedIds = state.pinnedIds.filter(id => id !== conversationId);
            localStorage.setItem('pinnedIds', JSON.stringify(newPinnedIds));

            return {
                conversations: state.conversations.filter(c => c.id !== conversationId),
                currentConversation: state.currentConversation?.id === conversationId ? null : state.currentConversation,
                pinnedIds: newPinnedIds
            }
        });

        socket.emit('delete-conversation', { conversationId });
    },

    togglePinConversation: (id: string) => {
        set((state) => {
            const isPinned = state.pinnedIds.includes(id);
            const newPinnedIds = isPinned
                ? state.pinnedIds.filter(pid => pid !== id)
                : [...state.pinnedIds, id];

            localStorage.setItem('pinnedIds', JSON.stringify(newPinnedIds));
            return { pinnedIds: newPinnedIds };
        });
    },

    renameConversation: (id: string, newTitle: string) => {
        const { socket } = get();
        if (!socket) return;

        // Optimistic update
        set((state) => {
            const nextConversations = state.conversations.map(c =>
                c.id === id ? { ...c, title: newTitle } : c
            );
            let nextCurrent = state.currentConversation;
            if (nextCurrent && nextCurrent.id === id) {
                nextCurrent = { ...nextCurrent, title: newTitle };
            }
            return { conversations: nextConversations, currentConversation: nextCurrent };
        });

        socket.emit('rename-conversation', { conversationId: id, title: newTitle });
    },

    addMessage: (message) => {
        const { currentConversation } = get();
        if (!currentConversation) return;

        set({
            currentConversation: {
                ...currentConversation,
                messages: [...currentConversation.messages, message]
            }
        });
    },

    updateLastMessage: (content, model?) => {
        const { currentConversation } = get();
        if (!currentConversation) return;

        const messages = [...currentConversation.messages];
        const lastIndex = messages.length - 1;
        const lastMessage = lastIndex >= 0 ? messages[lastIndex] : null;

        // If last message is from assistant, append to it
        if (lastMessage && lastMessage.role === 'assistant') {
            const updatedMessage = { ...lastMessage };
            updatedMessage.content += content;
            if (model) {
                updatedMessage.modelUsed = model;
            }
            messages[lastIndex] = updatedMessage;
        } else {
            // First chunk - create AI message now (delayed creation)
            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: content,
                timestamp: new Date(),
                modelUsed: model
            };
            messages.push(aiMessage);
        }

        set({
            currentConversation: {
                ...currentConversation,
                messages: messages
            }
        });
    },

    setSearchModalOpen: (open: boolean) => {
        set({ searchModalOpen: open });
    },

    toggleLearningMode: () => {
        set((state) => ({ isLearningMode: !state.isLearningMode }));
    },

    setActiveView: (view: ViewMode) => {
        set({ activeView: view });
    },

    switchUser: (userId: string) => {
        const { users, socket } = get();
        const user = users.find(u => u.id === userId);
        if (!user) return;
        localStorage.setItem('neon-current-user-id', userId);
        set({ currentUser: user, currentConversation: null, activeView: 'welcome' });
        // Re-register and reload conversations for new user
        if (socket) {
            socket.emit('register-user', { userId });
            socket.emit('get-conversations', { userId });
        }
    },

    createUser: (name: string, avatar: string) => {
        const id = `user-${Date.now()}`;
        const newUser: UserProfile = { id, name, avatar };
        const updatedUsers = [...get().users, newUser];
        localStorage.setItem('neon-users', JSON.stringify(updatedUsers));
        set({ users: updatedUsers });
    },

    setPersonality: (personality: PersonalityMode) => {
        localStorage.setItem('neon-personality', personality);
        set({ personality });
    },
}));
