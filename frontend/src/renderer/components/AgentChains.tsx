import { useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Play, Plus, Trash2, CheckCircle, XCircle, Loader2,
  Clock, Search, FileText, MessageSquare, Code, Archive,
  ChevronDown, ChevronUp, GripVertical
} from 'lucide-react';

// --- Types ---

type StepType = 'recherche' | 'zusammenfassung' | 'kapsel' | 'nachricht' | 'code';
type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface ChainStep {
  id: string;
  type: StepType;
  prompt: string;
  status: StepStatus;
  result?: string;
  error?: string;
}

interface ChainTemplate {
  name: string;
  description: string;
  steps: Omit<ChainStep, 'id' | 'status' | 'result' | 'error'>[];
}

// --- Constants ---

const STEP_TYPE_META: Record<StepType, { label: string; icon: typeof Search; color: string }> = {
  recherche:       { label: 'Recherche',       icon: Search,       color: '#4fc3f7' },
  zusammenfassung: { label: 'Zusammenfassung', icon: FileText,     color: '#81c784' },
  kapsel:          { label: 'Kapsel',          icon: Archive,      color: '#ce93d8' },
  nachricht:       { label: 'Nachricht',       icon: MessageSquare, color: '#ffb74d' },
  code:            { label: 'Code',            icon: Code,         color: '#ef5350' },
};

const TEMPLATES: ChainTemplate[] = [
  {
    name: 'Recherche + Zusammenfassung',
    description: 'Recherchiert ein Thema und fasst die Ergebnisse zusammen.',
    steps: [
      { type: 'recherche', prompt: 'Recherchiere zum Thema: ' },
      { type: 'zusammenfassung', prompt: 'Fasse die Recherche-Ergebnisse zusammen.' },
    ],
  },
  {
    name: 'Recherche + Gedaechtnis speichern',
    description: 'Recherchiert und speichert das Ergebnis als Zeitkapsel.',
    steps: [
      { type: 'recherche', prompt: 'Recherchiere zum Thema: ' },
      { type: 'kapsel', prompt: 'Speichere die Ergebnisse als Zeitkapsel.' },
    ],
  },
  {
    name: 'Code generieren + ausfuehren',
    description: 'Generiert Code aus einer Beschreibung und fuehrt ihn aus.',
    steps: [
      { type: 'code', prompt: 'Generiere Code fuer: ' },
      { type: 'code', prompt: 'Fuehre den generierten Code aus und zeige das Ergebnis.' },
    ],
  },
];

// --- Helpers ---

let _idCounter = 0;
const makeId = () => `step-${Date.now()}-${++_idCounter}`;

const makeStep = (type: StepType, prompt: string): ChainStep => ({
  id: makeId(),
  type,
  prompt,
  status: 'pending',
});

// --- Component ---

