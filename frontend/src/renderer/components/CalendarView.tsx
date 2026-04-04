import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
    Plus, Trash2, Calendar, Clock, MapPin, ChevronLeft, ChevronRight,
    Pencil, Check, X
} from 'lucide-react';

const BACKEND_URL = window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : window.location.origin;

interface CalendarEvent {
    id: string;
    userId: string;
    title: string;
    description?: string;
    startDate: string;
    endDate: string;
    location?: string;
    category: string;
    color?: string;
    isAllDay: boolean;
    createdAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
    'Arbeit': '#4285f4',
    'Gesundheit': '#ea4335',
    'Sport': '#34a853',
    'Feier': '#ff6d01',
    'Bildung': '#9c27b0',
    'Erledigung': '#795548',
    'Freizeit': '#e91e63',
    'Persoenlich': '#00bcd4',
    'Allgemein': '#f9ab00',
};

export default function CalendarView() {
    const userId = useAppStore((state) => state.currentUser.id);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'list'>('month');
    const [showAddForm, setShowAddForm] = useState(false);
    const [filterCategory, setFilterCategory] = useState<string>('');
    const [categories, setCategories] = useState<string[]>([]);
    const [stats, setStats] = useState({ total: 0, today: 0, thisWeek: 0 });

    // Add form state
    const [newTitle, setNewTitle] = useState('');
    const [newDate, setNewDate] = useState('');
    const [newTime, setNewTime] = useState('');
    const [newEndTime, setNewEndTime] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [newIsAllDay, setNewIsAllDay] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDate, setEditDate] = useState('');
    const [editTime, setEditTime] = useState('');
    const [editLocation, setEditLocation] = useState('');

    const fetchEvents = useCallback(async () => {
        try {
            const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
            const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59);
            const params = new URLSearchParams({
                startDate: startOfMonth.toISOString(),
                endDate: endOfMonth.toISOString(),
            });
            const res = await fetch(`${BACKEND_URL}/api/calendar/${userId}/range?${params}`);
            if (res.ok) {
                let data = await res.json();
                if (filterCategory) data = data.filter((e: CalendarEvent) => e.category === filterCategory);
                setEvents(data);
            }
        } catch (err) {
            console.error('Failed to fetch events:', err);
        }
    }, [userId, selectedDate, filterCategory]);

    const fetchMeta = useCallback(async () => {
        try {
            const [catRes, statsRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/calendar/${userId}/categories`),
                fetch(`${BACKEND_URL}/api/calendar/${userId}/stats`),
            ]);
            if (catRes.ok) setCategories(await catRes.json());
            if (statsRes.ok) setStats(await statsRes.json());
        } catch (err) {
            console.error('Failed to fetch meta:', err);
        }
    }, [userId]);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);
    useEffect(() => { fetchMeta(); }, [fetchMeta]);

    const addEvent = async () => {
        if (!newTitle.trim()) return;
        const dateStr = newDate || new Date().toISOString().split('T')[0];
        const startDate = newIsAllDay
            ? `${dateStr}T00:00:00`
            : `${dateStr}T${newTime || '12:00'}:00`;
        const endDate = newIsAllDay
            ? `${dateStr}T23:59:59`
            : newEndTime ? `${dateStr}T${newEndTime}:00` : new Date(new Date(startDate).getTime() + 3600000).toISOString();

        try {
            const res = await fetch(`${BACKEND_URL}/api/calendar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId, title: newTitle.trim(), startDate, endDate,
                    location: newLocation || undefined,
                    category: newCategory || undefined,
                    isAllDay: newIsAllDay,
                }),
            });
            if (res.ok) {
                resetForm();
                fetchEvents();
                fetchMeta();
            }
        } catch (err) {
            console.error('Failed to add event:', err);
        }
    };

    const deleteEvent = async (id: string) => {
        try {
            await fetch(`${BACKEND_URL}/api/calendar/${id}`, { method: 'DELETE' });
            fetchEvents();
            fetchMeta();
        } catch (err) {
            console.error('Failed to delete event:', err);
        }
    };

    const startEdit = (e: CalendarEvent) => {
        setEditingId(e.id);
        setEditTitle(e.title);
        setEditDate(new Date(e.startDate).toISOString().split('T')[0]);
        setEditTime(new Date(e.startDate).toTimeString().slice(0, 5));
        setEditLocation(e.location || '');
    };

    const saveEdit = async () => {
        if (!editingId || !editTitle.trim()) return;
        try {
            const startDate = `${editDate}T${editTime}:00`;
            const endDate = new Date(new Date(startDate).getTime() + 3600000).toISOString();
            await fetch(`${BACKEND_URL}/api/calendar/${editingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: editTitle.trim(),
                    startDate,
                    endDate,
                    location: editLocation || null,
                }),
            });
            setEditingId(null);
            fetchEvents();
        } catch (err) {
            console.error('Failed to update event:', err);
        }
    };

    const resetForm = () => {
        setNewTitle(''); setNewDate(''); setNewTime(''); setNewEndTime('');
        setNewLocation(''); setNewCategory(''); setNewIsAllDay(false);
        setShowAddForm(false);
    };

    // Calendar grid helpers
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7; // Monday = 0
    const totalDays = lastDay.getDate();

    const prevMonth = () => setSelectedDate(new Date(year, month - 1, 1));
    const nextMonth = () => setSelectedDate(new Date(year, month + 1, 1));
    const goToday = () => setSelectedDate(new Date());

    const getEventsForDay = (day: number) => {
        return events.filter(e => {
            const d = new Date(e.startDate);
            return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
        });
    };

    const isToday = (day: number) => {
        const now = new Date();
        return day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
    };

    const monthName = selectedDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <Calendar size={24} style={{ color: 'var(--accent-primary)' }} />
                    <h2 style={styles.title}>Kalender</h2>
                </div>
                <div style={styles.headerRight}>
                    <div style={styles.statsRow}>
                        <span style={styles.stat}>{stats.today} heute</span>
                        <span style={styles.statDivider}>|</span>
                        <span style={styles.stat}>{stats.thisWeek} diese Woche</span>
                        <span style={styles.statDivider}>|</span>
                        <span style={styles.stat}>{stats.total} gesamt</span>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div style={styles.toolbar}>
                <div style={styles.toolbarLeft}>
                    <button style={styles.navBtn} onClick={prevMonth}><ChevronLeft size={18} /></button>
                    <button style={styles.todayBtn} onClick={goToday}>Heute</button>
                    <button style={styles.navBtn} onClick={nextMonth}><ChevronRight size={18} /></button>
                    <span style={styles.monthLabel}>{monthName}</span>
                </div>
                <div style={styles.toolbarRight}>
                    {categories.length > 0 && (
                        <select
                            style={styles.filterSelect}
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                        >
                            <option value="">Alle Kategorien</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    )}
                    <button
                        style={{ ...styles.viewToggle, ...(viewMode === 'month' ? styles.viewToggleActive : {}) }}
                        onClick={() => setViewMode('month')}
                    >Monat</button>
                    <button
                        style={{ ...styles.viewToggle, ...(viewMode === 'list' ? styles.viewToggleActive : {}) }}
                        onClick={() => setViewMode('list')}
                    >Liste</button>
                    <button style={styles.addBtn} onClick={() => setShowAddForm(!showAddForm)}>
                        <Plus size={16} />
                        <span>Termin</span>
                    </button>
                </div>
            </div>

            {/* Add Form */}
            {showAddForm && (
                <div style={styles.addForm}>
                    <input
                        style={styles.input}
                        placeholder="Terminname..."
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addEvent()}
                        autoFocus
                    />
                    <div style={styles.formRow}>
                        <input
                            style={styles.inputSmall}
                            type="date"
                            value={newDate}
                            onChange={(e) => setNewDate(e.target.value)}
                        />
                        {!newIsAllDay && (
                            <>
                                <input
                                    style={styles.inputSmall}
                                    type="time"
                                    value={newTime}
                                    onChange={(e) => setNewTime(e.target.value)}
                                    placeholder="Start"
                                />
                                <span style={{ color: 'var(--text-tertiary)' }}>bis</span>
                                <input
                                    style={styles.inputSmall}
                                    type="time"
                                    value={newEndTime}
                                    onChange={(e) => setNewEndTime(e.target.value)}
                                    placeholder="Ende"
                                />
                            </>
                        )}
                        <label style={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={newIsAllDay}
                                onChange={(e) => setNewIsAllDay(e.target.checked)}
                            />
                            <span>Ganztaegig</span>
                        </label>
                    </div>
                    <div style={styles.formRow}>
                        <input
                            style={styles.inputSmall}
                            placeholder="Ort (optional)"
                            value={newLocation}
                            onChange={(e) => setNewLocation(e.target.value)}
                        />
                        <select
                            style={styles.inputSmall}
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                        >
                            <option value="">Auto-Kategorie</option>
                            {Object.keys(CATEGORY_COLORS).map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <button style={styles.saveBtn} onClick={addEvent}>
                            <Check size={14} /> Speichern
                        </button>
                        <button style={styles.cancelBtn} onClick={resetForm}>
                            <X size={14} /> Abbrechen
                        </button>
                    </div>
                </div>
            )}

            {/* Month View */}
            {viewMode === 'month' && (
                <div style={styles.calendarGrid}>
                    {/* Day headers */}
                    {dayNames.map(d => (
                        <div key={d} style={styles.dayHeader}>{d}</div>
                    ))}
                    {/* Empty cells for padding */}
                    {Array.from({ length: startPad }).map((_, i) => (
                        <div key={`pad-${i}`} style={styles.dayCell} />
                    ))}
                    {/* Day cells */}
                    {Array.from({ length: totalDays }).map((_, i) => {
                        const day = i + 1;
                        const dayEvents = getEventsForDay(day);
                        const today = isToday(day);
                        return (
                            <div
                                key={day}
                                style={{
                                    ...styles.dayCell,
                                    ...(today ? styles.todayCell : {}),
                                }}
                            >
                                <span style={{
                                    ...styles.dayNumber,
                                    ...(today ? styles.todayNumber : {}),
                                }}>{day}</span>
                                <div style={styles.dayEvents}>
                                    {dayEvents.slice(0, 3).map(ev => (
                                        <div
                                            key={ev.id}
                                            style={{
                                                ...styles.eventDot,
                                                backgroundColor: ev.color || CATEGORY_COLORS[ev.category] || '#f9ab00',
                                            }}
                                            title={`${formatTime(ev.startDate)} ${ev.title}`}
                                        >
                                            <span style={styles.eventDotText}>
                                                {ev.isAllDay ? '' : formatTime(ev.startDate) + ' '}{ev.title}
                                            </span>
                                        </div>
                                    ))}
                                    {dayEvents.length > 3 && (
                                        <span style={styles.moreEvents}>+{dayEvents.length - 3}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
                <div style={styles.listContainer}>
                    {events.length === 0 ? (
                        <div style={styles.empty}>
                            <Calendar size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
                            <p>Keine Termine in diesem Monat</p>
                        </div>
                    ) : (
                        events.map(ev => (
                            <div key={ev.id} style={styles.listItem}>
                                <div
                                    style={{
                                        ...styles.colorBar,
                                        backgroundColor: ev.color || CATEGORY_COLORS[ev.category] || '#f9ab00',
                                    }}
                                />
                                {editingId === ev.id ? (
                                    <div style={styles.editRow}>
                                        <input style={styles.editInput} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }} autoFocus />
                                        <input style={styles.editInputSmall} type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                                        <input style={styles.editInputSmall} type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                                        <input style={styles.editInput} placeholder="Ort" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} />
                                        <button style={styles.editSaveBtn} onClick={saveEdit}><Check size={14} /></button>
                                        <button style={styles.editCancelBtn} onClick={() => setEditingId(null)}><X size={14} /></button>
                                    </div>
                                ) : (
                                    <div style={styles.listItemContent}>
                                        <div style={styles.listItemMain}>
                                            <span style={styles.eventTitle}>{ev.title}</span>
                                            <span style={styles.eventCategory}>{ev.category}</span>
                                        </div>
                                        <div style={styles.listItemMeta}>
                                            <span style={styles.eventDate}>
                                                <Calendar size={12} /> {formatDate(ev.startDate)}
                                            </span>
                                            <span style={styles.eventTime}>
                                                <Clock size={12} /> {ev.isAllDay ? 'Ganztaegig' : `${formatTime(ev.startDate)} - ${formatTime(ev.endDate)}`}
                                            </span>
                                            {ev.location && (
                                                <span style={styles.eventLocation}>
                                                    <MapPin size={12} /> {ev.location}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {editingId !== ev.id && (
                                    <div style={styles.actionBtns}>
                                        <button style={styles.editBtn} onClick={() => startEdit(ev)} title="Bearbeiten">
                                            <Pencil size={14} />
                                        </button>
                                        <button style={styles.deleteBtn} onClick={() => deleteEvent(ev.id)} title="Loeschen">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        maxWidth: 960,
        margin: '0 auto',
        padding: '2rem 1.5rem',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },
    headerRight: {},
    title: {
        fontSize: '1.5rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        margin: 0,
    },
    statsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
    },
    stat: {},
    statDivider: { color: 'var(--border-subtle)' },
    toolbar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        flexWrap: 'wrap' as const,
        gap: 8,
    },
    toolbarLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    toolbarRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap' as const,
    },
    navBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
    },
    todayBtn: {
        padding: '4px 12px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '0.8rem',
    },
    monthLabel: {
        fontSize: '1.1rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginLeft: 8,
    },
    filterSelect: {
        padding: '4px 8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize: '0.8rem',
    },
    viewToggle: {
        padding: '4px 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: 'transparent',
        color: 'var(--text-tertiary)',
        cursor: 'pointer',
        fontSize: '0.8rem',
    },
    viewToggleActive: {
        background: 'rgba(249, 171, 0, 0.1)',
        borderColor: 'var(--accent-primary)',
        color: 'var(--accent-primary)',
    },
    addBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 14px',
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: 'var(--accent-primary)',
        color: '#000',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '0.85rem',
    },
    addForm: {
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '1rem',
        marginBottom: '1rem',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 10,
    },
    input: {
        padding: '8px 12px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '0.9rem',
        width: '100%',
    },
    formRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap' as const,
    },
    inputSmall: {
        padding: '6px 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '0.85rem',
        flex: '1 1 auto',
        minWidth: 120,
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        color: 'var(--text-secondary)',
        fontSize: '0.85rem',
        cursor: 'pointer',
    },
    saveBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 14px',
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: 'var(--accent-primary)',
        color: '#000',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '0.85rem',
    },
    cancelBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 14px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '0.85rem',
    },
    // Calendar Grid
    calendarGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 1,
        background: 'var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
    },
    dayHeader: {
        padding: '8px 4px',
        textAlign: 'center' as const,
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        background: 'var(--bg-secondary)',
        textTransform: 'uppercase' as const,
    },
    dayCell: {
        minHeight: 90,
        padding: '4px 6px',
        background: 'var(--bg-primary)',
        position: 'relative' as const,
    },
    todayCell: {
        background: 'rgba(249, 171, 0, 0.04)',
    },
    dayNumber: {
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        fontWeight: 500,
    },
    todayNumber: {
        color: '#000',
        background: 'var(--accent-primary)',
        borderRadius: '50%',
        width: 22,
        height: 22,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '0.75rem',
    },
    dayEvents: {
        marginTop: 2,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 1,
    },
    eventDot: {
        borderRadius: 3,
        padding: '1px 4px',
        overflow: 'hidden',
    },
    eventDotText: {
        fontSize: '0.65rem',
        color: '#fff',
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'block',
    },
    moreEvents: {
        fontSize: '0.65rem',
        color: 'var(--text-tertiary)',
        textAlign: 'center' as const,
    },
    // List View
    listContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 6,
    },
    listItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
    },
    colorBar: {
        width: 4,
        height: 40,
        borderRadius: 2,
        flexShrink: 0,
    },
    listItemContent: {
        flex: 1,
        minWidth: 0,
    },
    listItemMain: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 2,
    },
    eventTitle: {
        fontSize: '0.95rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
    },
    eventCategory: {
        fontSize: '0.7rem',
        padding: '1px 6px',
        borderRadius: 10,
        background: 'rgba(249, 171, 0, 0.12)',
        color: 'var(--accent-primary)',
    },
    listItemMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: '0.8rem',
        color: 'var(--text-tertiary)',
    },
    eventDate: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
    },
    eventTime: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
    },
    eventLocation: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
    },
    actionBtns: {
        display: 'flex',
        gap: 4,
        flexShrink: 0,
    },
    editBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: 'transparent',
        color: 'var(--text-tertiary)',
        cursor: 'pointer',
    },
    deleteBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid rgba(234, 67, 53, 0.3)',
        background: 'transparent',
        color: '#ea4335',
        cursor: 'pointer',
    },
    empty: {
        textAlign: 'center' as const,
        padding: '3rem',
        color: 'var(--text-tertiary)',
    },
    editRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flex: 1,
    },
    editInput: {
        padding: '4px 8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--accent-primary)',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '0.85rem',
        flex: 1,
    },
    editInputSmall: {
        padding: '4px 6px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--accent-primary)',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '0.8rem',
        width: 120,
    },
    editSaveBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: 'var(--accent-primary)',
        color: '#000',
        cursor: 'pointer',
    },
    editCancelBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: 'transparent',
        color: 'var(--text-tertiary)',
        cursor: 'pointer',
    },
};
