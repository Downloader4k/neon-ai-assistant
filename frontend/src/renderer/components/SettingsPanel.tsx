import { useState, useEffect } from 'react';
import { Settings, Sliders, Lock, Palette, Keyboard, Check, User } from 'lucide-react';
import { useAppStore, PERSONALITY_LIST } from '../store/useAppStore';

interface SettingsCategory {
    id: string;
    label: string;
    icon: any;
}

export default function SettingsPanel() {
    const [activeCategory, setActiveCategory] = useState('ai');
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [settings, setSettings] = useState({
        ai: {
            defaultModel: 'claude',
            complexityThreshold: 0.6,
            hybridMode: true,
            privacyMode: false,
            ollamaModel: 'qwen3:8b',
            visionProvider: 'local',
            temperature: 0.7,
            maxTokens: 2000,
        },
        privacy: {
            saveConversations: true,
            shareAnalytics: false,
            encryptData: true,
            autoDelete: false,
            retentionDays: 90,
        },
        appearance: {
            theme: 'dark',
            accentColor: '#f9ab00',
            fontSize: 14,
            fontFamily: 'Inter',
            animations: true,
            compactMode: false,
        },
        shortcuts: {
            search: 'Ctrl+K',
            newChat: 'Ctrl+N',
            settings: 'Ctrl+,',
            voice: 'Ctrl+M',
        },
    });

    // Load saved theme from localStorage on mount
    useEffect(() => {
        const savedTheme = localStorage.getItem('neon-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        setSettings(prev => ({
            ...prev,
            appearance: { ...prev.appearance, theme: savedTheme }
        }));
    }, []);

    useEffect(() => {
        // Fetch current settings on mount
        fetch('http://localhost:3001/api/settings')
            .then(res => res.json())
            .then(data => {
                if (data.ai) {
                    setSettings(prev => ({
                        ...prev,
                        ai: { ...prev.ai, ...data.ai }
                    }));
                }
            })
            .catch(err => console.error('Failed to load settings', err));

        // Fetch available Ollama models
        fetch('http://localhost:3001/api/settings/models')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setAvailableModels(data);
                }
            })
            .catch(err => console.error('Failed to load models', err));
    }, []);

    const currentUser = useAppStore((s) => s.currentUser);
    const updateUserName = useAppStore((s) => s.updateUserName);
    const deleteProfile = useAppStore((s) => s.deleteProfile);
    const [displayName, setDisplayName] = useState(currentUser.name);

    useEffect(() => {
        setDisplayName(currentUser.name);
    }, [currentUser.name]);

    const categories: SettingsCategory[] = [
        { id: 'profile', label: 'Profil', icon: User },
        { id: 'ai', label: 'KI-Verhalten', icon: Sliders },
        { id: 'privacy', label: 'Datenschutz', icon: Lock },
        { id: 'appearance', label: 'Erscheinungsbild', icon: Palette },
        { id: 'shortcuts', label: 'Tastenkürzel', icon: Keyboard },
        { id: 'advanced', label: 'Erweitert', icon: Settings },
    ];

    const updateSetting = (category: string, key: string, value: any) => {
        setSettings((prev) => ({
            ...prev,
            [category]: {
                ...prev[category as keyof typeof prev],
                [key]: value,
            },
        }));
    };

    const saveSettings = async () => {
        try {
            await fetch('http://localhost:3001/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            alert('Einstellungen gespeichert!');
        } catch (error) {
            console.error('Failed to save settings', error);
            alert('Fehler beim Speichern');
        }
    };

    return (
        <div className="p-6 bg-bg-primary text-text-primary min-h-screen">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Settings className="w-8 h-8 text-primary" />
                        Einstellungen
                    </h1>
                    <p className="text-text-secondary mt-2">Passe NEON an deine Bedürfnisse an</p>
                </div>

                <div className="flex gap-6">
                    {/* Sidebar */}
                    <div className="w-64 bg-bg-secondary border border-border rounded-lg p-4">
                        {categories.map((category) => {
                            const Icon = category.icon;
                            return (
                                <button
                                    key={category.id}
                                    onClick={() => setActiveCategory(category.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${activeCategory === category.id
                                        ? 'bg-primary text-black'
                                        : 'hover:bg-border text-text-primary'
                                        }`}
                                >
                                    <Icon className="w-5 h-5" />
                                    {category.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Content */}
                    <div className="flex-1 bg-bg-secondary border border-border rounded-lg p-6">
                        {activeCategory === 'profile' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-bold mb-4">Profil</h2>

                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Wie soll NEON dich nennen?
                                    </label>
                                    <div className="flex gap-3">
                                        <input
                                            type="text"
                                            value={displayName}
                                            onChange={(e) => setDisplayName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && displayName.trim()) {
                                                    updateUserName(displayName.trim());
                                                }
                                            }}
                                            placeholder="Dein Name..."
                                            className="flex-1 px-4 py-2 bg-bg-tertiary border border-border rounded-lg"
                                            maxLength={30}
                                        />
                                        <button
                                            onClick={() => {
                                                if (displayName.trim()) {
                                                    updateUserName(displayName.trim());
                                                }
                                            }}
                                            className="px-4 py-2 bg-primary text-black font-medium rounded-lg transition-colors hover:bg-primary/90"
                                        >
                                            Speichern
                                        </button>
                                    </div>
                                    <p className="text-xs text-text-secondary mt-2">
                                        Dieser Name wird in der Begruessung, im Chat und in allen Features angezeigt.
                                        Er gilt fuer das aktive Profil: <strong>{currentUser.id}</strong>
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">Aktives Profil</label>
                                    <div className="flex items-center gap-3 p-4 bg-bg-tertiary rounded-lg border border-border">
                                        <span className="text-2xl">{currentUser.avatar}</span>
                                        <div>
                                            <div className="font-semibold">{currentUser.name}</div>
                                            <div className="text-xs text-text-secondary">{currentUser.id}</div>
                                        </div>
                                    </div>
                                </div>

                                {currentUser.id !== 'default-user' && (
                                    <div className="pt-4 border-t border-border">
                                        <button
                                            onClick={() => {
                                                if (confirm(`Profil "${currentUser.name}" wirklich löschen? Alle Daten dieses Profils (Memories, Konversationen) bleiben erhalten, aber das Profil wird entfernt.`)) {
                                                    deleteProfile();
                                                }
                                            }}
                                            className="w-full px-4 py-2 bg-red-900/30 border border-red-800 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors text-sm"
                                        >
                                            Profil löschen
                                        </button>
                                        <p className="text-xs text-text-secondary mt-2">
                                            Du wirst zum Standard-Profil gewechselt. Das Standard-Profil kann nicht gelöscht werden.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeCategory === 'ai' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-bold mb-4">KI-Verhalten</h2>

                                <div>
                                    <label className="block text-sm font-medium mb-2">Standard-Modell</label>
                                    <select
                                        value={settings.ai.defaultModel}
                                        onChange={(e) => {
                                            const mode = e.target.value;
                                            let newThreshold = settings.ai.complexityThreshold;

                                            // Sync slider with mode
                                            if (mode === 'claude') newThreshold = 0;
                                            if (mode === 'ollama') newThreshold = 1;
                                            if (mode === 'auto') newThreshold = 0.3; // Default for auto

                                            setSettings(prev => ({
                                                ...prev,
                                                ai: {
                                                    ...prev.ai,
                                                    defaultModel: mode,
                                                    complexityThreshold: newThreshold
                                                }
                                            }));
                                        }}
                                        className="w-full px-4 py-2 bg-bg-tertiary border border-border rounded-lg mb-4"
                                    >
                                        <option value="claude">Claude (Cloud)</option>
                                        <option value="ollama">Ollama (Lokal)</option>
                                        <option value="auto">Automatisch</option>
                                    </select>

                                    {(settings.ai.defaultModel === 'ollama' || settings.ai.defaultModel === 'auto') && (
                                        <div className="mt-2">
                                            <label className="block text-xs text-text-secondary mb-1">Ollama Modell wählen</label>
                                            <select
                                                value={(settings.ai as any).ollamaModel || 'qwen3:8b'}
                                                onChange={(e) => updateSetting('ai', 'ollamaModel', e.target.value)}
                                                className="w-full px-4 py-2 bg-bg-tertiary border border-border rounded-lg text-sm"
                                            >
                                                {availableModels.length > 0 ? (
                                                    availableModels.map((m: any) => (
                                                        <option key={m.name} value={m.name}>
                                                            {m.name} ({(m.size / 1024 / 1024 / 1024).toFixed(1)} GB)
                                                        </option>
                                                    ))
                                                ) : (
                                                    <option value="qwen3:8b">qwen3:8b (Standard)</option>
                                                )}
                                                <option value="custom">── Anderes Modell (manuell) ──</option>
                                            </select>

                                            {((settings.ai as any).ollamaModel === 'custom' || !availableModels.find(m => m.name === (settings.ai as any).ollamaModel)) && (
                                                <input
                                                    type="text"
                                                    value={(settings.ai as any).ollamaModel === 'custom' ? '' : (settings.ai as any).ollamaModel}
                                                    onChange={(e) => updateSetting('ai', 'ollamaModel', e.target.value)}
                                                    placeholder="Modellname eingeben..."
                                                    className="w-full mt-2 px-4 py-2 bg-bg-tertiary border border-border rounded-lg text-sm"
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">Bilderkennung</label>
                                    <select
                                        value={(settings.ai as any).visionProvider || 'local'}
                                        onChange={(e) => updateSetting('ai', 'visionProvider', e.target.value)}
                                        className="w-full px-4 py-2 bg-bg-tertiary border border-border rounded-lg"
                                    >
                                        <option value="local">Lokal (Gemma 3 — kostenlos, privat)</option>
                                        <option value="claude">Claude Vision (Cloud — bessere Qualität)</option>
                                    </select>
                                    <p className="text-xs text-text-secondary mt-1">
                                        {(settings.ai as any).visionProvider === 'claude'
                                            ? 'Bilder werden an die Claude API gesendet (Kosten pro Bild)'
                                            : 'Bilder werden lokal mit Gemma 3 analysiert (keine Kosten, Daten bleiben lokal)'}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Komplexitätsschwelle: {settings.ai.complexityThreshold}
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={settings.ai.complexityThreshold}
                                        onChange={(e) =>
                                            updateSetting('ai', 'complexityThreshold', parseFloat(e.target.value))
                                        }
                                        className="w-full"
                                    />
                                    <p className="text-xs text-text-secondary mt-1">
                                        Höher = mehr Gemma (Lokal), Niedriger = mehr Claude (Cloud)
                                    </p>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span>Hybrid-Modus</span>
                                    <input
                                        type="checkbox"
                                        checked={settings.ai.hybridMode}
                                        onChange={(e) => updateSetting('ai', 'hybridMode', e.target.checked)}
                                        className="w-5 h-5"
                                    />
                                </div>

                                {/* Persoenlichkeit */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">Persoenlichkeit</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {PERSONALITY_LIST.map((p) => {
                                            const isActive = useAppStore.getState().personality === p.id;
                                            return (
                                                <button
                                                    key={p.id}
                                                    onClick={() => useAppStore.getState().setPersonality(p.id)}
                                                    className="flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left"
                                                    style={{
                                                        borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-subtle)',
                                                        background: isActive ? 'rgba(249,171,0,0.08)' : 'var(--bg-tertiary)',
                                                    }}
                                                >
                                                    <span className="text-xl">{p.icon === 'Scale' ? '⚖️' : p.icon === 'Smile' ? '😊' : p.icon === 'Laugh' ? '😏' : p.icon === 'GraduationCap' ? '🎓' : '☠️'}</span>
                                                    <div>
                                                        <div className="text-sm font-semibold" style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{p.name}</div>
                                                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.description}</div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span>Datenschutz-Modus (nur lokal)</span>
                                    <input
                                        type="checkbox"
                                        checked={settings.ai.privacyMode}
                                        onChange={(e) => updateSetting('ai', 'privacyMode', e.target.checked)}
                                        className="w-5 h-5"
                                    />
                                </div>
                            </div>
                        )}

                        {activeCategory === 'privacy' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-bold mb-4">Datenschutz</h2>

                                <div className="flex items-center justify-between">
                                    <span>Konversationen speichern</span>
                                    <input
                                        type="checkbox"
                                        checked={settings.privacy.saveConversations}
                                        onChange={(e) =>
                                            updateSetting('privacy', 'saveConversations', e.target.checked)
                                        }
                                        className="w-5 h-5"
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <span>Daten verschlüsseln</span>
                                    <input
                                        type="checkbox"
                                        checked={settings.privacy.encryptData}
                                        onChange={(e) => updateSetting('privacy', 'encryptData', e.target.checked)}
                                        className="w-5 h-5"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Aufbewahrungsdauer (Tage)
                                    </label>
                                    <input
                                        type="number"
                                        value={settings.privacy.retentionDays}
                                        onChange={(e) =>
                                            updateSetting('privacy', 'retentionDays', parseInt(e.target.value))
                                        }
                                        className="w-full px-4 py-2 bg-bg-tertiary border border-border rounded-lg"
                                    />
                                </div>
                            </div>
                        )}

                        {activeCategory === 'appearance' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-bold mb-4">Erscheinungsbild</h2>

                                <div>
                                    <label className="block text-sm font-medium mb-3">Farbschema</label>
                                    <div className="grid grid-cols-3 gap-4">
                                        {([
                                            {
                                                id: 'dark',
                                                label: 'Dunkel',
                                                desc: 'Standard-Design',
                                                colors: { bg: '#0f0f0f', card: '#1a1a1a', accent: '#f9ab00', text: '#e0e0e0', border: '#333' },
                                            },
                                            {
                                                id: 'light',
                                                label: 'Hell',
                                                desc: 'Heller Hintergrund',
                                                colors: { bg: '#f5f5f5', card: '#ffffff', accent: '#e89800', text: '#1a1a1a', border: '#d0d0d0' },
                                            },
                                            {
                                                id: 'oled',
                                                label: 'OLED',
                                                desc: 'Reines Schwarz',
                                                colors: { bg: '#000000', card: '#0a0a0a', accent: '#f9ab00', text: '#e8e8e8', border: '#1a1a1a' },
                                            },
                                        ] as const).map((theme) => {
                                            const isActive = settings.appearance.theme === theme.id;
                                            return (
                                                <button
                                                    key={theme.id}
                                                    onClick={() => {
                                                        updateSetting('appearance', 'theme', theme.id);
                                                        document.documentElement.setAttribute('data-theme', theme.id);
                                                        localStorage.setItem('neon-theme', theme.id);
                                                    }}
                                                    className="relative flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-200"
                                                    style={{
                                                        borderColor: isActive ? theme.colors.accent : 'var(--border-subtle)',
                                                        background: isActive ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                                                    }}
                                                >
                                                    {/* Preview block */}
                                                    <div
                                                        className="w-full h-20 rounded-lg mb-3 overflow-hidden border"
                                                        style={{ background: theme.colors.bg, borderColor: theme.colors.border }}
                                                    >
                                                        {/* Mini UI preview */}
                                                        <div className="flex h-full">
                                                            {/* Sidebar preview */}
                                                            <div
                                                                className="w-1/4 h-full"
                                                                style={{ background: theme.colors.card, borderRight: `1px solid ${theme.colors.border}` }}
                                                            >
                                                                <div className="mt-2 mx-1">
                                                                    <div className="h-1.5 rounded" style={{ background: theme.colors.accent, width: '60%' }} />
                                                                    <div className="h-1 mt-1.5 rounded" style={{ background: theme.colors.text, opacity: 0.3, width: '80%' }} />
                                                                    <div className="h-1 mt-1 rounded" style={{ background: theme.colors.text, opacity: 0.2, width: '70%' }} />
                                                                    <div className="h-1 mt-1 rounded" style={{ background: theme.colors.text, opacity: 0.2, width: '50%' }} />
                                                                </div>
                                                            </div>
                                                            {/* Content preview */}
                                                            <div className="flex-1 p-2 flex flex-col justify-center items-center gap-1.5">
                                                                <div className="h-1.5 rounded" style={{ background: theme.colors.text, opacity: 0.4, width: '70%' }} />
                                                                <div className="h-1.5 rounded" style={{ background: theme.colors.text, opacity: 0.25, width: '50%' }} />
                                                                <div className="h-3 mt-1 rounded" style={{ background: theme.colors.accent, width: '40%', opacity: 0.8 }} />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Label */}
                                                    <span className="text-sm font-semibold" style={{ color: isActive ? theme.colors.accent : 'var(--text-primary)' }}>
                                                        {theme.label}
                                                    </span>
                                                    <span className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                                        {theme.desc}
                                                    </span>

                                                    {/* Active check badge */}
                                                    {isActive && (
                                                        <div
                                                            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                                                            style={{ background: theme.colors.accent }}
                                                        >
                                                            <Check size={12} color="#000" strokeWidth={3} />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">Akzentfarbe</label>
                                    <input
                                        type="color"
                                        value={settings.appearance.accentColor}
                                        onChange={(e) => updateSetting('appearance', 'accentColor', e.target.value)}
                                        className="w-full h-12 rounded-lg cursor-pointer"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Schriftgröße: {settings.appearance.fontSize}px
                                    </label>
                                    <input
                                        type="range"
                                        min="12"
                                        max="20"
                                        value={settings.appearance.fontSize}
                                        onChange={(e) =>
                                            updateSetting('appearance', 'fontSize', parseInt(e.target.value))
                                        }
                                        className="w-full"
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <span>Animationen</span>
                                    <input
                                        type="checkbox"
                                        checked={settings.appearance.animations}
                                        onChange={(e) => updateSetting('appearance', 'animations', e.target.checked)}
                                        className="w-5 h-5"
                                    />
                                </div>
                            </div>
                        )}

                        {activeCategory === 'shortcuts' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-bold mb-4">Tastenkürzel</h2>

                                {Object.entries(settings.shortcuts).map(([key, value]) => {
                                    const labels: Record<string, string> = {
                                        search: 'Suche öffnen',
                                        newChat: 'Neuer Chat',
                                        settings: 'Einstellungen',
                                        voice: 'Spracheingabe',
                                    };
                                    return (
                                        <div key={key} className="flex items-center justify-between">
                                            <span>{labels[key] || key}</span>
                                            <input
                                                type="text"
                                                value={value}
                                                onChange={(e) => updateSetting('shortcuts', key, e.target.value)}
                                                className="w-40 px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-center text-sm font-mono"
                                            />
                                        </div>
                                    );
                                })}

                                <p className="text-xs text-text-secondary mt-4">
                                    Klicke in ein Feld und gib die gewünschte Tastenkombination ein (z.B. Ctrl+K).
                                </p>
                            </div>
                        )}

                        {activeCategory === 'advanced' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-bold mb-4">Erweitert</h2>

                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Temperatur: {settings.ai.temperature}
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={settings.ai.temperature}
                                        onChange={(e) => updateSetting('ai', 'temperature', parseFloat(e.target.value))}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-text-secondary mt-1">
                                        Niedrig = präzise Antworten, Hoch = kreativere Antworten
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Max Tokens: {settings.ai.maxTokens}
                                    </label>
                                    <input
                                        type="range"
                                        min="256"
                                        max="8192"
                                        step="256"
                                        value={settings.ai.maxTokens}
                                        onChange={(e) => updateSetting('ai', 'maxTokens', parseInt(e.target.value))}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-text-secondary mt-1">
                                        Maximale Länge der KI-Antworten
                                    </p>
                                </div>

                                <div className="pt-4 border-t border-border">
                                    <h3 className="text-lg font-semibold mb-3">Daten</h3>
                                    <div className="space-y-3">
                                        <button
                                            onClick={() => {
                                                if (confirm('Alle Konversationen löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
                                                    fetch('http://localhost:3001/api/conversations/clear', { method: 'DELETE' })
                                                        .then(() => alert('Konversationen gelöscht'))
                                                        .catch(() => alert('Fehler beim Löschen'));
                                                }
                                            }}
                                            className="w-full px-4 py-2 bg-red-900/30 border border-red-800 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors text-sm"
                                        >
                                            Alle Konversationen löschen
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm('Lokalen Cache leeren? (Theme, Profil-Einstellungen bleiben erhalten)')) {
                                                    localStorage.removeItem('neon-personality');
                                                    alert('Cache geleert');
                                                }
                                            }}
                                            className="w-full px-4 py-2 bg-red-900/30 border border-red-800 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors text-sm"
                                        >
                                            Lokalen Cache leeren
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Save Button */}
                        <div className="mt-8 pt-6 border-t border-border">
                            <button
                                onClick={saveSettings}
                                className="px-6 py-3 bg-primary hover:bg-primary/90 text-black font-medium rounded-lg transition-colors"
                            >
                                Einstellungen speichern
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
