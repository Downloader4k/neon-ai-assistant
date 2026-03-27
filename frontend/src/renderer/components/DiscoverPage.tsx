import { useState, useEffect } from 'react';
import { useAppStore, ViewMode } from '../store/useAppStore';
import {
  Compass, Sparkles, TrendingUp, Zap, BookOpen, Code, Globe, Brain,
  Palette, MessageSquare, CloudSun, Search, Gift, BarChart3, Pen,
  FolderSearch, Link, ArrowRight, Clock, Star, Flame, Coffee, Lock, Trophy
} from 'lucide-react';

// --- Inline SVG Illustrations ---

const HeroIllustration = () => (
  <svg width="280" height="180" viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background glow */}
    <defs>
      <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#F5A623" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#F5A623" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F5A623" />
        <stop offset="100%" stopColor="#FF6B35" />
      </linearGradient>
      <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2196F3" />
        <stop offset="100%" stopColor="#00BCD4" />
      </linearGradient>
      <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9C27B0" />
        <stop offset="100%" stopColor="#E91E63" />
      </linearGradient>
    </defs>
    <circle cx="140" cy="90" r="80" fill="url(#glow1)" />
    {/* Central brain/AI node */}
    <circle cx="140" cy="85" r="28" fill="url(#grad1)" opacity="0.9" />
    <path d="M130 85 Q135 75 140 80 Q145 75 150 85 Q145 95 140 90 Q135 95 130 85Z" fill="white" opacity="0.9" />
    {/* Orbiting elements */}
    <circle cx="80" cy="55" r="16" fill="url(#grad2)" opacity="0.8" />
    <rect x="74" y="50" width="12" height="2" rx="1" fill="white" opacity="0.9" />
    <rect x="74" y="54" width="8" height="2" rx="1" fill="white" opacity="0.7" />
    <rect x="74" y="58" width="10" height="2" rx="1" fill="white" opacity="0.8" />
    <circle cx="200" cy="55" r="16" fill="url(#grad3)" opacity="0.8" />
    <path d="M194 52 L200 58 L206 52" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M194 58 L200 52 L206 58" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
    <circle cx="85" cy="125" r="14" fill="#4CAF50" opacity="0.8" />
    <path d="M80 125 L83 128 L90 121" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
    <circle cx="195" cy="125" r="14" fill="#FF9800" opacity="0.8" />
    <path d="M191 122 L191 128 L197 128" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
    {/* Connection lines */}
    <line x1="96" y1="60" x2="112" y2="75" stroke="#2196F3" strokeWidth="1.5" opacity="0.4" strokeDasharray="4 3" />
    <line x1="184" y1="60" x2="168" y2="75" stroke="#9C27B0" strokeWidth="1.5" opacity="0.4" strokeDasharray="4 3" />
    <line x1="97" y1="120" x2="115" y2="100" stroke="#4CAF50" strokeWidth="1.5" opacity="0.4" strokeDasharray="4 3" />
    <line x1="183" y1="120" x2="165" y2="100" stroke="#FF9800" strokeWidth="1.5" opacity="0.4" strokeDasharray="4 3" />
    {/* Sparkle dots */}
    <circle cx="55" cy="90" r="3" fill="#F5A623" opacity="0.6">
      <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
    </circle>
    <circle cx="225" cy="90" r="3" fill="#F5A623" opacity="0.6">
      <animate attributeName="opacity" values="0.6;1;0.6" dur="2.5s" repeatCount="indefinite" />
    </circle>
    <circle cx="140" cy="145" r="2.5" fill="#F5A623" opacity="0.5">
      <animate attributeName="opacity" values="0.5;1;0.5" dur="3s" repeatCount="indefinite" />
    </circle>
    <circle cx="110" cy="40" r="2" fill="#2196F3" opacity="0.5">
      <animate attributeName="opacity" values="0.5;1;0.5" dur="2.2s" repeatCount="indefinite" />
    </circle>
    <circle cx="170" cy="40" r="2" fill="#E91E63" opacity="0.5">
      <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />
    </circle>
  </svg>
);

