import { Brain } from 'lucide-react';

interface SearchingIndicatorProps {
    query?: string;
}

export default function SearchingIndicator({ query }: SearchingIndicatorProps) {
    return (
        <div className="mx-auto max-w-3xl px-6 py-4 animate-fadeIn">
            <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-400/30 rounded-xl p-4 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Brain className="w-5 h-5 text-blue-400 animate-pulse" />
                        <div className="absolute inset-0 bg-blue-400/20 blur-lg rounded-full animate-ping"></div>
                    </div>
                    <div className="flex-1">
                        <div className="text-sm font-medium text-blue-300">
                            Recherchiere
                        </div>
                        {query && (
                            <div className="text-xs text-text-secondary mt-0.5 truncate">
                                {query}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-1">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
