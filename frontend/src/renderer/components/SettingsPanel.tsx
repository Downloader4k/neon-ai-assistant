import { useState, useEffect } from 'react';
import { Settings, Sliders, Lock, Palette, Keyboard } from 'lucide-react';

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

    const categories: SettingsCategory[] = [
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
                                    <label className="block text-sm font-medium mb-2">Theme</label>
                                    <select
                                        value={settings.appearance.theme}
                                        onChange={(e) => updateSetting('appearance', 'theme', e.target.value)}
                                        className="w-full px-4 py-2 bg-bg-tertiary border border-border rounded-lg"
                                    >
                                        <option value="dark">Dunkel</option>
                                        <option value="light">Hell</option>
                                        <option value="auto">Automatisch</option>
                                    </select>
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
