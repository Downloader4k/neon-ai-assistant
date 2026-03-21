import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, Trash2, Search, ArrowLeft, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

interface KnowledgeBaseViewProps {
    onBack: () => void;
}

export default function KnowledgeBaseView({ onBack }: KnowledgeBaseViewProps) {
    const [documents, setDocuments] = useState<string[]>([]); // Backend returns string[] of filenames for now
    const [uploading, setUploading] = useState(false);
    const [testQuery, setTestQuery] = useState('');
    const [queryResult, setQueryResult] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchDocuments = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/skills/knowledge-base/list');
            const data = await res.json();
            if (data.success) {
                setDocuments(data.documents);
            }
        } catch (error) {
            console.error('Failed to fetch docs', error);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, []);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        setUploading(true);
        try {
            for (const file of acceptedFiles) {
                const formData = new FormData();
                formData.append('file', file);

                await fetch('http://localhost:3001/api/skills/knowledge-base/upload', {
                    method: 'POST',
                    body: formData
                });
            }
            await fetchDocuments();
        } catch (error) {
            console.error('Upload failed', error);
        } finally {
            setUploading(false);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'text/plain': ['.txt', '.md']
        }
    });

    const handleDelete = async (filename: string) => {
        if (!confirm(`Dokument "${filename}" wirklich löschen?`)) return;

        try {
            await fetch('http://localhost:3001/api/skills/knowledge-base/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            await fetchDocuments();
        } catch (error) {
            console.error('Delete failed', error);
        }
    };

    const handleTestQuery = async () => {
        if (!testQuery.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`http://localhost:3001/api/skills/knowledge-base/query?q=${encodeURIComponent(testQuery)}`);
            const data = await res.json();
            if (data.success) {
                setQueryResult(data.results);
            }
        } catch (error) {
            console.error('Query failed', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-bg-primary text-text-primary">
            {/* Header */}
            <div className="p-6 border-b border-border flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-bg-tertiary rounded-full transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="text-accent-primary" />
                        Knowledge Base Manager
                    </h2>
                    <p className="text-text-secondary text-sm">Verwalte Dokumente für Neons Langzeitgedächtnis</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-8">

                    {/* Upload Section */}
                    <div
                        {...getRootProps()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragActive ? 'border-accent-primary bg-accent-primary/5' : 'border-border hover:border-text-secondary'
                            }`}
                    >
                        <input {...getInputProps()} />
                        <div className="flex flex-col items-center gap-3">
                            <div className="p-4 bg-bg-tertiary rounded-full">
                                {uploading ? <Loader2 className="animate-spin text-accent-primary" size={32} /> : <Upload className="text-text-secondary" size={32} />}
                            </div>
                            <div>
                                <h3 className="font-medium text-lg">Dokumente hier ablegen</h3>
                                <p className="text-text-tertiary text-sm mt-1">PDF, TXT, MD unterstützt</p>
                            </div>
                        </div>
                    </div>

                    {/* Document List */}
                    <div className="bg-bg-secondary rounded-xl border border-border overflow-hidden">
                        <div className="p-4 border-b border-border bg-bg-tertiary/50">
                            <h3 className="font-bold flex items-center gap-2">
                                <FileText size={18} />
                                Indexierte Dokumente ({documents.length})
                            </h3>
                        </div>

                        {documents.length === 0 ? (
                            <div className="p-8 text-center text-text-tertiary">
                                Keine Dokumente gefunden. Lade etwas hoch!
                            </div>
                        ) : (
                            <div className="divide-y divide-border">
                                {documents.map((doc, idx) => (
                                    <div key={idx} className="p-4 flex items-center justify-between hover:bg-bg-tertiary/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                                                <FileText size={20} />
                                            </div>
                                            <span className="font-medium">{doc}</span>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(doc)}
                                            className="p-2 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                            title="Löschen"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Test Retrieval */}
                    <div className="bg-bg-secondary rounded-xl border border-border p-6">
                        <h3 className="font-bold mb-4 flex items-center gap-2">
                            <Search size={18} />
                            Retrieval Test
                        </h3>
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={testQuery}
                                onChange={(e) => setTestQuery(e.target.value)}
                                placeholder="Stelle eine Frage an die Datenbank..."
                                className="flex-1 bg-bg-primary border border-border rounded-lg px-4 py-2 focus:border-accent-primary focus:outline-none"
                                onKeyDown={(e) => e.key === 'Enter' && handleTestQuery()}
                            />
                            <button
                                onClick={handleTestQuery}
                                disabled={loading}
                                className="bg-accent-primary text-black font-medium px-4 py-2 rounded-lg hover:bg-accent-primary/90 disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : 'Suchen'}
                            </button>
                        </div>

                        {queryResult.length > 0 && (
                            <div className="space-y-3 mt-4">
                                {queryResult.map((res, i) => (
                                    <div key={i} className="bg-bg-primary p-4 rounded-lg border border-border text-sm">
                                        <div className="flex justify-between text-xs text-text-tertiary mb-1">
                                            <span>Score: {res.score?.toFixed(4)}</span>
                                            <span>{res.metadata?.source}</span>
                                        </div>
                                        <p>{res.content}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
