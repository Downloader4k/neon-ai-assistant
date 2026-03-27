import { useState, useEffect } from 'react';
import { Clock, MessageSquare, Brain, BookOpen, Gift, Sparkles, ChevronDown } from 'lucide-react';

interface TimelineEntry {
  id: string;
  type: 'conversation' | 'memory' | 'research' | 'capsule';
  title: string;
  preview: string;
  date: Date;
  icon: typeof Clock;
  color: string;
}

export default function ThoughtTimeline() {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysToShow, setDaysToShow] = useState(7);

  useEffect(() => {
    fetchTimeline();
  }, [daysToShow]);

  const fetchTimeline = async () => {
    setLoading(true);
    const all: TimelineEntry[] = [];

    try {
      // Fetch conversations
      const convRes = await fetch('/api/conversations?userId=default-user');
      if (convRes.ok) {
        const convs = await convRes.json();
        convs.forEach((c: any) => {
          const date = new Date(c.updatedAt || c.createdAt);
          if (Date.now() - date.getTime() < daysToShow * 86400000) {
            all.push({
              id: 'conv-' + c.id,
              type: 'conversation',
              title: c.title || 'Unbenanntes Gespraech',
              preview: `${c._count?.messages || '?'} Nachrichten`,
              date,
              icon: MessageSquare,
              color: '#F5A623',
            });
          }
        });
      }

      // Fetch memories
      const memRes = await fetch('/api/memory/default-user');
      if (memRes.ok) {
        const mems = await memRes.json();
        mems.forEach((m: any) => {
          const date = new Date(m.createdAt);
          if (Date.now() - date.getTime() < daysToShow * 86400000) {
            const isResearch = m.content?.startsWith('[Recherche:');
            all.push({
              id: 'mem-' + m.id,
              type: isResearch ? 'research' : 'memory',
              title: isResearch ? m.content.match(/\[Recherche: (.+?)\]/)?.[1] || 'Recherche' : 'Erinnerung',
              preview: m.content?.substring(0, 100) || '',
              date,
              icon: isResearch ? BookOpen : Brain,
              color: isResearch ? '#4CAF50' : '#2196F3',
            });
          }
        });
      }

      // Fetch capsules
      try {
        const capRes = await fetch('/api/magic/capsules/default-user');
        if (capRes.ok) {
          const caps = await capRes.json();
          (Array.isArray(caps) ? caps : caps.capsules || []).forEach((c: any) => {
            const date = new Date(c.createdAt);
            if (Date.now() - date.getTime() < daysToShow * 86400000) {
              all.push({
                id: 'cap-' + c.id,
                type: 'capsule',
                title: 'Zeitkapsel',
                preview: c.opened ? c.message?.substring(0, 80) || '' : 'Noch verschlossen...',
                date,
                icon: Gift,
                color: '#FF9800',
              });
            }
          });
        }
      } catch { /* capsules optional */ }
    } catch { /* ignore */ }

    all.sort((a, b) => b.date.getTime() - a.date.getTime());
    setEntries(all);
    setLoading(false);
  };

  // Group entries by date
  const grouped: Record<string, TimelineEntry[]> = {};
  entries.forEach(e => {
    const key = e.date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <Clock size={24} color="var(--accent-primary)" />
        </div>
        <div>
          <h1 style={styles.title}>Gedanken-Zeitstrahl</h1>
          <p style={styles.subtitle}>Deine Reise durch {entries.length} Gedanken und Gespraeche</p>
        </div>
      </div>

      {/* Filter */}
      <div style={styles.filterBar}>
        {[7, 14, 30, 90].map(d => (
          <button
            key={d}
            style={{ ...styles.filterBtn, ...(daysToShow === d ? styles.filterBtnActive : {}) }}
            onClick={() => setDaysToShow(d)}
          >
            {d} Tage
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
          <Sparkles size={24} style={{ marginBottom: 8 }} /> Lade Zeitstrahl...
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
          Keine Eintraege in den letzten {daysToShow} Tagen
        </div>
      ) : (
        <div style={styles.timeline}>
          {/* Vertical line */}
          <div style={styles.timelineLine} />

          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel} style={styles.dayGroup}>
              {/* Date label */}
              <div style={styles.dateLabel}>
                <div style={styles.dateDot} />
                {dateLabel}
              </div>

              {/* Items */}
              {items.map(item => (
                <div key={item.id} style={styles.timelineItem}>
                  <div style={styles.itemConnector} />
                  <div style={{ ...styles.itemIcon, background: item.color + '20' }}>
                    <item.icon size={16} color={item.color} />
                  </div>
                  <div style={styles.itemContent}>
                    <div style={styles.itemHeader}>
                      <span style={styles.itemTitle}>{item.title}</span>
                      <span style={styles.itemTime}>
                        {item.date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={styles.itemPreview}>{item.preview}</p>
                    <span style={{ ...styles.itemBadge, background: item.color + '15', color: item.color }}>
                      {item.type === 'conversation' ? 'Gespraech' :
                       item.type === 'memory' ? 'Erinnerung' :
                       item.type === 'research' ? 'Recherche' : 'Zeitkapsel'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Load more */}
          {daysToShow < 90 && (
            <button style={styles.loadMoreBtn} onClick={() => setDaysToShow(d => Math.min(90, d + 7))}>
              <ChevronDown size={16} />
              Mehr laden
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '32px', maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'center', gap: '14px' },
  headerIcon: { width: 48, height: 48, borderRadius: 14, background: 'rgba(245,166,35,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  subtitle: { fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' },
  filterBar: { display: 'flex', gap: '8px' },
  filterBtn: { padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s ease' },
  filterBtnActive: { background: 'var(--accent-primary)', color: '#000', borderColor: 'var(--accent-primary)', fontWeight: 600 },
  timeline: { position: 'relative', paddingLeft: '32px' },
  timelineLine: { position: 'absolute', left: '11px', top: 0, bottom: 0, width: '2px', background: 'linear-gradient(180deg, var(--accent-primary), var(--border-subtle), transparent)' },
  dayGroup: { marginBottom: '24px' },
  dateLabel: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '12px', marginLeft: '-32px' },
  dateDot: { width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-primary)', border: '2px solid var(--bg-primary)', boxShadow: '0 0 8px rgba(245,166,35,0.4)', flexShrink: 0, marginLeft: '7px' },
  timelineItem: { position: 'relative', display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' },
  itemConnector: { position: 'absolute', left: '-25px', top: '14px', width: '16px', height: '2px', background: 'var(--border-subtle)' },
  itemIcon: { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemContent: { flex: 1, padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '12px' },
  itemHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  itemTitle: { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' },
  itemTime: { fontSize: '11px', color: 'var(--text-tertiary)' },
  itemPreview: { fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 6px 0', lineHeight: 1.4 },
  itemBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600 },
  loadMoreBtn: { display: 'flex', alignItems: 'center', gap: '6px', margin: '8px auto', padding: '8px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '20px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' },
};