const FeatureIllustration = ({ type, color }: { type: string; color: string }) => {
  const illustrations: Record<string, JSX.Element> = {
    whiteboard: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="8" y="8" width="48" height="48" rx="8" fill={color} opacity="0.1" />
        <path d="M20 44 Q28 20 36 32 Q44 44 44 20" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="20" cy="44" r="3" fill={color} opacity="0.6" />
        <circle cx="44" cy="20" r="3" fill={color} opacity="0.6" />
        <rect x="14" y="14" width="8" height="8" rx="2" fill={color} opacity="0.2" />
      </svg>
    ),
    chains: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="16" cy="32" r="8" fill={color} opacity="0.2" />
        <circle cx="32" cy="32" r="8" fill={color} opacity="0.3" />
        <circle cx="48" cy="32" r="8" fill={color} opacity="0.4" />
        <circle cx="16" cy="32" r="4" fill={color} opacity="0.8" />
        <circle cx="32" cy="32" r="4" fill={color} opacity="0.8" />
        <circle cx="48" cy="32" r="4" fill={color} opacity="0.8" />
        <line x1="20" y1="32" x2="28" y2="32" stroke={color} strokeWidth="2" opacity="0.6" />
        <line x1="36" y1="32" x2="44" y2="32" stroke={color} strokeWidth="2" opacity="0.6" />
        <path d="M24 28 L28 32 L24 36" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
        <path d="M40 28 L44 32 L40 36" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
      </svg>
    ),
    rag: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="12" y="16" width="20" height="26" rx="3" fill={color} opacity="0.15" />
        <rect x="14" y="18" width="16" height="2" rx="1" fill={color} opacity="0.4" />
        <rect x="14" y="22" width="12" height="2" rx="1" fill={color} opacity="0.3" />
        <rect x="14" y="26" width="14" height="2" rx="1" fill={color} opacity="0.3" />
        <rect x="32" y="20" width="20" height="26" rx="3" fill={color} opacity="0.2" />
        <rect x="34" y="22" width="16" height="2" rx="1" fill={color} opacity="0.4" />
        <rect x="34" y="26" width="12" height="2" rx="1" fill={color} opacity="0.3" />
        <circle cx="40" cy="38" r="8" fill={color} opacity="0.3" />
        <circle cx="40" cy="38" r="4" fill={color} opacity="0.6" />
        <path d="M43 41 L48 46" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </svg>
    ),
    capsules: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="18" y="14" width="28" height="36" rx="14" fill={color} opacity="0.15" />
        <rect x="22" y="14" width="20" height="18" rx="10" fill={color} opacity="0.25" />
        <circle cx="32" cy="32" r="6" fill={color} opacity="0.5" />
        <path d="M32 26 L32 32 L36 34" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="32" cy="12" r="2" fill={color} opacity="0.4">
          <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
    ),
    memory: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <ellipse cx="32" cy="34" rx="20" ry="16" fill={color} opacity="0.1" />
        <path d="M22 30 Q22 20 32 20 Q42 20 42 30 Q42 38 37 40 Q32 42 27 40 Q22 38 22 30Z" fill={color} opacity="0.25" />
        <circle cx="28" cy="28" r="2" fill={color} opacity="0.6" />
        <circle cx="36" cy="28" r="2" fill={color} opacity="0.6" />
        <circle cx="32" cy="34" r="1.5" fill={color} opacity="0.4" />
        <path d="M26 36 Q32 42 38 36" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
        {/* Neural connections */}
        <line x1="20" y1="24" x2="14" y2="18" stroke={color} strokeWidth="1" opacity="0.3" />
        <line x1="44" y1="24" x2="50" y2="18" stroke={color} strokeWidth="1" opacity="0.3" />
        <circle cx="14" cy="18" r="2" fill={color} opacity="0.3" />
        <circle cx="50" cy="18" r="2" fill={color} opacity="0.3" />
      </svg>
    ),
    code: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="10" y="12" width="44" height="40" rx="6" fill={color} opacity="0.1" />
        <rect x="10" y="12" width="44" height="10" rx="6" fill={color} opacity="0.2" />
        <circle cx="18" cy="17" r="2" fill="#FF5F57" opacity="0.8" />
        <circle cx="24" cy="17" r="2" fill="#FEBC2E" opacity="0.8" />
        <circle cx="30" cy="17" r="2" fill="#28C840" opacity="0.8" />
        <text x="16" y="33" fill={color} opacity="0.7" fontSize="8" fontFamily="monospace">{'>'} _</text>
        <rect x="16" y="36" width="20" height="2" rx="1" fill={color} opacity="0.3" />
        <rect x="16" y="40" width="14" height="2" rx="1" fill={color} opacity="0.2" />
        <rect x="16" y="44" width="24" height="2" rx="1" fill={color} opacity="0.25" />
      </svg>
    ),
  };
  return illustrations[type] || null;
};

