import { useRef, useState, useEffect, useCallback } from 'react';
import { Pen, Eraser, Type, Square, Circle, Minus, ArrowRight, Undo2, Redo2, Trash2, Download, Palette } from 'lucide-react';

type Tool = 'pen' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'line' | 'arrow';

interface CanvasAction {
  imageData: ImageData;
}

const PRESET_COLORS = [
  '#ffffff', '#f9ab00', '#ef4444', '#22c55e', '#3b82f6',
  '#a855f7', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
];

const TOOL_LIST: { id: Tool; icon: typeof Pen; label: string }[] = [
  { id: 'pen', icon: Pen, label: 'Stift' },
  { id: 'eraser', icon: Eraser, label: 'Radierer' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'rectangle', icon: Square, label: 'Rechteck' },
  { id: 'circle', icon: Circle, label: 'Kreis' },
  { id: 'line', icon: Minus, label: 'Linie' },
  { id: 'arrow', icon: ArrowRight, label: 'Pfeil' },
];

export default function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [undoStack, setUndoStack] = useState<CanvasAction[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasAction[]>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState('#f9ab00');
  const previewRef = useRef<ImageData | null>(null);

  const getCtx = useCallback(() => {
    return canvasRef.current?.getContext('2d') ?? null;
  }, []);

  // Save current state for undo
  const saveState = useCallback(() => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setUndoStack(prev => [...prev, { imageData }]);
    setRedoStack([]);
  }, [getCtx]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Save current content
      let savedData: ImageData | null = null;
      if (canvas.width > 0 && canvas.height > 0) {
        savedData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }

      canvas.width = rect.width;
      canvas.height = rect.height;

      // Fill background
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0a0a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Restore content
      if (savedData) {
        ctx.putImageData(savedData, 0, 0);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const undo = useCallback(() => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas || undoStack.length === 0) return;

    // Save current state for redo
    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setRedoStack(prev => [...prev, { imageData: currentData }]);

    // Restore previous state
    const prev = undoStack[undoStack.length - 1];
    ctx.putImageData(prev.imageData, 0, 0);
    setUndoStack(s => s.slice(0, -1));
  }, [getCtx, undoStack]);

  const redo = useCallback(() => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas || redoStack.length === 0) return;

    // Save current state for undo
    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setUndoStack(prev => [...prev, { imageData: currentData }]);

    const next = redoStack[redoStack.length - 1];
    ctx.putImageData(next.imageData, 0, 0);
    setRedoStack(s => s.slice(0, -1));
  }, [getCtx, redoStack]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const getCanvasPos = (e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    const headLen = Math.max(10, brushSize * 4);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    const ctx = getCtx();
    if (!ctx) return;

    if (tool === 'text') {
      saveState();
      const text = prompt('Text eingeben:');
      if (text) {
        ctx.font = `${Math.max(14, brushSize * 4)}px sans-serif`;
        ctx.fillStyle = color;
        ctx.fillText(text, pos.x, pos.y);
      }
      return;
    }

    saveState();
    setIsDrawing(true);
    setStartPos(pos);

    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize;
      ctx.strokeStyle = tool === 'eraser'
        ? (getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0a0a0f')
        : color;
    }

    // For shape tools, save a snapshot to restore during preview
    if (['rectangle', 'circle', 'line', 'arrow'].includes(tool)) {
      const canvas = canvasRef.current!;
      previewRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const pos = getCanvasPos(e);

    if (tool === 'pen' || tool === 'eraser') {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      return;
    }

    // Shape preview: restore snapshot then draw shape
    if (startPos && previewRef.current) {
      ctx.putImageData(previewRef.current, 0, 0);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';

      const w = pos.x - startPos.x;
      const h = pos.y - startPos.y;

      switch (tool) {
        case 'rectangle':
          ctx.strokeRect(startPos.x, startPos.y, w, h);
          break;
        case 'circle': {
          const rx = Math.abs(w) / 2;
          const ry = Math.abs(h) / 2;
          const cx = startPos.x + w / 2;
          const cy = startPos.y + h / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'line':
          ctx.beginPath();
          ctx.moveTo(startPos.x, startPos.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
          break;
        case 'arrow':
          drawArrow(ctx, startPos.x, startPos.y, pos.x, pos.y);
          break;
      }
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setStartPos(null);
    previewRef.current = null;
    const ctx = getCtx();
    if (ctx && (tool === 'pen' || tool === 'eraser')) {
      ctx.closePath();
    }
  };

  const clearCanvas = () => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    saveState();
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const exportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--bg-primary)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {/* Tool buttons */}
        {TOOL_LIST.map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={t.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 6,
              border: tool === t.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
              background: tool === t.id ? 'rgba(249,171,0,0.12)' : 'transparent',
              color: tool === t.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <t.icon size={18} />
          </button>
        ))}

        {/* Separator */}
        <div style={{ width: 1, height: 28, background: 'var(--border-subtle)', margin: '0 4px' }} />

        {/* Color presets */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: c,
                border: color === c ? '2px solid var(--accent-primary)' : '2px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'border 0.15s',
                boxShadow: color === c ? '0 0 6px var(--accent-primary)' : 'none',
              }}
            />
          ))}

          {/* Custom color button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              title="Eigene Farbe"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '2px solid var(--border-subtle)',
                background: customColor,
                cursor: 'pointer',
              }}
            >
              <Palette size={12} color="#000" />
            </button>
            {showColorPicker && (
              <div style={{
                position: 'absolute',
                top: 30,
                left: 0,
                zIndex: 50,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}>
                <input
                  type="color"
                  value={customColor}
                  onChange={e => {
                    setCustomColor(e.target.value);
                    setColor(e.target.value);
                  }}
                  style={{ width: 48, height: 32, border: 'none', cursor: 'pointer', background: 'transparent' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 28, background: 'var(--border-subtle)', margin: '0 4px' }} />

        {/* Brush size */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>Groesse: {brushSize}</span>
          <input
            type="range"
            min={1}
            max={30}
            value={brushSize}
            onChange={e => setBrushSize(Number(e.target.value))}
            style={{ width: 80, accentColor: 'var(--accent-primary)' }}
          />
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 28, background: 'var(--border-subtle)', margin: '0 4px' }} />

        {/* Undo / Redo */}
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Rueckgaengig (Strg+Z)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 6,
            border: '1px solid var(--border-subtle)', background: 'transparent',
            color: undoStack.length === 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
            cursor: undoStack.length === 0 ? 'default' : 'pointer',
            opacity: undoStack.length === 0 ? 0.4 : 1,
          }}
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Wiederherstellen (Strg+Y)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 6,
            border: '1px solid var(--border-subtle)', background: 'transparent',
            color: redoStack.length === 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
            cursor: redoStack.length === 0 ? 'default' : 'pointer',
            opacity: redoStack.length === 0 ? 0.4 : 1,
          }}
        >
          <Redo2 size={18} />
        </button>

        {/* Separator */}
        <div style={{ width: 1, height: 28, background: 'var(--border-subtle)', margin: '0 4px' }} />

        {/* Clear */}
        <button
          onClick={clearCanvas}
          title="Alles loeschen"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 6,
            border: '1px solid var(--border-subtle)', background: 'transparent',
            color: '#ef4444', cursor: 'pointer',
          }}
        >
          <Trash2 size={18} />
        </button>

        {/* Export */}
        <button
          onClick={exportPNG}
          title="Als PNG exportieren"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 6,
            border: '1px solid var(--accent-primary)',
            background: 'rgba(249,171,0,0.1)',
            color: 'var(--accent-primary)', cursor: 'pointer',
            fontSize: 13, fontWeight: 500,
          }}
        >
          <Download size={16} />
          PNG Export
        </button>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', cursor: tool === 'text' ? 'text' : 'crosshair' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ display: 'block' }}
        />
      </div>
    </div>
  );
}
