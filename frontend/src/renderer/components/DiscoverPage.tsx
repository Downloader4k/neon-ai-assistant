import { useState, useEffect } from 'react';
import { useAppStore, ViewMode } from '../store/useAppStore';
import { Sparkles } from 'lucide-react';

// --- Card Illustration Backgrounds ---

const CardIllustration = ({ type, size = 'large' }: { type: string; size?: 'large' | 'small' }) => {
  const w = size === 'large' ? 400 : 200;
  const h = size === 'large' ? 240 : 120;

  const illustrations: Record<string, JSX.Element> = {
    briefing: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#2a2010" />
        <circle cx={w * 0.7} cy={h * 0.3} r={h * 0.35} fill="#FF9800" opacity="0.35" />
        <circle cx={w * 0.7} cy={h * 0.3} r={h * 0.2} fill="#FF9800" opacity="0.35" />
        <circle cx={w * 0.3} cy={h * 0.6} r={h * 0.25} fill="#FF6B35" opacity="0.18" />
        {/* Sun */}
        <circle cx={w * 0.7} cy={h * 0.3} r={h * 0.12} fill="#f9ab00" opacity="0.9" />
        {/* Rays */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          const inner = h * 0.16;
          const outer = h * 0.22;
          const cx = w * 0.7;
          const cy = h * 0.3;
          return <line key={i} x1={cx + Math.cos(rad) * inner} y1={cy + Math.sin(rad) * inner} x2={cx + Math.cos(rad) * outer} y2={cy + Math.sin(rad) * outer} stroke="#f9ab00" strokeWidth="2" opacity="0.6" strokeLinecap="round" />;
        })}
        {/* Coffee cup */}
        <rect x={w * 0.15} y={h * 0.4} width={h * 0.2} height={h * 0.25} rx="4" fill="#FF9800" opacity="0.5" />
        <path d={`M${w * 0.15 + h * 0.2} ${h * 0.45} Q${w * 0.15 + h * 0.28} ${h * 0.45} ${w * 0.15 + h * 0.28} ${h * 0.52} Q${w * 0.15 + h * 0.28} ${h * 0.58} ${w * 0.15 + h * 0.2} ${h * 0.58}`} stroke="#FF9800" strokeWidth="2" fill="none" opacity="0.4" />
        {/* Steam */}
        <path d={`M${w * 0.18} ${h * 0.35} Q${w * 0.2} ${h * 0.28} ${w * 0.18} ${h * 0.22}`} stroke="#FF9800" strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round" />
        <path d={`M${w * 0.22} ${h * 0.36} Q${w * 0.24} ${h * 0.29} ${w * 0.22} ${h * 0.23}`} stroke="#FF9800" strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round" />
      </svg>
    ),
    challenges: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#2a1510" />
        <circle cx={w * 0.5} cy={h * 0.45} r={h * 0.4} fill="#FF5722" opacity="0.16" />
        {/* Trophy */}
        <rect x={w * 0.38} y={h * 0.25} width={w * 0.24} height={h * 0.3} rx="8" fill="#FF5722" opacity="0.4" />
        <rect x={w * 0.42} y={h * 0.2} width={w * 0.16} height={h * 0.15} rx={h * 0.08} fill="#f9ab00" opacity="0.5" />
        <rect x={w * 0.44} y={h * 0.55} width={w * 0.12} height={h * 0.08} rx="3" fill="#FF5722" opacity="0.4" />
        <rect x={w * 0.4} y={h * 0.62} width={w * 0.2} height={h * 0.05} rx="2" fill="#FF5722" opacity="0.4" />
        {/* Stars */}
        <circle cx={w * 0.2} cy={h * 0.25} r="4" fill="#f9ab00" opacity="0.5" />
        <circle cx={w * 0.8} cy={h * 0.3} r="3" fill="#f9ab00" opacity="0.4" />
        <circle cx={w * 0.75} cy={h * 0.65} r="5" fill="#FF5722" opacity="0.4" />
        <circle cx={w * 0.15} cy={h * 0.7} r="3" fill="#FF9800" opacity="0.4" />
      </svg>
    ),
    whiteboard: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#221520" />
        <circle cx={w * 0.3} cy={h * 0.4} r={h * 0.35} fill="#E91E63" opacity="0.16" />
        <circle cx={w * 0.7} cy={h * 0.6} r={h * 0.3} fill="#9C27B0" opacity="0.4" />
        {/* Canvas frame */}
        <rect x={w * 0.15} y={h * 0.15} width={w * 0.7} height={h * 0.65} rx="8" fill="#E91E63" opacity="0.16" stroke="#E91E63" strokeWidth="1.5" />
        {/* Brush strokes */}
        <path d={`M${w * 0.25} ${h * 0.6} Q${w * 0.4} ${h * 0.25} ${w * 0.55} ${h * 0.5} Q${w * 0.65} ${h * 0.7} ${w * 0.75} ${h * 0.35}`} stroke="#E91E63" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
        <circle cx={w * 0.35} cy={h * 0.35} r="8" fill="#9C27B0" opacity="0.4" />
        <rect x={w * 0.6} y={h * 0.55} width="16" height="16" rx="3" fill="#FF9800" opacity="0.4" />
      </svg>
    ),
    notes: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#251212" />
        <circle cx={w * 0.6} cy={h * 0.5} r={h * 0.4} fill="#F44336" opacity="0.4" />
        {/* Lock */}
        <rect x={w * 0.4} y={h * 0.4} width={w * 0.2} height={h * 0.3} rx="6" fill="#F44336" opacity="0.4" />
        <path d={`M${w * 0.43} ${h * 0.4} L${w * 0.43} ${h * 0.3} Q${w * 0.43} ${h * 0.15} ${w * 0.5} ${h * 0.15} Q${w * 0.57} ${h * 0.15} ${w * 0.57} ${h * 0.3} L${w * 0.57} ${h * 0.4}`} stroke="#F44336" strokeWidth="3" fill="none" opacity="0.4" />
        <circle cx={w * 0.5} cy={h * 0.52} r="4" fill="#F44336" opacity="0.6" />
        {/* Note lines */}
        <rect x={w * 0.2} y={h * 0.3} width={w * 0.12} height="2" rx="1" fill="#F44336" opacity="0.35" />
        <rect x={w * 0.2} y={h * 0.38} width={w * 0.1} height="2" rx="1" fill="#F44336" opacity="0.18" />
        <rect x={w * 0.68} y={h * 0.45} width={w * 0.12} height="2" rx="1" fill="#F44336" opacity="0.35" />
        <rect x={w * 0.7} y={h * 0.53} width={w * 0.08} height="2" rx="1" fill="#F44336" opacity="0.18" />
      </svg>
    ),
    timeline: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#1e1228" />
        <circle cx={w * 0.5} cy={h * 0.5} r={h * 0.4} fill="#9C27B0" opacity="0.4" />
        {/* Timeline line */}
        <line x1={w * 0.15} y1={h * 0.5} x2={w * 0.85} y2={h * 0.5} stroke="#9C27B0" strokeWidth="2" opacity="0.4" />
        {/* Nodes */}
        {[0.2, 0.4, 0.6, 0.8].map((pos, i) => (
          <g key={i}>
            <circle cx={w * pos} cy={h * 0.5} r={8 + i * 2} fill="#9C27B0" opacity={0.15 + i * 0.08} />
            <circle cx={w * pos} cy={h * 0.5} r="4" fill="#9C27B0" opacity={0.4 + i * 0.15} />
            <rect x={w * pos - 12} y={h * 0.5 - 28 - i * 5} width="24" height="14" rx="4" fill="#9C27B0" opacity={0.1 + i * 0.05} />
          </g>
        ))}
      </svg>
    ),
    diary: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#122218" />
        <circle cx={w * 0.4} cy={h * 0.5} r={h * 0.4} fill="#4CAF50" opacity="0.4" />
        {/* Book */}
        <rect x={w * 0.3} y={h * 0.15} width={w * 0.4} height={h * 0.7} rx="6" fill="#4CAF50" opacity="0.35" />
        <line x1={w * 0.5} y1={h * 0.15} x2={w * 0.5} y2={h * 0.85} stroke="#4CAF50" strokeWidth="1.5" opacity="0.4" />
        {/* Lines */}
        {[0.3, 0.38, 0.46, 0.54, 0.62].map((y, i) => (
          <rect key={i} x={w * 0.35} y={h * y} width={w * 0.12 + i * 3} height="2" rx="1" fill="#4CAF50" opacity={0.15 + i * 0.03} />
        ))}
        {/* Pen */}
        <line x1={w * 0.65} y1={h * 0.25} x2={w * 0.72} y2={h * 0.7} stroke="#4CAF50" strokeWidth="2" opacity="0.4" strokeLinecap="round" />
      </svg>
    ),
    radar: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#121e28" />
        {/* Radar circles */}
        {[0.35, 0.25, 0.15].map((r, i) => (
          <circle key={i} cx={w * 0.5} cy={h * 0.5} r={h * r} fill="none" stroke="#2196F3" strokeWidth="1" opacity={0.1 + i * 0.05} />
        ))}
        {/* Radar fill */}
        <polygon points={`${w * 0.5},${h * 0.2} ${w * 0.7},${h * 0.35} ${w * 0.68},${h * 0.65} ${w * 0.5},${h * 0.75} ${w * 0.32},${h * 0.6} ${w * 0.35},${h * 0.32}`} fill="#2196F3" opacity="0.35" />
        <polygon points={`${w * 0.5},${h * 0.2} ${w * 0.7},${h * 0.35} ${w * 0.68},${h * 0.65} ${w * 0.5},${h * 0.75} ${w * 0.32},${h * 0.6} ${w * 0.35},${h * 0.32}`} fill="none" stroke="#2196F3" strokeWidth="1.5" opacity="0.4" />
        {/* Dots */}
        {[[0.5, 0.2], [0.7, 0.35], [0.68, 0.65], [0.5, 0.75], [0.32, 0.6], [0.35, 0.32]].map(([x, y], i) => (
          <circle key={i} cx={w * x} cy={h * y} r="4" fill="#2196F3" opacity="0.6" />
        ))}
      </svg>
    ),
    chains: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#181824" />
        <circle cx={w * 0.5} cy={h * 0.5} r={h * 0.35} fill="#3F51B5" opacity="0.4" />
        {/* Chain nodes */}
        {[0.2, 0.4, 0.6, 0.8].map((x, i) => (
          <g key={i}>
            <circle cx={w * x} cy={h * 0.5} r="14" fill="#3F51B5" opacity={0.1 + i * 0.05} />
            <circle cx={w * x} cy={h * 0.5} r="8" fill="#3F51B5" opacity={0.2 + i * 0.1} />
            {i < 3 && <line x1={w * x + 14} y1={h * 0.5} x2={w * (x + 0.2) - 14} y2={h * 0.5} stroke="#3F51B5" strokeWidth="2" opacity="0.4" strokeDasharray="4 3" />}
            {i < 3 && <polygon points={`${w * (x + 0.2) - 18},${h * 0.5 - 4} ${w * (x + 0.2) - 12},${h * 0.5} ${w * (x + 0.2) - 18},${h * 0.5 + 4}`} fill="#3F51B5" opacity="0.4" />}
          </g>
        ))}
      </svg>
    ),
    rag: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#201a15" />
        <circle cx={w * 0.6} cy={h * 0.4} r={h * 0.35} fill="#795548" opacity="0.16" />
        {/* Folder */}
        <rect x={w * 0.25} y={h * 0.3} width={w * 0.35} height={h * 0.4} rx="4" fill="#795548" opacity="0.4" />
        <rect x={w * 0.25} y={h * 0.25} width={w * 0.15} height={h * 0.08} rx="3" fill="#795548" opacity="0.35" />
        {/* Search */}
        <circle cx={w * 0.65} cy={h * 0.55} r={h * 0.15} fill="#795548" opacity="0.35" stroke="#795548" strokeWidth="2" />
        <line x1={w * 0.72} y1={h * 0.65} x2={w * 0.78} y2={h * 0.75} stroke="#795548" strokeWidth="3" opacity="0.4" strokeLinecap="round" />
        {/* Doc lines */}
        <rect x={w * 0.3} y={h * 0.4} width={w * 0.2} height="2" rx="1" fill="#795548" opacity="0.4" />
        <rect x={w * 0.3} y={h * 0.47} width={w * 0.15} height="2" rx="1" fill="#795548" opacity="0.35" />
      </svg>
    ),
    capsules: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#221220" />
        <circle cx={w * 0.5} cy={h * 0.5} r={h * 0.4} fill="#E91E63" opacity="0.4" />
        {/* Capsule/hourglass */}
        <rect x={w * 0.4} y={h * 0.15} width={w * 0.2} height={h * 0.7} rx={w * 0.1} fill="#E91E63" opacity="0.35" />
        <circle cx={w * 0.5} cy={h * 0.35} r={h * 0.1} fill="#E91E63" opacity="0.35" />
        <circle cx={w * 0.5} cy={h * 0.65} r={h * 0.1} fill="#E91E63" opacity="0.4" />
        {/* Clock hands */}
        <line x1={w * 0.5} y1={h * 0.35} x2={w * 0.55} y2={h * 0.3} stroke="#E91E63" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        {/* Sparkles */}
        <circle cx={w * 0.3} cy={h * 0.25} r="3" fill="#E91E63" opacity="0.4" />
        <circle cx={w * 0.72} cy={h * 0.7} r="4" fill="#E91E63" opacity="0.35" />
        <circle cx={w * 0.25} cy={h * 0.65} r="2" fill="#E91E63" opacity="0.4" />
      </svg>
    ),
    memory: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#152022" />
        <circle cx={w * 0.5} cy={h * 0.45} r={h * 0.35} fill="#00BCD4" opacity="0.4" />
        {/* Brain shape */}
        <ellipse cx={w * 0.45} cy={h * 0.4} rx={h * 0.2} ry={h * 0.22} fill="#00BCD4" opacity="0.4" />
        <ellipse cx={w * 0.55} cy={h * 0.4} rx={h * 0.2} ry={h * 0.22} fill="#00BCD4" opacity="0.4" />
        {/* Neural dots */}
        {[[0.4, 0.3], [0.6, 0.3], [0.35, 0.5], [0.5, 0.45], [0.65, 0.5], [0.45, 0.6], [0.55, 0.6]].map(([x, y], i) => (
          <circle key={i} cx={w * x} cy={h * y} r="3" fill="#00BCD4" opacity={0.3 + i * 0.05} />
        ))}
        {/* Connections */}
        <line x1={w * 0.4} y1={h * 0.3} x2={w * 0.5} y2={h * 0.45} stroke="#00BCD4" strokeWidth="1" opacity="0.4" />
        <line x1={w * 0.6} y1={h * 0.3} x2={w * 0.5} y2={h * 0.45} stroke="#00BCD4" strokeWidth="1" opacity="0.4" />
        <line x1={w * 0.5} y1={h * 0.45} x2={w * 0.45} y2={h * 0.6} stroke="#00BCD4" strokeWidth="1" opacity="0.4" />
        <line x1={w * 0.5} y1={h * 0.45} x2={w * 0.55} y2={h * 0.6} stroke="#00BCD4" strokeWidth="1" opacity="0.4" />
      </svg>
    ),
    code: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#1a1c22" />
        <circle cx={w * 0.5} cy={h * 0.5} r={h * 0.35} fill="#607D8B" opacity="0.4" />
        {/* Terminal */}
        <rect x={w * 0.2} y={h * 0.15} width={w * 0.6} height={h * 0.7} rx="8" fill="#607D8B" opacity="0.18" />
        <rect x={w * 0.2} y={h * 0.15} width={w * 0.6} height={h * 0.12} rx="8" fill="#607D8B" opacity="0.35" />
        {/* Dots */}
        <circle cx={w * 0.26} cy={h * 0.21} r="3" fill="#FF5F57" opacity="0.6" />
        <circle cx={w * 0.3} cy={h * 0.21} r="3" fill="#FEBC2E" opacity="0.6" />
        <circle cx={w * 0.34} cy={h * 0.21} r="3" fill="#28C840" opacity="0.6" />
        {/* Code lines */}
        <rect x={w * 0.25} y={h * 0.35} width={w * 0.15} height="3" rx="1.5" fill="#607D8B" opacity="0.35" />
        <rect x={w * 0.25} y={h * 0.44} width={w * 0.3} height="3" rx="1.5" fill="#4CAF50" opacity="0.4" />
        <rect x={w * 0.25} y={h * 0.53} width={w * 0.22} height="3" rx="1.5" fill="#2196F3" opacity="0.4" />
        <rect x={w * 0.25} y={h * 0.62} width={w * 0.35} height="3" rx="1.5" fill="#607D8B" opacity="0.35" />
      </svg>
    ),
    lernen: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#122215" />
        <circle cx={w * 0.5} cy={h * 0.5} r={h * 0.4} fill="#4CAF50" opacity="0.4" />
        <rect x={w * 0.3} y={h * 0.2} width={w * 0.4} height={h * 0.55} rx="6" fill="#4CAF50" opacity="0.4" />
        {[0.32, 0.4, 0.48, 0.56].map((y, i) => (
          <rect key={i} x={w * 0.35} y={h * y} width={w * (0.2 + i * 0.03)} height="2.5" rx="1.25" fill="#4CAF50" opacity={0.15 + i * 0.05} />
        ))}
        <path d={`M${w * 0.6} ${h * 0.65} L${w * 0.65} ${h * 0.7} L${w * 0.73} ${h * 0.58}`} stroke="#4CAF50" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
      </svg>
    ),
    kreativ: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#201520" />
        <circle cx={w * 0.35} cy={h * 0.4} r={h * 0.25} fill="#E91E63" opacity="0.18" />
        <circle cx={w * 0.55} cy={h * 0.35} r={h * 0.2} fill="#FF9800" opacity="0.16" />
        <circle cx={w * 0.45} cy={h * 0.6} r={h * 0.22} fill="#9C27B0" opacity="0.16" />
        <polygon points={`${w * 0.5},${h * 0.15} ${w * 0.55},${h * 0.3} ${w * 0.45},${h * 0.3}`} fill="#FFC107" opacity="0.4" />
        <circle cx={w * 0.3} cy={h * 0.7} r="6" fill="#E91E63" opacity="0.4" />
        <circle cx={w * 0.7} cy={h * 0.5} r="4" fill="#FF9800" opacity="0.35" />
      </svg>
    ),
    recherche: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#181a1e" />
        <circle cx={w * 0.45} cy={h * 0.45} r={h * 0.25} fill="#607D8B" opacity="0.16" stroke="#607D8B" strokeWidth="2" />
        <circle cx={w * 0.45} cy={h * 0.45} r={h * 0.15} fill="#607D8B" opacity="0.18" />
        <line x1={w * 0.58} y1={h * 0.62} x2={w * 0.7} y2={h * 0.78} stroke="#607D8B" strokeWidth="4" strokeLinecap="round" opacity="0.35" />
        <circle cx={w * 0.25} cy={h * 0.25} r="3" fill="#2196F3" opacity="0.4" />
        <circle cx={w * 0.7} cy={h * 0.3} r="4" fill="#607D8B" opacity="0.4" />
      </svg>
    ),
    produktiv: (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={w} height={h} fill="#201a12" />
        {/* Bars */}
        <rect x={w * 0.25} y={h * 0.55} width={w * 0.08} height={h * 0.3} rx="3" fill="#FF9800" opacity="0.35" />
        <rect x={w * 0.38} y={h * 0.4} width={w * 0.08} height={h * 0.45} rx="3" fill="#FF9800" opacity="0.35" />
        <rect x={w * 0.51} y={h * 0.3} width={w * 0.08} height={h * 0.55} rx="3" fill="#f9ab00" opacity="0.4" />
        <rect x={w * 0.64} y={h * 0.2} width={w * 0.08} height={h * 0.65} rx="3" fill="#f9ab00" opacity="0.5" />
        {/* Trend line */}
        <path d={`M${w * 0.29} ${h * 0.52} L${w * 0.42} ${h * 0.37} L${w * 0.55} ${h * 0.27} L${w * 0.68} ${h * 0.17}`} stroke="#f9ab00" strokeWidth="2" fill="none" opacity="0.4" strokeLinecap="round" />
      </svg>
    ),
  };

  return illustrations[type] || (
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
      <rect width={w} height={h} fill="#1a1a1a" />
      <circle cx={w * 0.5} cy={h * 0.5} r={h * 0.3} fill="#f9ab00" opacity="0.4" />
    </svg>
  );
};

