import { useState, useEffect } from 'react';
import { useAppStore, ViewMode } from '../store/useAppStore';
import {
    Puzzle, Download, ToggleLeft, ToggleRight, Trash2, Settings, Database,
    Coffee, TrendingUp, Clock, Lock, BookOpen, Trophy, Gift, Link, Pen,
    FolderSearch, BarChart3, Sparkles, ArrowRight
} from 'lucide-react';
import KnowledgeBaseView from './skills/KnowledgeBaseView';
import WeatherSettingsModal from './skills/WeatherSettingsModal';

interface Skill {
    id: string;
    name: string;
    version: string;
    author: string;
    description: string;
    enabled: boolean;
}

interface MagicFeature {
    id: ViewMode;
    title: string;
    description: string;
    icon: typeof Sparkles;
    color: string;
    category: 'magic' | 'tools' | 'creative';
}

const magicFeatures: MagicFeature[] = [
    { id: 'briefing', title: 'Morgenbriefing', description: 'Taeglich personalisierte Zusammenfassung mit Wetter, Streaks und Vorschlaegen', icon: Coffee, color: '#FF9800', category: 'magic' },
    { id: 'radar', title: 'Interessen-Radar', description: 'Visualisierung deiner Interessen als Radar-Chart', icon: TrendingUp, color: '#2196F3', category: 'magic' },
    { id: 'timeline', title: 'Gedanken-Zeitstrahl', description: 'Chronologische Timeline deiner Gespraeche und Recherchen', icon: Clock, color: '#9C27B0', category: 'magic' },
    { id: 'notes', title: 'Geheime Notizen', description: 'PIN-geschuetzter privater Notiz-Editor', icon: Lock, color: '#F44336', category: 'magic' },
    { id: 'diary', title: 'KI-Tagebuch', description: 'NEON schreibt automatisch ein Journal ueber eure Gespraeche', icon: BookOpen, color: '#4CAF50', category: 'magic' },
    { id: 'challenges', title: 'Challenges', description: 'Taegliche Denk-Raetsel mit Streaks und Badges', icon: Trophy, color: '#FF5722', category: 'magic' },
    { id: 'capsules', title: 'Zeitkapseln', description: 'Nachrichten an dein zukuenftiges Ich planen', icon: Gift, color: '#E91E63', category: 'tools' },
    { id: 'chains', title: 'Agenten-Ketten', description: 'Mehrstufige KI-Workflows automatisieren', icon: Link, color: '#3F51B5', category: 'tools' },
    { id: 'canvas', title: 'Whiteboard', description: 'Zeichnen, Formen, Text und PNG-Export', icon: Pen, color: '#00BCD4', category: 'creative' },
    { id: 'rag', title: 'Dateien-RAG', description: 'Lokale Ordner indexieren und semantisch durchsuchen', icon: FolderSearch, color: '#795548', category: 'creative' },
    { id: 'summary', title: 'Tagesrueckblick', description: 'Automatische Zusammenfassung des Tages', icon: BarChart3, color: '#607D8B', category: 'tools' },
];

