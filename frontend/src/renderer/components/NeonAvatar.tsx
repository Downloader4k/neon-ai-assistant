import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

type AvatarMood = 'idle' | 'talking' | 'happy' | 'speaking' | 'sleeping';

export default function NeonAvatar() {
    const isTyping = useAppStore((s) => s.isTyping);
    const activeView = useAppStore((s) => s.activeView);
    const setActiveView = useAppStore((s) => s.setActiveView);
    const [mood, setMood] = useState<AvatarMood>('idle');
    const [minimized, setMinimized] = useState(false);
    const [bubbleText, setBubbleText] = useState<string | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const prevMood = useRef<AvatarMood>('idle');
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const onStart = () => setIsSpeaking(true);
        const onEnd = () => setIsSpeaking(false);
        window.addEventListener('neon-tts-start', onStart);
        window.addEventListener('neon-tts-end', onEnd);
        return () => {
            window.removeEventListener('neon-tts-start', onStart);
            window.removeEventListener('neon-tts-end', onEnd);
        };
    }, []);

    useEffect(() => {
        if (isSpeaking) {
            prevMood.current = mood;
            setMood('speaking');
            setBubbleText(null);
        } else if (isTyping) {
            prevMood.current = mood;
            setMood('talking');
            setBubbleText(null);
        } else if (['talking', 'speaking'].includes(prevMood.current) || ['talking', 'speaking'].includes(mood)) {
            setMood('happy');
            setBubbleText('Fertig!');
            prevMood.current = 'happy';
            const t = setTimeout(() => { setMood('idle'); setBubbleText(null); prevMood.current = 'idle'; }, 3000);
            return () => clearTimeout(t);
        }
    }, [isTyping, isSpeaking]);

    useEffect(() => {
        if (mood === 'idle') {
            idleTimer.current = setTimeout(() => setMood('sleeping'), 5 * 60 * 1000);
            return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
        }
    }, [mood]);

    const handleClick = () => {
        if (mood === 'sleeping') {
            setMood('happy');
            setBubbleText('Bin wach!');
            setTimeout(() => { setMood('idle'); setBubbleText(null); }, 2500);
        } else {
            // Voice-Seite oeffnen
            setActiveView('voice');
        }
    };

    // Auf der Voice-Seite ausblenden (dort ist der grosse Orb)
    if (activeView === 'voice') {
        return null;
    }

    if (minimized) {
        return (
            <div onClick={handleClick} title="Neon Avatar anzeigen" style={{
                position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
                width: 44, height: 44, borderRadius: '50%', cursor: 'pointer',
                background: 'linear-gradient(135deg, #f9ab00, #d4900a)',
                boxShadow: '0 0 16px rgba(249,171,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, color: '#fff',
            }}>✦</div>
        );
    }

    const isActive = mood === 'talking' || mood === 'speaking';
    const isHappy = mood === 'happy';
    const isSleep = mood === 'sleeping';

    const speed = isActive ? 2.5 : isHappy ? 3.5 : isSleep ? 14 : 7;
    const glowStd = isActive ? 6 : isHappy ? 5 : isSleep ? 2 : 3.5;

    return (
        <div onClick={handleClick} style={{
            position: 'fixed', bottom: 8, right: 8, zIndex: 9999,
            width: 130, height: 130, cursor: 'pointer',
            userSelect: 'none',
            opacity: isSleep ? 0.4 : 1,
            transition: 'opacity 0.8s',
        }}>
            {bubbleText && (
                <div style={{
                    position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(249,171,0,0.3)',
                    borderRadius: 12, padding: '5px 16px', fontSize: 13, color: '#f9ab00',
                    fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
                    whiteSpace: 'nowrap', zIndex: 10, animation: 'avatar-fade-in 0.3s ease-out',
                }}>
                    {bubbleText}
                </div>
            )}

            <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                <defs>
                    {/* Glow for bright rings */}
                    <filter id="ng1" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation={glowStd} result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    {/* Soft glow for thin rings */}
                    <filter id="ng2" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation={glowStd * 0.6} result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* ======== DARK SHADOW RINGS (depth effect) ======== */}

                {/* Shadow ring A */}
                <ellipse cx="100" cy="100" rx="60" ry="52" fill="none"
                    stroke="rgba(80,60,10,0.25)" strokeWidth="4" strokeLinecap="round">
                    <animateTransform attributeName="transform" type="rotate"
                        from="0 100 100" to="360 100 100" dur={`${speed * 1.1}s`} repeatCount="indefinite" />
                    <animate attributeName="rx" values="58;64;58" dur={`${speed * 1.4}s`} repeatCount="indefinite" />
                    <animate attributeName="ry" values="48;56;48" dur={`${speed}s`} repeatCount="indefinite" />
                </ellipse>

                {/* Shadow ring B */}
                <ellipse cx="100" cy="100" rx="52" ry="58" fill="none"
                    stroke="rgba(70,50,5,0.2)" strokeWidth="3.5" strokeLinecap="round">
                    <animateTransform attributeName="transform" type="rotate"
                        from="360 100 100" to="0 100 100" dur={`${speed * 1.3}s`} repeatCount="indefinite" />
                    <animate attributeName="rx" values="50;56;50" dur={`${speed * 0.9}s`} repeatCount="indefinite" />
                    <animate attributeName="ry" values="55;62;55" dur={`${speed * 1.2}s`} repeatCount="indefinite" />
                </ellipse>

                {/* Shadow ring C */}
                <ellipse cx="100" cy="100" rx="45" ry="60" fill="none"
                    stroke="rgba(60,45,5,0.18)" strokeWidth="3" strokeLinecap="round">
                    <animateTransform attributeName="transform" type="rotate"
                        from="120 100 100" to="480 100 100" dur={`${speed * 1.5}s`} repeatCount="indefinite" />
                    <animate attributeName="rx" values="42;50;42" dur={`${speed * 1.1}s`} repeatCount="indefinite" />
                    <animate attributeName="ry" values="58;65;58" dur={`${speed * 0.8}s`} repeatCount="indefinite" />
                </ellipse>

                {/* ======== BRIGHT GLOWING RINGS ======== */}

                {/* Ring 1 — Main thick golden ring */}
                <g filter="url(#ng1)">
                    <ellipse cx="100" cy="100" rx="56" ry="50" fill="none"
                        stroke="#d4900a" strokeWidth="3.5" strokeLinecap="round"
                        strokeDasharray="90 30 70 25 60 35" opacity="0.95"
                    >
                        <animateTransform attributeName="transform" type="rotate"
                            from="0 100 100" to="360 100 100" dur={`${speed}s`} repeatCount="indefinite" />
                        <animate attributeName="rx" values={isActive ? "48;62;48" : "52;60;52"} dur={`${speed * 1.3}s`} repeatCount="indefinite" />
                        <animate attributeName="ry" values={isActive ? "42;56;42" : "46;54;46"} dur={`${speed * 0.9}s`} repeatCount="indefinite" />
                        <animate attributeName="strokeDashoffset" from="0" to="310" dur={`${speed * 1.5}s`} repeatCount="indefinite" />
                    </ellipse>
                </g>

                {/* Ring 2 — Counter-rotating amber ring */}
                <g filter="url(#ng1)">
                    <ellipse cx="100" cy="100" rx="48" ry="55" fill="none"
                        stroke="#f9ab00" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray="80 40 50 45 65 30" opacity="0.9"
                    >
                        <animateTransform attributeName="transform" type="rotate"
                            from="360 100 100" to="0 100 100" dur={`${speed * 1.15}s`} repeatCount="indefinite" />
                        <animate attributeName="rx" values={isActive ? "42;55;42" : "45;52;45"} dur={`${speed}s`} repeatCount="indefinite" />
                        <animate attributeName="ry" values={isActive ? "48;60;48" : "52;58;52"} dur={`${speed * 1.3}s`} repeatCount="indefinite" />
                        <animate attributeName="strokeDashoffset" from="310" to="0" dur={`${speed * 1.3}s`} repeatCount="indefinite" />
                    </ellipse>
                </g>

                {/* Ring 3 — Inner bright gold */}
                <g filter="url(#ng2)">
                    <ellipse cx="100" cy="100" rx="38" ry="48" fill="none"
                        stroke="#e8a409" strokeWidth="2.5" strokeLinecap="round"
                        strokeDasharray="60 35 50 40 45 30" opacity="0.8"
                    >
                        <animateTransform attributeName="transform" type="rotate"
                            from="60 100 100" to="-300 100 100" dur={`${speed * 0.85}s`} repeatCount="indefinite" />
                        <animate attributeName="rx" values={isActive ? "32;45;32" : "35;42;35"} dur={`${speed * 1.1}s`} repeatCount="indefinite" />
                        <animate attributeName="ry" values={isActive ? "42;54;42" : "45;52;45"} dur={`${speed * 0.8}s`} repeatCount="indefinite" />
                        <animate attributeName="strokeDashoffset" from="0" to="-270" dur={`${speed * 1.1}s`} repeatCount="indefinite" />
                    </ellipse>
                </g>

                {/* Ring 4 — Thin fast accent */}
                <g filter="url(#ng2)">
                    <ellipse cx="100" cy="100" rx="55" ry="40" fill="none"
                        stroke="#c7850a" strokeWidth="1.8" strokeLinecap="round"
                        strokeDasharray="40 55 35 70 25 45" opacity="0.6"
                    >
                        <animateTransform attributeName="transform" type="rotate"
                            from="30 100 100" to="390 100 100" dur={`${speed * 1.4}s`} repeatCount="indefinite" />
                        <animate attributeName="rx" values="52;60;52" dur={`${speed * 1.2}s`} repeatCount="indefinite" />
                        <animate attributeName="ry" values="38;46;38" dur={`${speed * 0.95}s`} repeatCount="indefinite" />
                    </ellipse>
                </g>

                {/* Ring 5 — Wispy thin outer */}
                <g filter="url(#ng2)">
                    <ellipse cx="100" cy="100" rx="62" ry="45" fill="none"
                        stroke="#b07508" strokeWidth="1.2" strokeLinecap="round"
                        strokeDasharray="25 70 20 80 30 50" opacity="0.4"
                    >
                        <animateTransform attributeName="transform" type="rotate"
                            from="200 100 100" to="-160 100 100" dur={`${speed * 1.6}s`} repeatCount="indefinite" />
                        <animate attributeName="rx" values="60;66;60" dur={`${speed * 1.3}s`} repeatCount="indefinite" />
                        <animate attributeName="ry" values="42;50;42" dur={`${speed}s`} repeatCount="indefinite" />
                    </ellipse>
                </g>

                {/* ======== EXTRA: Bright highlight streaks ======== */}
                <g filter="url(#ng1)">
                    <ellipse cx="100" cy="100" rx="50" ry="53" fill="none"
                        stroke="#ffc530" strokeWidth="1.5" strokeLinecap="round"
                        strokeDasharray="15 200" opacity="0.85"
                    >
                        <animateTransform attributeName="transform" type="rotate"
                            from="0 100 100" to="360 100 100" dur={`${speed * 0.7}s`} repeatCount="indefinite" />
                        <animate attributeName="rx" values="47;55;47" dur={`${speed}s`} repeatCount="indefinite" />
                        <animate attributeName="ry" values="50;57;50" dur={`${speed * 0.8}s`} repeatCount="indefinite" />
                    </ellipse>
                </g>
                <g filter="url(#ng1)">
                    <ellipse cx="100" cy="100" rx="44" ry="56" fill="none"
                        stroke="#ffc530" strokeWidth="1.5" strokeLinecap="round"
                        strokeDasharray="12 210" opacity="0.75"
                    >
                        <animateTransform attributeName="transform" type="rotate"
                            from="180 100 100" to="-180 100 100" dur={`${speed * 0.9}s`} repeatCount="indefinite" />
                        <animate attributeName="rx" values="40;50;40" dur={`${speed * 0.85}s`} repeatCount="indefinite" />
                        <animate attributeName="ry" values="53;60;53" dur={`${speed * 1.1}s`} repeatCount="indefinite" />
                    </ellipse>
                </g>

                {/* ======== MOOD EFFECTS ======== */}

                {/* Speaking: expanding pulse waves */}
                {mood === 'speaking' && (
                    <>
                        <circle cx="100" cy="100" r="50" fill="none" stroke="#d4900a" strokeWidth="1.5" opacity="0.35">
                            <animate attributeName="r" from="50" to="85" dur="1.1s" repeatCount="indefinite" />
                            <animate attributeName="opacity" from="0.35" to="0" dur="1.1s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="100" cy="100" r="50" fill="none" stroke="#f9ab00" strokeWidth="1" opacity="0.25">
                            <animate attributeName="r" from="50" to="85" dur="1.1s" begin="0.4s" repeatCount="indefinite" />
                            <animate attributeName="opacity" from="0.25" to="0" dur="1.1s" begin="0.4s" repeatCount="indefinite" />
                        </circle>
                    </>
                )}

                {/* Happy: floating sparks */}
                {isHappy && (
                    <>
                        <circle cx="100" cy="38" r="2" fill="#ffc530">
                            <animate attributeName="cy" from="38" to="25" dur="1.6s" repeatCount="indefinite" />
                            <animate attributeName="opacity" from="0.8" to="0" dur="1.6s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="148" cy="60" r="1.5" fill="#d4900a">
                            <animate attributeName="cx" from="148" to="160" dur="1.6s" begin="0.3s" repeatCount="indefinite" />
                            <animate attributeName="opacity" from="0.7" to="0" dur="1.6s" begin="0.3s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="52" cy="65" r="1.5" fill="#f9ab00">
                            <animate attributeName="cx" from="52" to="40" dur="1.6s" begin="0.6s" repeatCount="indefinite" />
                            <animate attributeName="opacity" from="0.7" to="0" dur="1.6s" begin="0.6s" repeatCount="indefinite" />
                        </circle>
                    </>
                )}

            </svg>
        </div>
    );
}
