import { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

export default function VoiceControls() {
    const [isListening, setIsListening] = useState(false);

    const toggleListening = () => {
        setIsListening(!isListening);
        // Voice functionality will be integrated later
    };

    return (
        <>
            <button
                onClick={toggleListening}
                className={`voice-button ${isListening ? 'listening' : ''}`}
                title={isListening ? 'Aufnahme beenden' : 'Sprachaufnahme starten'}
            >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <style>{`
        .voice-button {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          background: transparent;
          transition: all 0.2s;
          position: relative;
        }

        .voice-button:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .voice-button.listening {
          background: var(--accent-light);
          color: var(--accent-primary);
        }

        .voice-button.listening::before {
          content: '';
          position: absolute;
          inset: -4px;
          border: 2px solid var(--accent-primary);
          border-radius: var(--radius-sm);
          animation: pulse-ring 1.5s ease-out infinite;
        }

        @keyframes pulse-ring {
          0% {
            transform: scale(0.95);
            opacity: 1;
          }
          100% {
            transform: scale(1.1);
            opacity: 0;
          }
        }
      `}</style>
        </>
    );
}