const CategoryIllustration = ({ category }: { category: string }) => {
  const illu: Record<string, JSX.Element> = {
    Lernen: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="6" y="8" width="20" height="16" rx="2" fill="#4CAF50" opacity="0.2" />
        <rect x="8" y="10" width="10" height="1.5" rx="0.75" fill="#4CAF50" opacity="0.5" />
        <rect x="8" y="13" width="7" height="1.5" rx="0.75" fill="#4CAF50" opacity="0.4" />
        <path d="M20 16 L22 18 L26 14" stroke="#4CAF50" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    ),
    Programmieren: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M12 10 L6 16 L12 22" stroke="#2196F3" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M20 10 L26 16 L20 22" stroke="#2196F3" strokeWidth="2" fill="none" strokeLinecap="round" />
        <line x1="18" y1="8" x2="14" y2="24" stroke="#2196F3" strokeWidth="1.5" opacity="0.5" />
      </svg>
    ),
    Kreativ: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="12" cy="16" r="6" fill="#E91E63" opacity="0.2" />
        <circle cx="20" cy="14" r="5" fill="#FF9800" opacity="0.2" />
        <circle cx="16" cy="20" r="5" fill="#9C27B0" opacity="0.2" />
        <path d="M14 12 L16 8 L18 12 L14 12Z" fill="#FFC107" opacity="0.6" />
      </svg>
    ),
    Produktivitaet: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="8" y="18" width="4" height="8" rx="1" fill="#FF9800" opacity="0.4" />
        <rect x="14" y="14" width="4" height="12" rx="1" fill="#FF9800" opacity="0.5" />
        <rect x="20" y="8" width="4" height="18" rx="1" fill="#FF9800" opacity="0.7" />
        <path d="M8 16 L14 12 L20 8 L26 4" stroke="#FF9800" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
      </svg>
    ),
    Analyse: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="10" fill="#9C27B0" opacity="0.1" />
        <path d="M16 6 L16 16 L24 16" stroke="#9C27B0" strokeWidth="1.5" fill="none" />
        <path d="M16 16 L16 6 A10 10 0 0 1 24 16 Z" fill="#9C27B0" opacity="0.3" />
      </svg>
    ),
    Recherche: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="14" cy="14" r="8" fill="#607D8B" opacity="0.15" />
        <circle cx="14" cy="14" r="6" stroke="#607D8B" strokeWidth="1.5" fill="none" opacity="0.5" />
        <line x1="19" y1="19" x2="26" y2="26" stroke="#607D8B" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
    Alltag: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="14" r="6" fill="#FFC107" opacity="0.3" />
        <circle cx="16" cy="14" r="3" fill="#FFC107" opacity="0.6" />
        <line x1="16" y1="4" x2="16" y2="6" stroke="#FFC107" strokeWidth="1.5" opacity="0.4" />
        <line x1="16" y1="22" x2="16" y2="24" stroke="#FFC107" strokeWidth="1.5" opacity="0.4" />
        <line x1="6" y1="14" x2="8" y2="14" stroke="#FFC107" strokeWidth="1.5" opacity="0.4" />
        <line x1="24" y1="14" x2="26" y2="14" stroke="#FFC107" strokeWidth="1.5" opacity="0.4" />
        <path d="M10 26 Q16 22 22 26" stroke="#607D8B" strokeWidth="1.5" fill="none" opacity="0.3" />
      </svg>
    ),
  };
  return illu[category] || null;
};