// --- Data ---

interface DiscoverCard {
  id?: ViewMode;
  title: string;
  prompt?: string;
  illustrationType: string;
  color: string;
}

const ideenCards: DiscoverCard[] = [
  { id: 'briefing', title: 'Starte deinen Tag mit einem Morgenbriefing', illustrationType: 'briefing', color: '#FF9800' },
  { id: 'radar', title: 'Entdecke dein Interessen-Profil', illustrationType: 'radar', color: '#2196F3' },
  { id: 'challenges', title: 'Stelle dich einer taeglichen Challenge', illustrationType: 'challenges', color: '#FF5722' },
];

const themenCards: DiscoverCard[] = [
  { id: 'canvas', title: 'Skizziere deine Ideen auf dem Whiteboard', illustrationType: 'whiteboard', color: '#E91E63' },
  { title: 'Lerne etwas Neues mit NEON', prompt: 'Erklaere mir wie ein geduldiger Lehrer, wie ', illustrationType: 'lernen', color: '#4CAF50' },
  { title: 'Lass dich kreativ inspirieren', prompt: 'Schreibe mir eine kreative Geschichte ueber ', illustrationType: 'kreativ', color: '#9C27B0' },
];

const storysCards: DiscoverCard[] = [
  { id: 'timeline', title: 'Reise durch deinen Gedanken-Zeitstrahl', illustrationType: 'timeline', color: '#9C27B0' },
  { id: 'capsules', title: 'Sende eine Nachricht an dein zukuenftiges Ich', illustrationType: 'capsules', color: '#E91E63' },
  { id: 'diary', title: 'Lies dein KI-Tagebuch', illustrationType: 'diary', color: '#4CAF50' },
];