export default function SkillStore() {
    const setActiveView = useAppStore((state) => state.setActiveView);
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeSkillView, setActiveSkillView] = useState<string | null>(null);
    const [settingsModalSkill, setSettingsModalSkill] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    const fetchSkills = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/skills');
            const data = await res.json();
            setSkills(data.skills || []);
        } catch (error) {
            console.error('Failed to fetch skills', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSkills();
    }, []);

    const toggleSkill = async (id: string) => {
        try {
            await fetch(`http://localhost:3001/api/skills/${id}/toggle`, { method: 'PATCH' });
            await fetchSkills();
        } catch (error) {
            console.error('Failed to toggle skill', error);
        }
    };

    const deleteSkill = async (_id: string) => {
        if (!confirm('Skill wirklich löschen?')) return;
        console.warn('Delete not fully implemented for core skills');
    };

    if (activeSkillView === 'knowledge-base') {
        return <KnowledgeBaseView onBack={() => setActiveSkillView(null)} />;
    }

    const filteredFeatures = selectedCategory === 'all'
        ? magicFeatures
        : magicFeatures.filter(f => f.category === selectedCategory);

    return (
        <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(245,166,35,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Puzzle size={24} color="var(--accent-primary)" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Skills & Features</h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Erweitere NEON mit neuen Faehigkeiten</p>
                    </div>
                </div>

                {/* Backend Skills Section */}
                {skills.length > 0 && (
                    <div style={{ marginBottom: '32px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Database size={16} color="var(--accent-primary)" />
                                Backend-Skills
                            </h2>
                            <button
                                onClick={fetchSkills}
                                disabled={loading}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
                                    borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer'
                                }}
                            >
                                <Download size={14} /> {loading ? 'Laden...' : 'Aktualisieren'}
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                            {skills.map((skill) => (
                                <div
                                    key={skill.name}
                                    style={{
                                        background: 'var(--bg-secondary)', padding: '18px', borderRadius: '14px',
                                        border: '1px solid var(--border-subtle)', transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div>
                                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {skill.name}
                                                {skill.enabled && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4CAF50', display: 'inline-block' }} />}
                                            </h3>
                                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>v{skill.version} • {skill.author}</span>
                                        </div>
                                        {skill.id !== 'knowledge-base' && (
                                            <button onClick={() => deleteSkill(skill.id)} style={{ padding: 4, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.4 }}>
                                        {skill.description}
                                    </p>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => toggleSkill(skill.id)}
                                            style={{
                                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                padding: '8px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                                                background: skill.enabled ? 'rgba(245,166,35,0.12)' : 'var(--bg-tertiary)',
                                                color: skill.enabled ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                            }}
                                        >
                                            {skill.enabled ? <><ToggleRight size={16} /> Aktiviert</> : <><ToggleLeft size={16} /> Deaktiviert</>}
                                        </button>
                                        {skill.enabled && skill.id === 'knowledge-base' && (
                                            <button onClick={() => setActiveSkillView('knowledge-base')} style={{ padding: '8px', background: 'var(--bg-tertiary)', border: 'none', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                <Database size={16} />
                                            </button>
                                        )}
                                        {skill.enabled && skill.id !== 'knowledge-base' && (
                                            <button onClick={() => setSettingsModalSkill(skill.id)} style={{ padding: '8px', background: 'var(--bg-tertiary)', border: 'none', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                <Settings size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Magic Features Section */}
                <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={16} color="var(--accent-primary)" />
                        NEON Features
                    </h2>

                    {/* Category Filter */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {[
                            { id: 'all', label: 'Alle' },
                            { id: 'magic', label: 'Magic' },
                            { id: 'tools', label: 'Produktivitaet' },
                            { id: 'creative', label: 'Kreativ' },
                        ].map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                style={{
                                    padding: '6px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                                    border: '1px solid var(--border-subtle)', transition: 'all 0.2s ease',
                                    ...(selectedCategory === cat.id
                                        ? { background: 'var(--accent-primary)', color: '#000', borderColor: 'var(--accent-primary)', fontWeight: 600 }
                                        : { background: 'transparent', color: 'var(--text-secondary)' })
                                }}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Feature Cards Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                        {filteredFeatures.map(feature => (
                            <button
                                key={feature.id}
                                onClick={() => setActiveView(feature.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '14px',
                                    padding: '18px', background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-subtle)', borderRadius: '14px',
                                    cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = feature.color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 20px ${feature.color}15`; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{
                                    width: 48, height: 48, borderRadius: 14,
                                    background: `linear-gradient(135deg, ${feature.color}20, ${feature.color}08)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <feature.icon size={22} color={feature.color} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px' }}>
                                        {feature.title}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                                        {feature.description}
                                    </div>
                                </div>
                                <ArrowRight size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                            </button>
                        ))}
                    </div>
                </div>

                {settingsModalSkill === 'weather' && (
                    <WeatherSettingsModal onClose={() => setSettingsModalSkill(null)} />
                )}
            </div>
        </div>
    );
}