// --- Data ---

interface PromptCard {
  title: string;
  description: string;
  prompt: string;
  icon: typeof Sparkles;
  color: string;
  category: string;
}

interface FeatureCardData {
  id: ViewMode;
  title: string;
  description: string;
  icon: typeof Sparkles;
  color: string;
  illustrationType: string;
}

const promptCards: PromptCard[] = [
  { title: 'Erklaere wie ein Lehrer', description: 'Komplexe Themen einfach verstehen', prompt: 'Erklaere mir wie ein geduldiger Lehrer, wie ', icon: BookOpen, color: '#4CAF50', category: 'Lernen' },
  { title: 'Code schreiben', description: 'Lass dir bei Programmieraufgaben helfen', prompt: 'Schreibe mir einen Code der ', icon: Code, color: '#2196F3', category: 'Programmieren' },
  { title: 'Kreatives Schreiben', description: 'Geschichten, Gedichte, Texte', prompt: 'Schreibe mir eine kreative Geschichte ueber ', icon: Palette, color: '#E91E63', category: 'Kreativ' },
  { title: 'Brainstorming', description: '10 innovative Ideen generieren', prompt: 'Gib mir 10 kreative Ideen fuer ', icon: Zap, color: '#FF9800', category: 'Produktivitaet' },
  { title: 'Pro & Contra Analyse', description: 'Entscheidungshilfe mit Abwaegung', prompt: 'Erstelle eine ausfuehrliche Pro- und Contra-Liste fuer ', icon: BarChart3, color: '#9C27B0', category: 'Analyse' },
  { title: 'Zusammenfassung', description: 'Texte auf den Punkt bringen', prompt: 'Fasse folgenden Text kurz und praegnant zusammen: ', icon: MessageSquare, color: '#00BCD4', category: 'Produktivitaet' },
  { title: 'Wetter abfragen', description: 'Aktuelle Wettervorhersage', prompt: 'Wie ist das Wetter in ', icon: CloudSun, color: '#FFC107', category: 'Alltag' },
  { title: 'Web-Recherche', description: 'Aktuelles Wissen aus dem Internet', prompt: 'Recherchiere im Internet nach ', icon: Globe, color: '#607D8B', category: 'Recherche' },
  { title: 'Erklaere den Unterschied', description: 'Vergleiche zwei Konzepte', prompt: 'Erklaere mir den Unterschied zwischen ', icon: Search, color: '#795548', category: 'Lernen' },
  { title: 'Tagesplan erstellen', description: 'Strukturierter Tagesablauf', prompt: 'Erstelle mir einen optimalen Tagesplan fuer ', icon: Clock, color: '#3F51B5', category: 'Produktivitaet' },
  { title: 'Quiz erstellen', description: 'Teste dein Wissen', prompt: 'Erstelle ein Quiz mit 5 Fragen zum Thema ', icon: Star, color: '#FF5722', category: 'Lernen' },
  { title: 'Debatte fuehren', description: 'Argumente aus verschiedenen Perspektiven', prompt: 'Fuehre eine Debatte mit mir ueber das Thema ', icon: Flame, color: '#F44336', category: 'Kreativ' },
];

