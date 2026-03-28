import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Sun, Moon, CloudSun, Coffee, BookOpen, Gift, Brain,
  TrendingUp, MessageSquare, Sparkles, ChevronRight, Flame
} from 'lucide-react';

interface BriefingData {
  conversations: number;
  messages: number;
  memories: number;
  researches: number;
  capsulesDue: number;
  topTopics: string[];
  streak: number;
  lastActive: string;
}

export default function MorningBriefing({ onStartChat }: { onStartChat: (msg: string) => void }) {
  const setActiveView = useAppStore((state) => state.setActiveView);
  const currentUser = useAppStore((s) => s.currentUser);
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [timeIcon, setTimeIcon] = useState<typeof Sun>(Sun);
  const [weather, setWeather] = useState<{ temp: number; desc: string } | null>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 6) { setGreeting('Gute Nacht'); setTimeIcon(Moon); }
    else if (hour < 12) { setGreeting('Guten Morgen'); setTimeIcon(Coffee); }
    else if (hour < 18) { setGreeting('Guten Tag'); setTimeIcon(Sun); }
    else { setGreeting('Guten Abend'); setTimeIcon(CloudSun); }

    fetchBriefing();
    fetchWeather();
  }, []);

  const fetchBriefing = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const [todayRes, yesterdayRes] = await Promise.all([
        fetch(`/api/summary/daily?date=${today}&userId=default-user`).then(r => r.ok ? r.json() : null),
        fetch(`/api/summary/daily?date=${yesterday}&userId=default-user`).then(r => r.ok ? r.json() : null),
      ]);

      const todayData = todayRes || {};
      const yesterdayData = yesterdayRes || {};

      // Calculate streak (simplified - count consecutive days)
      const streak = (yesterdayData.conversations || 0) > 0 ? 2 : 1;

      // Extract topics from research entries
      const topics: string[] = [];
      if (yesterdayData.researchEntries) {
        yesterdayData.researchEntries.forEach((e: any) => {
          const match = e.content?.match(/\[Recherche: (.+?)\]/);
          if (match) topics.push(match[1]);
        });
      }
      if (todayData.researchEntries) {
        todayData.researchEntries.forEach((e: any) => {
          const match = e.content?.match(/\[Recherche: (.+?)\]/);
          if (match && !topics.includes(match[1])) topics.push(match[1]);
        });
      }

      setData({
        conversations: todayData.conversations || 0,
        messages: todayData.messages || 0,
        memories: todayData.memoryEntries || 0,
        researches: topics.length,
        capsulesDue: todayData.capsulesDue || 0,
        topTopics: topics.slice(0, 3),
        streak,
        lastActive: yesterdayData.conversations > 0 ? 'gestern' : 'vor laengerem',
      });
    } catch {
      setData({
        conversations: 0, messages: 0, memories: 0, researches: 0,
        capsulesDue: 0, topTopics: [], streak: 1, lastActive: 'unbekannt'
      });
    }
    setLoading(false);
  };

  const fetchWeather = async () => {
    try {
      const savedCity = localStorage.getItem('neon-weather-city') || 'Berlin';
      const res = await fetch(`/api/magic/weather?city=${encodeURIComponent(savedCity)}`);
      if (res.ok) {
        const w = await res.json();
        setWeather({ temp: Math.round(w.main?.temp || w.temp || 0), desc: w.weather?.[0]?.description || '' });
      }
    } catch { /* ignore */ }
  };

  const TimeIcon = timeIcon;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        <Sparkles size={24} style={{ marginRight: 8, animation: 'spin 2s linear infinite' }} />
        Briefing wird vorbereitet...
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Hero */}
      <div style={styles.hero}>
        <div style={styles.heroGlow} />
        <TimeIcon size={48} color="var(--accent-primary)" style={{ position: 'relative', zIndex: 2 }} />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={styles.heroTitle}>{greeting}, {currentUser?.name || 'User'}!</h1>
          <p style={styles.heroSub}>Hier ist dein taegliches Briefing</p>
        </div>
        {weather && (
          <div style={styles.weatherBadge}>
            <CloudSun size={16} />
            {weather.temp}°C — {weather.desc}
          </div>
        )}
      </div>

      {/* Streak */}
      {data && data.streak > 1 && (
        <div style={styles.streakBar}>
          <Flame size={20} color="#FF6B35" />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{data.streak}-Tage-Streak!</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Du nutzt NEON regelmässig</span>
        </div>
      )}

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        {[
          { icon: MessageSquare, label: 'Gespraeche heute', value: data?.conversations || 0, color: '#F5A623' },
          { icon: Brain, label: 'Neue Erinnerungen', value: data?.memories || 0, color: '#2196F3' },
          { icon: BookOpen, label: 'Recherchen', value: data?.researches || 0, color: '#4CAF50' },
          { icon: Gift, label: 'Zeitkapseln faellig', value: data?.capsulesDue || 0, color: '#FF9800' },
        ].map(stat => (
          <div key={stat.label} style={styles.statCard}>
            <div style={{ ...styles.statIcon, background: stat.color + '20' }}>
              <stat.icon size={20} color={stat.color} />
            </div>
            <div style={styles.statValue}>{stat.value}</div>
            <div style={styles.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Zeitkapseln faellig */}
      {data && data.capsulesDue > 0 && (
        <button style={styles.actionCard} onClick={() => setActiveView('capsules')}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#FF9800'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
        >
          <Gift size={24} color="#FF9800" />
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {data.capsulesDue} Zeitkapsel{data.capsulesDue > 1 ? 'n' : ''} bereit!
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              Nachrichten aus der Vergangenheit warten auf dich
            </div>
          </div>
          <ChevronRight size={20} color="var(--text-tertiary)" />
        </button>
      )}

      {/* Letzte Themen */}
      {data && data.topTopics.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>
            <TrendingUp size={16} color="var(--accent-primary)" />
            Deine letzten Themen
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {data.topTopics.map(topic => (
              <button
                key={topic}
                style={styles.topicChip}
                onClick={() => onStartChat(`Erzaehl mir mehr ueber ${topic}`)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
              >
                <Sparkles size={12} color="var(--accent-primary)" />
                {topic}
                <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>Weitermachen?</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Vorschlaege */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>
          <Sparkles size={16} color="var(--accent-primary)" />
          Vorschlaege fuer heute
        </h3>
        <div style={styles.suggestGrid}>
          {[
            { text: 'Etwas Neues lernen', prompt: 'Erklaere mir ein spannendes Konzept aus der Wissenschaft, das ich vermutlich noch nicht kenne', icon: BookOpen, color: '#4CAF50' },
            { text: 'Kreativ werden', prompt: 'Schreibe mir eine kurze inspirierende Geschichte', icon: Sparkles, color: '#E91E63' },
            { text: 'Tagesplan erstellen', prompt: 'Hilf mir einen produktiven Tagesplan zu erstellen', icon: Coffee, color: '#FF9800' },
            { text: 'Denk-Challenge', prompt: 'Gib mir ein kniffliges Raetsel oder eine Denksportaufgabe', icon: Brain, color: '#9C27B0' },
          ].map(s => (
            <button key={s.text} style={styles.suggestBtn} onClick={() => onStartChat(s.prompt)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'none'; }}
            >
              <s.icon size={18} color={s.color} />
              <span style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{s.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '32px',
    maxWidth: '700px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    height: '100%',
    overflowY: 'auto',
  },
  hero: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '32px',
    borderRadius: '20px',
    background: 'linear-gradient(135deg, rgba(245,166,35,0.1), rgba(255,107,53,0.05))',
    border: '1px solid rgba(245,166,35,0.15)',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 150,
    height: 150,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(245,166,35,0.15), transparent 70%)',
  },
  heroTitle: { fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  heroSub: { fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0 0' },
  weatherBadge: {
    position: 'absolute',
    top: 16,
    right: 20,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.08)',
    color: 'var(--text-secondary)',
    fontSize: '13px',
  },
  streakBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 18px',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, rgba(255,107,53,0.1), rgba(255,152,0,0.05))',
    border: '1px solid rgba(255,107,53,0.2)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    padding: '18px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '14px',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' },
  statLabel: { fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' as const },
  actionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px 20px',
    background: 'linear-gradient(135deg, rgba(255,152,0,0.08), rgba(255,152,0,0.02))',
    border: '1px solid var(--border-subtle)',
    borderRadius: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left' as const,
  },
  section: { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  topicChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '20px',
    cursor: 'pointer',
    color: 'var(--text-primary)',
    fontSize: '13px',
    transition: 'all 0.2s ease',
  },
  suggestGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
  },
  suggestBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};
