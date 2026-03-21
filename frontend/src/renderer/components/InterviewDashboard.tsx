import { useEffect, useState } from 'react';
import { MessageSquare, CheckCircle, RefreshCw } from 'lucide-react';

interface InterviewQuestion {
    id: string;
    stage: string;
    text: string;
}

interface InterviewAnswer {
    questionId: string;
    answer: string;
    memoryId: string;
    createdAt: string;
}

interface InterviewData {
    questions: InterviewQuestion[];
    progress: {
        current: number;
        total: number;
        percentage: number;
    };
    answers: InterviewAnswer[];
}

export default function InterviewDashboard() {
    const [data, setData] = useState<InterviewData | null>(null);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/admin/interviews');
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (error) {
            console.error('Failed to load interview data', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="interview-dashboard loading">
                <RefreshCw className="spinning" size={32} />
                <p>Lade Interview-Daten...</p>
            </div>
        );
    }

    if (!data) return <div className="error">Konnte Daten nicht laden.</div>;

    // Group answers by stage for better visualization? 
    // Or just simple list. Let's do a simple list first.

    return (
        <div className="interview-dashboard">
            {/* Header with Progress */}
            <div className="dashboard-header">
                <div className="title-section">
                    <h3>
                        <MessageSquare size={24} />
                        Persönliches Interview
                    </h3>
                    <p>Fortschritt beim Kennenlernen</p>
                </div>

                <div className="progress-section">
                    <div className="progress-info">
                        <span>{data.progress.current} / {data.progress.total} Fragen beantwortet</span>
                        <strong>{data.progress.percentage}%</strong>
                    </div>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${data.progress.percentage}%` }}
                        />
                    </div>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* Left: Answered Questions (History) */}
                <div className="card history-card">
                    <h4>Gespeicherte Antworten</h4>
                    <div className="answer-list">
                        {data.answers.length === 0 ? (
                            <p className="empty-state">Noch keine Fragen beantwortet.</p>
                        ) : (
                            data.answers.map((ans) => {
                                const question = data.questions.find(q => q.id === ans.questionId);
                                return (
                                    <div key={ans.memoryId} className="answer-item">
                                        <div className="question-text">
                                            {question ? question.text : `Frage ID: ${ans.questionId}`}
                                        </div>
                                        <div className="answer-text">
                                            "{ans.answer}"
                                        </div>
                                        <div className="meta-info">
                                            {new Date(ans.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right: Interactive Form */}
                <div className="card form-card">
                    <h4>Offene Fragen beantworten</h4>
                    <p className="hint-text">Hier kannst du Fragen direkt beantworten. Neon lernt sofort daraus.</p>

                    <div className="question-list">
                        {data.questions.map((q) => {
                            // Find existing answer if any
                            const existingAnswer = data.answers.find(a => a.questionId === q.id);

                            return (
                                <QuestionInput
                                    key={q.id}
                                    question={q}
                                    existingAnswer={existingAnswer?.answer}
                                    onSave={() => loadData()} // Reload after save
                                />
                            );
                        })}

                        {data.progress.current === data.progress.total && (
                            <div className="complete-banner">
                                <CheckCircle size={24} color="#22c55e" />
                                <div>
                                    <strong>Alles erledigt!</strong>
                                    <p>Du hast alle Fragen beantwortet. Du kannst deine Antworten jederzeit bearbeiten.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                /* ... (keep existing styles) */
                .interview-dashboard {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .dashboard-header {
                    background: var(--bg-card);
                    padding: 1.5rem;
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border-subtle);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                /* ... */

                .form-card {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .hint-text {
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                    margin-top: -0.5rem;
                    margin-bottom: 1rem;
                }

                .question-input-item {
                    background: var(--bg-primary);
                    padding: 1rem;
                    border-radius: var(--radius-md);
                    border: 1px solid var(--border-subtle);
                    margin-bottom: 1rem;
                    transition: border-color 0.2s;
                }

                .question-input-item:focus-within {
                    border-color: var(--accent-primary);
                }

                .q-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 0.5rem;
                }

                .q-label {
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .q-stage {
                    font-size: 0.75rem;
                    color: var(--text-tertiary);
                    text-transform: uppercase;
                    background: var(--bg-secondary);
                    padding: 2px 6px;
                    border-radius: 4px;
                }

                textarea {
                    width: 100%;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-medium);
                    border-radius: var(--radius-sm);
                    color: var(--text-primary);
                    padding: 0.5rem;
                    min-height: 80px;
                    font-family: inherit;
                    resize: vertical;
                    margin-bottom: 0.5rem;
                }

                textarea:focus {
                    outline: none;
                    border-color: var(--accent-primary);
                }

                .btn-save {
                    background: var(--accent-primary);
                    color: white;
                    border: none;
                    padding: 0.4rem 1rem;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    font-size: 0.85rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-left: auto; /* Align right */
                }

                .btn-save:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .complete-banner {
                    display: flex;
                    gap: 1rem;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid #22c55e;
                    padding: 1rem;
                    border-radius: var(--radius-md);
                    align-items: center;
                }
            `}</style>
        </div>
    );
}

function QuestionInput({ question, existingAnswer, onSave }: { question: InterviewQuestion, existingAnswer?: string, onSave: () => void }) {
    const [answer, setAnswer] = useState(existingAnswer || '');
    const [saving, setSaving] = useState(false);

    // Update local state if prop changes (e.g. reload)
    useEffect(() => {
        setAnswer(existingAnswer || '');
    }, [existingAnswer]);

    const handleSave = async () => {
        if (!answer.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('http://localhost:3001/api/admin/interviews/answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questionId: question.id,
                    answer: answer
                })
            });

            if (res.ok) {
                onSave();
            } else {
                alert('Fehler beim Speichern');
            }
        } catch (error) {
            console.error(error);
            alert('Verbindungsfehler');
        } finally {
            setSaving(false);
        }
    };

    const isAnswered = !!existingAnswer;

    return (
        <div className={`question-input-item ${isAnswered ? 'answered' : ''}`}>
            <div className="q-header">
                <span className="q-label">{question.text}</span>
                <span className="q-stage">{question.stage}</span>
            </div>
            <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Deine Antwort..."
            />
            <button
                className="btn-save"
                onClick={handleSave}
                disabled={saving || !answer.trim() || answer === existingAnswer}
            >
                {saving ? <RefreshCw className="spinning" size={14} /> : <CheckCircle size={14} />}
                {isAnswered ? (answer === existingAnswer ? 'Gespeichert' : 'Aktualisieren') : 'Speichern'}
            </button>
        </div>
    );
}