const featureCards: FeatureCardData[] = [
  { id: 'briefing', title: 'Morgenbriefing', description: 'Dein taeglicher Start mit Wetter, Streaks und Vorschlaegen', icon: Coffee, color: '#FF9800', illustrationType: 'capsules' },
  { id: 'challenges', title: 'Challenges', description: 'Taegliche Denk-Raetsel mit Streaks und Badges', icon: Trophy, color: '#FF5722', illustrationType: 'chains' },
  { id: 'canvas', title: 'Whiteboard', description: 'Zeichne, skizziere und brainstorme visuell', icon: Pen, color: '#E91E63', illustrationType: 'whiteboard' },
  { id: 'notes', title: 'Geheime Notizen', description: 'PIN-geschuetzter privater Notiz-Editor', icon: Lock, color: '#F44336', illustrationType: 'code' },
  { id: 'timeline', title: 'Gedanken-Zeitstrahl', description: 'Chronologische Timeline deiner Reise', icon: Clock, color: '#9C27B0', illustrationType: 'chains' },
  { id: 'diary', title: 'KI-Tagebuch', description: 'NEON schreibt automatisch ein Journal', icon: BookOpen, color: '#4CAF50', illustrationType: 'memory' },
  { id: 'radar', title: 'Interessen-Radar', description: 'Dein Persoenlichkeits-Profil als Radar-Chart', icon: TrendingUp, color: '#2196F3', illustrationType: 'rag' },
  { id: 'chains', title: 'Agenten-Ketten', description: 'Automatisierte mehrstufige KI-Workflows', icon: Link, color: '#3F51B5', illustrationType: 'chains' },
  { id: 'rag', title: 'Dateien-RAG', description: 'Durchsuche deine lokalen Dateien per KI', icon: FolderSearch, color: '#795548', illustrationType: 'rag' },
  { id: 'capsules', title: 'Zeitkapseln', description: 'Sende Nachrichten an dein zukuenftiges Ich', icon: Gift, color: '#E91E63', illustrationType: 'capsules' },
  { id: 'memory', title: 'Gedaechtnis', description: 'NEON merkt sich was dir wichtig ist', icon: Brain, color: '#00BCD4', illustrationType: 'memory' },
  { id: 'code', title: 'Code-Tools', description: 'Fuehre JavaScript, Python oder PowerShell aus', icon: Code, color: '#607D8B', illustrationType: 'code' },
];

const categories = ['Alle', 'Lernen', 'Programmieren', 'Kreativ', 'Produktivitaet', 'Analyse', 'Recherche', 'Alltag'];

