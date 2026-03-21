import { useState, useEffect } from 'react';
import { Puzzle, Download, ToggleLeft, ToggleRight, Trash2, Settings, Database } from 'lucide-react';
import KnowledgeBaseView from './skills/KnowledgeBaseView';
import WeatherSettingsModal from './skills/WeatherSettingsModal';

interface Skill {
    id: string;
    name: string;
    version: string;
    author: string;
    description: string;
    enabled: boolean;
}

export default function SkillStore() {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeSkillView, setActiveSkillView] = useState<string | null>(null);
    const [settingsModalSkill, setSettingsModalSkill] = useState<string | null>(null);

    const fetchSkills = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/skills');
            const data = await res.json();
            setSkills(data.skills || []);
        } catch (error) {
            console.error('Failed to fetch skills', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSkills();
    }, []);

    const toggleSkill = async (id: string) => {
        try {
            await fetch(`http://localhost:3001/api/skills/${id}/toggle`, {
                method: 'PATCH',
            });
            await fetchSkills();
        } catch (error) {
            console.error('Failed to toggle skill', error);
        }
    };

    const deleteSkill = async (_id: string) => {
        if (!confirm('Skill wirklich löschen?')) return;

        try {
            // Note: Delete endpoint might not exist globally yet, but keeping logic for future
            // For now, specialized skills like KB might not be deleteable via generic endpoint
            console.warn('Delete not fully implemented for core skills');
            // await fetch(`http://localhost:3001/api/skills/${id}`, { method: 'DELETE' });
            // await fetchSkills();
        } catch (error) {
            console.error('Failed to delete skill', error);
        }
    };

    if (activeSkillView === 'knowledge-base') {
        return <KnowledgeBaseView onBack={() => setActiveSkillView(null)} />;
    }

    return (
        <div className="p-6 bg-bg-primary text-text-primary h-full overflow-y-auto">
            <div className="max-w-6xl mx-auto">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Puzzle className="w-8 h-8 text-accent-primary" />
                            Skill Store
                        </h1>
                        <p className="text-text-secondary mt-2">Erweitere NEON mit neuen Fähigkeiten</p>
                    </div>
                    <button
                        onClick={fetchSkills}
                        disabled={loading}
                        className="px-4 py-2 bg-bg-tertiary hover:bg-bg-hover border border-border rounded-lg transition-colors flex items-center gap-2"
                    >
                        <Download size={16} />
                        {loading ? 'Laden...' : 'Aktualisieren'}
                    </button>
                </div>

                {skills.length === 0 && !loading ? (
                    <div className="text-center py-12 text-text-secondary border-2 border-dashed border-border-subtle rounded-xl">
                        <Puzzle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Keine Skills gefunden. Ist das Backend verbunden?</p>
                        <button
                            onClick={fetchSkills}
                            className="mt-4 text-accent-primary hover:underline"
                        >
                            Erneut versuchen
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {skills.map((skill) => (
                            <div
                                key={skill.name}
                                className={`bg-bg-secondary p-6 rounded-2xl border border-border hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5 group relative overflow-hidden`}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg flex items-center gap-2">
                                            {skill.name}
                                            {skill.enabled && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                                        </h3>
                                        <p className="text-xs text-text-tertiary mt-1">
                                            v{skill.version} • {skill.author}
                                        </p>
                                    </div>
                                    <div className="flex gap-1">
                                        {/* Core skills usually can't be deleted easily */}
                                        {skill.id !== 'knowledge-base' && (
                                            <button
                                                onClick={() => deleteSkill(skill.id)}
                                                className="p-2 text-text-tertiary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                title="Skill entfernen"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <p className="text-sm text-text-secondary mb-6 line-clamp-2 min-h-[40px]">
                                    {skill.description}
                                </p>

                                <div className="flex gap-2 items-center">
                                    <button
                                        onClick={() => toggleSkill(skill.id)}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${skill.enabled
                                            ? 'bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20'
                                            : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                                            }`}
                                    >
                                        {skill.enabled ? (
                                            <>
                                                <ToggleRight className="w-5 h-5" />
                                                Aktiviert
                                            </>
                                        ) : (
                                            <>
                                                <ToggleLeft className="w-5 h-5" />
                                                Deaktiviert
                                            </>
                                        )}
                                    </button>

                                    {/* Settings / Manage Button */}
                                    {skill.enabled && skill.id === 'knowledge-base' && (
                                        <button
                                            onClick={() => setActiveSkillView('knowledge-base')}
                                            className="p-2.5 bg-bg-tertiary hover:bg-bg-hover text-text-secondary rounded-lg border border-border"
                                            title="Datenbank verwalten"
                                        >
                                            <Database className="w-5 h-5" />
                                        </button>
                                    )}

                                    {skill.enabled && skill.id !== 'knowledge-base' && (
                                        <button
                                            onClick={() => setSettingsModalSkill(skill.id)}
                                            className="p-2.5 bg-bg-tertiary hover:bg-bg-hover text-text-secondary rounded-lg"
                                            title="Einstellungen"
                                        >
                                            <Settings className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                
                {settingsModalSkill === 'weather' && (
                    <WeatherSettingsModal onClose={() => setSettingsModalSkill(null)} />
                )}
            </div>
        </div>
    );
}
