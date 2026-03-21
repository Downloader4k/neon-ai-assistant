import { useState, useEffect } from 'react';
import { Brain, TrendingUp, Lightbulb, Star, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface Prediction {
  type: string;
  content: string;
  confidence: number;
  priority: 'high' | 'medium' | 'low';
  category: string;
}

interface PredictiveAssistantProps {
  onAcceptPrediction?: (text: string) => void;
}

export default function PredictiveAssistant({ onAcceptPrediction }: PredictiveAssistantProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = (prediction: Prediction) => {
    if (onAcceptPrediction) {
      // Create a natural response to the suggestion
      const responseText = prediction.type === 'question'
        ? `Ja, bitte erzähl mir mehr über: ${prediction.content.replace('Möchtest du mehr über ', '').replace(' erfahren?', '')}`
        : prediction.content;

      onAcceptPrediction(responseText);
    }
  };

  const handleLater = (index: number) => {
    setPredictions(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    fetchPredictions();
  }, []);

  const fetchPredictions = async () => {
    setLoading(true);
    setError(null);

    try {
      const userId = localStorage.getItem('userId') || 'default-user';
      const res = await fetch(`http://localhost:3001/api/magic/predict/${userId}`);

      if (!res.ok) {
        throw new Error(res.status === 404 ? 'Noch keine ausreichenden Daten. Nutze NEON ein wenig, damit ich Vorhersagen treffen kann!' : 'API-Fehler');
      }

      const data = await res.json();

      if (!data.predictions || data.predictions.length === 0) {
        throw new Error('Keine Vorhersagen verfügbar');
      }

      setPredictions(data.predictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backend nicht erreichbar');
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'task':
        return <CheckCircle className="icon" />;
      case 'question':
        return <Lightbulb className="icon" />;
      case 'reminder':
        return <Clock className="icon" />;
      case 'suggestion':
        return <Star className="icon" />;
      case 'insight':
        return <TrendingUp className="icon" />;
      default:
        return <AlertCircle className="icon" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'var(--accent-primary)';
      case 'medium':
        return '#3b82f6';
      case 'low':
        return 'var(--text-secondary)';
      default:
        return 'var(--text-tertiary)';
    }
  };

  if (loading) {
    return (
      <div className="predictive-container">
        <div className="loading">Generiere Vorhersagen mit KI...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="predictive-container">
        <div className="error-state">
          <Brain size={48} className="text-accent-primary mb-4" />
          <p className="text-lg font-medium mb-4">{error}</p>
          <button onClick={fetchPredictions} className="retry-button">
            <Brain size={18} />
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="predictive-container">
      <div className="predictive-header">
        <Brain size={32} className="header-icon" />
        <div>
          <h2>Predictive Assistant</h2>
          <p className="subtitle">KI-basierte Vorschläge basierend auf deinem Verhalten</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{predictions.length}</div>
          <div className="stat-label">Aktive Vorhersagen</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {predictions.filter((p) => p.priority === 'high').length}
          </div>
          <div className="stat-label">Hohe Priorität</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {Math.round(
              predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length * 100
            )}%
          </div>
          <div className="stat-label">Ø Konfidenz</div>
        </div>
      </div>

      <div className="predictions-list">
        {predictions.map((pred, idx) => (
          <div key={idx} className="prediction-card" style={{ borderLeftColor: getPriorityColor(pred.priority) }}>
            <div className="prediction-header">
              {getIcon(pred.type)}
              <div className="prediction-meta">
                <span className="prediction-category">{pred.category}</span>
                <span className="prediction-priority" style={{ color: getPriorityColor(pred.priority) }}>
                  {pred.priority === 'high' && '🔴 Hoch'}
                  {pred.priority === 'medium' && '🟡 Mittel'}
                  {pred.priority === 'low' && '🟢 Niedrig'}
                </span>
              </div>
            </div>

            <p className="prediction-content">{pred.content}</p>

            <div className="prediction-footer">
              <div className="confidence-bar">
                <div className="confidence-label">Konfidenz:</div>
                <div className="confidence-track">
                  <div
                    className="confidence-fill"
                    style={{ width: `${pred.confidence * 100}%` }}
                  />
                </div>
                <div className="confidence-value">{Math.round(pred.confidence * 100)}%</div>
              </div>
              <div className="prediction-actions">
                <button
                  className="action-btn primary"
                  onClick={() => handleAccept(pred)}
                >
                  Annehmen
                </button>
                <button
                  className="action-btn"
                  onClick={() => handleLater(idx)}
                >
                  Später
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={fetchPredictions} className="refresh-button">
        <Brain size={18} />
        Neue Vorhersagen generieren
      </button>

      <style>{`
        .predictive-container {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
          height: 100%;
          overflow-y: auto;
        }

        .predictive-header {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .header-icon {
          color: var(--accent-primary);
          filter: drop-shadow(0 0 10px rgba(249, 171, 0, 0.5));
        }

        .predictive-header h2 {
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

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .stat-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          text-align: center;
        }

        .stat-value {
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--accent-primary);
          margin-bottom: 0.5rem;
        }

        .stat-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .predictions-list {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .prediction-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-left: 4px solid;
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          transition: all 0.2s;
        }

        .prediction-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .prediction-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .icon {
          width: 24px;
          height: 24px;
          color: var(--accent-primary);
        }

        .prediction-meta {
          flex: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .prediction-category {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .prediction-priority {
          font-size: 0.75rem;
          font-weight: 600;
        }

        .prediction-content {
          font-size: 0.9375rem;
          line-height: 1.6;
          color: var(--text-primary);
          margin: 0 0 1rem 0;
        }

        .prediction-footer {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .confidence-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .confidence-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .confidence-track {
          flex: 1;
          height: 6px;
          background: var(--bg-primary);
          border-radius: 3px;
          overflow: hidden;
        }

        .confidence-fill {
          height: 100%;
          background: var(--accent-gradient);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .confidence-value {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--accent-primary);
          min-width: 40px;
          text-align: right;
        }

        .prediction-actions {
          display: flex;
          gap: 0.75rem;
        }

        .action-btn {
          padding: 0.5rem 1rem;
          border: 1px solid var(--border-medium);
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .action-btn.primary {
          background: var(--accent-gradient);
          color: white;
          border: none;
        }

        .action-btn.primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 0 20px rgba(249, 171, 0, 0.4);
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
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
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
          .stats-grid {
            grid-template-columns: 1fr;
          }

          .prediction-actions {
            flex-direction: column;
          }

          .action-btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