// --- Component ---

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
      {/* Hero Banner */}
      <div style={styles.heroBanner}>
        <div style={styles.heroContent}>
          <div style={styles.heroBadge}>
            <Compass size={14} />
            <span>Entdecken</span>
          </div>
          <h1 style={styles.heroTitle}>{greeting}!</h1>
          <h2 style={styles.heroSubtitle}>Entdecke was NEON alles kann</h2>
          <p style={styles.heroDesc}>Finde Inspiration, probiere neue Features aus und starte mit einem Klick</p>
        </div>
        <div style={styles.heroIllustration}>
          <HeroIllustration />
        </div>
        {/* Decorative background shapes */}
        <div style={styles.heroBgShape1} />
        <div style={styles.heroBgShape2} />
      </div>

      {/* Schnellstart */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          <TrendingUp size={18} color="var(--accent-primary)" />
          Schnellstart
        </h2>
        <div style={styles.quickGrid}>
          {[
            { label: 'Neuer Chat', action: () => onStartChat(''), icon: MessageSquare, gradient: 'linear-gradient(135deg, #F5A62320, #FF6B3520)' },
            { label: 'Morgenbriefing', action: () => setActiveView('briefing'), icon: Coffee, gradient: 'linear-gradient(135deg, #FF980020, #FF6B3520)' },
            { label: 'Challenge starten', action: () => setActiveView('challenges'), icon: Trophy, gradient: 'linear-gradient(135deg, #FF572220, #F4433620)' },
            { label: 'Whiteboard', action: () => setActiveView('canvas'), icon: Pen, gradient: 'linear-gradient(135deg, #E91E6320, #FF5F5720)' },
          ].map((item) => (
            <button key={item.label} style={{ ...styles.quickBtn, background: item.gradient }} onClick={item.action}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(245,166,35,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <item.icon size={18} color="var(--accent-primary)" />
              </div>
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

        {/* Category Filter with illustrations */}
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
              {cat !== 'Alle' && <CategoryIllustration category={cat} />}
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
                e.currentTarget.style.boxShadow = `0 8px 24px ${card.color}25`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ ...styles.promptIconWrap, background: `linear-gradient(135deg, ${card.color}20, ${card.color}10)` }}>
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
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = `0 12px 32px ${feature.color}20`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Illustration */}
              <div style={styles.featureIlluWrap}>
                <FeatureIllustration type={feature.illustrationType} color={feature.color} />
              </div>
              {/* Gradient accent bar */}
              <div style={{ width: '100%', height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${feature.color}, ${feature.color}40)`, marginTop: -4 }} />
              <h3 style={styles.featureTitle}>{feature.title}</h3>
              <p style={styles.featureDesc}>{feature.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Slash-Command Hinweis */}
      <div style={styles.tipBar}>
        <div style={styles.tipIcon}>
          <Sparkles size={16} color="var(--accent-primary)" />
        </div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Tipp:</strong> Tippe <code style={styles.code}>/</code> im Chat fuer Slash-Commands wie <code style={styles.code}>/wetter</code>, <code style={styles.code}>/suche</code> oder <code style={styles.code}>/code</code>
        </span>
      </div>
    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '32px',
    maxWidth: '920px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '36px',
    height: '100%',
    overflowY: 'auto',
  },
  // Hero Banner
  heroBanner: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '36px 40px',
    borderRadius: '20px',
    background: 'linear-gradient(135deg, rgba(245,166,35,0.08) 0%, rgba(255,107,53,0.05) 50%, rgba(33,150,243,0.05) 100%)',
    border: '1px solid rgba(245,166,35,0.15)',
    overflow: 'hidden',
    minHeight: '180px',
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
    flex: 1,
  },
  heroBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderRadius: '20px',
    background: 'rgba(245,166,35,0.15)',
    color: 'var(--accent-primary)',
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: '12px',
  },
  heroTitle: {
    fontSize: '28px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: '0 0 4px 0',
  },
  heroSubtitle: {
    fontSize: '18px',
    fontWeight: 500,
    color: 'var(--accent-primary)',
    margin: '0 0 8px 0',
  },
  heroDesc: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    margin: 0,
    maxWidth: '380px',
    lineHeight: 1.5,
  },
  heroIllustration: {
    position: 'relative',
    zIndex: 2,
    flexShrink: 0,
  },
  heroBgShape1: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(245,166,35,0.08) 0%, transparent 70%)',
  },
  heroBgShape2: {
    position: 'absolute',
    bottom: -40,
    left: '30%',
    width: 160,
    height: 160,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(33,150,243,0.06) 0%, transparent 70%)',
  },
  // Sections
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
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
  // Quick Actions
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
    gap: '10px',
  },
  quickBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    border: '1px solid var(--border-subtle)',
    borderRadius: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  // Category Filter
  categoryBar: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  categoryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
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
  // Prompt Cards
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
    width: '42px',
    height: '42px',
    borderRadius: '12px',
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
  // Feature Cards
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '12px',
  },
  featureCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    padding: '16px 12px 20px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    textAlign: 'center' as const,
  },
  featureIlluWrap: {
    width: '64px',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },
  featureDesc: {
    fontSize: '11px',
    color: 'var(--text-tertiary)',
    margin: 0,
    lineHeight: 1.4,
  },
  // Tip Bar
  tipBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 18px',
    background: 'linear-gradient(135deg, rgba(245,166,35,0.06), rgba(245,166,35,0.02))',
    border: '1px solid rgba(245,166,35,0.15)',
    borderRadius: '14px',
  },
  tipIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: 'rgba(245,166,35,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
