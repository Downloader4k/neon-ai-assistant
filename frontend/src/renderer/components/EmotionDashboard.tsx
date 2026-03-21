import { useState, useEffect } from 'react';
import { Heart, Activity, TrendingUp, Smile, Frown, Meh, Calendar, AlertCircle } from 'lucide-react';

interface EmotionData {
  sentiment: string;
  emotionTrend: string;
  topEmotion: string;
  score: number;
  history: Array<{
    date: string;
    sentiment: string;
    score: number;
  }>;
}

export default function EmotionDashboard() {
  const [emotion, setEmotion] = useState<EmotionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmotionData();
  }, []);

  const fetchEmotionData = async () => {
    setLoading(true);
    setError(null);

    try {
      const userId = localStorage.getItem('userId') || 'default-user';
      const res = await fetch(`http://localhost:3001/api/magic/emotion/${userId}/mood`);

      if (!res.ok) {
        throw new Error(res.status === 404 ? 'Keine Konversationsdaten gefunden. Chatte erst ein wenig, dann kann ich deine Stimmung analysieren!' : 'API-Fehler');
      }

      const data = await res.json();
      setEmotion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backend nicht erreichbar');
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'var(--accent-primary)';
      case 'negative':
        return '#ef4444';
      default:
        return 'var(--text-secondary)';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <Smile size={32} />;
      case 'negative':
        return <Frown size={32} />;
      default:
        return <Meh size={32} />;
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'improving') return ' 📈';
    if (trend === 'declining') return '📉';
    return '➡️';
  };

  if (loading) {
    return (
      <div className="emotion-container">
        <div className="loading">Analysiere deine Emotionen...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="emotion-container">
        <div className="error-state">
          <AlertCircle size={48} />
          <h3>Keine Daten verfügbar</h3>
          <p>{error}</p>
          <button onClick={fetchEmotionData} className="retry-button">
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (!emotion) return null;

  return (
    <div className="emotion-container">
      <div className="emotion-header">
        <Heart size={32} className="header-icon" />
        <h2>Emotionale Gesundheit</h2>
      </div>

      {/* Current Mood */}
      <div className="emotion-grid">
        <div className="emotion-card main-mood">
          <div className="card-header">
            <h3>Aktuelle Stimmung</h3>
          </div>
          <div className="mood-display" style={{ color: getSentimentColor(emotion.sentiment) }}>
            {getSentimentIcon(emotion.sentiment)}
            <div className="mood-text">
              <span className="mood-label">
                {emotion.sentiment === 'positive' && 'Positiv'}
                {emotion.sentiment === 'negative' && 'Negativ'}
                {emotion.sentiment === 'neutral' && 'Neutral'}
              </span>
              <div className="mood-score">
                Score: {isNaN(emotion.score) ? 0 : Math.round(emotion.score * 100)}%
              </div>
            </div>
          </div>
        </div>

        <div className="emotion-card">
          <div className="card-header">
            <Activity size={20} />
            <h3>Trend</h3>
          </div>
          <div className="trend-display">
            <span className="trend-icon">{getTrendIcon(emotion.emotionTrend)}</span>
            <span className="trend-text">{emotion.emotionTrend}</span>
          </div>
        </div>

        <div className="emotion-card">
          <div className="card-header">
            <TrendingUp size={20} />
            <h3>Top Emotion</h3>
          </div>
          <div className="top-emotion">
            {emotion.topEmotion}
          </div>
        </div>
      </div>

      {/* History Chart */}
      {emotion.history && emotion.history.length > 0 && (
        <div className="emotion-card history-card">
          <div className="card-header">
            <Calendar size={20} />
            <h3>Verlauf (Letzte 7 Tage)</h3>
          </div>
          <div className="history-chart">
            {emotion.history.map((entry, index) => (
              <div key={index} className="history-bar">
                <div
                  className="bar-fill"
                  style={{
                    height: `${entry.score * 100}%`,
                    background: getSentimentColor(entry.sentiment),
                  }}
                />
                <span className="bar-label">{entry.date.substring(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={fetchEmotionData} className="refresh-button">
        Aktualisieren
      </button>

      <style>{`
        .emotion-container {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
          height: 100%;
          overflow-y: auto;
        }

        .emotion-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 2rem;
          color: var(--text-primary);
        }

        .header-icon {
          color: var(--accent-primary);
        }

        .emotion-header h2 {
          font-size: 2rem;
          font-weight: 700;
          margin: 0;
        }

        .emotion-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .emotion-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
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

        .main-mood {
          grid-column: span 1;
        }

        .mood-display {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 1rem 0;
        }

        .mood-text {
          flex: 1;
        }

        .mood-label {
          font-size: 1.5rem;
          font-weight: 700;
          display: block;
          margin-bottom: 0.5rem;
        }

        .mood-score {
          font-size: 1rem;
          color: var(--text-secondary);
        }

        .trend-display {
          display: flex;
          align-items: center;
          gap: 1rem;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .trend-icon {
          font-size: 2rem;
        }

        .top-emotion {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--accent-primary);
          text-transform: capitalize;
        }

        .history-card {
          grid-column: span 3;
        }

        .history-chart {
          display: flex;
          align-items: flex-end;
          gap: 1rem;
          height: 200px;
          padding: 1rem 0;
        }

        .history-bar {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          height: 100%;
        }

        .bar-fill {
          width: 100%;
          border-radius: var(--radius-sm);
          transition: height 0.3s ease;
        }

        .bar-label {
          font-size: 0.75rem;
          color: var(--text-tertiary);
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

        @media (max-width: 768px) {
          .emotion-grid {
            grid-template-columns: 1fr;
          }

          .history-card {
            grid-column: span 1;
          }
        }
      `}</style>
    </div>
  );
}
