import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Clock, BarChart3, TrendingDown, GitBranch, Search,
    Brain, Star, Calendar, Activity, Eye, ChevronDown
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

type InspectorTab = 'timeline' | 'heatmap' | 'decay' | 'graph';

interface TimelineEntry {
    id: string;
    type: string;
    content: string;
    importanceScore: number;
    accessCount: number;
    createdAt: string;
}

interface DecayEntry {
    id: string;
    type: string;
    content: string;
    originalImportance: number;
    currentImportance: number;
    decayFactor: number;
    ageDays: number;
    halfLife: number;
    accessCount: number;
}

interface HeatmapData {
    [week: string]: {
        [type: string]: { count: number; avgImportance: number };
    };
}

interface GraphData {
    nodes: Array<{ id: string; type: string; label: string; importance: number }>;
    edges: Array<{ source: string; target: string; type: string; strength: number }>;
}

const TYPE_COLORS: Record<string, string> = {
    fact: '#3B82F6',
    preference: '#8B5CF6',
    project: '#F59E0B',
    instruction: '#EF4444',
    knowledge: '#10B981',
};

const TYPE_LABELS: Record<string, string> = {
    fact: 'Fakten',
    preference: 'Praeferenzen',
    project: 'Projekte',
    instruction: 'Anweisungen',
    knowledge: 'Wissen',
};

