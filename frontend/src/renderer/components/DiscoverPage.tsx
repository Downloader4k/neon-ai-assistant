import { useState, useEffect } from 'react';
import { useAppStore, ViewMode } from '../store/useAppStore';
import {
  Compass, Sparkles, TrendingUp, Zap, BookOpen, Code, Globe, Brain,
  Palette, MessageSquare, CloudSun, Search, Gift, BarChart3, Pen,
  FolderSearch, Link, ArrowRight, Clock, Star, Flame
} from 'lucide-react';

interface PromptCard {
  title: string;
  description: string;
  prompt: string;
  icon: typeof Sparkles;
  color: string;
  category: string;
}

interface FeatureCard {
  id: ViewMode;
  title: string;
  description: string;
  icon: typeof Sparkles;
  color: string;
}

const promptCards: PromptCard[] = [
  {
    title: 'Erklaere wie ein Lehrer',
    description: 'Komplexe Themen einfach verstehen',
    prompt: 'Erklaere mir wie ein geduldiger Lehrer, wie ',
    icon: BookOpen,
    color: '#4CAF50',
    category: 'Lernen'
  },
  {
    title: 'Code schreiben',
    description: 'Lass dir bei Programmieraufgaben helfen',
    prompt: 'Schreibe mir einen Code der ',
    icon: Code,
    color: '#2196F3',
    category: 'Programmieren'
  },
  {
    title: 'Kreatives Schreiben',
    description: 'Geschichten, Gedichte, Texte',
    prompt: 'Schreibe mir eine kreative Geschichte ueber ',
    icon: Palette,
    color: '#E91E63',
    category: 'Kreativ'
  },
  {
    title: 'Brainstorming',
    description: '10 innovative Ideen generieren',
    prompt: 'Gib mir 10 kreative Ideen fuer ',
    icon: Zap,
    color: '#FF9800',
    category: 'Produktivitaet'
  },
  {
    title: 'Pro & Contra Analyse',
    description: 'Entscheidungshilfe mit Abwaegung',
    prompt: 'Erstelle eine ausfuehrliche Pro- und Contra-Liste fuer ',
    icon: BarChart3,
    color: '#9C27B0',
    category: 'Analyse'
  },
  {
    title: 'Zusammenfassung',
    description: 'Texte auf den Punkt bringen',
    prompt: 'Fasse folgenden Text kurz und praegnant zusammen: ',
    icon: MessageSquare,
    color: '#00BCD4',
    category: 'Produktivitaet'
  },
  {
    title: 'Wetter abfragen',
    description: 'Aktuelle Wettervorhersage',
    prompt: 'Wie ist das Wetter in ',
    icon: CloudSun,
    color: '#FFC107',
    category: 'Alltag'
  },
  {
    title: 'Web-Recherche',
    description: 'Aktuelles Wissen aus dem Internet',
    prompt: 'Recherchiere im Internet nach ',
    icon: Globe,
    color: '#607D8B',
    category: 'Recherche'
  },
  {
    title: 'Erklaere den Unterschied',
    description: 'Vergleiche zwei Konzepte',
    prompt: 'Erklaere mir den Unterschied zwischen ',
    icon: Search,
    color: '#795548',
    category: 'Lernen'
  },
  {
    title: 'Tagesplan erstellen',
    description: 'Strukturierter Tagesablauf',
    prompt: 'Erstelle mir einen optimalen Tagesplan fuer ',
    icon: Clock,
    color: '#3F51B5',
    category: 'Produktivitaet'
  },
  {
    title: 'Quiz erstellen',
    description: 'Teste dein Wissen',
    prompt: 'Erstelle ein Quiz mit 5 Fragen zum Thema ',
    icon: Star,
    color: '#FF5722',
    category: 'Lernen'
  },
  {
    title: 'Debatte fuehren',
    description: 'Argumente aus verschiedenen Perspektiven',
    prompt: 'Fuehre eine Debatte mit mir ueber das Thema ',
    icon: Flame,
    color: '#F44336',
    category: 'Kreativ'
  }
];

const featureCards: FeatureCard[] = [
  { id: 'canvas', title: 'Whiteboard', description: 'Zeichne, skizziere und brainstorme visuell', icon: Pen, color: '#E91E63' },
  { id: 'chains', title: 'Agenten-Ketten', description: 'Automatisierte mehrstufige KI-Workflows', icon: Link, color: '#9C27B0' },
  { id: 'rag', title: 'Dateien-RAG', description: 'Durchsuche deine lokalen Dateien per KI', icon: FolderSearch, color: '#4CAF50' },
  { id: 'capsules', title: 'Zeitkapseln', description: 'Sende Nachrichten an dein zukuenftiges Ich', icon: Gift, color: '#FF9800' },
  { id: 'memory', title: 'Gedaechtnis', description: 'NEON merkt sich was dir wichtig ist', icon: Brain, color: '#2196F3' },
  { id: 'code', title: 'Code-Tools', description: 'Fuehre JavaScript, Python oder PowerShell aus', icon: Code, color: '#00BCD4' },
];

