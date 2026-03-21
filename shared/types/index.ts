export type MessageRole = 'user' | 'assistant' | 'system';
export type AIProvider = 'claude' | 'ollama' | 'hybrid';

export interface Message {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: Date;
    modelUsed?: string;
}

export interface Conversation {
    id: string;
    title: string;
    summary?: string;
    messages: Message[];
    createdAt: Date;
    updatedAt: Date;
}

export interface User {
    id: string;
    name: string;
    email?: string;
    preferences?: Record<string, any>;
}
