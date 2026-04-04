import { useState, useEffect, useCallback } from 'react';
import {
    Package, Download, Star, Shield, ToggleLeft, ToggleRight,
    Trash2, Plus, Github, Folder,
    CloudSun, BookOpen, Globe, Terminal, Sparkles, Search
} from 'lucide-react';

interface SkillData {
    name: string;
    displayName: string;
    version: string;
    description: string;
    author?: string;
    icon?: string;
    category: string;
    tags: string[];
    permissions: string[];
    source: string;
    verified: boolean;
    rating: number;
    downloads: number;
    enabled: boolean;
    settings: Array<{ key: string; label: string; type: string; default?: any }>;
    userSettings: Record<string, any>;
}

const CATEGORY_LABELS: Record<string, string> = {
    all: 'Alle',
    productivity: 'Produktivitaet',
    communication: 'Kommunikation',
    entertainment: 'Unterhaltung',
    knowledge: 'Wissen',
    tools: 'Tools',
    lifestyle: 'Lifestyle',
    development: 'Entwicklung',
    custom: 'Eigene',
};

const ICON_MAP: Record<string, any> = {
    CloudSun, BookOpen, Globe, Terminal, Sparkles, Package,
};

const PERMISSION_LABELS: Record<string, string> = {
    network: 'Netzwerk',
    filesystem: 'Dateisystem',
    database: 'Datenbank',
    execute: 'Code-Ausfuehrung',
    notifications: 'Benachrichtigungen',
    memory: 'Gedaechtnis',
    llm: 'KI-Modelle',
    system: 'System',
};

