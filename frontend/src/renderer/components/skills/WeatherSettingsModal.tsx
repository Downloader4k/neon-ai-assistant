import { useState, useEffect } from 'react';
import { X, Save, MapPin } from 'lucide-react';

interface WeatherSettingsModalProps {
    onClose: () => void;
}

export default function WeatherSettingsModal({ onClose }: WeatherSettingsModalProps) {
    const [location, setLocation] = useState('');
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        // Fetch current settings
        fetch('http://localhost:3001/api/skills/weather/settings')
            .then(res => res.json())
            .then(data => {
                if (data.location) setLocation(data.location);
                else setLocation('Berlin'); // Default fallback
            })
            .catch(err => console.error(err));
    }, []);

    const handleSave = async () => {
        setLoading(true);
        try {
            await fetch('http://localhost:3001/api/skills/weather/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    settings: { location }
                })
            });
            setSaved(true);
            setTimeout(() => {
                setSaved(false);
                onClose();
            }, 1000);
        } catch (error) {
            console.error('Failed to save', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <MapPin className="text-accent-primary" />
                        Wetter Einstellungen
                    </h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                            Standard Wohnort
                        </label>
                        <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="z.B. Berlin, München"
                            className="w-full px-4 py-2 bg-bg-input border border-border rounded-lg focus:ring-2 focus:ring-accent-primary focus:border-transparent outline-none transition-all"
                        />
                        <p className="text-xs text-text-tertiary mt-2">
                            Dieser Ort wird verwendet, wenn du nur "Wie ist das Wetter?" fragst.
                        </p>
                    </div>
                </div>

                <div className="p-6 border-t border-border flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-text-secondary hover:bg-bg-hover rounded-lg transition-colors"
                    >
                        Abbrechen
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || !location}
                        className={`px-4 py-2 bg-accent-gradient text-white rounded-lg flex items-center gap-2 font-medium transition-all hover:shadow-lg hover:shadow-accent-primary/25 disabled:opacity-50 disabled:cursor-not-allowed ${saved ? 'bg-green-500' : ''}`}
                    >
                        {saved ? 'Gespeichert!' : (
                            <>
                                <Save size={18} />
                                Speichern
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
