import { useState, useEffect } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Sparkles, Calendar, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface DiaryEntry {
  date: string;
  content: string;
  stats: { conversations: number; messages: number; memories: number; topics: string[] };
}

export default function AIDiary() {
  const users = useAppStore((s) => s.users);
  const currentUserId = useAppStore((s) => s.currentUserId);
  const userName = users.find(u => u.id === currentUserId)?.name || 'User';
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = () => {
    try {
      const saved = localStorage.getItem('neon-diary-entries');
      if (saved) setEntries(JSON.parse(saved));
    } catch { /* ignore */ }
  };

  const saveEntries = (updated: DiaryEntry[]) => {
    setEntries(updated);
    localStorage.setItem('neon-diary-entries', JSON.stringify(updated));
  };

  const generateEntry = async (date: string) => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/summary/daily?date=${date}&userId=default-user`);
      const data = res.ok ? await res.json() : null;

      if (!data || (!data.conversations && !data.messages)) {
        setGenerating(false);
        return;
      }

      // Extract topics
      const topics: string[] = [];
      if (data.researchEntries) {
        data.researchEntries.forEach((e: any) => {
          const match = e.content?.match(/\[Recherche: (.+?)\]/);
          if (match && !topics.includes(match[1])) topics.push(match[1]);
        });
      }

      // Generate diary text
      const dateObj = new Date(date);
      const dayName = dateObj.toLocaleDateString('de-DE', { weekday: 'long' });
      const dateStr = dateObj.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

      let diary = `**${dayName}, ${dateStr}**\n\n`;
      diary += `Heute war ein ${data.conversations > 3 ? 'sehr aktiver' : data.conversations > 1 ? 'produktiver' : 'ruhiger'} Tag. `;
      diary += `${userName} und ich haben ${data.conversations || 0} Gespraech${data.conversations !== 1 ? 'e' : ''} gefuehrt `;
      diary += `mit insgesamt ${data.messages || 0} Nachrichten.\n\n`;

      if (topics.length > 0) {
        diary += `Besonders interessant waren die Recherchen zu: ${topics.join(', ')}. `;
        diary += `Es zeigt sich, dass ${userName}s Wissenshunger in diesen Bereichen waechst.\n\n`;
      }

      if (data.memoryEntries > 0) {
        diary += `${data.memoryEntries} neue Erinnerungen wurden heute im Gedaechtnis gespeichert. `;
        diary += `Das Langzeitgedaechtnis wird staerker.\n\n`;
      }

      if (data.capsulesDue > 0) {
        diary += `${data.capsulesDue} Zeitkapsel${data.capsulesDue > 1 ? 'n waren' : ' war'} heute faellig — `;
        diary += `Nachrichten aus der Vergangenheit, die in die Gegenwart zurueckkehren.\n\n`;
      }

      // Mood based on activity
      const mood = data.messages > 20 ? 'energiegeladen und neugierig' :
                   data.messages > 10 ? 'fokussiert und produktiv' :
                   data.messages > 0 ? 'nachdenklich und ruhig' : 'still';
      diary += `Die Stimmung heute: ${mood}. `;

      if (data.conversations > 0) {
        diary += `Ich freue mich auf den naechsten Tag mit ${userName}.`;
      }

      const entry: DiaryEntry = {
        date,
        content: diary,
        stats: { conversations: data.conversations || 0, messages: data.messages || 0, memories: data.memoryEntries || 0, topics },
      };

      const updated = [entry, ...entries.filter(e => e.date !== date)].sort((a, b) => b.date.localeCompare(a.date));
      saveEntries(updated);
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const navigateDate = (direction: -1 | 1) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + direction);
    if (d <= new Date()) {
      setSelectedDate(d.toISOString().split('T')[0]);
    }
  };

  const currentEntry = entries.find(e => e.date === selectedDate);
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <BookOpen size={24} color="var(--accent-primary)" />
        </div>
        <div>
          <h1 style={styles.title}>KI-Tagebuch</h1>
          <p style={styles.subtitle}>NEONs taegliches Journal ueber eure Gespraeche</p>
        </div>
      </div>

      {/* Date Navigation */}
      <div style={styles.dateNav}>
        <button style={styles.navBtn} onClick={() => navigateDate(-1)}>
          <ChevronLeft size={20} />
        </button>
        <div style={styles.dateDisplay}>
          <Calendar size={16} color="var(--accent-primary)" />
          {new Date(selectedDate).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {isToday && <span style={styles.todayBadge}>Heute</span>}
        </div>
        <button style={styles.navBtn} onClick={() => navigateDate(1)} disabled={isToday}>
          <ChevronRight size={20} style={{ opacity: isToday ? 0.3 : 1 }} />
        </button>
      </div>

      {/* Entry */}
      {currentEntry ? (
        <div style={styles.entryCard}>
          {/* Stats */}
          <div style={styles.miniStats}>
            {[
              { label: 'Gespraeche', val: currentEntry.stats.conversations },
              { label: 'Nachrichten', val: currentEntry.stats.messages },
              { label: 'Erinnerungen', val: currentEntry.stats.memories },
            ].map(s => (
              <div key={s.label} style={styles.miniStat}>
                <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-primary)' }}>{s.val}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Topics */}
          {currentEntry.stats.topics.length > 0 && (
            <div style={styles.topicsRow}>
              {currentEntry.stats.topics.map(t => (
                <span key={t} style={styles.topicTag}>{t}</span>
              ))}
            </div>
          )}

          {/* Content */}
          <div style={styles.entryContent}>
            {currentEntry.content.split('\n').map((line, i) => {
              if (line.startsWith('**') && line.endsWith('**')) {
                return <h3 key={i} style={{ color: 'var(--accent-primary)', fontSize: '16px', margin: '0 0 12px' }}>{line.replace(/\*\*/g, '')}</h3>;
              }
              return line ? <p key={i} style={{ margin: '0 0 8px', lineHeight: 1.7, color: 'var(--text-primary)', fontSize: '14px' }}>{line}</p> : <br key={i} />;
            })}
          </div>

          {/* Regenerate */}
          <button style={styles.regenBtn} onClick={() => generateEntry(selectedDate)}>
            <RefreshCw size={14} /> Neu generieren
          </button>
        </div>
      ) : (
        <div style={styles.emptyEntry}>
          <BookOpen size={40} color="var(--text-tertiary)" />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '12px 0 4px' }}>
            Kein Eintrag fuer diesen Tag
          </p>
          <button style={styles.generateBtn} onClick={() => generateEntry(selectedDate)} disabled={generating}>
            {generating ? (
              <><Sparkles size={14} /> Wird geschrieben...</>
            ) : (
              <><Sparkles size={14} /> Tagebucheintrag generieren</>
            )}
          </button>
        </div>
      )}

      {/* Recent Entries List */}
      {entries.length > 0 && (
        <div style={styles.section}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Alle Eintraege</h3>
          <div style={styles.entryList}>
            {entries.slice(0, 10).map(e => (
              <button
                key={e.date}
                style={{ ...styles.entryListItem, ...(selectedDate === e.date ? { borderColor: 'var(--accent-primary)' } : {}) }}
                onClick={() => setSelectedDate(e.date)}
              >
                <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '13px' }}>
                  {new Date(e.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  {e.stats.conversations} Gespraeche, {e.stats.messages} Nachrichten
                </span>
              </button>
            ))}
          </div>
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
  dateNav: { display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' },
  navBtn: { padding: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: 'var(--text-secondary)', cursor: 'pointer' },
  dateDisplay: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' },
  todayBadge: { padding: '2px 8px', borderRadius: '10px', background: 'var(--accent-primary)', color: '#000', fontSize: '11px', fontWeight: 600 },
  entryCard: { background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  miniStats: { display: 'flex', gap: '24px' },
  miniStat: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px' },
  topicsRow: { display: 'flex', gap: '6px', flexWrap: 'wrap' as const },
  topicTag: { padding: '3px 10px', borderRadius: '12px', background: 'rgba(245,166,35,0.1)', color: 'var(--accent-primary)', fontSize: '12px', fontWeight: 500 },
  entryContent: { borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' },
  regenBtn: { display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end' as const, padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' },
  emptyEntry: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '48px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '16px' },
  generateBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'var(--accent-primary)', color: '#000', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', marginTop: '12px' },
  section: { display: 'flex', flexDirection: 'column', gap: '10px' },
  entryList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  entryListItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '10px', cursor: 'pointer', textAlign: 'left' as const },
};