export default function AgentChains() {
  const socket = useAppStore((s) => s.socket);
  const [steps, setSteps] = useState<ChainStep[]>([]);
  const [running, setRunning] = useState(false);
  const [newStepType, setNewStepType] = useState<StepType>('recherche');
  const [newStepPrompt, setNewStepPrompt] = useState('');
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  // --- Template loading ---
  const loadTemplate = (tpl: ChainTemplate) => {
    setSteps(tpl.steps.map((s) => makeStep(s.type, s.prompt)));
  };

  // --- Step management ---
  const addStep = () => {
    if (!newStepPrompt.trim()) return;
    setSteps((prev) => [...prev, makeStep(newStepType, newStepPrompt.trim())]);
    setNewStepPrompt('');
  };

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // --- Execution ---
  const runChain = useCallback(async () => {
    if (!socket || steps.length === 0) return;
    setRunning(true);

    // Reset all statuses
    setSteps((prev) => prev.map((s) => ({ ...s, status: 'pending' as StepStatus, result: undefined, error: undefined })));

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Mark running
      setSteps((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: 'running' as StepStatus } : s))
      );
      setExpandedStep(step.id);

      try {
        const result = await new Promise<string>((resolve, reject) => {
          let accumulated = '';
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Zeitueberschreitung (30s)'));
          }, 30000);

          const onChunk = ({ chunk }: { chunk: string }) => {
            accumulated += chunk;
          };
          const onComplete = () => {
            cleanup();
            resolve(accumulated || '(Keine Antwort)');
          };
          const onError = ({ message }: { message: string }) => {
            cleanup();
            reject(new Error(message));
          };

          const cleanup = () => {
            clearTimeout(timeout);
            socket.off('ai-response-chunk', onChunk);
            socket.off('ai-response-complete', onComplete);
            socket.off('error', onError);
          };

          socket.on('ai-response-chunk', onChunk);
          socket.on('ai-response-complete', onComplete);
          socket.on('error', onError);

          // Build prompt including previous step result
          let fullPrompt = `[Agenten-Kette Schritt ${i + 1}/${steps.length} - ${STEP_TYPE_META[step.type].label}]\n${step.prompt}`;
          if (i > 0) {
            const prevResult = steps[i - 1].result;
            if (prevResult) {
              fullPrompt += `\n\nErgebnis des vorherigen Schritts:\n${prevResult}`;
            }
          }

          socket.emit('user-message', {
            message: fullPrompt,
            userId: useAppStore.getState().currentUser.id,
            personality: useAppStore.getState().personality,
          });
        });

        // Mark done
        setSteps((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: 'done' as StepStatus, result } : s))
        );
        // Store result on the mutable reference so next iteration can access it
        steps[i].result = result;
      } catch (err: any) {
        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: 'error' as StepStatus, error: err.message || 'Unbekannter Fehler' } : s
          )
        );
        break; // Stop chain on error
      }
    }

    setRunning(false);
  }, [socket, steps]);

  // --- Status icon ---
  const StatusIcon = ({ status }: { status: StepStatus }) => {
    switch (status) {
      case 'running':
        return <Loader2 size={18} className="spin" style={{ color: 'var(--accent-primary)' }} />;
      case 'done':
        return <CheckCircle size={18} style={{ color: '#4caf50' }} />;
      case 'error':
        return <XCircle size={18} style={{ color: '#ef5350' }} />;
      default:
        return <Clock size={18} style={{ color: 'var(--text-tertiary)' }} />;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Agenten-Ketten</h2>
        <p style={styles.subtitle}>Definiere mehrstufige KI-Aufgaben und fuehre sie sequenziell aus.</p>
      </div>

      {/* Templates */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Vorlagen</h3>
        <div style={styles.templateGrid}>
          {TEMPLATES.map((tpl, i) => (
            <button
              key={i}
              style={styles.templateCard}
              onClick={() => loadTemplate(tpl)}
              disabled={running}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
              }}
            >
              <span style={styles.templateName}>{tpl.name}</span>
              <span style={styles.templateDesc}>{tpl.description}</span>
              <span style={styles.templateStepCount}>{tpl.steps.length} Schritte</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step List */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Kette ({steps.length} Schritte)</h3>

        {steps.length === 0 && (
          <div style={styles.emptyState}>
            Keine Schritte vorhanden. Waehle eine Vorlage oder fuege Schritte manuell hinzu.
          </div>
        )}

        <div style={styles.stepList}>
          {steps.map((step, idx) => {
            const meta = STEP_TYPE_META[step.type];
            const Icon = meta.icon;
            const isExpanded = expandedStep === step.id;

            return (
              <div key={step.id} style={styles.stepCard}>
                <div style={styles.stepHeader} onClick={() => setExpandedStep(isExpanded ? null : step.id)}>
                  <div style={styles.stepLeft}>
                    <GripVertical size={14} style={{ color: 'var(--text-tertiary)' }} />
                    <span style={{ ...styles.stepBadge, background: meta.color + '22', color: meta.color }}>
                      <Icon size={14} />
                      {meta.label}
                    </span>
                    <span style={styles.stepIndex}>#{idx + 1}</span>
                  </div>
                  <div style={styles.stepRight}>
                    <StatusIcon status={step.status} />
                    {!running && (
                      <>
                        <button style={styles.iconBtn} onClick={(e) => { e.stopPropagation(); moveStep(idx, -1); }} disabled={idx === 0} title="Nach oben">
                          <ChevronUp size={16} />
                        </button>
                        <button style={styles.iconBtn} onClick={(e) => { e.stopPropagation(); moveStep(idx, 1); }} disabled={idx === steps.length - 1} title="Nach unten">
                          <ChevronDown size={16} />
                        </button>
                        <button style={{ ...styles.iconBtn, color: '#ef5350' }} onClick={(e) => { e.stopPropagation(); removeStep(step.id); }} title="Entfernen">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div style={styles.stepBody}>
                    <div style={styles.promptLabel}>Prompt:</div>
                    <div style={styles.promptText}>{step.prompt}</div>

                    {step.result && (
                      <>
                        <div style={{ ...styles.promptLabel, marginTop: 12 }}>Ergebnis:</div>
                        <div style={styles.resultText}>{step.result}</div>
                      </>
                    )}
                    {step.error && (
                      <>
                        <div style={{ ...styles.promptLabel, marginTop: 12, color: '#ef5350' }}>Fehler:</div>
                        <div style={{ ...styles.resultText, color: '#ef5350' }}>{step.error}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Step */}
      {!running && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Schritt hinzufuegen</h3>
          <div style={styles.addRow}>
            <select
              value={newStepType}
              onChange={(e) => setNewStepType(e.target.value as StepType)}
              style={styles.select}
            >
              {Object.entries(STEP_TYPE_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
            <input
              style={styles.input}
              placeholder="Prompt / Anweisung fuer diesen Schritt..."
              value={newStepPrompt}
              onChange={(e) => setNewStepPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStep()}
            />
            <button style={styles.addBtn} onClick={addStep} title="Schritt hinzufuegen">
              <Plus size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Run Button */}
      <div style={styles.runRow}>
        <button
          style={{
            ...styles.runBtn,
            opacity: running || steps.length === 0 ? 0.5 : 1,
            cursor: running || steps.length === 0 ? 'not-allowed' : 'pointer',
          }}
          onClick={runChain}
          disabled={running || steps.length === 0}
        >
          {running ? (
            <>
              <Loader2 size={20} className="spin" />
              Kette laeuft...
            </>
          ) : (
            <>
              <Play size={20} />
              Kette starten
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

// --- Inline Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '2rem 1.5rem',
    color: 'var(--text-primary)',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: '0.95rem',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    marginBottom: 12,
    color: 'var(--text-secondary)',
  },
  templateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 12,
  },
  templateCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '14px 16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.2s',
    color: 'var(--text-primary)',
  },
  templateName: {
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  templateDesc: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  },
  templateStepCount: {
    fontSize: '0.75rem',
    color: 'var(--text-tertiary)',
    marginTop: 4,
  },
  emptyState: {
    padding: '24px 16px',
    textAlign: 'center',
    color: 'var(--text-tertiary)',
    fontSize: '0.9rem',
    border: '1px dashed var(--border-subtle)',
    borderRadius: 10,
  },
  stepList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  stepCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    cursor: 'pointer',
  },
  stepLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  stepRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  stepBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: 6,
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  stepIndex: {
    fontSize: '0.78rem',
    color: 'var(--text-tertiary)',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
  },
  stepBody: {
    padding: '0 14px 14px',
  },
  promptLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  promptText: {
    fontSize: '0.88rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  resultText: {
    fontSize: '0.85rem',
    color: 'var(--text-primary)',
    background: 'var(--bg-primary)',
    padding: '10px 12px',
    borderRadius: 8,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    maxHeight: 300,
    overflowY: 'auto',
  },
  addRow: {
    display: 'flex',
    gap: 8,
  },
  select: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '0.88rem',
    minWidth: 150,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '0.88rem',
    outline: 'none',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-secondary)',
    color: 'var(--accent-primary)',
    cursor: 'pointer',
  },
  runRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: 16,
  },
  runBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 32px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--accent-primary)',
    color: '#000',
    fontWeight: 700,
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
};
