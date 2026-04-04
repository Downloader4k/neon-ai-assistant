import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
    Plus, Trash2, ShoppingCart, ListTodo,
    Filter, Store, Tag, AlertTriangle,
    CheckCircle2, Circle, Clock, Pencil, Check, X
} from 'lucide-react';

// Backend URL
const BACKEND_URL = window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : window.location.origin;

interface TodoItem {
    id: string;
    userId: string;
    title: string;
    description?: string;
    category: string;
    priority: string;
    status: string;
    dueDate?: string;
    completedAt?: string;
    createdAt: string;
}

interface ShoppingItem {
    id: string;
    userId: string;
    name: string;
    quantity?: string;
    category: string;
    store?: string;
    isPurchased: boolean;
    createdAt: string;
}

interface TodoStats {
    total: number;
    open: number;
    done: number;
    overdue: number;
}

type TabMode = 'todos' | 'shopping';

const priorityColors: Record<string, string> = {
    urgent: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
};

const priorityLabels: Record<string, string> = {
    urgent: 'Dringend',
    high: 'Hoch',
    medium: 'Mittel',
    low: 'Niedrig',
};

export default function ListManager() {
    const currentUser = useAppStore((s) => s.currentUser);
    const [tab, setTab] = useState<TabMode>('todos');

    // --- Todo State ---
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [todoStats, setTodoStats] = useState<TodoStats>({ total: 0, open: 0, done: 0, overdue: 0 });
    const [todoFilter, setTodoFilter] = useState<'open' | 'done' | 'all'>('open');
    const [newTodoTitle, setNewTodoTitle] = useState('');
    const [todoCategories, setTodoCategories] = useState<string[]>([]);
    const [selectedTodoCategory, setSelectedTodoCategory] = useState<string>('');

    // --- Shopping State ---
    const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
    const [newItemText, setNewItemText] = useState('');
    const [shoppingFilter, setShoppingFilter] = useState<'pending' | 'purchased' | 'all'>('pending');
    const [selectedStore, setSelectedStore] = useState<string>('');
    const [stores, setStores] = useState<string[]>([]);
    const [shoppingCategories, setShoppingCategories] = useState<string[]>([]);
    const [groupBy, setGroupBy] = useState<'category' | 'store'>('category');

    // --- Edit State ---
    const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
    const [editTodoTitle, setEditTodoTitle] = useState('');
    const [editingShoppingId, setEditingShoppingId] = useState<string | null>(null);
    const [editShoppingName, setEditShoppingName] = useState('');
    const [editShoppingQuantity, setEditShoppingQuantity] = useState('');
    const [editShoppingStore, setEditShoppingStore] = useState('');

    const [loading, setLoading] = useState(false);

    // --- Fetch Helpers ---
    const apiFetch = useCallback(async (path: string, options?: RequestInit) => {
        const res = await fetch(`${BACKEND_URL}/api${path}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    }, []);

    // --- Load Todos (load all, filter client-side for reliability) ---
    const loadTodos = useCallback(async () => {
        try {
            const [allItems, stats, cats] = await Promise.all([
                apiFetch(`/todos/${currentUser.id}`),
                apiFetch(`/todos/${currentUser.id}/stats`),
                apiFetch(`/todos/${currentUser.id}/categories`),
            ]);

            // Client-side filtering
            let filtered = allItems;
            if (todoFilter === 'open') filtered = allItems.filter((t: TodoItem) => t.status !== 'done');
            else if (todoFilter === 'done') filtered = allItems.filter((t: TodoItem) => t.status === 'done');
            if (selectedTodoCategory) filtered = filtered.filter((t: TodoItem) => t.category === selectedTodoCategory);

            setTodos(filtered);
            setTodoStats(stats);
            setTodoCategories(cats);
        } catch (err) {
            console.error('Failed to load todos', err);
        }
    }, [currentUser.id, todoFilter, selectedTodoCategory, apiFetch]);

    // --- Load Shopping (load all, filter client-side) ---
    const loadShopping = useCallback(async () => {
        try {
            const [allItems, storeList, catList] = await Promise.all([
                apiFetch(`/shopping/${currentUser.id}`),
                apiFetch(`/shopping/${currentUser.id}/stores`),
                apiFetch(`/shopping/${currentUser.id}/categories`),
            ]);

            // Client-side filtering
            let filtered = allItems;
            if (shoppingFilter === 'pending') filtered = allItems.filter((i: ShoppingItem) => !i.isPurchased);
            else if (shoppingFilter === 'purchased') filtered = allItems.filter((i: ShoppingItem) => i.isPurchased);
            if (selectedStore) filtered = filtered.filter((i: ShoppingItem) => i.store === selectedStore);

            setShoppingItems(filtered);
            setStores(storeList);
            setShoppingCategories(catList);
        } catch (err) {
            console.error('Failed to load shopping', err);
        }
    }, [currentUser.id, shoppingFilter, selectedStore, apiFetch]);

    // Initial load
    useEffect(() => {
        if (tab === 'todos') loadTodos();
        else loadShopping();
    }, [tab, loadTodos, loadShopping]);

    // --- Todo Actions ---
    const addTodo = async () => {
        if (!newTodoTitle.trim()) return;
        setLoading(true);
        try {
            await apiFetch('/todos', {
                method: 'POST',
                body: JSON.stringify({
                    userId: currentUser.id,
                    title: newTodoTitle.trim(),
                    autoCategories: true,
                }),
            });
            setNewTodoTitle('');
            await loadTodos();
        } catch (err) {
            console.error('Failed to add todo', err);
        }
        setLoading(false);
    };

    const completeTodo = async (id: string) => {
        try {
            await apiFetch(`/todos/${id}/complete`, { method: 'PATCH' });
            await loadTodos();
        } catch (err) {
            console.error('Failed to complete todo', err);
        }
    };

    const reopenTodo = async (id: string) => {
        try {
            await apiFetch(`/todos/${id}/reopen`, { method: 'PATCH' });
            await loadTodos();
        } catch (err) {
            console.error('Failed to reopen todo', err);
        }
    };

    const deleteTodo = async (id: string) => {
        try {
            await apiFetch(`/todos/${id}`, { method: 'DELETE' });
            await loadTodos();
        } catch (err) {
            console.error('Failed to delete todo', err);
        }
    };

    // --- Todo Edit ---
    const startEditTodo = (todo: TodoItem) => {
        setEditingTodoId(todo.id);
        setEditTodoTitle(todo.title);
    };

    const saveEditTodo = async () => {
        if (!editingTodoId || !editTodoTitle.trim()) return;
        try {
            await apiFetch(`/todos/${editingTodoId}`, {
                method: 'PATCH',
                body: JSON.stringify({ title: editTodoTitle.trim() }),
            });
            setEditingTodoId(null);
            await loadTodos();
        } catch (err) {
            console.error('Failed to edit todo', err);
        }
    };

    const cancelEditTodo = () => {
        setEditingTodoId(null);
        setEditTodoTitle('');
    };

    // --- Shopping Edit ---
    const startEditShopping = (item: ShoppingItem) => {
        setEditingShoppingId(item.id);
        setEditShoppingName(item.name);
        setEditShoppingQuantity(item.quantity || '');
        setEditShoppingStore(item.store || '');
    };

    const saveEditShopping = async () => {
        if (!editingShoppingId || !editShoppingName.trim()) return;
        try {
            await apiFetch(`/shopping/item/${editingShoppingId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: editShoppingName.trim(),
                    quantity: editShoppingQuantity.trim() || null,
                    store: editShoppingStore.trim() || undefined,
                }),
            });
            setEditingShoppingId(null);
            await loadShopping();
        } catch (err) {
            console.error('Failed to edit shopping item', err);
        }
    };

    const cancelEditShopping = () => {
        setEditingShoppingId(null);
    };

    // --- Shopping Actions ---
    const addShoppingItems = async () => {
        if (!newItemText.trim()) return;
        setLoading(true);
        try {
            const items = newItemText.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
            await apiFetch('/shopping/items', {
                method: 'POST',
                body: JSON.stringify({ userId: currentUser.id, items }),
            });
            setNewItemText('');
            await loadShopping();
        } catch (err) {
            console.error('Failed to add shopping items', err);
        }
        setLoading(false);
    };

    const togglePurchased = async (id: string) => {
        try {
            await apiFetch(`/shopping/item/${id}/toggle`, { method: 'PATCH' });
            await loadShopping();
        } catch (err) {
            console.error('Failed to toggle item', err);
        }
    };

    const deleteShoppingItem = async (id: string) => {
        try {
            await apiFetch(`/shopping/item/${id}`, { method: 'DELETE' });
            await loadShopping();
        } catch (err) {
            console.error('Failed to delete item', err);
        }
    };

    const clearPurchased = async () => {
        try {
            await apiFetch(`/shopping/${currentUser.id}/purchased`, { method: 'DELETE' });
            await loadShopping();
        } catch (err) {
            console.error('Failed to clear purchased', err);
        }
    };

    // --- Group shopping by category or store ---
    const groupedShopping = shoppingItems.reduce<Record<string, ShoppingItem[]>>((acc, item) => {
        const key = groupBy === 'store'
            ? (item.store || 'Kein Laden zugewiesen')
            : (item.category || 'Sonstiges');
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <h1 style={styles.title}>Listen & Aufgaben</h1>
                <p style={styles.subtitle}>Todos und Einkaufslisten - KI-verwaltet</p>
            </div>

            {/* Tab Switcher */}
            <div style={styles.tabBar}>
                <button
                    style={{ ...styles.tabBtn, ...(tab === 'todos' ? styles.tabActive : {}) }}
                    onClick={() => setTab('todos')}
                >
                    <ListTodo size={18} />
                    <span>Todos</span>
                    {todoStats.open > 0 && (
                        <span style={styles.badge}>{todoStats.open}</span>
                    )}
                </button>
                <button
                    style={{ ...styles.tabBtn, ...(tab === 'shopping' ? styles.tabActive : {}) }}
                    onClick={() => setTab('shopping')}
                >
                    <ShoppingCart size={18} />
                    <span>Einkaufsliste</span>
                    {shoppingItems.filter(i => !i.isPurchased).length > 0 && (
                        <span style={styles.badge}>{shoppingItems.filter(i => !i.isPurchased).length}</span>
                    )}
                </button>
            </div>

            {/* Content */}
            <div style={styles.content}>
                {tab === 'todos' ? (
                    /* ===== TODOS TAB ===== */
                    <>
                        {/* Stats Bar */}
                        <div style={styles.statsBar}>
                            <div style={styles.statItem}>
                                <Circle size={14} color="#eab308" />
                                <span>{todoStats.open} Offen</span>
                            </div>
                            <div style={styles.statItem}>
                                <CheckCircle2 size={14} color="#22c55e" />
                                <span>{todoStats.done} Erledigt</span>
                            </div>
                            {todoStats.overdue > 0 && (
                                <div style={{ ...styles.statItem, color: '#ef4444' }}>
                                    <AlertTriangle size={14} />
                                    <span>{todoStats.overdue} Ueberfaellig</span>
                                </div>
                            )}
                        </div>

                        {/* Add Todo */}
                        <div style={styles.inputRow}>
                            <input
                                style={styles.input}
                                placeholder="Neues Todo eingeben... (z.B. Arzt anrufen)"
                                value={newTodoTitle}
                                onChange={(e) => setNewTodoTitle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                                disabled={loading}
                            />
                            <button style={styles.addBtn} onClick={addTodo} disabled={loading || !newTodoTitle.trim()}>
                                <Plus size={18} />
                            </button>
                        </div>

                        {/* Filters */}
                        <div style={styles.filterRow}>
                            <div style={styles.filterGroup}>
                                <Filter size={14} />
                                {(['open', 'done', 'all'] as const).map((f) => (
                                    <button
                                        key={f}
                                        style={{ ...styles.filterBtn, ...(todoFilter === f ? styles.filterActive : {}) }}
                                        onClick={() => setTodoFilter(f)}
                                    >
                                        {f === 'open' ? 'Offen' : f === 'done' ? 'Erledigt' : 'Alle'}
                                    </button>
                                ))}
                            </div>
                            {todoCategories.length > 0 && (
                                <select
                                    style={styles.select}
                                    value={selectedTodoCategory}
                                    onChange={(e) => setSelectedTodoCategory(e.target.value)}
                                >
                                    <option value="">Alle Kategorien</option>
                                    {todoCategories.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Todo List */}
                        <div style={styles.list}>
                            {todos.length === 0 ? (
                                <div style={styles.empty}>
                                    <ListTodo size={48} strokeWidth={1} />
                                    <p>Keine Todos gefunden</p>
                                    <p style={styles.emptyHint}>
                                        Erstelle ein neues Todo oben oder schreib im Chat: <br />
                                        <code style={styles.code}>/todo Arzt anrufen</code>
                                    </p>
                                </div>
                            ) : (
                                todos.map((todo) => (
                                    <div key={todo.id} style={{
                                        ...styles.todoItem,
                                        opacity: todo.status === 'done' ? 0.6 : 1,
                                    }}>
                                        <button
                                            style={styles.checkBtn}
                                            onClick={() => todo.status === 'done' ? reopenTodo(todo.id) : completeTodo(todo.id)}
                                            title={todo.status === 'done' ? 'Wieder oeffnen' : 'Als erledigt markieren'}
                                        >
                                            {todo.status === 'done' ? (
                                                <CheckCircle2 size={20} color="#22c55e" />
                                            ) : (
                                                <Circle size={20} color="var(--text-tertiary)" />
                                            )}
                                        </button>

                                        <div style={styles.todoContent}>
                                            {editingTodoId === todo.id ? (
                                                <div style={styles.editRow}>
                                                    <input
                                                        style={styles.editInput}
                                                        value={editTodoTitle}
                                                        onChange={(e) => setEditTodoTitle(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') saveEditTodo();
                                                            if (e.key === 'Escape') cancelEditTodo();
                                                        }}
                                                        autoFocus
                                                    />
                                                    <button style={styles.editSaveBtn} onClick={saveEditTodo} title="Speichern">
                                                        <Check size={14} />
                                                    </button>
                                                    <button style={styles.editCancelBtn} onClick={cancelEditTodo} title="Abbrechen">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div
                                                    style={{
                                                        ...styles.todoTitle,
                                                        textDecoration: todo.status === 'done' ? 'line-through' : 'none',
                                                        cursor: 'pointer',
                                                    }}
                                                    onDoubleClick={() => startEditTodo(todo)}
                                                    title="Doppelklick zum Bearbeiten"
                                                >
                                                    {todo.title}
                                                </div>
                                            )}
                                            <div style={styles.todoMeta}>
                                                <span style={{
                                                    ...styles.priorityBadge,
                                                    background: `${priorityColors[todo.priority]}20`,
                                                    color: priorityColors[todo.priority],
                                                    borderColor: `${priorityColors[todo.priority]}40`,
                                                }}>
                                                    {priorityLabels[todo.priority] || todo.priority}
                                                </span>
                                                <span style={styles.categoryBadge}>
                                                    <Tag size={10} /> {todo.category}
                                                </span>
                                                {todo.dueDate && (
                                                    <span style={styles.dueDateBadge}>
                                                        <Clock size={10} /> {new Date(todo.dueDate).toLocaleDateString('de-DE')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div style={styles.actionBtns}>
                                            {editingTodoId !== todo.id && (
                                                <button
                                                    style={styles.editBtn}
                                                    onClick={() => startEditTodo(todo)}
                                                    title="Bearbeiten"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            )}
                                            <button
                                                style={styles.deleteBtn}
                                                onClick={() => deleteTodo(todo.id)}
                                                title="Loeschen"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    /* ===== SHOPPING TAB ===== */
                    <>
                        {/* Add Items */}
                        <div style={styles.inputRow}>
                            <input
                                style={styles.input}
                                placeholder="Artikel eingeben... (z.B. 2x Milch, Brot, 500g Mehl)"
                                value={newItemText}
                                onChange={(e) => setNewItemText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addShoppingItems()}
                                disabled={loading}
                            />
                            <button style={styles.addBtn} onClick={addShoppingItems} disabled={loading || !newItemText.trim()}>
                                <Plus size={18} />
                            </button>
                        </div>
                        <p style={styles.inputHint}>Mehrere Artikel mit Komma trennen. Mengen wie "2x" oder "500g" werden erkannt.</p>

                        {/* Filters */}
                        <div style={styles.filterRow}>
                            <div style={styles.filterGroup}>
                                <Filter size={14} />
                                {(['pending', 'purchased', 'all'] as const).map((f) => (
                                    <button
                                        key={f}
                                        style={{ ...styles.filterBtn, ...(shoppingFilter === f ? styles.filterActive : {}) }}
                                        onClick={() => setShoppingFilter(f)}
                                    >
                                        {f === 'pending' ? 'Offen' : f === 'purchased' ? 'Gekauft' : 'Alle'}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {/* Group by toggle */}
                                <div style={styles.groupByToggle}>
                                    <button
                                        style={{ ...styles.groupByBtn, ...(groupBy === 'category' ? styles.groupByActive : {}) }}
                                        onClick={() => setGroupBy('category')}
                                        title="Nach Kategorie gruppieren"
                                    >
                                        <Tag size={12} /> Kategorie
                                    </button>
                                    <button
                                        style={{ ...styles.groupByBtn, ...(groupBy === 'store' ? styles.groupByActive : {}) }}
                                        onClick={() => setGroupBy('store')}
                                        title="Nach Laden gruppieren"
                                    >
                                        <Store size={12} /> Laden
                                    </button>
                                </div>
                                {/* Filter dropdown: Laden-Filter bei Kategorie-Gruppierung, Kategorie-Filter bei Laden-Gruppierung */}
                                {groupBy === 'category' && stores.length > 0 && (
                                    <select
                                        style={styles.select}
                                        value={selectedStore}
                                        onChange={(e) => setSelectedStore(e.target.value)}
                                    >
                                        <option value="">Alle Laeden</option>
                                        {stores.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                )}
                                {groupBy === 'store' && shoppingCategories.length > 0 && (
                                    <select
                                        style={styles.select}
                                        value={selectedStore}
                                        onChange={(e) => setSelectedStore(e.target.value)}
                                    >
                                        <option value="">Alle Kategorien</option>
                                        {shoppingCategories.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                )}
                                {shoppingFilter === 'all' || shoppingFilter === 'purchased' ? (
                                    <button style={styles.clearBtn} onClick={clearPurchased} title="Gekaufte entfernen">
                                        <Trash2 size={14} />
                                        <span>Gekaufte leeren</span>
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        {/* Shopping List grouped by category */}
                        <div style={styles.list}>
                            {shoppingItems.length === 0 ? (
                                <div style={styles.empty}>
                                    <ShoppingCart size={48} strokeWidth={1} />
                                    <p>Einkaufsliste ist leer</p>
                                    <p style={styles.emptyHint}>
                                        Fuege Artikel oben hinzu oder schreib im Chat: <br />
                                        <code style={styles.code}>/einkauf Milch, Brot, Eier</code>
                                    </p>
                                </div>
                            ) : (
                                Object.entries(groupedShopping).map(([groupName, items]) => (
                                    <div key={groupName} style={styles.categoryGroup}>
                                        <div style={styles.categoryHeader}>
                                            {groupBy === 'store' ? <Store size={14} /> : <Tag size={14} />}
                                            <span>{groupName}</span>
                                            <span style={styles.categoryCount}>{items.length}</span>
                                        </div>
                                        {items.map((item) => (
                                            <div key={item.id} style={{
                                                ...styles.shoppingItem,
                                                opacity: item.isPurchased ? 0.5 : 1,
                                            }}>
                                                <button
                                                    style={styles.checkBtn}
                                                    onClick={() => togglePurchased(item.id)}
                                                    title={item.isPurchased ? 'Nicht gekauft' : 'Als gekauft markieren'}
                                                >
                                                    {item.isPurchased ? (
                                                        <CheckCircle2 size={20} color="#22c55e" />
                                                    ) : (
                                                        <Circle size={20} color="var(--text-tertiary)" />
                                                    )}
                                                </button>

                                                {editingShoppingId === item.id ? (
                                                    <div style={{ ...styles.shoppingContent, flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
                                                        <div style={styles.editRow}>
                                                            <input
                                                                style={{ ...styles.editInput, flex: 2 }}
                                                                value={editShoppingName}
                                                                onChange={(e) => setEditShoppingName(e.target.value)}
                                                                placeholder="Artikelname"
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') saveEditShopping();
                                                                    if (e.key === 'Escape') cancelEditShopping();
                                                                }}
                                                                autoFocus
                                                            />
                                                            <input
                                                                style={{ ...styles.editInput, flex: 0, width: '70px' }}
                                                                value={editShoppingQuantity}
                                                                onChange={(e) => setEditShoppingQuantity(e.target.value)}
                                                                placeholder="Menge"
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') saveEditShopping();
                                                                    if (e.key === 'Escape') cancelEditShopping();
                                                                }}
                                                            />
                                                            <input
                                                                style={{ ...styles.editInput, flex: 0, width: '90px' }}
                                                                value={editShoppingStore}
                                                                onChange={(e) => setEditShoppingStore(e.target.value)}
                                                                placeholder="Laden"
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') saveEditShopping();
                                                                    if (e.key === 'Escape') cancelEditShopping();
                                                                }}
                                                            />
                                                            <button style={styles.editSaveBtn} onClick={saveEditShopping} title="Speichern">
                                                                <Check size={14} />
                                                            </button>
                                                            <button style={styles.editCancelBtn} onClick={cancelEditShopping} title="Abbrechen">
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        style={styles.shoppingContent}
                                                        onDoubleClick={() => startEditShopping(item)}
                                                        title="Doppelklick zum Bearbeiten"
                                                    >
                                                        <span style={{
                                                            ...styles.shoppingName,
                                                            textDecoration: item.isPurchased ? 'line-through' : 'none',
                                                            cursor: 'pointer',
                                                        }}>
                                                            {item.quantity && (
                                                                <span style={styles.quantityBadge}>{item.quantity}</span>
                                                            )}
                                                            {item.name}
                                                        </span>
                                                        {item.store && (
                                                            <span style={styles.storeBadge}>
                                                                <Store size={10} /> {item.store}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                <div style={styles.actionBtns}>
                                                    {editingShoppingId !== item.id && (
                                                        <button
                                                            style={styles.editBtn}
                                                            onClick={() => startEditShopping(item)}
                                                            title="Bearbeiten"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                    )}
                                                    <button
                                                        style={styles.deleteBtn}
                                                        onClick={() => deleteShoppingItem(item.id)}
                                                        title="Loeschen"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// --- Inline Styles ---
const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: '800px',
        margin: '0 auto',
        padding: '24px',
        gap: '16px',
    },
    header: {
        marginBottom: '8px',
    },
    title: {
        fontSize: '1.75rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        margin: 0,
    },
    subtitle: {
        fontSize: '0.875rem',
        color: 'var(--text-tertiary)',
        margin: '4px 0 0 0',
    },
    tabBar: {
        display: 'flex',
        gap: '4px',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '4px',
        border: '1px solid var(--border-subtle)',
    },
    tabBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '10px 16px',
        border: 'none',
        borderRadius: '8px',
        background: 'transparent',
        color: 'var(--text-secondary)',
        fontSize: '0.875rem',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    tabActive: {
        background: 'var(--bg-hover)',
        color: 'var(--accent-primary)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    },
    badge: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '20px',
        height: '20px',
        borderRadius: '10px',
        background: 'var(--accent-primary)',
        color: '#000',
        fontSize: '0.7rem',
        fontWeight: 700,
        padding: '0 6px',
    },
    content: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        flex: 1,
        minHeight: 0,
    },
    statsBar: {
        display: 'flex',
        gap: '16px',
        padding: '10px 14px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
    },
    statItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
    },
    inputRow: {
        display: 'flex',
        gap: '8px',
    },
    input: {
        flex: 1,
        padding: '10px 14px',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize: '0.875rem',
        outline: 'none',
    },
    inputHint: {
        fontSize: '0.75rem',
        color: 'var(--text-tertiary)',
        margin: '-4px 0 0 0',
    },
    addBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        borderRadius: '8px',
        border: 'none',
        background: 'var(--accent-primary)',
        color: '#000',
        cursor: 'pointer',
        transition: 'opacity 0.2s',
    },
    filterRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap' as const,
        gap: '8px',
    },
    filterGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: 'var(--text-tertiary)',
    },
    filterBtn: {
        padding: '4px 10px',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        fontSize: '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    filterActive: {
        background: 'var(--accent-primary)',
        color: '#000',
        borderColor: 'var(--accent-primary)',
    },
    select: {
        padding: '4px 8px',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        fontSize: '0.75rem',
        cursor: 'pointer',
    },
    clearBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '6px',
        border: '1px solid rgba(239,68,68,0.3)',
        background: 'rgba(239,68,68,0.1)',
        color: '#ef4444',
        fontSize: '0.75rem',
        cursor: 'pointer',
    },
    list: {
        flex: 1,
        overflowY: 'auto' as const,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
    },
    empty: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '48px 0',
        color: 'var(--text-tertiary)',
        textAlign: 'center' as const,
    },
    emptyHint: {
        fontSize: '0.8rem',
        lineHeight: 1.6,
    },
    code: {
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        color: 'var(--accent-primary)',
    },

    // Todo Item
    todoItem: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '8px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        transition: 'all 0.2s',
    },
    checkBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px',
        flexShrink: 0,
    },
    todoContent: {
        flex: 1,
        minWidth: 0,
    },
    todoTitle: {
        fontSize: '0.9rem',
        color: 'var(--text-primary)',
        fontWeight: 500,
    },
    todoMeta: {
        display: 'flex',
        gap: '6px',
        marginTop: '4px',
        flexWrap: 'wrap' as const,
    },
    priorityBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: '4px',
        fontSize: '0.65rem',
        fontWeight: 600,
        border: '1px solid',
    },
    categoryBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '1px 6px',
        borderRadius: '4px',
        fontSize: '0.65rem',
        background: 'rgba(255,255,255,0.05)',
        color: 'var(--text-tertiary)',
        border: '1px solid var(--border-subtle)',
    },
    dueDateBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '1px 6px',
        borderRadius: '4px',
        fontSize: '0.65rem',
        background: 'rgba(234,179,8,0.1)',
        color: '#eab308',
        border: '1px solid rgba(234,179,8,0.2)',
    },
    deleteBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-tertiary)',
        padding: '4px',
        borderRadius: '4px',
        transition: 'color 0.2s',
        flexShrink: 0,
    },

    // Shopping Item
    categoryGroup: {
        marginBottom: '8px',
    },
    categoryHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        fontSize: '0.8rem',
        fontWeight: 600,
        color: 'var(--accent-primary)',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: '2px',
    },
    categoryCount: {
        fontSize: '0.7rem',
        color: 'var(--text-tertiary)',
        marginLeft: 'auto',
    },
    shoppingItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '6px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        transition: 'all 0.2s',
    },
    shoppingContent: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap' as const,
        minWidth: 0,
    },
    shoppingName: {
        fontSize: '0.875rem',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    },
    quantityBadge: {
        display: 'inline-flex',
        padding: '1px 5px',
        borderRadius: '4px',
        background: 'rgba(249,171,0,0.15)',
        color: 'var(--accent-primary)',
        fontSize: '0.7rem',
        fontWeight: 600,
    },
    groupByToggle: {
        display: 'flex',
        gap: '2px',
        background: 'var(--bg-secondary)',
        borderRadius: '6px',
        padding: '2px',
        border: '1px solid var(--border-subtle)',
    },
    groupByBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '4px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-tertiary)',
        fontSize: '0.7rem',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    groupByActive: {
        background: 'var(--accent-primary)',
        color: '#000',
    },
    actionBtns: {
        display: 'flex',
        gap: '2px',
        flexShrink: 0,
    },
    editBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-tertiary)',
        padding: '4px',
        borderRadius: '4px',
        transition: 'color 0.2s',
    },
    editRow: {
        display: 'flex',
        gap: '4px',
        alignItems: 'center',
        width: '100%',
    },
    editInput: {
        flex: 1,
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid var(--accent-primary)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize: '0.85rem',
        outline: 'none',
    },
    editSaveBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        border: 'none',
        background: '#22c55e',
        color: '#fff',
        cursor: 'pointer',
        flexShrink: 0,
    },
    editCancelBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        border: 'none',
        background: 'rgba(239,68,68,0.2)',
        color: '#ef4444',
        cursor: 'pointer',
        flexShrink: 0,
    },
    storeBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '1px 6px',
        borderRadius: '4px',
        fontSize: '0.65rem',
        background: 'rgba(59,130,246,0.1)',
        color: '#3b82f6',
        border: '1px solid rgba(59,130,246,0.2)',
    },
};
