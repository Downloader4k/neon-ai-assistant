import { useState, useEffect } from 'react';
import {
  Upload,
  Database,
  Settings,
  Activity,
  RefreshCw,
  Server,
  BarChart3,
  Brain,
  MessageSquare,
} from 'lucide-react';
import InterviewDashboard from './InterviewDashboard';
import { useAppStore } from '../store/useAppStore';

interface SystemStats {
  database: {
    totalMemories: number;
    totalMessages: number;
    totalConversations: number;
    totalUsers: number;
  };
  api: {
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
  };
}

interface ApiUsageStats {
  summary: Array<{ service: string; tokens: number; cost: number }>;
  totalCost: number;
  currency: string;
  rate: number;
  recentLogs: Array<{ id: string; service: string; tokensUsed: number; cost: number; timestamp: string }>;
}

export default function AdminPanel({ onStartChat }: { onStartChat: (msg: string) => void }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progressText, setProgressText] = useState('');

  const isLearningMode = useAppStore((state) => state.isLearningMode);
  const toggleLearningMode = useAppStore((state) => state.toggleLearningMode);
  const socket = useAppStore((state) => state.socket);

  useEffect(() => {
    console.log('🔌 [AdminPanel] Socket object:', socket ? 'Present' : 'NULL');
    if (!socket) return;

    console.log('🔌 [AdminPanel] Socket connected:', socket.connected);

    const handleProgress = (data: { processed: number; total: number; currentStep: string }) => {
      console.log('📊 [AdminPanel] Progress received:', data);
      setProgressText(`${data.processed}/${data.total}: ${data.currentStep}`);
    };

    const handleConnect = () => console.log('✅ [AdminPanel] Socket connected event');
    const handleDisconnect = () => console.log('❌ [AdminPanel] Socket disconnected event');

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('memory-extraction-progress', handleProgress);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('memory-extraction-progress', handleProgress);
    };
  }, [socket]);

  const [learningTopic, setLearningTopic] = useState('');
  const [isAutoLearning, setIsAutoLearning] = useState(false);
  const [lastLearnedResult, setLastLearnedResult] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    const onLearningComplete = (data: { topic: string; result: string }) => {
      setIsAutoLearning(false);
      setLastLearnedResult(data.result);
      setLearningTopic('');
    };

    socket.on('auto-learning-complete', onLearningComplete);

    return () => {
      socket.off('auto-learning-complete', onLearningComplete);
    };
  }, [socket]);

  const handleAutoLearn = () => {
    if (!socket || !learningTopic) return;
    setIsAutoLearning(true);
    setLastLearnedResult(null);
    socket.emit('trigger-auto-learning', { topic: learningTopic, userId: 'default-user' }); // Hardcoded user for now
  };

  const handleStartInterview = () => {
    if (!isLearningMode) {
      toggleLearningMode();
    }
    onStartChat("Lass uns ein Interview starten. Ich möchte mein Profil vervollständigen.");
  };

  const [stats, setStats] = useState<SystemStats>({
    database: {
      totalMemories: 0,
      totalMessages: 0,
      totalConversations: 0,
      totalUsers: 0,
    },
    api: {
      totalRequests: 0,
      totalTokens: 0,
      totalCostUsd: 0,
    },
  });

  const [usageStats, setUsageStats] = useState<ApiUsageStats>({
    summary: [],
    totalCost: 0,
    currency: 'USD',
    rate: 1,
    recentLogs: []
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, usageRes] = await Promise.all([
          fetch('http://localhost:3001/api/admin/stats'),
          fetch('http://localhost:3001/api/admin/usage')
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (usageRes.ok) setUsageStats(await usageRes.json());
      } catch (error) {
        console.error('Failed to fetch admin data', error);
      }
    };

    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();

    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await fetch('http://localhost:3001/api/admin/import', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        alert('Dateien erfolgreich hochgeladen!');
      } else {
        alert('Fehler beim Hochladen');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload fehlgeschlagen');
    }

    setUploading(false);
  };

  const handleReindexAll = async () => {
    if (!confirm('Alle Daten neu indizieren? Das kann einige Minuten dauern.')) return;

    setIndexing(true);
    try {
      const res = await fetch('http://localhost:3001/api/admin/reindex-all', {
        method: 'POST',
      });

      if (res.ok) {
        alert('Reindizierung gestartet!');
      } else {
        alert('Fehler beim Reindizieren');
      }
    } catch (error) {
      console.error('Reindex error:', error);
      alert('Reindizierung fehlgeschlagen');
    }
    setIndexing(false);
  };

  const handleResetMemory = async () => {
    if (!confirm('⚠️ WARNUNG: Bist du sicher? Dies löscht ALLE Erinnerungen und das gesamte Langzeitgedächtnis von Neon. Dies kann NICHT rückgängig gemacht werden.')) return;

    try {
      const res = await fetch('http://localhost:3001/api/admin/reset-memory', {
        method: 'POST',
      });

      if (res.ok) {
        alert('Gedächtnis erfolgreich gelöscht. Neon ist jetzt ein unbeschriebenes Blatt.');
        // Refresh stats
        const statsRes = await fetch('http://localhost:3001/api/admin/stats');
        if (statsRes.ok) setStats(await statsRes.json());
      } else {
        alert('Fehler beim Löschen des Gedächtnisses.');
      }
    } catch (error) {
      console.error('Reset memory error:', error);
      alert('Verbindung zum Server fehlgeschlagen.');
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <Settings size={32} className="header-icon" />
        <div>
          <h2>Admin Panel</h2>
          <p className="subtitle">System-Verwaltung und Konfiguration</p>
        </div>
      </div>



      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Activity size={18} />
          Übersicht
        </button>
        <button
          className={`tab ${activeTab === 'database' ? 'active' : ''}`}
          onClick={() => setActiveTab('database')}
        >
          <Database size={18} />
          Datenbank
        </button>
        <button
          className={`tab ${activeTab === 'interviews' ? 'active' : ''}`}
          onClick={() => setActiveTab('interviews')}
        >
          <MessageSquare size={18} />
          Interviews
        </button>
        <button
          className={`tab ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          <Upload size={18} />
          Import
        </button>
        <button
          className={`tab ${activeTab === 'training' ? 'active' : ''}`}
          onClick={() => setActiveTab('training')}
        >
          <Brain size={18} />
          Training
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <Database size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-label">Erinnerungen</div>
                <div className="stat-value">{stats.database.totalMemories.toLocaleString()}</div>
                <div className="stat-sublabel">Aktive Memories</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <MessageSquare size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-label">Nachrichten</div>
                <div className="stat-value">{stats.database.totalMessages.toLocaleString()}</div>
                <div className="stat-sublabel">Gesamt</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Server size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-label">API Requests</div>
                <div className="stat-value">{stats.api.totalRequests.toLocaleString()}</div>
                <div className="stat-sublabel">Total</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <BarChart3 size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-label">AI Kosten (Gesamt)</div>
                <div className="stat-value">{usageStats.currency === 'EUR' ? '€' : '$'}{usageStats.totalCost.toFixed(2)}</div>
                <div className="stat-sublabel">Kurs: {usageStats.rate.toFixed(4)}</div>
              </div>
            </div>
          </div>

          <div className="details-grid">
            <div className="detail-card">
              <h3>
                <Database size={20} />
                Datenbank Details
              </h3>
              <div className="detail-list">
                <div className="detail-item">
                  <span>Erinnerungen:</span>
                  <strong>{stats.database.totalMemories.toLocaleString()}</strong>
                </div>
                <div className="detail-item">
                  <span>Nachrichten:</span>
                  <strong>{stats.database.totalMessages.toLocaleString()}</strong>
                </div>
                <div className="detail-item">
                  <span>Unterhaltungen:</span>
                  <strong>{stats.database.totalConversations.toLocaleString()}</strong>
                </div>
                <div className="detail-item">
                  <span>Benutzer:</span>
                  <strong>{stats.database.totalUsers.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            <div className="detail-card">
              <h3>
                <BarChart3 size={20} />
                API Nutzung
              </h3>
              <div className="detail-list">
                <div className="detail-item">
                  <span>Anfragen:</span>
                  <strong>{stats.api.totalRequests.toLocaleString()}</strong>
                </div>
                <div className="detail-item">
                  <span>Tokens verbraucht:</span>
                  <strong>{stats.api.totalTokens.toLocaleString()}</strong>
                </div>
                <div className="detail-item">
                  <span>Kosten (USD):</span>
                  <strong className="success">${stats.api.totalCostUsd.toFixed(4)}</strong>
                </div>
              </div>
            </div>

            <div className="detail-card">
              <h3>
                <BarChart3 size={20} />
                API Nutzung (Letzte 50)
              </h3>
              <div className="detail-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {usageStats.recentLogs.length === 0 ? (
                  <div className="detail-item">Keine Daten verfügbar</div>
                ) : (
                  usageStats.recentLogs.map((log) => (
                    <div key={log.id} className="detail-item" style={{ fontSize: '0.85rem' }}>
                      <span style={{ width: '80px' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <strong style={{ flex: 1 }}>{log.service}</strong>
                      <span>{log.tokensUsed} Tok.</span>
                      <strong className="success" style={{ marginLeft: '10px' }}>{usageStats.currency === 'EUR' ? '€' : '$'}{log.cost.toFixed(5)}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Database Tab */}
      {activeTab === 'database' && (
        <div className="tab-content">
          <div className="action-card">
            <h3>
              <RefreshCw size={20} />
              Datenbank-Aktionen
            </h3>
            <p>Wartungs- und Verwaltungsoptionen für die Datenbank</p>

            <div className="action-buttons">
              <button
                onClick={handleReindexAll}
                disabled={indexing}
                className="action-btn primary"
              >
                <RefreshCw size={18} className={indexing ? 'spinning' : ''} />
                {indexing ? 'Indiziere...' : 'Neu Indizieren'}
              </button>
              <button
                className="action-btn primary"
                disabled={isLoading}
                onClick={async () => {
                  if (isLoading) return;
                  setIsLoading(true);
                  console.log('🔘 [AdminPanel] "Memories Extrahieren" clicked');
                  try {
                    console.log('📡 [AdminPanel] Sending POST request to /api/admin/extract-memories...');
                    const res = await fetch('http://localhost:3001/api/admin/extract-memories', {
                      method: 'POST',
                    });
                    console.log('📥 [AdminPanel] Response status:', res.status);

                    if (res.ok) {
                      const data = await res.json();
                      console.log('✅ [AdminPanel] Success:', data);

                      let msg = data.message;
                      if (data.stats) {
                        msg += `\n(Verarbeitet: ${data.stats.processed}, Übersprungen: ${data.stats.skipped}, Fehler: ${data.stats.errors})`;
                      }
                      alert('✅ ' + msg);
                    } else {
                      const data = await res.json();
                      console.error('❌ [AdminPanel] Server Error:', data);
                      alert(`❌ Fehler: ${data.details || data.error || 'Unbekannter Fehler'}`);
                    }
                  } catch (error) {
                    console.error('💥 [AdminPanel] Network/JS Error:', error);
                    alert('❌ Verbindung fehlgeschlagen: ' + error);
                  } finally {
                    setIsLoading(false);
                    setProgressText('');
                  }
                }}
              >
                {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <Brain size={18} />}
                {isLoading ? (progressText || 'Extrahiere...') : 'Memories Extrahieren'}
              </button>
              <button
                className="action-btn danger"
                onClick={handleResetMemory}
              >
                <Database size={18} />
                Gedächtnis Löschen
              </button>
              <button className="action-btn danger">
                <Database size={18} />
                Cache leeren
              </button>
            </div>
          </div>

          <div className="info-card">
            <h4>⚠️ Hinweis</h4>
            <p>
              Die Neuindizierung kann je nach Datenmenge mehrere Minuten dauern.
              Während dieser Zeit kann die Suchfunktion eingeschränkt sein.
            </p>
          </div>
        </div>
      )}

      {/* Import Tab */}
      {activeTab === 'import' && (
        <div className="tab-content">
          <div className="action-card">
            <h3>
              <Upload size={20} />
              Daten Import
            </h3>
            <p>Importiere Dokumente, Konversationen oder Wissensdatenbanken</p>

            <div className="upload-area">
              <input
                type="file"
                id="file-upload"
                multiple
                onChange={handleFileUpload}
                accept=".txt,.md,.pdf,.json"
                style={{ display: 'none' }}
              />
              <label htmlFor="file-upload" className="upload-label">
                <Upload size={32} />
                <span>Dateien auswählen oder hierher ziehen</span>
                <span className="upload-hint">TXT, MD, PDF, JSON bis 10MB</span>
              </label>
            </div>

            {uploading && (
              <div className="upload-progress">
                <div className="progress-bar">
                  <div className="progress-fill" />
                </div>
                <p>Upload läuft...</p>
              </div>
            )}
          </div>

          <div className="info-card">
            <h4>💡 Unterstützte Formate</h4>
            <ul>
              <li><strong>TXT/MD:</strong> Text und Markdown-Dokumente</li>
              <li><strong>PDF:</strong> PDF-Dokumente (Text wird extrahiert)</li>
              <li><strong>JSON:</strong> Konversations-Export</li>
            </ul>
          </div>
        </div>
      )}

      {/* Training Tab */}
      {activeTab === 'training' && (
        <div className="tab-content">
          <div className="action-card">
            <h3>
              <Brain size={20} />
              Lernmodus Steuerung
            </h3>
            <p>Kontrolliere, wie Neon lernt und Informationen sammelt.</p>

            <div className="action-buttons">
              <button
                onClick={toggleLearningMode}
                className={`action-btn ${isLearningMode ? 'primary' : ''}`}
              >
                <Brain size={18} className={isLearningMode ? 'animate-pulse' : ''} />
                {isLearningMode ? 'Lernmodus Deaktivieren' : 'Lernmodus Aktivieren'}
              </button>

              <button
                className="action-btn"
                onClick={handleStartInterview}
              >
                <MessageSquare size={18} />
                Interview Starten
              </button>
            </div>
          </div>

          <div className="action-card">
            <h3>
              <Activity size={20} />
              Manuelle Recherche
            </h3>
            <p>Lass Neon gezielt nach Themen im Internet suchen und lernen.</p>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <input
                type="text"
                placeholder="Thema (z.B. Quantenphysik, Aktuelle Nachrichten)"
                value={learningTopic}
                onChange={(e) => setLearningTopic(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)'
                }}
              />
              <button
                className="action-btn primary"
                disabled={!learningTopic || isAutoLearning}
                onClick={handleAutoLearn}
              >
                {isAutoLearning ? (
                  <>
                    <RefreshCw className="spinning" size={18} />
                    Recherchiere...
                  </>
                ) : (
                  <>
                    <Brain size={18} />
                    Jetzt Lernen
                  </>
                )}
              </button>
            </div>
            {lastLearnedResult && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-md)',
                whiteSpace: 'pre-wrap',
                borderLeft: '4px solid var(--accent-primary)'
              }}>
                {lastLearnedResult}
              </div>
            )}
          </div>

          <div className="info-card">
            <h4>🧠 Über den Lernmodus</h4>
            <p>
              Im Lernmodus stellt Neon proaktiv Fragen, um Wissenslücken zu schließen.
              Interview-Sitzungen sind spezialisierte Chats, die nicht im normalen Verlauf auftauchen.
            </p>
          </div>
        </div>
      )}

      {/* Interviews Tab */}
      {activeTab === 'interviews' && (
        <div className="tab-content">
          <InterviewDashboard />
        </div>
      )}

      <style>{`
        .admin-container {
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
          height: 100%;
          overflow-y: auto;
        }

        .admin-header {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .header-icon {
          color: var(--accent-primary);
        }

        .admin-header h2 {
          font-size: 2rem;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary);
        }

        .subtitle {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin: 0.25rem 0 0 0;
        }

        .tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 2rem;
          border-bottom: 1px solid var(--border-subtle);
        }

        .tab {
          padding: 0.75rem 1.5rem;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
          cursor: pointer;
        }

        .tab:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }

        .tab.active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }

        .tab-content {
          animation: fadeIn 0.3s ease;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .stat-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          display: flex;
          gap: 1rem;
        }

        .stat-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-light);
          border-radius: var(--radius-md);
          color: var(--accent-primary);
        }

        .stat-content {
          flex: 1;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 0.5rem;
        }

        .stat-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }

        .stat-sublabel {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .detail-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
        }

        .detail-card h3 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 0 1rem 0;
          color: var(--text-primary);
          font-size: 1.125rem;
        }

        .detail-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: var(--bg-primary);
          border-radius: var(--radius-sm);
        }

        .detail-item span {
          color: var(--text-secondary);
        }

        .detail-item strong {
          color: var(--text-primary);
        }

        .detail-item strong.success {
          color: #22c55e;
        }

        .action-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 2rem;
          margin-bottom: 1.5rem;
        }

        .action-card h3 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 0 0.5rem 0;
          color: var(--text-primary);
        }

        .action-card p {
          color: var(--text-secondary);
          margin: 0 0 1.5rem 0;
        }

        .action-buttons {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .action-btn {
          padding: 0.75rem 1.5rem;
          border: 1px solid var(--border-medium);
          border-radius: var(--radius-md);
          background: transparent;
          color: var(--text-primary);
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn:hover {
          background: var(--bg-hover);
          transform: translateY(-2px);
        }

        .action-btn.primary {
          background: var(--accent-gradient);
          color: white;
          border: none;
        }

        .action-btn.primary:hover {
          box-shadow: 0 0 20px rgba(249, 171, 0, 0.4);
        }

        .action-btn.danger {
          color: #ef4444;
          border-color: #ef4444;
        }

        .action-btn.danger:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .upload-area {
          margin-bottom: 1.5rem;
        }

        .upload-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 3rem;
          border: 2px dashed var(--border-medium);
          border-radius: var(--radius-lg);
          background: var(--bg-primary);
          cursor: pointer;
          transition: all 0.2s;
          color: var(--text-secondary);
        }

        .upload-label:hover {
          border-color: var(--accent-primary);
          background: var(--accent-light);
          color: var(--accent-primary);
        }

        .upload-hint {
          font-size: 0.75rem;
          color: var(--text-tertiary);
        }

        .upload-progress {
          padding: 1rem;
          background: var(--accent-light);
          border-radius: var(--radius-md);
          text-align: center;
        }

        .progress-bar {
          height: 8px;
          background: var(--bg-primary);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .progress-fill {
          height: 100%;
          background: var(--accent-gradient);
          animation: progress 2s ease-in-out infinite;
        }

        @keyframes progress {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }

        .info-card {
          background: var(--accent-light);
          border: 1px solid var(--accent-primary);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
        }

        .info-card h4 {
          margin: 0 0 0.75rem 0;
          color: var(--accent-primary);
        }

        .info-card p {
          margin: 0;
          color: var(--text-primary);
          line-height: 1.6;
        }

        .info-card ul {
          margin: 0.5rem 0 0 0;
          padding-left: 1.5rem;
          color: var(--text-primary);
        }

        .info-card li {
          margin-bottom: 0.5rem;
        }

        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .details-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }

          .action-buttons {
            flex-direction: column;
          }

          .action-btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
