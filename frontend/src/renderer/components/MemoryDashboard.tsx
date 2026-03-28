import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Brain, Clock, Star, Archive, Trash2, Sparkles, Edit2, Check, X, Upload, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Memory {
    id: string;
    type: string;
    status: string;
    content: string;
    importance: number;
    accessCount: number;
    createdAt: string;
    expiresAt?: string;
    tags: string[];
}

interface MemoryStats {
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    avgImportance: number;
}

export default function MemoryDashboard({ userId }: { userId?: string } = {}) {
    const currentUser = useAppStore((state) => state.currentUser);
    const effectiveUserId = userId || currentUser?.id || 'default-user';
    const socket = useAppStore((state) => state.socket);
    const [memories, setMemories] = useState<Memory[]>([]);
    const [stats, setStats] = useState<MemoryStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>(''); // NEW: Search filter

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    // Import state
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importStatus, setImportStatus] = useState('');
    const [importStats, setImportStats] = useState<{ foundCount: number } | null>(null);
    const [useClaude, setUseClaude] = useState(false);

    useEffect(() => {
        loadData();
    }, [effectiveUserId, filter]);

    // Progress listener
    useEffect(() => {
        if (!socket) return;

        const handleProgress = (data: { progress: number; status: string; stats?: { foundCount: number } }) => {
            setImportProgress(data.progress);
            setImportStatus(data.status);
            if (data.stats) {
                setImportStats(data.stats);
            }
        };

        const handleUpdate = () => {
            loadData(); // Auto-reload on external update
        };

        socket.on('import-progress', handleProgress);
        socket.on('memories-updated', handleUpdate);

        return () => {
            // Reset
            setImportStats(null);
            socket.off('import-progress', handleProgress);
            socket.off('memories-updated', handleUpdate);
        };
    }, [socket]);

    const loadData = async () => {
        setLoading(true);

        try {
            // Load memories
            const typeParam = filter !== 'all' ? `?type=${filter}` : '';
            const memResponse = await fetch(`http://localhost:3001/api/memory/${effectiveUserId}${typeParam}`);
            const memData = await memResponse.json();
            setMemories(Array.isArray(memData) ? memData : memData.memories || []);

            // Load stats
            const statsResponse = await fetch(`http://localhost:3001/api/memory/${effectiveUserId}/stats`);
            const statsData = await statsResponse.json();
            setStats(statsData);
        } catch (error) {
            console.error('Failed to load memory data', error);
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (memory: Memory) => {
        setEditingId(memory.id);
        setEditContent(memory.content);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditContent('');
    };

    const saveEdit = async (memoryId: string) => {
        try {
            const res = await fetch(`http://localhost:3001/api/memory/${effectiveUserId}/${memoryId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent })
            });

            if (res.ok) {
                // Optimistic update
                setMemories(prev => prev.map(m =>
                    m.id === memoryId ? { ...m, content: editContent } : m
                ));
                setEditingId(null);
            }
        } catch (error) {
            console.error('Failed to update memory', error);
        }
    };

    const handleDelete = async (memoryId: string) => {
        if (!confirm('Möchtest du diese Erinnerung wirklich löschen?')) return;

        try {
            const res = await fetch(`http://localhost:3001/api/memory/${effectiveUserId}/${memoryId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                // Optimistic update
                setMemories(prev => prev.filter(m => m.id !== memoryId));
                // Reload stats
                const statsResponse = await fetch(`http://localhost:3001/api/memory/${effectiveUserId}/stats`);
                const statsData = await statsResponse.json();
                setStats(statsData);
            }
        } catch (error) {
            console.error('Failed to delete memory', error);
        }
    };

    const getTypeName = (type: string) => {
        const names: Record<string, string> = {
            working: 'Arbeitsgedächtnis',
            short_term: 'Kurzzeit',
            long_term: 'Langzeit',
            episodic: 'Episodisch',
            semantic: 'Semantisch',
            all: 'Alle'
        };
        return names[type] || type;
    };

    const getTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            working: 'bg-blue-500/20 text-blue-400',
            short_term: 'bg-purple-500/20 text-purple-400',
            long_term: 'bg-green-500/20 text-green-400',
            episodic: 'bg-orange-500/20 text-orange-400',
            semantic: 'bg-pink-500/20 text-pink-400',
        };
        return colors[type] || 'bg-gray-500/20 text-gray-400';
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'working':
                return <Clock className="w-4 h-4" />;
            case 'long_term':
                return <Archive className="w-4 h-4" />;
            case 'semantic':
                return <Brain className="w-4 h-4" />;
            default:
                return <Sparkles className="w-4 h-4" />;
        }
    };



    const handleImport = async () => {
        if (!importText.trim()) return;
        setImporting(true);
        setImportProgress(0);
        setImportStatus('Starte Import...');

        try {
            const res = await fetch(`http://localhost:3001/api/memory/${effectiveUserId}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: importText,
                    provider: useClaude ? 'claude' : 'ollama'
                })
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Import erfolgreich! ${data.count} Erinnerungen hinzugefügt.`);
                setShowImport(false);
                setImportText('');
                loadData(); // Reload list
            } else {
                alert('Import fehlgeschlagen.');
            }
        } catch (error) {
            console.error('Import error', error);
            alert('Netzwerkfehler beim Import.');
        } finally {
            setImporting(false);
            setImportProgress(0);
            setImportStatus('');
        }
    };

    return (
        <div className="p-6 bg-bg-primary text-text-primary min-h-screen">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Brain className="w-8 h-8 text-primary" />
                        Memory System
                    </h1>
                    <p className="text-text-secondary mt-2">
                        Verwaltung und Visualisierung deines KI-Gedächtnisses
                    </p>
                </div>
                <button
                    onClick={() => setShowImport(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-bg-secondary hover:bg-bg-tertiary border border-border rounded-lg transition-colors"
                >
                    <Upload className="w-4 h-4" />
                    Importieren
                </button>
            </div>

            {/* Import Modal */}
            {showImport && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-bg-primary border border-border rounded-xl p-6 w-full max-w-2xl shadow-2xl animate-fade-in relative">
                        <button
                            onClick={() => setShowImport(false)}
                            className="absolute right-4 top-4 p-1 hover:bg-bg-tertiary rounded text-text-secondary"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            Erinnerungen importieren
                        </h2>

                        <p className="text-sm text-text-secondary mb-4">
                            Kopiere deine Erinnerungen (z.B. aus ChatGPT) hier hinein. Die KI wird sie analysieren, strukturieren und Duplikate ignorieren.
                        </p>

                        <textarea
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            placeholder="- Ich mag Pizza mit Ananas&#10;- Mein Hund heißt Bello&#10;- Ich arbeite als..."
                            className="w-full h-64 p-4 bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-primary resize-none mb-4 font-mono text-sm"
                        />

                        {/* Model Selection */}
                        <div className="flex items-center gap-2 mb-4">
                            <input
                                type="checkbox"
                                id="useClaude"
                                checked={useClaude}
                                onChange={(e) => setUseClaude(e.target.checked)}
                                className="w-4 h-4 rounded border-border bg-bg-tertiary text-primary focus:ring-primary"
                            />
                            <label htmlFor="useClaude" className="text-sm text-text-secondary select-none cursor-pointer">
                                <strong>Cloud-KI (Claude) nutzen</strong> <span className="opacity-70">– Schneller & präziser. (Deaktiviert = Gemma Lokal)</span>
                            </label>
                        </div>

                        {/* Progress Bar */}
                        {importing && (
                            <div className="mb-4">
                                <div className="flex justify-between text-xs text-text-secondary mb-1">
                                    <span>{importStatus || 'Verarbeite...'}</span>
                                    <span>{importProgress}%</span>
                                </div>
                                <div className="w-full bg-bg-tertiary rounded-full h-2 overflow-hidden mb-1">
                                    <div
                                        className="bg-primary h-full transition-all duration-300 ease-out"
                                        style={{ width: `${importProgress}%` }}
                                    ></div>
                                </div>
                                {importStats && (
                                    <div className="text-xs text-text-secondary text-right">
                                        Schon {importStats.foundCount} Memories gefunden
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowImport(false)}
                                className="px-4 py-2 text-text-secondary hover:bg-bg-tertiary rounded-lg transition-colors"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={importing || !importText.trim()}
                                className="px-6 py-2 bg-primary text-black font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {importing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                                        Verarbeite...
                                    </>
                                ) : (
                                    'Analysieren & Importieren'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="p-4 bg-bg-secondary border border-border rounded-lg">
                        <div className="text-2xl font-bold text-primary">{stats.total}</div>
                        <div className="text-sm text-text-secondary">Gesamt Memories</div>
                    </div>

                    <div className="p-4 bg-bg-secondary border border-border rounded-lg">
                        <div className="text-2xl font-bold text-green-400">
                            {stats.byStatus?.active || 0}
                        </div>
                        <div className="text-sm text-text-secondary">Aktiv</div>
                    </div>

                    <div className="p-4 bg-bg-secondary border border-border rounded-lg">
                        <div className="text-2xl font-bold text-purple-400">
                            {stats.byType?.long_term || 0}
                        </div>
                        <div className="text-sm text-text-secondary">Langzeit</div>
                    </div>

                    <div className="p-4 bg-bg-secondary border border-border rounded-lg">
                        <div className="text-2xl font-bold text-orange-400">
                            {(stats.avgImportance * 100).toFixed(0)}%
                        </div>
                        <div className="text-sm text-text-secondary">Ø Wichtigkeit</div>
                    </div>
                </div>
            )}

            {/* Search Box */}
            <div className="mb-6">
                <div className="relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="🔍 Suche nach Erinnerungen... (z.B. 'Phoenix', 'Projekt', 'Python')"
                        className="w-full px-4 py-3 pl-4 bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-primary transition-colors text-text-primary placeholder:text-text-secondary"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
                {searchQuery && (
                    <div className="mt-2 text-sm text-text-secondary">
                        {memories.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())).length} Ergebnisse
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-6 flex-wrap">
                {['all', 'working', 'short_term', 'long_term', 'episodic', 'semantic'].map((type) => (
                    <button
                        key={type}
                        onClick={() => setFilter(type)}
                        className={`px-4 py-2 rounded-lg transition-colors ${filter === type
                            ? 'bg-primary text-black font-medium'
                            : 'bg-bg-secondary text-text-secondary hover:bg-border'
                            }`}
                    >
                        {getTypeName(type)}
                    </button>
                ))}
            </div>

            {/* Memory List */}
            {loading ? (
                <div className="text-center py-12 text-text-secondary">Lade Memories...</div>
            ) : memories.length === 0 ? (
                <div className="text-center py-12 text-text-secondary">
                    <Brain className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Keine Memories gefunden</p>
                </div>
            ) : (() => {
                // Apply search filter
                const filteredMemories = searchQuery
                    ? memories.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
                    : memories;

                return filteredMemories.length === 0 ? (
                    <div className="text-center py-12 text-text-secondary">
                        <p>Keine Ergebnisse für "{searchQuery}"</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredMemories.map((memory) => (
                            <div
                                key={memory.id}
                                className="p-4 bg-bg-secondary border border-border rounded-lg hover:border-primary/50 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-4 mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-3 py-1 rounded-md text-sm flex items-center gap-2 ${getTypeColor(memory.type)}`}>
                                            {getTypeIcon(memory.type)}
                                            {getTypeName(memory.type)}
                                        </span>

                                        <span className="px-2 py-1 rounded-md text-xs bg-bg-tertiary text-text-secondary">
                                            {memory.status}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4 text-sm text-text-secondary">
                                        <div className="flex items-center gap-1">
                                            <Star className="w-4 h-4 text-yellow-500" />
                                            {(memory.importance * 100).toFixed(0)}%
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <Clock className="w-4 h-4" />
                                            {memory.accessCount}x
                                        </div>
                                        <button
                                            onClick={() => handleDelete(memory.id)}
                                            className="p-1 hover:bg-bg-tertiary rounded text-red-400 opacity-60 hover:opacity-100 transition-opacity"
                                            title="Löschen"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {editingId === memory.id ? (
                                    <div className="mb-3">
                                        <textarea
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            className="w-full p-2 bg-bg-tertiary border border-border rounded-md text-text-primary focus:outline-none focus:border-primary resize-none"
                                            rows={3}
                                            autoFocus
                                        />
                                        <div className="flex gap-2 mt-2 justify-end">
                                            <button
                                                onClick={cancelEdit}
                                                className="p-1 text-text-secondary hover:text-text-primary"
                                                title="Abbrechen"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => saveEdit(memory.id)}
                                                className="p-1 text-green-400 hover:text-green-300"
                                                title="Speichern"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-text-primary mb-3 line-clamp-3">{memory.content}</p>
                                )}

                                <div className="flex items-center justify-between text-xs text-text-secondary">
                                    <div className="flex gap-2">
                                        {memory.tags?.map((tag) => (
                                            <span key={tag} className="px-2 py-1 bg-bg-tertiary rounded">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <span>
                                            Erstellt: {format(new Date(memory.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                                        </span>
                                        {/* Action Buttons */}
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => startEdit(memory)}
                                                className="p-1 hover:bg-bg-tertiary rounded text-blue-400 opacity-60 hover:opacity-100 transition-opacity"
                                                title="Bearbeiten"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(memory.id)}
                                                className="p-1 hover:bg-bg-tertiary rounded text-red-400 opacity-60 hover:opacity-100 transition-opacity"
                                                title="Löschen"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })()}
        </div >
    );
}
