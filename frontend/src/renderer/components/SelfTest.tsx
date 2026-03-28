import React, { useState, useCallback } from 'react';
import { Play, CheckCircle, XCircle, Clock, AlertTriangle, BarChart3, RefreshCw, ChevronDown, ChevronUp, FileDown } from 'lucide-react';

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

    // Alle Tests einzeln ausfuehren (mit Live-Fortschritt)
    const runAllTests = useCallback(async () => {
        if (scenarios.length === 0) return;
        setRunning(true);
        setReport(null);
        setSingleResults(new Map());

        const results: TestResult[] = [];

        for (let i = 0; i < scenarios.length; i++) {
            const scenario = scenarios[i];
            setCurrentTest(`Test ${i + 1}/${scenarios.length}: ${scenario.name}`);

            try {
                const res = await fetch(`${BACKEND_URL}/api/selftest/run/${scenario.id}`, { method: 'POST' });
                const data: TestResult = await res.json();
                results.push(data);
                setSingleResults(prev => new Map(prev).set(scenario.id, data));
            } catch (err) {
                console.error(`Test ${scenario.id} failed:`, err);
            }
        }

        // Gesamtbericht erstellen
        const passed = results.filter(r => r.evaluation?.passed).length;
        const failed = results.filter(r => !r.evaluation?.passed).length;
        const avgScore = results.length > 0
            ? results.reduce((sum, r) => sum + (r.evaluation?.score || 0), 0) / results.length
            : 0;
        const allSuggestions = results
            .flatMap(r => r.evaluation?.suggestions || [])
            .filter((s, i, arr) => arr.indexOf(s) === i);

        setReport({
            timestamp: new Date().toISOString(),
            totalTests: results.length,
            passed,
            failed,
            averageScore: Math.round(avgScore * 10) / 10,
            results,
            allSuggestions,
        });
        setCurrentTest('');
        setRunning(false);
    }, [scenarios]);

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

    // ─── PDF Export (Browser Print-to-PDF) ────────────────────────
    const exportPDF = useCallback(() => {
        if (!report) return;

        const date = new Date(report.timestamp);
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const categories = [...new Set(report.results.map(r => r.scenario.category))];

        let resultsHtml = '';
        for (const cat of categories) {
            resultsHtml += `<h2 class="cat">${esc(cat.toUpperCase())}</h2>`;
            const catResults = report.results.filter(r => r.scenario.category === cat);
            for (const result of catResults) {
                const ev = result.evaluation;
                const scoreClass = ev.score >= 8 ? 'green' : ev.score >= 6 ? 'yellow' : 'red';
                resultsHtml += `<div class="test-card">
                    <div class="test-header">
                        <span class="badge ${scoreClass}">${ev.passed ? 'PASS' : 'FAIL'}</span>
                        <strong>${esc(result.scenario.name)}</strong>
                        <span class="score ${scoreClass}">${ev.score}/10</span>
                        <span class="meta">${esc(result.provider)} (${esc(result.model)}) — ${(result.durationMs / 1000).toFixed(1)}s</span>
                    </div>
                    <div class="response"><b>NEON Antwort:</b><br/>${esc(result.neonResponse)}</div>
                    <div class="criteria">
                        ${ev.criteriaResults.map(cr => `
                            <div class="cr ${cr.passed ? 'pass' : 'fail'}">
                                <span>${cr.passed ? '+' : '-'}</span>
                                <div><strong>${esc(cr.criterion)}</strong>${cr.comment ? `<br/><span class="comment">${esc(cr.comment)}</span>` : ''}</div>
                            </div>
                        `).join('')}
                    </div>
                    ${ev.overallComment ? `<div class="overall">${esc(ev.overallComment)}</div>` : ''}
                    ${ev.suggestions.length > 0 ? `<div class="suggestions"><b>Verbesserungen:</b><ul>${ev.suggestions.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
                </div>`;
            }
        }

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>NEON Self-Test Bericht</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; padding: 32px; max-width: 800px; margin: 0 auto; font-size: 13px; line-height: 1.5; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 12px; margin-bottom: 24px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .summary-card { flex: 1; background: #f1f5f9; border-radius: 8px; padding: 14px; text-align: center; }
    .summary-card .num { font-size: 26px; font-weight: bold; }
    .summary-card .label { font-size: 11px; color: #64748b; }
    .green { color: #16a34a; } .yellow { color: #ca8a04; } .red { color: #dc2626; }
    .suggestions-box { background: #fffbeb; border: 1px solid #f59e0b44; border-radius: 8px; padding: 14px; margin-bottom: 24px; }
    .suggestions-box b { color: #92400e; }
    .suggestions-box ul { margin: 8px 0 0 18px; }
    .suggestions-box li { margin-bottom: 4px; color: #78350f; }
    .cat { font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 20px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .test-card { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; padding: 12px; page-break-inside: avoid; }
    .test-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .badge { font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 4px; background: #f1f5f9; }
    .badge.green { background: #dcfce7; color: #16a34a; } .badge.red { background: #fee2e2; color: #dc2626; } .badge.yellow { background: #fef9c3; color: #ca8a04; }
    .score { font-weight: bold; margin-left: auto; }
    .meta { font-size: 11px; color: #94a3b8; }
    .response { background: #f8fafc; border-radius: 6px; padding: 8px 10px; font-size: 12px; color: #475569; margin-bottom: 8px; white-space: pre-wrap; word-break: break-word; }
    .criteria { margin-bottom: 8px; }
    .cr { display: flex; gap: 6px; padding: 3px 0; font-size: 12px; }
    .cr span:first-child { font-weight: bold; width: 14px; flex-shrink: 0; }
    .cr.pass span:first-child { color: #16a34a; } .cr.fail span:first-child { color: #dc2626; }
    .comment { color: #94a3b8; font-size: 11px; }
    .overall { background: #f1f5f9; border-left: 3px solid #94a3b8; padding: 8px 10px; font-size: 12px; color: #64748b; border-radius: 4px; margin-bottom: 8px; }
    .suggestions { font-size: 12px; color: #92400e; } .suggestions ul { margin: 4px 0 0 18px; }
    @media print { body { padding: 16px; } .test-card { page-break-inside: avoid; } }
</style></head><body>
    <h1>NEON Self-Test Bericht</h1>
    <div class="subtitle">Erstellt: ${date.toLocaleDateString('de-DE')} um ${date.toLocaleTimeString('de-DE')}</div>
    <div class="summary">
        <div class="summary-card"><div class="num ${report.averageScore >= 8 ? 'green' : report.averageScore >= 6 ? 'yellow' : 'red'}">${report.averageScore}/10</div><div class="label">Durchschnitt</div></div>
        <div class="summary-card"><div class="num green">${report.passed}</div><div class="label">Bestanden</div></div>
        <div class="summary-card"><div class="num red">${report.failed}</div><div class="label">Durchgefallen</div></div>
        <div class="summary-card"><div class="num">${report.totalTests}</div><div class="label">Tests gesamt</div></div>
    </div>
    ${report.allSuggestions.length > 0 ? `<div class="suggestions-box"><b>Verbesserungsvorschlaege von Claude:</b><ul>${report.allSuggestions.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    ${resultsHtml}
</body></html>`;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = () => {
                printWindow.print();
            };
        }
    }, [report]);

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
                <div style={{ display: 'flex', gap: '8px' }}>
                    {report && (
                        <button
                            onClick={exportPDF}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 20px',
                                background: '#10b98122',
                                color: '#10b981',
                                border: '1px solid #10b98144',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 600,
                            }}
                        >
                            <FileDown size={16} />
                            PDF Export
                        </button>
                    )}
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