export default function MemoryInspector() {
    const [activeTab, setActiveTab] = useState<InspectorTab>('timeline');
    const [timelineData, setTimelineData] = useState<Record<string, TimelineEntry[]>>({});
    const [decayData, setDecayData] = useState<DecayEntry[]>([]);
    const [heatmapData, setHeatmapData] = useState<HeatmapData>({});
    const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMemory, setSelectedMemory] = useState<string | null>(null);
    const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

    const currentUser = useAppStore((s) => s.currentUser);
    const userId = currentUser?.id || 'default-user';

    const decayCanvasRef = useRef<HTMLCanvasElement>(null);
    const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);

    // Load data when tab changes
    useEffect(() => {
        loadData(activeTab);
    }, [activeTab, userId]);

    const loadData = useCallback(async (tab: InspectorTab) => {
        setLoading(true);
        try {
            switch (tab) {
                case 'timeline': {
                    const res = await fetch(`/api/memory/${userId}/timeline`);
                    if (!res.ok) break;
                    const data = await res.json();
                    if (data && typeof data === 'object' && !data.error) {
                        setTimelineData(data);
                        const days = Object.keys(data).slice(0, 3);
                        setExpandedDays(new Set(days));
                    }
                    break;
                }
                case 'decay': {
                    const res = await fetch(`/api/memory/${userId}/decay`);
                    if (!res.ok) break;
                    const data = await res.json();
                    if (Array.isArray(data)) setDecayData(data);
                    break;
                }
                case 'heatmap': {
                    const res = await fetch(`/api/memory/${userId}/heatmap`);
                    if (!res.ok) break;
                    const data = await res.json();
                    if (data && typeof data === 'object' && !data.error) setHeatmapData(data);
                    break;
                }
                case 'graph': {
                    const res = await fetch(`/api/memory/${userId}/relations`);
                    if (!res.ok) break;
                    const data = await res.json();
                    if (data && data.nodes && data.edges) setGraphData(data);
                    break;
                }
            }
        } catch (error) {
            console.error('Failed to load memory data:', error);
        }
        setLoading(false);
    }, [userId]);

    // Draw decay graph
    useEffect(() => {
        if (activeTab !== 'decay' || !decayCanvasRef.current || decayData.length === 0) return;

        const canvas = decayCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;
        const padding = 40;

        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 10; i++) {
            const y = padding + (h - 2 * padding) * (i / 10);
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(w - padding, y);
            ctx.stroke();
        }

        // Axes labels
        ctx.fillStyle = '#666';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 10; i++) {
            const y = padding + (h - 2 * padding) * (i / 10);
            ctx.fillText(`${100 - i * 10}%`, padding - 5, y + 3);
        }

        // Sort by age
        const sorted = [...decayData].sort((a, b) => a.ageDays - b.ageDays);
        const maxAge = Math.max(...sorted.map(d => d.ageDays), 1);

        // X-axis labels
        ctx.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const x = padding + (w - 2 * padding) * (i / 5);
            const days = Math.round(maxAge * (i / 5));
            ctx.fillText(`${days}d`, x, h - 10);
        }

        // Draw dots
        for (const entry of sorted) {
            const x = padding + (w - 2 * padding) * (entry.ageDays / maxAge);
            const y = padding + (h - 2 * padding) * (1 - entry.currentImportance);
            const color = TYPE_COLORS[entry.type] || '#666';

            ctx.fillStyle = color;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Draw decay curves per type
        const types = [...new Set(decayData.map(d => d.type))];
        for (const type of types) {
            const halfLife = decayData.find(d => d.type === type)?.halfLife || 60;
            if (halfLife === Infinity) continue;

            ctx.strokeStyle = TYPE_COLORS[type] || '#666';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();

            for (let day = 0; day <= maxAge; day++) {
                const decay = Math.pow(0.5, day / halfLife);
                const x = padding + (w - 2 * padding) * (day / maxAge);
                const y = padding + (h - 2 * padding) * (1 - decay);

                if (day === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }

    }, [activeTab, decayData]);

    // Draw heatmap
    useEffect(() => {
        if (activeTab !== 'heatmap' || !heatmapCanvasRef.current) return;

        const canvas = heatmapCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const weeks = Object.keys(heatmapData).sort();
        const types = [...new Set(Object.values(heatmapData).flatMap(w => Object.keys(w)))];

        if (weeks.length === 0 || types.length === 0) return;

        const cellW = Math.max(20, Math.min(40, (canvas.width - 100) / weeks.length));
        const cellH = 30;
        const leftPad = 100;
        const topPad = 30;

        canvas.width = leftPad + weeks.length * cellW + 20;
        canvas.height = topPad + types.length * cellH + 40;

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Type labels
        ctx.fillStyle = '#999';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        types.forEach((type, i) => {
            ctx.fillText(TYPE_LABELS[type] || type, leftPad - 10, topPad + i * cellH + cellH / 2 + 4);
        });

        // Week labels (show every nth)
        ctx.textAlign = 'center';
        const labelEvery = Math.max(1, Math.floor(weeks.length / 10));
        weeks.forEach((week, i) => {
            if (i % labelEvery === 0) {
                ctx.save();
                ctx.translate(leftPad + i * cellW + cellW / 2, canvas.height - 5);
                ctx.rotate(-Math.PI / 4);
                ctx.fillText(week.slice(5), 0, 0); // Show MM-DD
                ctx.restore();
            }
        });

        // Draw cells
        for (let wi = 0; wi < weeks.length; wi++) {
            const weekData = heatmapData[weeks[wi]] || {};
            for (let ti = 0; ti < types.length; ti++) {
                const cell = weekData[types[ti]];
                const x = leftPad + wi * cellW;
                const y = topPad + ti * cellH;

                if (cell) {
                    const intensity = Math.min(1, cell.count / 10);
                    const baseColor = TYPE_COLORS[types[ti]] || '#666';
                    ctx.globalAlpha = 0.2 + intensity * 0.8;
                    ctx.fillStyle = baseColor;
                    ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
                    ctx.globalAlpha = 1;

                    // Count text
                    if (cellW > 25) {
                        ctx.fillStyle = '#fff';
                        ctx.font = '10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(String(cell.count), x + cellW / 2, y + cellH / 2 + 4);
                    }
                } else {
                    ctx.fillStyle = '#252525';
                    ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
                }
            }
        }
    }, [activeTab, heatmapData]);

    const toggleDay = (day: string) => {
        setExpandedDays(prev => {
            const next = new Set(prev);
            if (next.has(day)) next.delete(day);
            else next.add(day);
            return next;
        });
    };

    const filteredTimeline: Record<string, TimelineEntry[]> = searchQuery
        ? Object.fromEntries(
            Object.entries(timelineData).map(([day, entries]) => [
                day,
                entries.filter((e: TimelineEntry) =>
                    e.content.toLowerCase().includes(searchQuery.toLowerCase())
                ),
            ]).filter(([, entries]) => (entries as TimelineEntry[]).length > 0)
        )
        : timelineData;

    const tabs: { id: InspectorTab; label: string; icon: any }[] = [
        { id: 'timeline', label: 'Timeline', icon: Clock },
        { id: 'heatmap', label: 'Heatmap', icon: BarChart3 },
        { id: 'decay', label: 'Decay', icon: TrendingDown },
        { id: 'graph', label: 'Relationen', icon: GitBranch },
    ];

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <Brain size={24} color="#f9ab00" />
                    <h1 style={styles.title}>Memory Inspector</h1>
                </div>
                <p style={styles.subtitle}>Visualisiere wie dein Assistent denkt und erinnert</p>
            </div>

            {/* Tab Navigation */}
            <div style={styles.tabBar}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            ...styles.tab,
                            ...(activeTab === tab.id ? styles.tabActive : {}),
                        }}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Search (for Timeline) */}
            {activeTab === 'timeline' && (
                <div style={styles.searchBar}>
                    <Search size={16} color="#666" />
                    <input
                        type="text"
                        placeholder="Memories durchsuchen..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={styles.searchInput}
                    />
                </div>
            )}

            {/* Content */}
            <div style={styles.content}>
                {loading ? (
                    <div style={styles.loading}>Lade Daten...</div>
                ) : (
                    <>
                        {/* TIMELINE VIEW */}
                        {activeTab === 'timeline' && (
                            <div style={styles.timeline}>
                                {Object.entries(filteredTimeline).map(([day, entries]) => (
                                    <div key={day} style={styles.timelineDay}>
                                        <button
                                            onClick={() => toggleDay(day)}
                                            style={styles.timelineDayHeader}
                                        >
                                            <Calendar size={14} color="#f9ab00" />
                                            <span style={styles.timelineDayTitle}>{formatDate(day)}</span>
                                            <span style={styles.timelineDayCount}>{entries.length} Memories</span>
                                            <ChevronDown
                                                size={14}
                                                style={{
                                                    transform: expandedDays.has(day) ? 'rotate(180deg)' : 'none',
                                                    transition: 'transform 0.2s',
                                                }}
                                            />
                                        </button>

                                        {expandedDays.has(day) && (
                                            <div style={styles.timelineEntries}>
                                                {entries.map(entry => (
                                                    <div
                                                        key={entry.id}
                                                        style={{
                                                            ...styles.memoryCard,
                                                            borderLeft: `3px solid ${TYPE_COLORS[entry.type] || '#666'}`,
                                                            ...(selectedMemory === entry.id ? styles.memoryCardSelected : {}),
                                                        }}
                                                        onClick={() => setSelectedMemory(
                                                            selectedMemory === entry.id ? null : entry.id
                                                        )}
                                                    >
                                                        <div style={styles.memoryHeader}>
                                                            <span style={{
                                                                ...styles.typeBadge,
                                                                background: `${TYPE_COLORS[entry.type]}22`,
                                                                color: TYPE_COLORS[entry.type],
                                                            }}>
                                                                {TYPE_LABELS[entry.type] || entry.type}
                                                            </span>
                                                            <div style={styles.memoryMeta}>
                                                                <Star size={12} color="#f9ab00" />
                                                                <span>{Math.round(entry.importanceScore * 100)}%</span>
                                                                <Eye size={12} color="#666" />
                                                                <span>{entry.accessCount}x</span>
                                                            </div>
                                                        </div>
                                                        <p style={styles.memoryContent}>
                                                            {selectedMemory === entry.id
                                                                ? entry.content
                                                                : entry.content.substring(0, 120) + (entry.content.length > 120 ? '...' : '')
                                                            }
                                                        </p>
                                                        <span style={styles.memoryTime}>
                                                            {new Date(entry.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {Object.keys(filteredTimeline).length === 0 && (
                                    <div style={styles.empty}>Keine Memories gefunden</div>
                                )}
                            </div>
                        )}

                        {/* HEATMAP VIEW */}
                        {activeTab === 'heatmap' && (
                            <div style={styles.canvasContainer}>
                                <h3 style={styles.sectionTitle}>Importance-Score Heatmap</h3>
                                <p style={styles.sectionDesc}>Zeigt die Aktivitaet pro Woche und Memory-Typ</p>
                                <div style={styles.canvasScroll}>
                                    <canvas
                                        ref={heatmapCanvasRef}
                                        width={800}
                                        height={250}
                                    />
                                </div>
                                <div style={styles.legend}>
                                    {Object.entries(TYPE_COLORS).map(([type, color]) => (
                                        <div key={type} style={styles.legendItem}>
                                            <div style={{ ...styles.legendDot, background: color }} />
                                            <span>{TYPE_LABELS[type] || type}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* DECAY VIEW */}
                        {activeTab === 'decay' && (
                            <div>
                                <h3 style={styles.sectionTitle}>Memory Decay Graph</h3>
                                <p style={styles.sectionDesc}>
                                    Zeigt wie die Wichtigkeit von Memories ueber die Zeit abnimmt.
                                    Gestrichelte Linien = theoretische Decay-Kurven pro Typ.
                                </p>
                                <canvas
                                    ref={decayCanvasRef}
                                    width={700}
                                    height={350}
                                    style={{ width: '100%', maxWidth: '700px', borderRadius: '8px' }}
                                />
                                <div style={styles.legend}>
                                    {Object.entries(TYPE_COLORS).map(([type, color]) => (
                                        <div key={type} style={styles.legendItem}>
                                            <div style={{ ...styles.legendDot, background: color }} />
                                            <span>{TYPE_LABELS[type] || type}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Decay Table */}
                                <div style={styles.decayTable}>
                                    <h4 style={{ color: '#e0e0e0', margin: '16px 0 8px' }}>Top bedrohte Memories</h4>
                                    {decayData
                                        .filter(d => d.decayFactor < 0.7 && d.halfLife !== Infinity)
                                        .sort((a, b) => a.decayFactor - b.decayFactor)
                                        .slice(0, 10)
                                        .map(entry => (
                                            <div key={entry.id} style={styles.decayRow}>
                                                <span style={{
                                                    ...styles.typeBadge,
                                                    background: `${TYPE_COLORS[entry.type]}22`,
                                                    color: TYPE_COLORS[entry.type],
                                                    fontSize: '10px',
                                                }}>
                                                    {TYPE_LABELS[entry.type] || entry.type}
                                                </span>
                                                <span style={styles.decayContent}>{entry.content}</span>
                                                <div style={styles.decayBar}>
                                                    <div style={{
                                                        ...styles.decayBarFill,
                                                        width: `${entry.decayFactor * 100}%`,
                                                        background: entry.decayFactor > 0.5 ? '#22c55e' : entry.decayFactor > 0.25 ? '#f59e0b' : '#ef4444',
                                                    }} />
                                                </div>
                                                <span style={styles.decayPercent}>{Math.round(entry.decayFactor * 100)}%</span>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        )}

                        {/* GRAPH VIEW */}
                        {activeTab === 'graph' && (
                            <div>
                                <h3 style={styles.sectionTitle}>Wissens-Graph</h3>
                                <p style={styles.sectionDesc}>
                                    Zeigt Verbindungen zwischen Memories ({graphData.nodes.length} Knoten, {graphData.edges.length} Kanten)
                                </p>
                                <div style={styles.graphGrid}>
                                    {graphData.nodes.map(node => (
                                        <div
                                            key={node.id}
                                            style={{
                                                ...styles.graphNode,
                                                borderColor: TYPE_COLORS[node.type] || '#666',
                                            }}
                                        >
                                            <span style={{
                                                ...styles.typeBadge,
                                                background: `${TYPE_COLORS[node.type]}22`,
                                                color: TYPE_COLORS[node.type],
                                                fontSize: '9px',
                                            }}>
                                                {TYPE_LABELS[node.type] || node.type}
                                            </span>
                                            <p style={styles.graphNodeLabel}>{node.label}</p>
                                            <div style={styles.graphNodeMeta}>
                                                <Activity size={10} />
                                                <span>{Math.round(node.importance * 100)}%</span>
                                                {graphData.edges.filter(e => e.source === node.id || e.target === node.id).length > 0 && (
                                                    <>
                                                        <GitBranch size={10} />
                                                        <span>{graphData.edges.filter(e => e.source === node.id || e.target === node.id).length}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {graphData.nodes.length === 0 && (
                                    <div style={styles.empty}>Keine Memory-Relationen vorhanden</div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) return 'Heute';
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Gestern';

    return date.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        padding: '24px',
        maxWidth: '900px',
        margin: '0 auto',
    },
    header: {
        marginBottom: '24px',
    },
    titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '4px',
    },
    title: {
        fontSize: '24px',
        fontWeight: 700,
        color: '#e0e0e0',
        margin: 0,
    },
    subtitle: {
        color: '#666',
        fontSize: '14px',
        margin: 0,
    },
    tabBar: {
        display: 'flex',
        gap: '4px',
        marginBottom: '20px',
        borderBottom: '1px solid #333',
        paddingBottom: '8px',
    },
    tab: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        borderRadius: '8px 8px 0 0',
        border: 'none',
        background: 'transparent',
        color: '#999',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        transition: 'all 0.2s',
    },
    tabActive: {
        background: '#1a1a1a',
        color: '#f9ab00',
        borderBottom: '2px solid #f9ab00',
    },
    searchBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: '#1a1a1a',
        borderRadius: '8px',
        marginBottom: '16px',
        border: '1px solid #333',
    },
    searchInput: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        color: '#e0e0e0',
        fontSize: '13px',
        outline: 'none',
    },
    content: {
        minHeight: '400px',
    },
    loading: {
        textAlign: 'center' as const,
        color: '#666',
        padding: '40px',
    },
    empty: {
        textAlign: 'center' as const,
        color: '#666',
        padding: '40px',
    },
    // Timeline
    timeline: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '8px',
    },
    timelineDay: {
        background: '#1a1a1a',
        borderRadius: '8px',
        overflow: 'hidden',
    },
    timelineDayHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        width: '100%',
        border: 'none',
        background: 'transparent',
        color: '#e0e0e0',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
    },
    timelineDayTitle: {
        flex: 1,
        textAlign: 'left' as const,
    },
    timelineDayCount: {
        color: '#666',
        fontSize: '12px',
    },
    timelineEntries: {
        padding: '0 16px 12px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '8px',
    },
    memoryCard: {
        padding: '10px 12px',
        background: '#252525',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'background 0.15s',
    },
    memoryCardSelected: {
        background: '#2a2a2a',
        boxShadow: '0 0 0 1px #f9ab00',
    },
    memoryHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
    },
    typeBadge: {
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 600,
    },
    memoryMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        color: '#666',
        fontSize: '11px',
    },
    memoryContent: {
        color: '#ccc',
        fontSize: '12px',
        lineHeight: '1.4',
        margin: '0 0 4px',
    },
    memoryTime: {
        color: '#555',
        fontSize: '10px',
    },
    // Canvas views
    canvasContainer: {},
    canvasScroll: {
        overflowX: 'auto' as const,
        paddingBottom: '8px',
    },
    sectionTitle: {
        color: '#e0e0e0',
        fontSize: '16px',
        fontWeight: 600,
        margin: '0 0 4px',
    },
    sectionDesc: {
        color: '#666',
        fontSize: '12px',
        margin: '0 0 16px',
    },
    legend: {
        display: 'flex',
        gap: '16px',
        marginTop: '12px',
        flexWrap: 'wrap' as const,
    },
    legendItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: '#999',
        fontSize: '12px',
    },
    legendDot: {
        width: '10px',
        height: '10px',
        borderRadius: '50%',
    },
    // Decay table
    decayTable: {},
    decayRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 0',
        borderBottom: '1px solid #252525',
    },
    decayContent: {
        flex: 1,
        color: '#ccc',
        fontSize: '12px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
    },
    decayBar: {
        width: '80px',
        height: '6px',
        background: '#252525',
        borderRadius: '3px',
        overflow: 'hidden',
    },
    decayBarFill: {
        height: '100%',
        borderRadius: '3px',
        transition: 'width 0.3s',
    },
    decayPercent: {
        color: '#666',
        fontSize: '11px',
        width: '35px',
        textAlign: 'right' as const,
    },
    // Graph
    graphGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '8px',
    },
    graphNode: {
        padding: '10px',
        background: '#1a1a1a',
        borderRadius: '8px',
        borderLeft: '3px solid #666',
    },
    graphNodeLabel: {
        color: '#ccc',
        fontSize: '12px',
        margin: '6px 0 4px',
        lineHeight: '1.3',
    },
    graphNodeMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        color: '#666',
        fontSize: '10px',
    },
};
