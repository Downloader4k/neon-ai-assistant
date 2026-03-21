import { useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface SearchResult {
    messageId: string;
    content: string;
    similarity: number;
    metadata: {
        conversationId: string;
        role: string;
        timestamp: Date;
        modelUsed?: string;
    };
}

interface SemanticSearchProps {
    onClose?: () => void;
    onResultClick?: (conversationId: string, messageId: string) => void;
}

export default function SemanticSearch({
    onClose = () => { },
    onResultClick = () => { }
}: SemanticSearchProps = {}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!query.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(
                `http://localhost:3001/api/search?q=${encodeURIComponent(query)}&limit=20`
            );

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
            setResults(data.results);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center pt-20 z-50 animate-fade-in">
            <div className="w-full max-w-3xl mx-4 bg-bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden">
                {/* Search Header */}
                <div className="p-6 border-b border-border">
                    <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                            <Search className="w-6 h-6 text-primary" />
                            Semantische Suche
                        </h2>
                        <button
                            onClick={onClose}
                            className="ml-auto p-2 hover:bg-bg-tertiary rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-text-secondary" />
                        </button>
                    </div>

                    {/* Search Input */}
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Nach was suchst du? (z.B. 'Python Tutorial' oder 'API Integration')"
                            className="flex-1 bg-bg-tertiary text-text-primary placeholder-text-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            autoFocus
                        />
                        <button
                            onClick={handleSearch}
                            disabled={loading || !query.trim()}
                            className="px-6 py-3 bg-primary hover:bg-primary/90 disabled:bg-border disabled:cursor-not-allowed text-black font-medium rounded-xl transition-colors flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Suche...
                                </>
                            ) : (
                                <>
                                    <Search className="w-5 h-5" />
                                    Suchen
                                </>
                            )}
                        </button>
                    </div>

                    <p className="text-xs text-text-secondary mt-2">
                        Sucht semantisch ähnliche Nachrichten basierend auf der Bedeutung, nicht nur Keywords
                    </p>
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto p-6 space-y-3">
                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                            {error}
                        </div>
                    )}

                    {results.length === 0 && !loading && !error && query && (
                        <div className="text-center py-12 text-text-secondary">
                            <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>Keine Ergebnisse gefunden</p>
                        </div>
                    )}

                    {results.length === 0 && !loading && !error && !query && (
                        <div className="text-center py-12 text-text-secondary">
                            <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>Gib einen Suchbegriff ein, um zu starten</p>
                        </div>
                    )}

                    {results.map((result) => (
                        <div
                            key={result.messageId}
                            onClick={() => onResultClick(result.metadata.conversationId, result.messageId)}
                            className="p-4 bg-bg-tertiary hover:bg-border border border-border/50 rounded-lg cursor-pointer transition-colors group"
                        >
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`px-2 py-1 text-xs rounded-md ${result.metadata.role === 'user'
                                            ? 'bg-primary/20 text-primary'
                                            : 'bg-blue-500/20 text-blue-400'
                                            }`}
                                    >
                                        {result.metadata.role === 'user' ? 'Du' : 'NEON'}
                                    </span>
                                    {result.metadata.modelUsed && (
                                        <span className="px-2 py-1 text-xs rounded-md bg-bg-secondary text-text-secondary">
                                            {result.metadata.modelUsed}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-text-secondary">
                                    <span className="text-primary font-medium">
                                        {(result.similarity * 100).toFixed(0)}% Match
                                    </span>
                                    <span>{format(new Date(result.metadata.timestamp), 'dd.MM.yyyy HH:mm', { locale: de })}</span>
                                </div>
                            </div>

                            <p className="text-text-primary text-sm line-clamp-3 group-hover:line-clamp-none transition-all">
                                {result.content}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                {results.length > 0 && (
                    <div className="p-4 border-t border-border bg-bg-primary text-center text-sm text-text-secondary">
                        {results.length} Ergebnisse gefunden • Klicke auf ein Ergebnis um zur Konversation zu springen
                    </div>
                )}
            </div>
        </div>
    );
}
