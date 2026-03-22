import { useState } from 'react';
import { Play, Terminal, AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';

type Language = 'javascript' | 'python' | 'powershell';

interface ExecutionResult {
  output: string;
  error?: string;
  executionTime: number;
  success: boolean;
}

export default function CodeExecutor() {
  const [language, setLanguage] = useState<Language>('javascript');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecute = async () => {
    if (!code.trim() || isExecuting) return;

    setIsExecuting(true);
    setResult(null);

    try {
      const res = await fetch('http://localhost:3001/api/code/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });

      const data: ExecutionResult = await res.json();
      setResult(data);
    } catch (error) {
      setResult({
        output: '',
        error: `Verbindungsfehler: ${error instanceof Error ? error.message : 'Unbekannt'}`,
        executionTime: 0,
        success: false,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter to execute
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleExecute();
    }
    // Tab to indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  const placeholders: Record<Language, string> = {
    javascript: 'console.log("Hallo Welt!");\n\nconst summe = [1, 2, 3].reduce((a, b) => a + b, 0);\nconsole.log("Summe:", summe);',
    python: 'print("Hallo Welt!")\n\nsumme = sum([1, 2, 3])\nprint(f"Summe: {summe}")',
    powershell: 'Write-Host "Hallo Welt!"\n\n$summe = (1..3 | Measure-Object -Sum).Sum\nWrite-Host "Summe: $summe"',
  };

  return (
    <div className="code-executor-container">
      <div className="code-executor-header">
        <Terminal size={28} className="header-icon" />
        <div>
          <h2>Code-Ausfuehrung</h2>
          <p className="subtitle">Code sicher in einer Sandbox ausfuehren</p>
        </div>
      </div>

      <div className="code-executor-content">
        {/* Language Selector & Execute */}
        <div className="code-toolbar">
          <div className="language-selector">
            <label>Sprache:</label>
            {(['javascript', 'python', 'powershell'] as Language[]).map((lang) => (
              <button
                key={lang}
                className={`lang-btn ${language === lang ? 'active' : ''}`}
                onClick={() => setLanguage(lang)}
              >
                {lang === 'javascript' ? 'JavaScript' : lang === 'python' ? 'Python' : 'PowerShell'}
              </button>
            ))}
          </div>

          <button
            className="execute-btn"
            onClick={handleExecute}
            disabled={!code.trim() || isExecuting}
          >
            <Play size={16} />
            {isExecuting ? 'Wird ausgefuehrt...' : 'Ausfuehren'}
          </button>
        </div>

        {/* Code Editor */}
        <div className="code-editor-wrapper">
          <textarea
            className="code-editor"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholders[language]}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />
          <div className="editor-hint">Strg+Enter zum Ausfuehren | Tab zum Einruecken</div>
        </div>

        {/* Output */}
        {result && (
          <div className={`output-area ${result.success ? 'success' : 'error'}`}>
            <div className="output-header">
              {result.success ? (
                <CheckCircle size={16} className="output-icon success" />
              ) : (
                <XCircle size={16} className="output-icon error" />
              )}
              <span className="output-title">
                {result.success ? 'Ausgabe' : 'Fehler'}
              </span>
              <span className="execution-time">
                <Clock size={12} />
                {result.executionTime}ms
              </span>
            </div>
            <pre className="output-content">
              {result.output || result.error || '(Keine Ausgabe)'}
            </pre>
          </div>
        )}

        {/* Security Note */}
        <div className="info-card">
          <h4><AlertTriangle size={16} /> Sicherheitshinweis</h4>
          <p>
            Code wird in einer eingeschraenkten Sandbox ausgefuehrt. Dateizugriffe,
            Netzwerkoperationen und gefaehrliche Systemaufrufe werden blockiert.
            Maximale Ausfuehrungszeit: JS 5s, Python 10s, PowerShell 15s.
          </p>
        </div>
      </div>

      <style>{`
        .code-executor-container {
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
          height: 100%;
          overflow-y: auto;
        }

        .code-executor-header {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .code-executor-header .header-icon {
          color: var(--accent-primary);
        }

        .code-executor-header h2 {
          font-size: 2rem;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary);
        }

        .code-executor-header .subtitle {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin: 0.25rem 0 0 0;
        }

        .code-executor-content {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .code-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .language-selector {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .language-selector label {
          color: var(--text-secondary);
          font-weight: 500;
          margin-right: 0.25rem;
        }

        .lang-btn {
          padding: 0.5rem 1rem;
          border: 1px solid var(--border-medium);
          border-radius: var(--radius-md);
          background: transparent;
          color: var(--text-secondary);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .lang-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .lang-btn.active {
          background: var(--accent-gradient);
          color: white;
          border-color: transparent;
        }

        .execute-btn {
          padding: 0.75rem 1.5rem;
          background: var(--accent-gradient);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .execute-btn:hover:not(:disabled) {
          box-shadow: 0 0 20px rgba(249, 171, 0, 0.4);
          transform: translateY(-2px);
        }

        .execute-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .code-editor-wrapper {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .code-editor {
          width: 100%;
          min-height: 240px;
          padding: 1.25rem;
          background: var(--bg-primary);
          color: var(--text-primary);
          border: none;
          font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
          font-size: 0.875rem;
          line-height: 1.6;
          resize: vertical;
          outline: none;
          tab-size: 2;
        }

        .code-editor::placeholder {
          color: var(--text-tertiary);
        }

        .editor-hint {
          padding: 0.5rem 1.25rem;
          font-size: 0.75rem;
          color: var(--text-tertiary);
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
        }

        .output-area {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .output-area.success {
          border-left: 4px solid #22c55e;
        }

        .output-area.error {
          border-left: 4px solid #ef4444;
        }

        .output-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
        }

        .output-icon.success {
          color: #22c55e;
        }

        .output-icon.error {
          color: #ef4444;
        }

        .output-title {
          font-weight: 600;
          color: var(--text-primary);
          flex: 1;
        }

        .execution-time {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          color: var(--text-tertiary);
        }

        .output-content {
          padding: 1.25rem;
          margin: 0;
          font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
          font-size: 0.85rem;
          line-height: 1.6;
          color: var(--text-primary);
          background: var(--bg-primary);
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 400px;
          overflow-y: auto;
        }

        .code-executor-container .info-card {
          background: var(--accent-light);
          border: 1px solid var(--accent-primary);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
        }

        .code-executor-container .info-card h4 {
          margin: 0 0 0.75rem 0;
          color: var(--accent-primary);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .code-executor-container .info-card p {
          margin: 0;
          color: var(--text-primary);
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
