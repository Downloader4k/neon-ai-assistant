import { useState, useEffect, useRef } from 'react';
import { FolderSearch, Database, Search, FileText, AlertCircle, RefreshCw, Loader2, CheckCircle2, Upload } from 'lucide-react';

interface SearchResult {
  id: string;
  filename: string;
  contentPreview: string;
  createdAt: string;
  importanceScore: number;
}

const API_BASE = window.location.port === '5173'
  ? `http://${window.location.hostname}:3001`
  : window.location.origin;

export default function LocalRAG() {
  const [folderPath, setFolderPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [totalIndexed, setTotalIndexed] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recentFolders, setRecentFolders] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('rag-recent-folders') || '[]');
    } catch { return []; }
  });

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rag/status`);
      if (res.ok) {
        const data = await res.json();
        setTotalIndexed(data.totalIndexed);
      }
    } catch {
      // silently fail
    }
  };

  const handleIndex = async () => {
    if (!folderPath.trim()) return;
    setIndexing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/api/rag/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderPath.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Indexierung fehlgeschlagen');
      }

      setSuccess(`${data.indexed} Dateien indexiert${data.errors > 0 ? `, ${data.errors} Fehler` : ''}`);
      fetchStatus();

      // Save to recent folders
      const updated = [folderPath.trim(), ...recentFolders.filter(f => f !== folderPath.trim())].slice(0, 5);
      setRecentFolders(updated);
      localStorage.setItem('rag-recent-folders', JSON.stringify(updated));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Indexierung fehlgeschlagen');
    } finally {
      setIndexing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setSuccess(null);

    let uploaded = 0;
    let errors = 0;

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_BASE}/api/rag/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload fehlgeschlagen');
        }
        uploaded++;
      } catch {
        errors++;
      }
    }

    setSuccess(`${uploaded} Datei${uploaded !== 1 ? 'en' : ''} indexiert${errors > 0 ? `, ${errors} Fehler` : ''}`);
    fetchStatus();
    setUploading(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: searchQuery.trim() });
      const res = await fetch(`${API_BASE}/api/rag/search?${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Suche fehlgeschlagen');
      }

      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suche fehlgeschlagen');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="local-rag-container">
      <div className="rag-header">
        <FolderSearch size={28} className="rag-header-icon" />
        <div>
          <h2 className="rag-title">Lokales Datei-RAG</h2>
          <p className="rag-subtitle">Ordner indexieren und Dateien durchsuchen</p>
        </div>
      </div>

      {/* Status Card */}
      <div className="rag-status-card">
        <Database size={20} />
        <span className="rag-status-text">
          <strong>{totalIndexed}</strong> Dateien indexiert
        </span>
        <button className="rag-refresh-btn" onClick={fetchStatus} title="Status aktualisieren">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Error / Success Messages */}
      {error && (
        <div className="rag-alert rag-alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="rag-alert rag-alert-success">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      {/* Index Section */}
      <div className="rag-section">
        <h3 className="rag-section-title">Ordner indexieren</h3>
        <div className="rag-input-row">
          <input
            type="text"
            className="rag-input"
            placeholder="z.B. C:\MeinProjekt oder /home/user/docs"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleIndex()}
            disabled={indexing}
          />
          <button
            className="rag-btn rag-btn-primary"
            onClick={handleIndex}
            disabled={indexing || !folderPath.trim()}
          >
            {indexing ? <Loader2 size={18} className="rag-spin" /> : <FolderSearch size={18} />}
            {indexing ? 'Indexiere...' : 'Ordner indexieren'}
          </button>
        </div>
        <p className="rag-hint">
          Unterstuetzte Dateien: .txt, .md, .json, .csv, .ts, .js, .py, .pdf
        </p>

        <div className="rag-file-upload-row">
          <span className="rag-or-divider">oder</span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.json,.csv,.ts,.js,.py,.pdf"
            onChange={handleFileUpload}
            className="rag-file-input-hidden"
          />
          <button
            className="rag-btn rag-btn-secondary rag-btn-upload"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 size={18} className="rag-spin" /> : <Upload size={18} />}
            {uploading ? 'Lade hoch...' : 'Dateien durchsuchen'}
          </button>
        </div>
      </div>

      {/* Recent Folders */}
      {recentFolders.length > 0 && (
        <div className="rag-section">
          <h3 className="rag-section-title">Zuletzt indexierte Ordner</h3>
          <div className="rag-recent-list">
            {recentFolders.map((folder, i) => (
              <button
                key={i}
                className="rag-recent-item"
                onClick={() => setFolderPath(folder)}
                title={folder}
              >
                <FileText size={14} />
                <span className="rag-recent-path">{folder}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Section */}
      <div className="rag-section">
        <h3 className="rag-section-title">Dateien durchsuchen</h3>
        <div className="rag-input-row">
          <input
            type="text"
            className="rag-input"
            placeholder="Suchbegriff eingeben..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            disabled={searching}
          />
          <button
            className="rag-btn rag-btn-secondary"
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
          >
            {searching ? <Loader2 size={18} className="rag-spin" /> : <Search size={18} />}
            {searching ? 'Suche...' : 'Suchen'}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="rag-section">
          <h3 className="rag-section-title">Ergebnisse ({results.length})</h3>
          <div className="rag-results-list">
            {results.map((result) => (
              <div key={result.id} className="rag-result-card">
                <div className="rag-result-header">
                  <FileText size={16} className="rag-result-icon" />
                  <span className="rag-result-filename">{result.filename}</span>
                  <span className="rag-result-score">
                    Relevanz: {Math.round(result.importanceScore * 100)}%
                  </span>
                </div>
                <pre className="rag-result-preview">{result.contentPreview}</pre>
                <span className="rag-result-date">
                  Indexiert: {new Date(result.createdAt).toLocaleString('de-DE')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length === 0 && searchQuery && !searching && (
        <div className="rag-empty">
          <Search size={32} className="rag-empty-icon" />
          <p>Keine Ergebnisse fuer "{searchQuery}"</p>
        </div>
      )}

      <style>{`
        .local-rag-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
        }

        .rag-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .rag-header-icon {
          color: var(--accent-primary);
        }

        .rag-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .rag-subtitle {
          font-size: 0.875rem;
          color: var(--text-tertiary);
          margin: 0.25rem 0 0 0;
        }

        .rag-status-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          margin-bottom: 1.5rem;
          color: var(--accent-primary);
        }

        .rag-status-text {
          color: var(--text-secondary);
          flex: 1;
        }

        .rag-status-text strong {
          color: var(--accent-primary);
          font-size: 1.1rem;
        }

        .rag-refresh-btn {
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 4px;
          transition: color 0.2s;
        }

        .rag-refresh-btn:hover {
          color: var(--accent-primary);
        }

        .rag-alert {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-md, 8px);
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .rag-alert-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
        }

        .rag-alert-success {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #22c55e;
        }

        .rag-section {
          margin-bottom: 1.5rem;
        }

        .rag-section-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 0.75rem 0;
        }

        .rag-input-row {
          display: flex;
          gap: 0.5rem;
        }

        .rag-input {
          flex: 1;
          padding: 0.65rem 0.85rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          color: var(--text-primary);
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.2s;
        }

        .rag-input:focus {
          border-color: var(--accent-primary);
        }

        .rag-input::placeholder {
          color: var(--text-tertiary);
        }

        .rag-input:disabled {
          opacity: 0.6;
        }

        .rag-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 1rem;
          border: none;
          border-radius: var(--radius-md, 8px);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .rag-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .rag-btn-primary {
          background: var(--accent-primary);
          color: #000;
        }

        .rag-btn-primary:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .rag-btn-secondary {
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
        }

        .rag-btn-secondary:hover:not(:disabled) {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .rag-hint {
          font-size: 0.75rem;
          color: var(--text-tertiary);
          margin: 0.5rem 0 0 0;
        }

        .rag-file-upload-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 0.75rem;
        }

        .rag-or-divider {
          font-size: 0.8rem;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .rag-file-input-hidden {
          display: none;
        }

        .rag-btn-upload {
          flex: 1;
        }

        .rag-recent-list {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .rag-recent-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          font-size: 0.85rem;
        }

        .rag-recent-item:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .rag-recent-path {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rag-results-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .rag-result-card {
          padding: 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          transition: border-color 0.2s;
        }

        .rag-result-card:hover {
          border-color: var(--accent-primary);
        }

        .rag-result-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .rag-result-icon {
          color: var(--accent-primary);
          flex-shrink: 0;
        }

        .rag-result-filename {
          font-weight: 600;
          color: var(--text-primary);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rag-result-score {
          font-size: 0.75rem;
          color: var(--accent-primary);
          background: rgba(249, 171, 0, 0.1);
          padding: 0.15rem 0.5rem;
          border-radius: 999px;
          white-space: nowrap;
        }

        .rag-result-preview {
          font-size: 0.8rem;
          color: var(--text-secondary);
          background: var(--bg-primary);
          padding: 0.75rem;
          border-radius: 6px;
          margin: 0.5rem 0;
          max-height: 120px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          line-height: 1.4;
        }

        .rag-result-date {
          font-size: 0.7rem;
          color: var(--text-tertiary);
        }

        .rag-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 2rem;
          color: var(--text-tertiary);
          text-align: center;
        }

        .rag-empty-icon {
          opacity: 0.4;
        }

        .rag-spin {
          animation: ragSpin 1s linear infinite;
        }

        @keyframes ragSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
