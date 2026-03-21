import { useAppStore } from '../store/useAppStore';

export default function TypingIndicator() {
    const currentProvider = useAppStore((state) => state.currentProvider);

    return (
        <div className="flex items-center gap-3 text-text-secondary animate-fade-in">
            <div className="flex gap-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-sm">
                NEON schreibt{currentProvider && ` (${currentProvider})`}...
            </span>
        </div>
    );
}