const toolsCards: DiscoverCard[] = [
  { id: 'code', title: 'Fuehre Code direkt im Chat aus', illustrationType: 'code', color: '#607D8B' },
  { id: 'rag', title: 'Durchsuche deine Dateien per KI', illustrationType: 'rag', color: '#795548' },
  { id: 'chains', title: 'Erstelle automatisierte KI-Workflows', illustrationType: 'chains', color: '#3F51B5' },
  { id: 'notes', title: 'Schreibe geheime Notizen', illustrationType: 'notes', color: '#F44336' },
  { id: 'memory', title: 'Verwalte NEONs Gedaechtnis', illustrationType: 'memory', color: '#00BCD4' },
  { title: 'Recherchiere im Internet', prompt: 'Recherchiere im Internet nach ', illustrationType: 'recherche', color: '#607D8B' },
];

// --- Component ---

export default function DiscoverPage({ onStartChat }: { onStartChat: (msg: string) => void }) {
  const setActiveView = useAppStore((state) => state.setActiveView);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Guten Morgen');
    else if (hour < 18) setGreeting('Guten Tag');
    else setGreeting('Guten Abend');
  }, []);

  const handleCardClick = (card: DiscoverCard) => {
    if (card.id) {
      setActiveView(card.id);
    } else if (card.prompt) {
      onStartChat(card.prompt);
    }
  };

  const renderSection = (title: string, cards: DiscoverCard[]) => (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <div style={styles.cardRow}>
        {/* Large card */}
        <button
          style={styles.cardLarge}
          onClick={() => handleCardClick(cards[0])}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = `0 12px 40px ${cards[0].color}20`; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div style={styles.cardIllustration}>
            <CardIllustration type={cards[0].illustrationType} size="large" />
          </div>
          <div style={styles.cardOverlay} />
          <span style={styles.cardLargeText}>{cards[0].title}</span>
        </button>

        {/* Two small cards stacked */}
        <div style={styles.cardSmallStack}>
          {cards.slice(1, 3).map((card, i) => (
            <button
              key={i}
              style={styles.cardSmall}
              onClick={() => handleCardClick(card)}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = `0 8px 30px ${card.color}20`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={styles.cardSmallIllustration}>
                <CardIllustration type={card.illustrationType} size="small" />
              </div>
              <span style={styles.cardSmallText}>{card.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderToolsSection = (title: string, cards: DiscoverCard[]) => (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <div style={styles.toolsGrid}>
        {cards.map((card, i) => (
          <button
            key={i}
            style={styles.toolCard}
            onClick={() => handleCardClick(card)}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.borderColor = card.color; e.currentTarget.style.boxShadow = `0 8px 24px ${card.color}15`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={styles.toolCardIllustration}>
              <CardIllustration type={card.illustrationType} size="small" />
            </div>
            <span style={styles.toolCardText}>{card.title}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Greeting */}
      <div style={styles.greeting}>
        <h1 style={styles.greetingTitle}>{greeting}!</h1>
      </div>

      {renderSection('Ideen zum Erkunden', ideenCards)}
      {renderSection('Themen, die dir gefallen koennten', themenCards)}
      {renderSection('Deine Reise', storysCards)}
      {renderToolsSection('Tools & Werkzeuge', toolsCards)}

      {/* Tip */}
      <div style={styles.tipBar}>
        <Sparkles size={14} color="var(--accent-primary)" />
        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
          Tippe <code style={styles.code}>/</code> im Chat fuer Slash-Commands
        </span>
      </div>
    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '28px 32px',
    maxWidth: '960px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  greeting: {
    textAlign: 'center',
    padding: '8px 0',
  },
  greetingTitle: {
    fontSize: '26px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  // Sections
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
    textAlign: 'center',
  },
  // Card Row (1 large + 2 small)
  cardRow: {
    display: 'grid',
    gridTemplateColumns: '1.6fr 1fr',
    gap: '12px',
    minHeight: '280px',
  },
  cardLarge: {
    position: 'relative',
    borderRadius: '20px',
    overflow: 'hidden',
    border: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    background: 'var(--bg-secondary)',
    display: 'flex',
    alignItems: 'flex-end',
    padding: 0,
    textAlign: 'left',
  },
  cardIllustration: {
    position: 'absolute',
    inset: 0,
  },
  cardOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
  },
  cardLargeText: {
    position: 'relative',
    zIndex: 1,
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
    padding: '24px',
    lineHeight: 1.3,
  },
  cardSmallStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  cardSmall: {
    position: 'relative',
    flex: 1,
    borderRadius: '20px',
    overflow: 'hidden',
    border: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    background: 'var(--bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: 0,
    textAlign: 'left',
  },
  cardSmallIllustration: {
    width: '110px',
    height: '100%',
    flexShrink: 0,
    borderRadius: '20px 0 0 20px',
    overflow: 'hidden',
  },
  cardSmallText: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    padding: '12px 16px 12px 0',
    lineHeight: 1.4,
  },
  // Tools Grid
  toolsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  toolCard: {
    position: 'relative',
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    background: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'column',
    padding: 0,
    textAlign: 'left',
  },
  toolCardIllustration: {
    width: '100%',
    height: '90px',
    overflow: 'hidden',
  },
  toolCardText: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    padding: '10px 14px 14px',
    lineHeight: 1.3,
  },
  // Tip
  tipBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px',
  },
  code: {
    background: 'var(--bg-tertiary)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    fontFamily: 'monospace',
    color: 'var(--accent-primary)',
  },
};
