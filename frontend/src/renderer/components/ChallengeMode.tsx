import { useState, useEffect } from 'react';
import { Flame, Trophy, Star, Brain, Zap, Target, Award, ChevronRight, Sparkles } from 'lucide-react';

interface Challenge {
  id: string;
  title: string;
  description: string;
  prompt: string;
  difficulty: 'leicht' | 'mittel' | 'schwer';
  category: string;
  icon: typeof Brain;
  color: string;
}

interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

const dailyChallenges: Challenge[] = [
  { id: 'riddle', title: 'Denk-Raetsel', description: 'Loese ein kniffliges Raetsel', prompt: 'Gib mir ein anspruchsvolles Denk-Raetsel. Warte auf meine Antwort bevor du die Loesung verrätst.', difficulty: 'mittel', category: 'Logik', icon: Brain, color: '#9C27B0' },
  { id: 'quiz', title: 'Wissens-Quiz', description: '5 Fragen aus verschiedenen Bereichen', prompt: 'Erstelle ein Quiz mit 5 schwierigen Fragen aus verschiedenen Wissensgebieten. Warte nach jeder Frage auf meine Antwort.', difficulty: 'mittel', category: 'Wissen', icon: Star, color: '#FF9800' },
  { id: 'code', title: 'Code-Challenge', description: 'Loesung in unter 10 Zeilen', prompt: 'Gib mir eine Programmier-Challenge die ich in unter 10 Zeilen Code loesen soll. Nenne die Sprache und warte auf meine Loesung.', difficulty: 'schwer', category: 'Code', icon: Zap, color: '#2196F3' },
  { id: 'creative', title: 'Kreativ-Sprint', description: 'Schreibe eine Geschichte in 3 Saetzen', prompt: 'Gib mir ein ungewoehnliches Thema und ich schreibe eine Geschichte in genau 3 Saetzen dazu. Bewerte danach meine Kreativitaet.', difficulty: 'leicht', category: 'Kreativ', icon: Sparkles, color: '#E91E63' },
  { id: 'debate', title: 'Streit-Gespraech', description: 'Verteidige eine zufaellige Position', prompt: 'Gib mir eine kontroverse These und ich muss sie verteidigen, egal ob ich zustimme. Du argumentierst dagegen. Nach 3 Runden bewerte meine Argumentation.', difficulty: 'schwer', category: 'Debatte', icon: Target, color: '#F44336' },
  { id: 'math', title: 'Kopfrechnen', description: '5 Mathe-Aufgaben ohne Taschenrechner', prompt: 'Gib mir 5 Kopfrechen-Aufgaben mit steigender Schwierigkeit (keine Taschenrechner erlaubt). Warte nach jeder Aufgabe auf meine Antwort.', difficulty: 'mittel', category: 'Mathe', icon: Brain, color: '#4CAF50' },
  { id: 'vocab', title: 'Wort-Akrobat', description: 'Finde Woerter mit Bedingungen', prompt: 'Gib mir 5 Wort-Raetsel: z.B. "Nenne ein deutsches Wort mit 3 aufeinanderfolgenden Vokalen" oder "Ein Wort das rueckwaerts gelesen ein anderes Wort ergibt". Warte auf meine Antworten.', difficulty: 'leicht', category: 'Sprache', icon: Star, color: '#00BCD4' },
];

const allBadges: Badge[] = [
  { id: 'first', title: 'Erster Schritt', description: 'Erste Challenge absolviert', icon: '🏅', unlocked: false },
  { id: 'streak3', title: 'Heisser Streak', description: '3 Tage in Folge Challenges', icon: '🔥', unlocked: false },
  { id: 'streak7', title: 'Wochenkrieger', description: '7 Tage in Folge', icon: '⚡', unlocked: false },
  { id: 'allcat', title: 'Allrounder', description: 'Jede Kategorie mindestens einmal', icon: '🌟', unlocked: false },
  { id: 'ten', title: 'Zehnkampf', description: '10 Challenges geschafft', icon: '🏆', unlocked: false },
  { id: 'hard5', title: 'Hartkern', description: '5 schwere Challenges', icon: '💎', unlocked: false },
];

