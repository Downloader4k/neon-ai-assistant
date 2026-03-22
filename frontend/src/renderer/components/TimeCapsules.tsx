import { useState, useEffect } from 'react';
import { Gift, Plus, Clock, Lock, Unlock, AlertCircle, RefreshCw } from 'lucide-react';

interface TimeCapsule {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  openAt: string;
  opened: boolean;
  metadata?: any;
}

export default function TimeCapsules() {
  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state
  const [message, setMessage] = useState('');
  const [openAt, setOpenAt] = useState('');

  const userId = localStorage.getItem('userId') || 'default-user';

  useEffect(() => {
    fetchCapsules();
  }, []);

  const fetchCapsules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:3001/api/magic/capsules/${userId}`);
      if (!res.ok) throw new Error('Fehler beim Laden der Zeitkapseln');
      const data = await res.json();
      setCapsules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backend nicht erreichbar');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!message.trim() || !openAt) return;
    setCreating(true);
    try {
      const res = await fetch('http://localhost:3001/api/magic/capsules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          message: message.trim(),
          openAt: new Date(openAt).toISOString(),
        }),
      });
      if (!res.ok) throw new Error('Fehler beim Erstellen');
      setMessage('');
      setOpenAt('');
      await fetchCapsules();
    } catch (err) {
      alert('Fehler: ' + (err instanceof Error ? err.message : 'Unbekannt'));
    } finally {
      setCreating(false);
    }
  };

  const handleOpen = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:3001/api/magic/capsules/${id}/open`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Fehler beim Öffnen');
      await fetchCapsules();
    } catch (err) {
      alert('Fehler: ' + (err instanceof Error ? err.message : 'Unbekannt'));
    }
  };

  const isReady = (capsule: TimeCapsule) => {
    return !capsule.opened && new Date(capsule.openAt) <= new Date();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  if (loading) {
    return (
      <div className="capsule-container">
        <div className="loading">Lade Zeitkapseln...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="capsule-container">
        <div className="error-state">
          <AlertCircle size={48} />
          <h3>Keine Daten verfügbar</h3>
          <p>{error}</p>
          <button onClick={fetchCapsules} className="retry-button">
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  const readyCapsules = capsules.filter(c => isReady(c));
  const pendingCapsules = capsules.filter(c => !c.opened && !isReady(c));
  const openedCapsules = capsules.filter(c => c.opened);

  return (
    <div className="capsule-container">
      <div className="capsule-header">
        <Gift size={32} className="header-icon" />
        <div>
          <h2>Zeitkapseln</h2>
          <p className="subtitle">Nachrichten an dein zukünftiges Ich</p>
        </div>
      </div>

      {/* Create Form */}
      <div className="capsule-card create-card">
        <div className="card-header">
          <Plus size={20} />
          <h3>Neue Zeitkapsel erstellen</h3>
        </div>
        <textarea
          className="capsule-textarea"
          placeholder="Schreibe eine Nachricht an dein zukünftiges Ich..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
        />
        <div className="create-row">
          <div className="date-field">
            <label>Öffnen am:</label>
            <input
              type="datetime-local"
              className="capsule-date-input"
              value={openAt}
              onChange={(e) => setOpenAt(e.target.value)}
              min={getMinDateTime()}
            />
          </div>
          <button
            className="create-btn"
            onClick={handleCreate}
            disabled={creating || !message.trim() || !openAt}
          >
            {creating ? (
              <>
                <RefreshCw size={18} className="spinning" />
                Erstelle...
              </>
            ) : (
              <>
                <Plus size={18} />
                Erstellen
              </>
            )}
          </button>
        </div>
      </div>

      {/* Ready Capsules */}
      {readyCapsules.length > 0 && (
        <div className="capsule-section">
          <h3 className="section-title ready-title">
            <Unlock size={18} />
            Bereit zum Öffnen ({readyCapsules.length})
          </h3>
          {readyCapsules.map(capsule => (
            <div key={capsule.id} className="capsule-card ready-card">
              <div className="capsule-info">
                <div className="capsule-meta">
                  <span className="capsule-date">
                    <Clock size={14} />
                    Erstellt: {formatDate(capsule.createdAt)}
                  </span>
                  <span className="capsule-status status-ready">Bereit</span>
                </div>
                <p className="capsule-preview">{capsule.content.substring(0, 100)}...</p>
              </div>
              <button className="open-btn" onClick={() => handleOpen(capsule.id)}>
                <Unlock size={16} />
                Öffnen
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending Capsules */}
      {pendingCapsules.length > 0 && (
        <div className="capsule-section">
          <h3 className="section-title">
            <Lock size={18} />
            Wartend ({pendingCapsules.length})
          </h3>
          {pendingCapsules.map(capsule => (
            <div key={capsule.id} className="capsule-card">
              <div className="capsule-info">
                <div className="capsule-meta">
                  <span className="capsule-date">
                    <Clock size={14} />
                    Öffnet am: {formatDate(capsule.openAt)}
                  </span>
                  <span className="capsule-status status-locked">Geschlossen</span>
                </div>
                <p className="capsule-preview locked-text">
                  {capsule.content.substring(0, 50)}...
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Opened Capsules */}
      {openedCapsules.length > 0 && (
        <div className="capsule-section">
          <h3 className="section-title">
            <Gift size={18} />
            Geöffnet ({openedCapsules.length})
          </h3>
          {openedCapsules.map(capsule => (
            <div key={capsule.id} className="capsule-card opened-card">
              <div className="capsule-info">
                <div className="capsule-meta">
                  <span className="capsule-date">
                    <Clock size={14} />
                    Erstellt: {formatDate(capsule.createdAt)}
                  </span>
                  <span className="capsule-status status-opened">Offen</span>
                </div>
                <p className="capsule-content">{capsule.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {capsules.length === 0 && (
        <div className="empty-state">
          <Gift size={48} />
          <h3>Noch keine Zeitkapseln</h3>
          <p>Erstelle deine erste Zeitkapsel und sende eine Nachricht an dein zukünftiges Ich!</p>
        </div>
      )}

      <button onClick={fetchCapsules} className="refresh-button">
        Aktualisieren
      </button>

      <style>{`
        .capsule-container {
          padding: 2rem;
          max-width: 900px;
          margin: 0 auto;
          height: 100%;
          overflow-y: auto;
        }

        .capsule-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 2rem;
          color: var(--text-primary);
        }

        .header-icon {
          color: var(--accent-primary);
        }

        .capsule-header h2 {
          font-size: 2rem;
          font-weight: 700;
          margin: 0;
        }

        .subtitle {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin: 0.25rem 0 0 0;
        }

        .capsule-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          margin-bottom: 1rem;
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
          color: var(--text-secondary);
        }

        .card-header h3 {
          font-size: 0.875rem;
          font-weight: 600;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .capsule-textarea {
          width: 100%;
          padding: 0.75rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-medium);
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: inherit;
          font-size: 0.9rem;
          resize: vertical;
          min-height: 80px;
          box-sizing: border-box;
        }

        .capsule-textarea:focus {
          outline: none;
          border-color: var(--accent-primary);
        }

        .capsule-textarea::placeholder {
          color: var(--text-tertiary);
        }

        .create-row {
          display: flex;
          align-items: flex-end;
          gap: 1rem;
          margin-top: 1rem;
        }

        .date-field {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .date-field label {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .capsule-date-input {
          padding: 0.6rem 0.75rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-medium);
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: inherit;
          font-size: 0.9rem;
        }

        .capsule-date-input:focus {
          outline: none;
          border-color: var(--accent-primary);
        }

        .create-btn {
          padding: 0.6rem 1.5rem;
          background: var(--accent-gradient);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .create-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 0 20px rgba(249, 171, 0, 0.4);
        }

        .create-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .capsule-section {
          margin-top: 2rem;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 1rem 0;
        }

        .ready-title {
          color: var(--accent-primary);
        }

        .ready-card {
          border-color: var(--accent-primary);
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .opened-card {
          opacity: 0.7;
        }

        .capsule-info {
          flex: 1;
        }

        .capsule-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 0.5rem;
        }

        .capsule-date {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.8rem;
          color: var(--text-tertiary);
        }

        .capsule-status {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.15rem 0.5rem;
          border-radius: var(--radius-sm);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .status-ready {
          background: rgba(249, 171, 0, 0.15);
          color: var(--accent-primary);
        }

        .status-locked {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-tertiary);
        }

        .status-opened {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
        }

        .capsule-preview {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .capsule-content {
          margin: 0;
          color: var(--text-primary);
          font-size: 0.9rem;
          line-height: 1.6;
          white-space: pre-wrap;
        }

        .locked-text {
          filter: blur(2px);
          user-select: none;
        }

        .open-btn {
          padding: 0.5rem 1rem;
          background: var(--accent-gradient);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .open-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 20px rgba(249, 171, 0, 0.4);
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem;
          text-align: center;
          color: var(--text-secondary);
          gap: 1rem;
        }

        .empty-state h3 {
          margin: 0;
          color: var(--accent-primary);
        }

        .empty-state p {
          margin: 0;
          max-width: 400px;
        }

        .refresh-button, .retry-button {
          width: 100%;
          padding: 0.75rem;
          background: var(--accent-gradient);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 1.5rem;
        }

        .refresh-button:hover, .retry-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 30px rgba(249, 171, 0, 0.5);
        }

        .loading, .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem;
          text-align: center;
          color: var(--text-secondary);
          gap: 1rem;
        }

        .error-state {
          color: var(--text-primary);
        }

        .error-state h3 {
          margin: 0;
          color: var(--accent-primary);
        }

        .error-state p {
          margin: 0;
          max-width: 500px;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .create-row {
            flex-direction: column;
            align-items: stretch;
          }

          .ready-card {
            flex-direction: column;
            align-items: stretch;
          }

          .open-btn {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