export default function SkillMarketplace() {
    const [skills, setSkills] = useState<SkillData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSkill, setSelectedSkill] = useState<SkillData | null>(null);
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [installSource, setInstallSource] = useState<'local' | 'github'>('local');
    const [installPath, setInstallPath] = useState('');
    const [installLoading, setInstallLoading] = useState(false);
    const [installError, setInstallError] = useState('');

    const fetchSkills = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/skill-store');
            if (res.ok) {
                const data = await res.json();
                setSkills(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Failed to fetch skills', error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchSkills();
    }, [fetchSkills]);

    const toggleSkill = async (name: string) => {
        try {
            await fetch(`/api/skill-store/${name}/toggle`, { method: 'PATCH' });
            await fetchSkills();
        } catch (error) {
            console.error('Failed to toggle skill', error);
        }
    };

    const uninstallSkill = async (name: string) => {
        if (!confirm(`"${name}" wirklich deinstallieren?`)) return;
        try {
            const res = await fetch('/api/skill-store/uninstall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (data.success) {
                await fetchSkills();
                setSelectedSkill(null);
            } else {
                alert(data.error || 'Deinstallation fehlgeschlagen');
            }
        } catch (error) {
            console.error('Failed to uninstall', error);
        }
    };

    const rateSkill = async (name: string, rating: number) => {
        try {
            await fetch(`/api/skill-store/${name}/rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating }),
            });
            await fetchSkills();
        } catch (error) {
            console.error('Failed to rate', error);
        }
    };

    const installSkill = async () => {
        if (!installPath.trim()) return;
        setInstallLoading(true);
        setInstallError('');

        try {
            const res = await fetch('/api/skill-store/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: installSource, path: installPath }),
            });
            const data = await res.json();

            if (data.success) {
                setShowInstallModal(false);
                setInstallPath('');
                await fetchSkills();
            } else {
                setInstallError(data.error || 'Installation fehlgeschlagen');
            }
        } catch (error) {
            setInstallError('Verbindungsfehler');
        }
        setInstallLoading(false);
    };

    const filteredSkills = skills.filter(s => {
        if (selectedCategory !== 'all' && s.category !== selectedCategory) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                s.name.toLowerCase().includes(q) ||
                s.displayName.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q) ||
                s.tags.some(t => t.toLowerCase().includes(q))
            );
        }
        return true;
    });

    const categories = ['all', ...new Set(skills.map(s => s.category))];

    const renderStars = (rating: number, clickable: boolean = false, skillName?: string) => {
        return (
            <div style={styles.stars}>
                {[1, 2, 3, 4, 5].map(i => (
                    <Star
                        key={i}
                        size={14}
                        fill={i <= Math.round(rating) ? '#f9ab00' : 'transparent'}
                        color={i <= Math.round(rating) ? '#f9ab00' : '#555'}
                        style={{ cursor: clickable ? 'pointer' : 'default' }}
                        onClick={() => clickable && skillName && rateSkill(skillName, i)}
                    />
                ))}
                <span style={styles.ratingText}>{rating.toFixed(1)}</span>
            </div>
        );
    };

    const getIconComponent = (iconName?: string) => {
        const Icon = iconName && ICON_MAP[iconName] ? ICON_MAP[iconName] : Package;
        return Icon;
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <Package size={24} color="#f9ab00" />
                    <div>
                        <h1 style={styles.title}>Skill Store</h1>
                        <p style={styles.subtitle}>
                            {skills.length} Skills verfuegbar - {skills.filter(s => s.enabled).length} aktiv
                        </p>
                    </div>
                </div>
                <button onClick={() => setShowInstallModal(true)} style={styles.installBtn}>
                    <Plus size={16} />
                    Skill installieren
                </button>
            </div>

            {/* Search + Filter */}
            <div style={styles.filterBar}>
                <div style={styles.searchBox}>
                    <Search size={16} color="#666" />
                    <input
                        type="text"
                        placeholder="Skills durchsuchen..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={styles.searchInput}
                    />
                </div>
                <div style={styles.categories}>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            style={{
                                ...styles.categoryBtn,
                                ...(selectedCategory === cat ? styles.categoryBtnActive : {}),
                            }}
                        >
                            {CATEGORY_LABELS[cat] || cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Skills Grid */}
            <div style={styles.grid}>
                {loading ? (
                    <div style={styles.loading}>Skills werden geladen...</div>
                ) : filteredSkills.length === 0 ? (
                    <div style={styles.loading}>Keine Skills gefunden</div>
                ) : (
                    filteredSkills.map(skill => {
                        const Icon = getIconComponent(skill.icon);
                        return (
                            <div
                                key={skill.name}
                                style={{
                                    ...styles.card,
                                    ...(selectedSkill?.name === skill.name ? styles.cardSelected : {}),
                                }}
                                onClick={() => setSelectedSkill(
                                    selectedSkill?.name === skill.name ? null : skill
                                )}
                            >
                                <div style={styles.cardHeader}>
                                    <div style={styles.cardIcon}>
                                        <Icon size={20} color="#f9ab00" />
                                    </div>
                                    <div style={styles.cardMeta}>
                                        <div style={styles.cardTitle}>
                                            {skill.displayName}
                                            {skill.verified && (
                                                <Shield size={12} color="#22c55e" style={{ marginLeft: 4 }} />
                                            )}
                                        </div>
                                        <span style={styles.cardVersion}>
                                            v{skill.version} {skill.author && `von ${skill.author}`}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleSkill(skill.name); }}
                                        style={{
                                            ...styles.toggleBtn,
                                            color: skill.enabled ? '#22c55e' : '#666',
                                        }}
                                    >
                                        {skill.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                    </button>
                                </div>

                                <p style={styles.cardDesc}>{skill.description}</p>

                                <div style={styles.cardFooter}>
                                    {renderStars(skill.rating)}
                                    <span style={styles.sourceBadge}>
                                        {skill.source === 'builtin' ? 'Builtin' : skill.source}
                                    </span>
                                </div>

                                {/* Expanded Detail */}
                                {selectedSkill?.name === skill.name && (
                                    <div style={styles.detail} onClick={e => e.stopPropagation()}>
                                        <div style={styles.detailSection}>
                                            <span style={styles.detailLabel}>Berechtigungen:</span>
                                            <div style={styles.permList}>
                                                {skill.permissions.map(p => (
                                                    <span key={p} style={styles.permBadge}>
                                                        {PERMISSION_LABELS[p] || p}
                                                    </span>
                                                ))}
                                                {skill.permissions.length === 0 && (
                                                    <span style={styles.permBadge}>Keine</span>
                                                )}
                                            </div>
                                        </div>

                                        {skill.tags.length > 0 && (
                                            <div style={styles.detailSection}>
                                                <span style={styles.detailLabel}>Tags:</span>
                                                <div style={styles.permList}>
                                                    {skill.tags.map(t => (
                                                        <span key={t} style={styles.tagBadge}>{t}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div style={styles.detailSection}>
                                            <span style={styles.detailLabel}>Bewerten:</span>
                                            {renderStars(skill.rating, true, skill.name)}
                                        </div>

                                        <div style={styles.detailActions}>
                                            {skill.source !== 'builtin' && (
                                                <button
                                                    onClick={() => uninstallSkill(skill.name)}
                                                    style={styles.deleteBtn}
                                                >
                                                    <Trash2 size={14} />
                                                    Deinstallieren
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Install Modal */}
            {showInstallModal && (
                <div style={styles.modalOverlay} onClick={() => setShowInstallModal(false)}>
                    <div style={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 style={styles.modalTitle}>Skill installieren</h2>

                        <div style={styles.installTabs}>
                            <button
                                onClick={() => setInstallSource('local')}
                                style={{
                                    ...styles.installTab,
                                    ...(installSource === 'local' ? styles.installTabActive : {}),
                                }}
                            >
                                <Folder size={16} />
                                Lokaler Ordner
                            </button>
                            <button
                                onClick={() => setInstallSource('github')}
                                style={{
                                    ...styles.installTab,
                                    ...(installSource === 'github' ? styles.installTabActive : {}),
                                }}
                            >
                                <Github size={16} />
                                GitHub
                            </button>
                        </div>

                        <div style={styles.installForm}>
                            <label style={styles.inputLabel}>
                                {installSource === 'local'
                                    ? 'Pfad zum Skill-Ordner (mit manifest.json):'
                                    : 'GitHub Repository URL:'
                                }
                            </label>
                            <input
                                type="text"
                                placeholder={installSource === 'local'
                                    ? 'C:\\Users\\...\\my-skill'
                                    : 'https://github.com/user/neon-skill-example'
                                }
                                value={installPath}
                                onChange={e => setInstallPath(e.target.value)}
                                style={styles.textInput}
                            />

                            {installError && (
                                <p style={styles.errorText}>{installError}</p>
                            )}

                            <div style={styles.modalActions}>
                                <button
                                    onClick={() => setShowInstallModal(false)}
                                    style={styles.cancelBtn}
                                >
                                    Abbrechen
                                </button>
                                <button
                                    onClick={installSkill}
                                    disabled={installLoading || !installPath.trim()}
                                    style={{
                                        ...styles.confirmBtn,
                                        opacity: installLoading || !installPath.trim() ? 0.5 : 1,
                                    }}
                                >
                                    <Download size={14} />
                                    {installLoading ? 'Installiere...' : 'Installieren'}
                                </button>
                            </div>
                        </div>

                        {/* Manifest Info */}
                        <div style={styles.manifestInfo}>
                            <h4 style={{ color: '#e0e0e0', margin: '0 0 8px', fontSize: '13px' }}>
                                manifest.json Format:
                            </h4>
                            <pre style={styles.codeBlock}>{`{
  "name": "mein-skill",
  "version": "1.0.0",
  "description": "Beschreibung",
  "entry": "index.js",
  "permissions": ["network"],
  "category": "tools",
  "triggers": [
    { "type": "command", "pattern": "/meinskill" }
  ]
}`}</pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        padding: '24px',
        maxWidth: '900px',
        margin: '0 auto',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '20px',
    },
    titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    title: {
        fontSize: '24px',
        fontWeight: 700,
        color: '#e0e0e0',
        margin: 0,
    },
    subtitle: {
        color: '#666',
        fontSize: '13px',
        margin: '2px 0 0',
    },
    installBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        background: '#f9ab00',
        color: '#000',
        border: 'none',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
    },
    filterBar: {
        marginBottom: '20px',
    },
    searchBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: '#1a1a1a',
        borderRadius: '8px',
        border: '1px solid #333',
        marginBottom: '12px',
    },
    searchInput: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        color: '#e0e0e0',
        fontSize: '13px',
        outline: 'none',
    },
    categories: {
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap' as const,
    },
    categoryBtn: {
        padding: '5px 12px',
        borderRadius: '16px',
        fontSize: '12px',
        border: '1px solid #333',
        background: 'transparent',
        color: '#999',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    categoryBtnActive: {
        background: '#f9ab00',
        color: '#000',
        borderColor: '#f9ab00',
        fontWeight: 600,
    },
    grid: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '10px',
    },
    loading: {
        textAlign: 'center' as const,
        color: '#666',
        padding: '40px',
    },
    card: {
        background: '#1a1a1a',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid #333',
        cursor: 'pointer',
        transition: 'all 0.15s',
    },
    cardSelected: {
        borderColor: '#f9ab00',
    },
    cardHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '8px',
    },
    cardIcon: {
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        background: 'rgba(249, 171, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    cardMeta: {
        flex: 1,
    },
    cardTitle: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#e0e0e0',
        display: 'flex',
        alignItems: 'center',
    },
    cardVersion: {
        fontSize: '11px',
        color: '#666',
    },
    toggleBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '4px',
    },
    cardDesc: {
        fontSize: '12px',
        color: '#999',
        margin: '0 0 10px',
        lineHeight: '1.4',
    },
    cardFooter: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    stars: {
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
    },
    ratingText: {
        fontSize: '11px',
        color: '#666',
        marginLeft: '4px',
    },
    sourceBadge: {
        fontSize: '10px',
        padding: '2px 8px',
        borderRadius: '10px',
        background: '#252525',
        color: '#999',
    },
    // Detail
    detail: {
        marginTop: '12px',
        paddingTop: '12px',
        borderTop: '1px solid #333',
    },
    detailSection: {
        marginBottom: '10px',
    },
    detailLabel: {
        fontSize: '11px',
        color: '#666',
        fontWeight: 600,
        display: 'block',
        marginBottom: '4px',
    },
    permList: {
        display: 'flex',
        gap: '4px',
        flexWrap: 'wrap' as const,
    },
    permBadge: {
        fontSize: '10px',
        padding: '2px 8px',
        borderRadius: '10px',
        background: 'rgba(239, 68, 68, 0.1)',
        color: '#ef4444',
    },
    tagBadge: {
        fontSize: '10px',
        padding: '2px 8px',
        borderRadius: '10px',
        background: 'rgba(59, 130, 246, 0.1)',
        color: '#3b82f6',
    },
    detailActions: {
        display: 'flex',
        gap: '8px',
        marginTop: '8px',
    },
    deleteBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 12px',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '6px',
        color: '#ef4444',
        fontSize: '12px',
        cursor: 'pointer',
    },
    // Modal
    modalOverlay: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    modal: {
        background: '#1a1a1a',
        borderRadius: '16px',
        padding: '24px',
        width: '500px',
        maxWidth: '90vw',
        border: '1px solid #333',
    },
    modalTitle: {
        fontSize: '18px',
        fontWeight: 700,
        color: '#e0e0e0',
        margin: '0 0 16px',
    },
    installTabs: {
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
    },
    installTab: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '10px',
        borderRadius: '8px',
        border: '1px solid #333',
        background: 'transparent',
        color: '#999',
        cursor: 'pointer',
        fontSize: '13px',
    },
    installTabActive: {
        background: 'rgba(249, 171, 0, 0.1)',
        borderColor: '#f9ab00',
        color: '#f9ab00',
    },
    installForm: {},
    inputLabel: {
        display: 'block',
        fontSize: '12px',
        color: '#999',
        marginBottom: '6px',
    },
    textInput: {
        width: '100%',
        padding: '10px 12px',
        background: '#252525',
        border: '1px solid #333',
        borderRadius: '8px',
        color: '#e0e0e0',
        fontSize: '13px',
        outline: 'none',
        boxSizing: 'border-box' as const,
    },
    errorText: {
        color: '#ef4444',
        fontSize: '12px',
        margin: '8px 0 0',
    },
    modalActions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        marginTop: '16px',
    },
    cancelBtn: {
        padding: '8px 16px',
        background: '#252525',
        border: '1px solid #333',
        borderRadius: '8px',
        color: '#999',
        cursor: 'pointer',
        fontSize: '13px',
    },
    confirmBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        background: '#f9ab00',
        border: 'none',
        borderRadius: '8px',
        color: '#000',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
    },
    manifestInfo: {
        marginTop: '20px',
        padding: '12px',
        background: '#0f0f0f',
        borderRadius: '8px',
        border: '1px solid #252525',
    },
    codeBlock: {
        background: '#252525',
        padding: '10px',
        borderRadius: '6px',
        fontSize: '11px',
        color: '#e0e0e0',
        overflow: 'auto',
        margin: 0,
        fontFamily: 'monospace',
    },
};