export default function ChallengeMode({ onStartChat }: { onStartChat: (msg: string) => void }) {
  const [stats, setStats] = useState({ streak: 0, total: 0, todayDone: false, completedIds: [] as string[], badges: allBadges });
  const [todayChallenge, setTodayChallenge] = useState<Challenge | null>(null);

  useEffect(() => {
    loadStats();
    pickDailyChallenge();
  }, []);

  const loadStats = () => {
    try {
      const saved = localStorage.getItem('neon-challenge-stats');
      if (saved) setStats(JSON.parse(saved));
    } catch { /* ignore */ }
  };

  const saveStats = (s: typeof stats) => {
    setStats(s);
    localStorage.setItem('neon-challenge-stats', JSON.stringify(s));
  };

  const pickDailyChallenge = () => {
    // Deterministic daily challenge based on date
    const today = new Date();
    const dayIndex = (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % dailyChallenges.length;
    setTodayChallenge(dailyChallenges[dayIndex]);
  };

  const startChallenge = (challenge: Challenge) => {
    // Mark as done today
    const updated = {
      ...stats,
      total: stats.total + 1,
      todayDone: true,
      streak: stats.todayDone ? stats.streak : stats.streak + 1,
      completedIds: [...stats.completedIds, challenge.id],
    };

    // Check badges
    updated.badges = updated.badges.map(b => {
      if (b.unlocked) return b;
      if (b.id === 'first' && updated.total >= 1) return { ...b, unlocked: true, unlockedAt: new Date().toISOString() };
      if (b.id === 'streak3' && updated.streak >= 3) return { ...b, unlocked: true, unlockedAt: new Date().toISOString() };
      if (b.id === 'streak7' && updated.streak >= 7) return { ...b, unlocked: true, unlockedAt: new Date().toISOString() };
      if (b.id === 'ten' && updated.total >= 10) return { ...b, unlocked: true, unlockedAt: new Date().toISOString() };
      return b;
    });

    saveStats(updated);
    onStartChat(challenge.prompt);
  };

  const diffColor = (d: string) => d === 'leicht' ? '#4CAF50' : d === 'mittel' ? '#FF9800' : '#F44336';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <Trophy size={24} color="var(--accent-primary)" />
        </div>
        <div>
          <h1 style={styles.title}>Challenge-Modus</h1>
          <p style={styles.subtitle}>Taegliche Denk-Challenges und Lern-Streaks</p>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={styles.statsBar}>
        <div style={styles.statItem}>
          <Flame size={22} color="#FF6B35" />
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.streak}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Streak</div>
          </div>
        </div>
        <div style={styles.divider} />
        <div style={styles.statItem}>
          <Trophy size={22} color="var(--accent-primary)" />
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.total}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Gesamt</div>
          </div>
        </div>
        <div style={styles.divider} />
        <div style={styles.statItem}>
          <Award size={22} color="#9C27B0" />
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.badges.filter(b => b.unlocked).length}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Badges</div>
          </div>
        </div>
      </div>

      {/* Daily Challenge */}
      {todayChallenge && (
        <div style={styles.dailyCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Sparkles size={16} color="var(--accent-primary)" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)' }}>Challenge des Tages</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ ...styles.challengeIcon, background: todayChallenge.color + '20' }}>
              <todayChallenge.icon size={28} color={todayChallenge.color} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: 'var(--text-primary)' }}>{todayChallenge.title}</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>{todayChallenge.description}</p>
              <span style={{ ...styles.diffBadge, background: diffColor(todayChallenge.difficulty) + '20', color: diffColor(todayChallenge.difficulty) }}>
                {todayChallenge.difficulty}
              </span>
            </div>
            <button style={styles.startBtn} onClick={() => startChallenge(todayChallenge)}>
              Los! <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* All Challenges */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Alle Challenges</h3>
        <div style={styles.challengeGrid}>
          {dailyChallenges.map(c => (
            <button key={c.id} style={styles.challengeCard} onClick={() => startChallenge(c)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = c.color; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'none'; }}
            >
              <c.icon size={20} color={c.color} />
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{c.title}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{c.description}</span>
              <span style={{ ...styles.diffBadge, background: diffColor(c.difficulty) + '20', color: diffColor(c.difficulty), marginTop: 4 }}>
                {c.difficulty}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Badges */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Badges</h3>
        <div style={styles.badgeGrid}>
          {stats.badges.map(b => (
            <div key={b.id} style={{ ...styles.badgeCard, opacity: b.unlocked ? 1 : 0.4 }}>
              <span style={{ fontSize: '28px' }}>{b.icon}</span>
              <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>{b.title}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'center' }}>{b.description}</span>
              {b.unlocked && <span style={{ fontSize: '10px', color: 'var(--accent-primary)' }}>Freigeschaltet!</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '32px', maxWidth: '750px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'center', gap: '14px' },
  headerIcon: { width: 48, height: 48, borderRadius: 14, background: 'rgba(245,166,35,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  subtitle: { fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' },
  statsBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px', padding: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '16px' },
  statItem: { display: 'flex', alignItems: 'center', gap: '10px' },
  divider: { width: 1, height: 36, background: 'var(--border-subtle)' },
  dailyCard: { padding: '20px', background: 'linear-gradient(135deg, rgba(245,166,35,0.08), rgba(245,166,35,0.02))', border: '1px solid rgba(245,166,35,0.2)', borderRadius: '16px' },
  challengeIcon: { width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  diffBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, marginTop: 6 },
  startBtn: { display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 18px', background: 'var(--accent-primary)', color: '#000', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', flexShrink: 0 },
  section: { display: 'flex', flexDirection: 'column', gap: '12px' },
  sectionTitle: { fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  challengeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' },
  challengeCard: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '6px', padding: '16px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '14px', cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'center' as const },
  badgeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' },
  badgeCard: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '4px', padding: '16px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '14px', transition: 'opacity 0.3s ease' },
};
