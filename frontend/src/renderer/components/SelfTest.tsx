import React, { useState, useCallback } from 'react';
import { Play, CheckCircle, XCircle, Clock, AlertTriangle, BarChart3, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

const BACKEND_URL = window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : window.location.origin;

interface CriterionResult {
    criterion: string;
    passed: boolean;
    comment: string;
}

interface TestResult {
    scenario: {
        id: string;
        category: string;
        name: string;
        evaluationCriteria: string[];
    };
    neonResponse: string;
    provider: string;
    model: string;
    evaluation: {
        score: number;
        passed: boolean;
        criteriaResults: CriterionResult[];
        overallComment: string;
        suggestions: string[];
    };
    durationMs: number;
}

interface TestReport {
    timestamp: string;
    totalTests: number;
    passed: number;
    failed: number;
    averageScore: number;
    results: TestResult[];
    allSuggestions: string[];
}

const SelfTest: React.FC = () => {
    const [report, setReport] = useState<TestReport | null>(null);
    const [running, setRunning] = useState(false);
    const [currentTest, setCurrentTest] = useState<string>('');
    const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
    const [singleResults, setSingleResults] = useState<Map<string, TestResult>>(new Map());
    const [scenarios, setScenarios] = useState<Array<{ id: string; category: string; name: string; criteriaCount: number }>>([]);
    const [loaded, setLoaded] = useState(false);

    // Szenarien laden
    const loadScenarios = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/selftest/scenarios`);
            const data = await res.json();
            setScenarios(data.scenarios);
            setLoaded(true);
        } catch (err) {
            console.error('Failed to load scenarios:', err);
        }
    }, []);

    React.useEffect(() => {
        if (!loaded) loadScenarios();
    }, [loaded, loadScenarios]);

    // Alle Tests ausfuehren
    const runAllTests = useCallback(async () => {
        setRunning(true);
        setReport(null);
        setCurrentTest('Starte alle Tests...');

        try {
            const res = await fetch(`${BACKEND_URL}/api/selftest/run-all`, { method: 'POST' });
            const data: TestReport = await res.json();
            setReport(data);
            setCurrentTest('');
        } catch (err) {
            console.error('Test run failed:', err);
            setCurrentTest('Fehler beim Ausfuehren der Tests');
        } finally {
            setRunning(false);
        }
    }, []);

    // Einzelnen Test ausfuehren
    const runSingleTest = useCallback(async (scenarioId: string) => {
        setCurrentTest(scenarioId);
        try {
            const res = await fetch(`${BACKEND_URL}/api/selftest/run/${scenarioId}`, { method: 'POST' });
            const data: TestResult = await res.json();
            setSingleResults(prev => new Map(prev).set(scenarioId, data));
        } catch (err) {
            console.error(`Test ${scenarioId} failed:`, err);
        } finally {
            setCurrentTest('');
        }
    }, []);

    const toggleExpand = (id: string) => {
        setExpandedResults(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const getScoreColor = (score: number) => {
        if (score >= 8) return '#22c55e';
        if (score >= 6) return '#eab308';
        return '#ef4444';
    };

    const getScoreEmoji = (score: number) => {
        if (score >= 9) return 'Exzellent';
        if (score >= 7) return 'Gut';
        if (score >= 5) return 'Ausbaufaehig';
        return 'Kritisch';
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', color: '#e2e8f0' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
                        NEON Self-Test
                    </h1>
                    <p style={{ color: '#94a3b8', margin: '4px 0 0 0', fontSize: '14px' }}>
                        Automatisierte Qualitaetspruefung — Claude bewertet NEON's Antworten
                    </p>
                </div>
                <button
                    onClick={runAllTests}
                    disabled={running}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        background: running ? '#334155' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: running ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                    }}
                >
                    {running ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
                    {running ? 'Tests laufen...' : 'Alle Tests starten'}
                </button>
            </div>

            {/* Laufender Test */}
            {running && currentTest && (
                <div style={{
                    padding: '12px 16px',
                    background: '#1e293b',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                }}>
                    <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>{currentTest}</span>
                </div>
            )}

            {/* Gesamtbericht */}
            {report && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px',
                    marginBottom: '24px',
                }}>
                    <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                        <BarChart3 size={20} style={{ margin: '0 auto 8px', color: '#3b82f6' }} />
                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: getScoreColor(report.averageScore) }}>
                            {report.averageScore}/10
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>Durchschnitt</div>
                    </div>
                    <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                        <CheckCircle size={20} style={{ margin: '0 auto 8px', color: '#22c55e' }} />
                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#22c55e' }}>{report.passed}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>Bestanden</div>
                    </div>
                    <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                        <XCircle size={20} style={{ margin: '0 auto 8px', color: '#ef4444' }} />
                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef4444' }}>{report.failed}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>Durchgefallen</div>
                    </div>
                    <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                        <Clock size={20} style={{ margin: '0 auto 8px', color: '#94a3b8' }} />
                        <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{report.totalTests}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>Tests gesamt</div>
                    </div>
                </div>
            )}

            {/* Verbesserungsvorschlaege */}
            {report && report.allSuggestions.length > 0 && (
                <div style={{
                    background: '#1e293b',
                    border: '1px solid #f59e0b33',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '24px',
                }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                        Verbesserungsvorschlaege von Claude
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.8' }}>
                        {report.allSuggestions.map((s, i) => (
                            <li key={i} style={{ color: '#cbd5e1' }}>{s}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Einzelne Szenarien */}
            <h2 style={{ fontSize: '18px', margin: '0 0 12px 0' }}>Test-Szenarien</h2>

            {/* Gruppiert nach Kategorie */}
            {(() => {
                const items = report ? report.results : scenarios.map(s => ({
                    scenario: s,
                    evaluation: singleResults.get(s.id)?.evaluation,
                    neonResponse: singleResults.get(s.id)?.neonResponse,
                    provider: singleResults.get(s.id)?.provider,
                    model: singleResults.get(s.id)?.model,
                    durationMs: singleResults.get(s.id)?.durationMs,
                }));

                const categories = [...new Set(items.map((i: any) => i.scenario.category))];

                return categories.map(cat => (
                    <div key={cat} style={{ marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {cat}
                        </h3>
                        {items.filter((i: any) => i.scenario.category === cat).map((item: any) => {
                            const id = item.scenario.id;
                            const eval_ = item.evaluation;
                            const isExpanded = expandedResults.has(id);
                            const isRunning = currentTest === id;

                            return (
                                <div key={id} style={{
                                    background: '#1e293b',
                                    borderRadius: '8px',
                                    marginBottom: '8px',
                                    overflow: 'hidden',
                                    border: eval_?.passed === false ? '1px solid #ef444433' : eval_?.passed ? '1px solid #22c55e33' : '1px solid #334155',
                                }}>
                                    {/* Header */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '12px 16px',
                                            cursor: eval_ ? 'pointer' : 'default',
                                            gap: '12px',
                                        }}
                                        onClick={() => eval_ && toggleExpand(id)}
                                    >
                                        {/* Status Icon */}
                                        {eval_ ? (
                                            eval_.passed
                                                ? <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
                                                : <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                                        ) : (
                                            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #475569', flexShrink: 0 }} />
                                        )}

                                        {/* Name */}
                                        <span style={{ flex: 1, fontSize: '14px' }}>{item.scenario.name}</span>

                                        {/* Score */}
                                        {eval_ && (
                                            <span style={{
                                                fontSize: '13px',
                                                fontWeight: 600,
                                                color: getScoreColor(eval_.score),
                                                minWidth: '60px',
                                                textAlign: 'right',
                                            }}>
                                                {eval_.score}/10 — {getScoreEmoji(eval_.score)}
                                            </span>
                                        )}

                                        {/* Provider Badge */}
                                        {item.provider && (
                                            <span style={{
                                                fontSize: '11px',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                background: item.provider === 'claude' ? '#7c3aed22' : item.provider === 'ollama' ? '#06b6d422' : '#f59e0b22',
                                                color: item.provider === 'claude' ? '#a78bfa' : item.provider === 'ollama' ? '#22d3ee' : '#fbbf24',
                                            }}>
                                                {item.provider} {item.model ? `(${item.model})` : ''}
                                            </span>
                                        )}

                                        {/* Duration */}
                                        {item.durationMs && (
                                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                                                {(item.durationMs / 1000).toFixed(1)}s
                                            </span>
                                        )}

                                        {/* Run Button (nur wenn kein Gesamtbericht) */}
                                        {!report && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); runSingleTest(id); }}
                                                disabled={isRunning}
                                                style={{
                                                    padding: '4px 12px',
                                                    background: isRunning ? '#334155' : '#3b82f622',
                                                    color: '#3b82f6',
                                                    border: '1px solid #3b82f644',
                                                    borderRadius: '4px',
                                                    cursor: isRunning ? 'not-allowed' : 'pointer',
                                                    fontSize: '12px',
                                                }}
                                            >
                                                {isRunning ? 'Laeuft...' : 'Testen'}
                                            </button>
                                        )}

                                        {/* Expand Arrow */}
                                        {eval_ && (isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                                    </div>

                                    {/* Expanded Detail */}
                                    {isExpanded && eval_ && (
                                        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #334155' }}>
                                            {/* NEON Response */}
                                            <div style={{ marginTop: '12px' }}>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>NEON Antwort:</div>
                                                <div style={{
                                                    background: '#0f172a',
                                                    padding: '10px 12px',
                                                    borderRadius: '6px',
                                                    fontSize: '13px',
                                                    lineHeight: '1.5',
                                                    color: '#cbd5e1',
                                                    whiteSpace: 'pre-wrap',
                                                }}>
                                                    {item.neonResponse}
                                                </div>
                                            </div>

                                            {/* Criteria */}
                                            <div style={{ marginTop: '12px' }}>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Kriterien:</div>
                                                {eval_.criteriaResults.map((cr: CriterionResult, i: number) => (
                                                    <div key={i} style={{
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        gap: '8px',
                                                        padding: '6px 0',
                                                        fontSize: '13px',
                                                    }}>
                                                        {cr.passed
                                                            ? <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
                                                            : <XCircle size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                                                        }
                                                        <div>
                                                            <span style={{ color: cr.passed ? '#86efac' : '#fca5a5' }}>{cr.criterion}</span>
                                                            {cr.comment && (
                                                                <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
                                                                    {cr.comment}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Overall Comment */}
                                            {eval_.overallComment && (
                                                <div style={{
                                                    marginTop: '12px',
                                                    padding: '10px 12px',
                                                    background: '#0f172a',
                                                    borderRadius: '6px',
                                                    fontSize: '13px',
                                                    color: '#94a3b8',
                                                    borderLeft: `3px solid ${getScoreColor(eval_.score)}`,
                                                }}>
                                                    {eval_.overallComment}
                                                </div>
                                            )}

                                            {/* Suggestions */}
                                            {eval_.suggestions.length > 0 && (
                                                <div style={{ marginTop: '12px' }}>
                                                    <div style={{ fontSize: '11px', color: '#f59e0b', marginBottom: '4px' }}>VERBESSERUNGEN:</div>
                                                    {eval_.suggestions.map((s: string, i: number) => (
                                                        <div key={i} style={{ fontSize: '12px', color: '#fbbf24', padding: '2px 0' }}>
                                                            → {s}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ));
            })()}

            {/* Spin Animation */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spin { animation: spin 1s linear infinite; }
            `}</style>
        </div>
    );
};

export default SelfTest;
