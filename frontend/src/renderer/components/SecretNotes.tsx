import { useState, useEffect } from 'react';
import { Lock, Plus, Trash2, Eye, EyeOff, Shield } from 'lucide-react';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  locked: boolean;
}

export default function SecretNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [pin, setPin] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const STORAGE_KEY = 'neon-secret-notes';
  const PIN_KEY = 'neon-notes-pin';

  useEffect(() => {
    const savedPin = localStorage.getItem(PIN_KEY);
    if (!savedPin) {
      // First time: set default pin
      localStorage.setItem(PIN_KEY, btoa('1234'));
    }
  }, []);

  const unlock = () => {
    const savedPin = localStorage.getItem(PIN_KEY);
    if (savedPin && btoa(pin) === savedPin) {
      setIsUnlocked(true);
      loadNotes();
    } else {
      alert('Falscher PIN!');
    }
    setPin('');
  };

  const loadNotes = () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        // Simple decode
        const decoded = atob(data);
        setNotes(JSON.parse(decoded));
      }
    } catch {
      setNotes([]);
    }
  };

  const saveNotes = (updated: Note[]) => {
    setNotes(updated);
    localStorage.setItem(STORAGE_KEY, btoa(JSON.stringify(updated)));
  };

  const createNote = () => {
    if (!editTitle.trim()) return;
    const newNote: Note = {
      id: Date.now().toString(),
      title: editTitle,
      content: editContent,
      createdAt: new Date().toISOString(),
      locked: true,
    };
    saveNotes([newNote, ...notes]);
    setIsCreating(false);
    setEditTitle('');
    setEditContent('');
    setSelectedNote(newNote.id);
  };

  const updateNote = (id: string) => {
    saveNotes(notes.map(n => n.id === id ? { ...n, title: editTitle, content: editContent } : n));
  };

  const deleteNote = (id: string) => {
    if (confirm('Notiz wirklich loeschen?')) {
      saveNotes(notes.filter(n => n.id !== id));
      if (selectedNote === id) {
        setSelectedNote(null);
        setEditTitle('');
        setEditContent('');
      }
    }
  };

  const selectNote = (note: Note) => {
    setSelectedNote(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setIsCreating(false);
  };

  const changePin = () => {
    const newPin = prompt('Neuer PIN (4 Ziffern):');
    if (newPin && /^\d{4}$/.test(newPin)) {
      localStorage.setItem(PIN_KEY, btoa(newPin));
      alert('PIN geaendert!');
    } else if (newPin) {
      alert('PIN muss 4 Ziffern sein!');
    }
  };

  // Lock Screen
  if (!isUnlocked) {
    return (
      <div style={styles.lockScreen}>
        <div style={styles.lockCard}>
          <div style={styles.lockIconWrap}>
            <Lock size={40} color="var(--accent-primary)" />
          </div>
          <h2 style={{ color: 'var(--text-primary)', margin: '16px 0 8px', fontSize: '20px' }}>Geheime Notizen</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 20px' }}>
            Gib deinen PIN ein um deine privaten Notizen zu oeffnen
          </p>
          <div style={styles.pinRow}>
            <input
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => e.key === 'Enter' && unlock()}
              placeholder="PIN"
              style={styles.pinInput}
              maxLength={4}
              autoFocus
            />
            <button style={styles.pinEyeBtn} onClick={() => setShowPin(!showPin)}>
              {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button style={styles.unlockBtn} onClick={unlock}>
            <Shield size={16} /> Entsperren
          </button>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '16px' }}>
            Standard-PIN: 1234 (aenderbar nach Entsperren)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.notesSidebar}>
        <div style={styles.sidebarHeader}>
          <Lock size={18} color="var(--accent-primary)" />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>Geheime Notizen</span>
        </div>

        <button style={styles.newNoteBtn} onClick={() => { setIsCreating(true); setSelectedNote(null); setEditTitle(''); setEditContent(''); }}>
          <Plus size={16} /> Neue Notiz
        </button>

        <div style={styles.notesList}>
          {notes.map(note => (
            <button
              key={note.id}
              style={{ ...styles.noteItem, ...(selectedNote === note.id ? styles.noteItemActive : {}) }}
              onClick={() => selectNote(note)}
            >
              <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-primary)' }}>{note.title}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                {new Date(note.createdAt).toLocaleDateString('de-DE')}
              </div>
            </button>
          ))}
          {notes.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
              Noch keine Notizen
            </div>
          )}
        </div>

        <div style={styles.sidebarFooter}>
          <button style={styles.changePinBtn} onClick={changePin}>PIN aendern</button>
          <button style={styles.lockBtn} onClick={() => { setIsUnlocked(false); setNotes([]); setSelectedNote(null); }}>
            <Lock size={14} /> Sperren
          </button>
        </div>
      </div>

      {/* Editor */}
      <div style={styles.editor}>
        {isCreating || selectedNote ? (
          <>
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="Titel der Notiz..."
              style={styles.editorTitle}
              autoFocus={isCreating}
            />
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder="Schreibe deine geheimen Gedanken hier..."
              style={styles.editorContent}
            />
            <div style={styles.editorFooter}>
              {isCreating ? (
                <button style={styles.saveBtn} onClick={createNote}>
                  <Plus size={14} /> Erstellen
                </button>
              ) : (
                <>
                  <button style={styles.saveBtn} onClick={() => selectedNote && updateNote(selectedNote)}>
                    Speichern
                  </button>
                  <button style={styles.deleteBtn} onClick={() => selectedNote && deleteNote(selectedNote)}>
                    <Trash2 size={14} /> Loeschen
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div style={styles.emptyEditor}>
            <Lock size={32} color="var(--text-tertiary)" />
            <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Waehle eine Notiz aus oder erstelle eine neue</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  lockScreen: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  lockCard: { textAlign: 'center', padding: '40px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '20px', maxWidth: '340px' },
  lockIconWrap: { width: 72, height: 72, borderRadius: '50%', background: 'rgba(245,166,35,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' },
  pinRow: { display: 'flex', gap: '8px', justifyContent: 'center' },
  pinInput: { width: '120px', textAlign: 'center' as const, padding: '10px', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '20px', letterSpacing: '8px', outline: 'none' },
  pinEyeBtn: { padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: 'var(--text-secondary)', cursor: 'pointer' },
  unlockBtn: { display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', width: '100%', padding: '10px', background: 'var(--accent-primary)', color: '#000', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', marginTop: '12px' },
  container: { display: 'flex', height: '100%', overflow: 'hidden' },
  notesSidebar: { width: '260px', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' },
  sidebarHeader: { display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 16px 12px', borderBottom: '1px solid var(--border-subtle)' },
  newNoteBtn: { display: 'flex', alignItems: 'center', gap: '6px', margin: '12px 12px 8px', padding: '8px 12px', background: 'var(--accent-primary)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' },
  notesList: { flex: 1, overflowY: 'auto' as const, padding: '4px 8px' },
  noteItem: { width: '100%', textAlign: 'left' as const, padding: '10px 12px', background: 'transparent', border: '1px solid transparent', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px', display: 'block' },
  noteItemActive: { background: 'rgba(245,166,35,0.1)', borderColor: 'rgba(245,166,35,0.3)' },
  sidebarFooter: { display: 'flex', gap: '8px', padding: '12px', borderTop: '1px solid var(--border-subtle)' },
  changePinBtn: { flex: 1, padding: '6px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' },
  lockBtn: { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' },
  editor: { flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' },
  editorTitle: { fontSize: '20px', fontWeight: 700, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', marginBottom: '12px' },
  editorContent: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.7, resize: 'none' as const, padding: '8px 0' },
  editorFooter: { display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' },
  saveBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--accent-primary)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' },
  deleteBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'transparent', color: '#ef4444', border: '1px solid #ef444440', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' },
  emptyEditor: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' },
};
