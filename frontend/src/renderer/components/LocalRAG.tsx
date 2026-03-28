import { useState, useEffect, useRef } from 'react';
import { FolderSearch, Database, Search, FileText, AlertCircle, RefreshCw, Loader2, CheckCircle2, Upload, Trash2, Eye, X, ChevronDown, ChevronUp } from 'lucide-react';

interface IndexedFile {
  id: string;
  filename: string;
  description: string;
  charCount: number;
  createdAt: string;
}

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
  const [files, setFiles] = useState<IndexedFile[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<{ id: string; filename: string; content: string } | null>(null);
  const [showIndexSection, setShowIndexSection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recentFolders, setRecentFolders] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('rag-recent-folders') || '[]');
    } catch { return []; }
  });

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rag/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files);
        setTotalIndexed(data.total);
      }
    } catch {
      // fallback to status
      try {
        const res = await fetch(`${API_BASE}/api/rag/status`);
        if (res.ok) {
          const data = await res.json();
          setTotalIndexed(data.totalIndexed);
        }
      } catch {}
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
      fetchFiles();

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
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;
    setUploading(true);
    setError(null);
    setSuccess(null);

    let uploaded = 0;
    let errors = 0;

    for (const file of Array.from(inputFiles)) {
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
    fetchFiles();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteFile = async (id: string, filename: string) => {
    if (!confirm(`"${filename}" wirklich aus dem Index entfernen?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/rag/files/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFiles(files.filter(f => f.id !== id));
        setTotalIndexed(prev => prev - 1);
        if (viewingFile?.id === id) setViewingFile(null);
      }
    } catch {
      setError('Datei konnte nicht geloescht werden');
    }
  };

  const handleViewFile = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/rag/files/${id}`);
      if (res.ok) {
        const data = await res.json();
        setViewingFile(data);
      }
    } catch {
      setError('Datei konnte nicht geladen werden');
    }
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

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const colors: Record<string, string> = {
      pdf: '#ef4444', md: '#3b82f6', txt: '#6b7280', json: '#f59e0b',
      csv: '#22c55e', ts: '#3178c6', js: '#f7df1e', py: '#306998',
    };
    return colors[ext || ''] || 'var(--accent-primary)';
  };

  const formatFileSize = (chars: number) => {
    if (chars < 1000) return `${chars} Zeichen`;
    return `${(chars / 1000).toFixed(1)}k Zeichen`;
  };

  return (
    <div className="local-rag-container">
      <div className="rag-header">
        <FolderSearch size={28} className="rag-header-icon" />
        <div>
          <h2 className="rag-title">Lokales Datei-RAG</h2>
          <p className="rag-subtitle">Dateien indexieren, verwalten und im Chat nutzen</p>
        </div>
      </div>

      {/* Status + Upload Bar */}
      <div className="rag-status-bar">
        <div className="rag-status-left">
          <Database size={18} />
          <span><strong>{totalIndexed}</strong> Dateien indexiert</span>
        </div>
        <div className="rag-status-actions">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.json,.csv,.ts,.js,.py,.pdf"
            onChange={handleFileUpload}
            className="rag-file-input-hidden"
          />
          <button
            className="rag-btn rag-btn-primary rag-btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 size={16} className="rag-spin" /> : <Upload size={16} />}
            {uploading ? 'Lade hoch...' : 'Dateien hochladen'}
          </button>
          <button
            className="rag-btn rag-btn-ghost rag-btn-sm"
            onClick={() => setShowIndexSection(!showIndexSection)}
            title="Ordner indexieren"
          >
            <FolderSearch size={16} />
            {showIndexSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button className="rag-btn rag-btn-ghost rag-btn-sm" onClick={fetchFiles} title="Aktualisieren">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Error / Success Messages */}
      {error && (
        <div className="rag-alert rag-alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button className="rag-alert-close" onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="rag-alert rag-alert-success">
          <CheckCircle2 size={18} />
          <span>{success}</span>
          <button className="rag-alert-close" onClick={() => setSuccess(null)}><X size={14} /></button>
        </div>
      )}

      {/* Collapsible Index Section */}
      {showIndexSection && (
        <div className="rag-section rag-index-section">
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
              {indexing ? 'Indexiere...' : 'Indexieren'}
            </button>
          </div>
          <p className="rag-hint">
            Unterstuetzte Dateien: .txt, .md, .json, .csv, .ts, .js, .py, .pdf
          </p>

          {recentFolders.length > 0 && (
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
          )}
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFile && (
        <div className="rag-modal-overlay" onClick={() => setViewingFile(null)}>
          <div className="rag-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rag-modal-header">
              <FileText size={18} style={{ color: getFileIcon(viewingFile.filename) }} />
              <span className="rag-modal-title">{viewingFile.filename}</span>
              <button className="rag-modal-close" onClick={() => setViewingFile(null)}>
                <X size={18} />
              </button>
            </div>
            <pre className="rag-modal-content">{viewingFile.content}</pre>
          </div>
        </div>
      )}

      {/* Indexed Files List */}
      {files.length > 0 && (
        <div className="rag-section">
          <h3 className="rag-section-title">Indexierte Dateien</h3>
          <div className="rag-files-grid">
            {files.map((file) => (
              <div key={file.id} className="rag-file-card" onClick={() => handleViewFile(file.id)}>
                <div className="rag-file-card-icon" style={{ color: getFileIcon(file.filename) }}>
                  <FileText size={22} />
                </div>
                <div className="rag-file-card-info">
                  <span className="rag-file-card-name">{file.filename}</span>
                  <span className="rag-file-card-desc">{file.description || 'Keine Beschreibung'}</span>
                  <div className="rag-file-card-meta">
                    <span>{formatFileSize(file.charCount)}</span>
                    <span>{new Date(file.createdAt).toLocaleDateString('de-DE')}</span>
                  </div>
                </div>
                <button
                  className="rag-file-card-delete"
                  onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id, file.filename); }}
                  title="Aus Index entfernen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 && !error && (
        <div className="rag-empty">
          <Upload size={36} className="rag-empty-icon" />
          <p>Noch keine Dateien indexiert</p>
          <p className="rag-empty-hint">Lade Dateien hoch oder indexiere einen Ordner, damit NEON sie im Chat nutzen kann.</p>
        </div>
      )}

      {/* Search Section */}
      {files.length > 0 && (
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
      )}

      {/* Search Results */}
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
                    {Math.round(result.importanceScore * 100)}%
                  </span>
                </div>
                <pre className="rag-result-preview">{result.contentPreview}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length === 0 && searchQuery && !searching && (
        <div className="rag-empty rag-empty-sm">
          <Search size={24} className="rag-empty-icon" />
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

        .rag-header-icon { color: var(--accent-primary); }

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

        /* Status Bar */
        .rag-status-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          margin-bottom: 1rem;
        }

        .rag-status-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        .rag-status-left strong {
          color: var(--accent-primary);
          font-size: 1.05rem;
        }

        .rag-status-left svg { color: var(--accent-primary); }

        .rag-status-actions {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        /* Buttons */
        .rag-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.55rem 0.85rem;
          border: none;
          border-radius: var(--radius-md, 8px);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .rag-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .rag-btn-sm { padding: 0.4rem 0.7rem; font-size: 0.8rem; }
        .rag-btn-primary { background: var(--accent-primary); color: #000; }
        .rag-btn-primary:hover:not(:disabled) { filter: brightness(1.1); }

        .rag-btn-secondary {
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
        }
        .rag-btn-secondary:hover:not(:disabled) {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .rag-btn-ghost {
          background: none;
          color: var(--text-tertiary);
          padding: 0.4rem;
        }
        .rag-btn-ghost:hover { color: var(--accent-primary); }

        .rag-file-input-hidden { display: none; }

        /* Alerts */
        .rag-alert {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 0.85rem;
          border-radius: var(--radius-md, 8px);
          margin-bottom: 0.75rem;
          font-size: 0.85rem;
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

        .rag-alert-close {
          margin-left: auto;
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          opacity: 0.6;
          padding: 0.2rem;
        }
        .rag-alert-close:hover { opacity: 1; }

        /* Sections */
        .rag-section { margin-bottom: 1.5rem; }
        .rag-section-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 0.75rem 0;
        }

        /* Index Section */
        .rag-index-section {
          padding: 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
        }

        .rag-input-row { display: flex; gap: 0.5rem; }

        .rag-input {
          flex: 1;
          padding: 0.55rem 0.75rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          color: var(--text-primary);
          font-size: 0.85rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .rag-input:focus { border-color: var(--accent-primary); }
        .rag-input::placeholder { color: var(--text-tertiary); }
        .rag-input:disabled { opacity: 0.6; }

        .rag-hint {
          font-size: 0.7rem;
          color: var(--text-tertiary);
          margin: 0.4rem 0 0.5rem 0;
        }

        .rag-recent-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
          margin-top: 0.5rem;
        }

        .rag-recent-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.3rem 0.6rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-subtle);
          border-radius: 999px;
          color: var(--text-tertiary);
          cursor: pointer;
          font-size: 0.75rem;
          transition: all 0.2s;
        }
        .rag-recent-item:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .rag-recent-path {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* File Cards Grid */
        .rag-files-grid {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .rag-file-card {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.75rem 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          cursor: pointer;
          transition: all 0.2s;
        }
        .rag-file-card:hover {
          border-color: var(--accent-primary);
          background: rgba(249, 171, 0, 0.03);
        }

        .rag-file-card-icon { flex-shrink: 0; }

        .rag-file-card-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .rag-file-card-name {
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rag-file-card-desc {
          font-size: 0.78rem;
          color: var(--text-tertiary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rag-file-card-meta {
          display: flex;
          gap: 0.75rem;
          font-size: 0.7rem;
          color: var(--text-tertiary);
        }

        .rag-file-card-delete {
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          padding: 0.35rem;
          border-radius: 4px;
          opacity: 0;
          transition: all 0.2s;
        }
        .rag-file-card:hover .rag-file-card-delete { opacity: 1; }
        .rag-file-card-delete:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }

        /* Modal */
        .rag-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 2rem;
        }

        .rag-modal {
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          width: 100%;
          max-width: 700px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .rag-modal-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border-subtle);
        }

        .rag-modal-title {
          font-weight: 600;
          font-size: 1rem;
          color: var(--text-primary);
          flex: 1;
        }

        .rag-modal-close {
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 4px;
        }
        .rag-modal-close:hover { color: var(--text-primary); }

        .rag-modal-content {
          padding: 1.25rem;
          overflow-y: auto;
          font-size: 0.82rem;
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-word;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          line-height: 1.5;
          margin: 0;
        }

        /* Search Results */
        .rag-results-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .rag-result-card {
          padding: 0.75rem 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          transition: border-color 0.2s;
        }
        .rag-result-card:hover { border-color: var(--accent-primary); }

        .rag-result-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.4rem;
        }

        .rag-result-icon { color: var(--accent-primary); flex-shrink: 0; }

        .rag-result-filename {
          font-weight: 600;
          font-size: 0.85rem;
          color: var(--text-primary);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rag-result-score {
          font-size: 0.7rem;
          color: var(--accent-primary);
          background: rgba(249, 171, 0, 0.1);
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
        }

        .rag-result-preview {
          font-size: 0.78rem;
          color: var(--text-secondary);
          background: var(--bg-primary);
          padding: 0.6rem;
          border-radius: 6px;
          margin: 0;
          max-height: 100px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          line-height: 1.4;
        }

        /* Empty States */
        .rag-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 3rem 2rem;
          color: var(--text-tertiary);
          text-align: center;
        }
        .rag-empty-sm { padding: 1.5rem; }
        .rag-empty-icon { opacity: 0.3; }
        .rag-empty-hint { font-size: 0.8rem; max-width: 350px; }

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