const categories = ['Alle', 'Lernen', 'Programmieren', 'Kreativ', 'Produktivitaet', 'Analyse', 'Recherche', 'Alltag'];

export default function DiscoverPage({ onStartChat }: { onStartChat: (msg: string) => void }) {
  const setActiveView = useAppStore((state) => state.setActiveView);
  const [selectedCategory, setSelectedCategory] = useState('Alle');
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Guten Morgen');
    else if (hour < 18) setGreeting('Guten Tag');
    else setGreeting('Guten Abend');
  }, []);

  const filteredPrompts = selectedCategory === 'Alle'
    ? promptCards
    : promptCards.filter(p => p.category === selectedCategory);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <Compass size={32} color="var(--accent-primary)" />
        </div>
        <div>
          <h1 style={styles.title}>{greeting}! Entdecke NEON</h1>
          <p style={styles.subtitle}>Finde Inspiration, probiere neue Features aus und entdecke was NEON alles kann</p>
        </div>
      </div>

      {/* Trending / Quick Actions */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          <TrendingUp size={18} color="var(--accent-primary)" />
          Schnellstart
        </h2>
        <div style={styles.quickGrid}>
          {[
            { label: 'Neuer Chat', action: () => onStartChat(''), icon: MessageSquare },
            { label: 'Whiteboard oeffnen', action: () => setActiveView('canvas'), icon: Pen },
            { label: 'Dateien durchsuchen', action: () => setActiveView('rag'), icon: FolderSearch },
            { label: 'Tagesrueckblick', action: () => setActiveView('summary'), icon: BarChart3 },
          ].map((item) => (
            <button key={item.label} style={styles.quickBtn} onClick={item.action}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'none'; }}
            >
              <item.icon size={20} color="var(--accent-primary)" />
              <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Vorschlaege */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          <Sparkles size={18} color="var(--accent-primary)" />
          Prompt-Vorschlaege
        </h2>

        {/* Category Filter */}
        <div style={styles.categoryBar}>
          {categories.map(cat => (
            <button
              key={cat}
              style={{
                ...styles.categoryBtn,
                ...(selectedCategory === cat ? styles.categoryBtnActive : {})
              }}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={styles.promptGrid}>
          {filteredPrompts.map((card) => (
            <button
              key={card.title}
              style={styles.promptCard}
              onClick={() => onStartChat(card.prompt)}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = card.color;
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = `0 8px 24px ${card.color}20`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ ...styles.promptIconWrap, backgroundColor: card.color + '20' }}>
                <card.icon size={20} color={card.color} />
              </div>
              <div style={styles.promptContent}>
                <span style={styles.promptTitle}>{card.title}</span>
                <span style={styles.promptDesc}>{card.description}</span>
              </div>
              <ArrowRight size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>

      {/* Features entdecken */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          <Zap size={18} color="var(--accent-primary)" />
          Features entdecken
        </h2>
        <div style={styles.featureGrid}>
          {featureCards.map((feature) => (
            <button
              key={feature.id}
              style={styles.featureCard}
              onClick={() => setActiveView(feature.id)}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = feature.color;
                e.currentTarget.style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ ...styles.featureIconWrap, backgroundColor: feature.color + '20' }}>
                <feature.icon size={24} color={feature.color} />
              </div>
              <h3 style={styles.featureTitle}>{feature.title}</h3>
              <p style={styles.featureDesc}>{feature.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Slash-Command Hinweis */}
      <div style={styles.tipBar}>
        <Sparkles size={16} color="var(--accent-primary)" />
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Tipp:</strong> Tippe <code style={styles.code}>/</code> im Chat fuer Slash-Commands wie <code style={styles.code}>/wetter</code>, <code style={styles.code}>/suche</code> oder <code style={styles.code}>/code</code>
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '32px',
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    height: '100%',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '16px',
    background: 'var(--accent-primary)15',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    margin: '4px 0 0 0',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '10px',
  },
  quickBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  categoryBar: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  categoryBtn: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: '1px solid var(--border-subtle)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  categoryBtnActive: {
    background: 'var(--accent-primary)',
    color: '#000',
    borderColor: 'var(--accent-primary)',
    fontWeight: 600,
  },
  promptGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '10px',
  },
  promptCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left' as const,
  },
  promptIconWrap: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  promptContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    minWidth: 0,
  },
  promptTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  promptDesc: {
    fontSize: '12px',
    color: 'var(--text-tertiary)',
  },
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '12px',
  },
  featureCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '10px',
    padding: '20px 16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'center' as const,
  },
  featureIconWrap: {
    width: '48px',
    height: '48px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },
  featureDesc: {
    fontSize: '12px',
    color: 'var(--text-tertiary)',
    margin: 0,
    lineHeight: 1.4,
  },
  tipBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    background: 'var(--accent-primary)08',
    border: '1px solid var(--accent-primary)30',
    borderRadius: '12px',
  },
  code: {
    background: 'var(--bg-tertiary)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'monospace',
    color: 'var(--accent-primary)',
  },
};
