import { useState, useEffect } from 'react';
import {
  CalendarDays,
  MessageSquare,
  Brain,
  Search,
  Gift,
  RefreshCw,
  AlertCircle,
  MessagesSquare,
  Sparkles,
} from 'lucide-react';

interface DailySummaryData {
  date: string;
  userId: string;
  conversations: number;
  messages: number;
  memories: number;
  research: { count: number; topics: string[] };
  capsules: { count: number; items: { id: string; content: string; openAt: string }[] };
}

function getMotivationalLine(data: DailySummaryData): string {
  const total = data.conversations + data.messages + data.memories + data.research.count + data.capsules.count;
  if (total === 0) return 'Heute war ein ruhiger Tag. Morgen wird bestimmt spannender!';
  if (total <= 5) return 'Ein gemuetlicher Tag mit NEON. Qualitaet zaehlt mehr als Quantitaet!';
  if (total <= 15) return 'Produktiver Tag! Du und NEON seid ein starkes Team.';
  if (total <= 30) return 'Was fuer ein Tag! Du hast heute richtig viel geschafft.';
  return 'Unglaublich aktiv heute! NEON gluuueht vor Begeisterung.';
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

export default function DailySummary() {
  const [data, setData] = useState<DailySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = localStorage.getItem('userId') || 'default-user';
  const today = new Date().toISOString().split('T')[0];

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `http://localhost:3001/api/summary/daily?userId=${encodeURIComponent(userId)}&date=${today}`
      );
      if (!res.ok) throw new Error('Zusammenfassung konnte nicht geladen werden');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backend nicht erreichbar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const statItems = data
    ? [
        {
          icon: MessagesSquare,
          label: 'Gespraeche gefuehrt',
          value: data.conversations,
        },
        {
          icon: MessageSquare,
          label: 'Nachrichten ausgetauscht',
          value: data.messages,
        },
        {
          icon: Brain,
          label: 'Neue Erinnerungen',
          value: data.memories,
        },
        {
          icon: Search,
          label: 'Recherchen durchgefuehrt',
          value: data.research.count,
        },
        {
          icon: Gift,
          label: 'Zeitkapseln erstellt',
          value: data.capsules.count,
        },
      ]
    : [];

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <CalendarDays size={28} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <h2 style={styles.greeting}>{getGreeting()}</h2>
              <p style={styles.subtitle}>Tagesrueckblick &mdash; {today}</p>
            </div>
          </div>
          <button onClick={fetchSummary} style={styles.refreshBtn} title="Aktualisieren">
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
        </div>

        {/* Content */}
        {loading && !data && (
          <div style={styles.center}>
            <RefreshCw size={24} className="spin" style={{ color: 'var(--accent-primary)' }} />
            <p style={styles.loadingText}>Zusammenfassung wird geladen...</p>
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {data && (
          <>
            {/* Stats Grid */}
            <div style={styles.statsGrid}>
              {statItems.map((item) => (
                <div key={item.label} style={styles.statCard}>
                  <div style={styles.statIconWrap}>
                    <item.icon size={22} style={{ color: 'var(--accent-primary)' }} />
                  </div>
                  <div style={styles.statValue}>{item.value}</div>
                  <div style={styles.statLabel}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Research Topics */}
            {data.research.count > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Recherche-Themen</h3>
                <ul style={styles.topicList}>
                  {data.research.topics.map((topic, i) => (
                    <li key={i} style={styles.topicItem}>
                      <Search size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                      <span>{topic}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Capsules */}
            {data.capsules.count > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Erstellte Zeitkapseln</h3>
                <ul style={styles.topicList}>
                  {data.capsules.items.map((c) => (
                    <li key={c.id} style={styles.topicItem}>
                      <Gift size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                      <span>
                        {c.content.length > 80 ? c.content.slice(0, 80) + '...' : c.content}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Motivational Line */}
            <div style={styles.motivationBox}>
              <Sparkles size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              <p style={styles.motivationText}>{getMotivationalLine(data)}</p>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '2rem',
    minHeight: '100%',
  },
  card: {
    width: '100%',
    maxWidth: 700,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg, 12px)',
    padding: '2rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  greeting: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.85rem',
    color: 'var(--text-tertiary)',
    margin: 0,
  },
  refreshBtn: {
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm, 6px)',
    padding: '0.5rem',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '2rem',
  },
  loadingText: {
    color: 'var(--text-tertiary)',
    fontSize: '0.9rem',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 'var(--radius-sm, 6px)',
    color: '#f87171',
    fontSize: '0.9rem',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '1.25rem 0.75rem',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md, 8px)',
    transition: 'border-color 0.2s',
  },
  statIconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'rgba(249, 171, 0, 0.1)',
  },
  statValue: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  statLabel: {
    fontSize: '0.75rem',
    color: 'var(--text-tertiary)',
    textAlign: 'center',
  },
  section: {
    marginBottom: '1.25rem',
  },
  sectionTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '0.5rem',
  },
  topicList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  topicItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    padding: '0.4rem 0.6rem',
    background: 'var(--bg-primary)',
    borderRadius: 'var(--radius-sm, 6px)',
  },
  motivationBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem 1.25rem',
    background: 'rgba(249, 171, 0, 0.08)',
    border: '1px solid rgba(249, 171, 0, 0.2)',
    borderRadius: 'var(--radius-md, 8px)',
    marginTop: '0.5rem',
  },
  motivationText: {
    margin: 0,
    fontSize: '0.9rem',
    color: 'var(--text-primary)',
    fontStyle: 'italic',
  },
};
