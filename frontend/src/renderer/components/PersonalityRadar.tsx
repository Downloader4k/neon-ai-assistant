import { useState, useEffect, useRef } from 'react';
import { Sparkles, TrendingUp, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface RadarCategory {
  label: string;
  value: number; // 0-100
  color: string;
}

export default function PersonalityRadar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [categories, setCategories] = useState<RadarCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMessages, setTotalMessages] = useState(0);

  useEffect(() => {
    analyzePersonality();
  }, []);

  useEffect(() => {
    if (categories.length > 0) drawRadar();
  }, [categories]);

  const analyzePersonality = async () => {
    setLoading(true);
    try {
      // Fetch memories to analyze personality patterns
      const activeUserId = useAppStore.getState().currentUser?.id || 'default-user';
      const res = await fetch(`/api/memory/${activeUserId}`);
      const memories = res.ok ? await res.json() : [];

      // Fetch conversations for topic analysis
      const convRes = await fetch(`/api/conversations?userId=${activeUserId}`);
      const conversations = convRes.ok ? await convRes.json() : [];

      setTotalMessages(conversations.reduce((acc: number, c: any) => acc + (c._count?.messages || c.messages?.length || 0), 0));

      // Analyze content keywords to determine interests
      const allContent = memories.map((m: any) => m.content?.toLowerCase() || '').join(' ') +
        conversations.map((c: any) => c.title?.toLowerCase() || '').join(' ');

      const techWords = ['code', 'programm', 'javascript', 'python', 'react', 'api', 'server', 'bug', 'software', 'developer', 'typescript', 'html', 'css', 'git', 'docker', 'database'];
      const scienceWords = ['wissenschaft', 'physik', 'quanten', 'forschung', 'studie', 'theorie', 'experiment', 'biologie', 'chemie', 'mathematik', 'universum', 'atom'];
      const creativeWords = ['kreativ', 'geschichte', 'kunst', 'design', 'musik', 'schreib', 'gedicht', 'idee', 'brainstorm', 'fantasy', 'bild', 'farbe'];
      const productiveWords = ['plan', 'aufgabe', 'todo', 'projekt', 'meeting', 'ziel', 'organisation', 'termin', 'deadline', 'arbeit', 'produktiv', 'effizienz'];
      const socialWords = ['menschen', 'team', 'kommunikation', 'beziehung', 'freund', 'familie', 'gespräch', 'empathie', 'feedback', 'zusammenarbeit'];
      const learningWords = ['lernen', 'erkläre', 'verstehen', 'wissen', 'kurs', 'tutorial', 'lehrer', 'schule', 'bildung', 'buch', 'lesen'];

      const countMatches = (words: string[]) => {
        let count = 0;
        words.forEach(w => {
          const regex = new RegExp(w, 'gi');
          const matches = allContent.match(regex);
          if (matches) count += matches.length;
        });
        return count;
      };

      const scores = [
        { label: 'Technik', raw: countMatches(techWords), color: '#2196F3' },
        { label: 'Wissenschaft', raw: countMatches(scienceWords), color: '#9C27B0' },
        { label: 'Kreativitaet', raw: countMatches(creativeWords), color: '#E91E63' },
        { label: 'Produktivitaet', raw: countMatches(productiveWords), color: '#FF9800' },
        { label: 'Soziales', raw: countMatches(socialWords), color: '#4CAF50' },
        { label: 'Lernen', raw: countMatches(learningWords), color: '#00BCD4' },
      ];

      const maxRaw = Math.max(...scores.map(s => s.raw), 1);
      setCategories(scores.map(s => ({
        label: s.label,
        value: Math.min(100, Math.round((s.raw / maxRaw) * 100)),
        color: s.color,
      })));
    } catch {
      setCategories([
        { label: 'Technik', value: 50, color: '#2196F3' },
        { label: 'Wissenschaft', value: 30, color: '#9C27B0' },
        { label: 'Kreativitaet', value: 40, color: '#E91E63' },
        { label: 'Produktivitaet', value: 60, color: '#FF9800' },
        { label: 'Soziales', value: 20, color: '#4CAF50' },
        { label: 'Lernen', value: 45, color: '#00BCD4' },
      ]);
    }
    setLoading(false);
  };

  const drawRadar = () => {
    const canvas = canvasRef.current;
    if (!canvas || categories.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 340;
    canvas.width = size * 2; // HiDPI
    canvas.height = size * 2;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(2, 2);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 50;
    const n = categories.length;
    const angleStep = (Math.PI * 2) / n;

    ctx.clearRect(0, 0, size, size);

    // Draw grid rings
    for (let ring = 1; ring <= 4; ring++) {
      const r = (radius / 4) * ring;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = angleStep * i - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw axis lines
    for (let i = 0; i < n; i++) {
      const angle = angleStep * i - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw data polygon
    ctx.beginPath();
    categories.forEach((cat, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const r = (cat.value / 100) * radius;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();

    // Gradient fill
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(245, 166, 35, 0.3)');
    gradient.addColorStop(1, 'rgba(245, 166, 35, 0.05)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 166, 35, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw data points and labels
    categories.forEach((cat, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const r = (cat.value / 100) * radius;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;

      // Point
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = cat.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      const labelR = radius + 28;
      const lx = cx + Math.cos(angle) * labelR;
      const ly = cy + Math.sin(angle) * labelR;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cat.label, lx, ly);
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <TrendingUp size={24} color="var(--accent-primary)" />
        </div>
        <div>
          <h1 style={styles.title}>Persoenlichkeits-Radar</h1>
          <p style={styles.subtitle}>Dein Interessen-Profil basierend auf {totalMessages} Nachrichten</p>
        </div>
        <button style={styles.refreshBtn} onClick={analyzePersonality} title="Neu analysieren">
          <RefreshCw size={18} color="var(--text-secondary)" />
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
          <Sparkles size={24} style={{ marginBottom: 8 }} /> Analysiere dein Profil...
        </div>
      ) : (
        <>
          {/* Radar Chart */}
          <div style={styles.radarWrap}>
            <canvas ref={canvasRef} />
          </div>

          {/* Bars */}
          <div style={styles.barsSection}>
            {categories.map(cat => (
              <div key={cat.label} style={styles.barRow}>
                <div style={styles.barLabel}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, display: 'inline-block' }} />
                  {cat.label}
                </div>
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${cat.value}%`, background: `linear-gradient(90deg, ${cat.color}, ${cat.color}80)` }} />
                </div>
                <span style={styles.barValue}>{cat.value}%</span>
              </div>
            ))}
          </div>

          {/* Insights */}
          <div style={styles.insightCard}>
            <Sparkles size={16} color="var(--accent-primary)" />
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              {categories.length > 0 && (
                <>
                  Dein staerkstes Interesse: <strong style={{ color: 'var(--text-primary)' }}>
                    {[...categories].sort((a, b) => b.value - a.value)[0]?.label}
                  </strong>. Das Radar aktualisiert sich mit jedem Gespraech.
                </>
              )}
            </span>
          </div>
        </>
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
  refreshBtn: { marginLeft: 'auto', padding: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 10, cursor: 'pointer' },
  radarWrap: { display: 'flex', justifyContent: 'center', padding: '8px 0' },
  barsSection: { display: 'flex', flexDirection: 'column', gap: '10px' },
  barRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  barLabel: { width: '120px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', flexShrink: 0 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-tertiary)' },
  barFill: { height: '100%', borderRadius: 4, transition: 'width 0.8s ease' },
  barValue: { width: '36px', textAlign: 'right' as const, fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' },
  insightCard: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.15)', borderRadius: '12px' },
};
