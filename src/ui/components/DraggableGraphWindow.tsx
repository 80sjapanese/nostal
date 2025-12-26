import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';

// グラフタイプの定義
const GRAPH_TYPES = [
  { value: 'histogram', label: 'Histogram' },
  { value: 'rgb-parade', label: 'RGB Parade' },
  { value: 'waveform', label: 'Waveform' },
  { value: 'vectorscope', label: 'Vectorscope' },
];

interface DraggableGraphWindowProps {
  previewCanvasRef?: React.RefObject<HTMLCanvasElement>;
}

export const DraggableGraphWindow: React.FC<DraggableGraphWindowProps> = ({ previewCanvasRef }) => {
  const { graphWindow, setGraphWindowPosition, setGraphType, toggleGraphWindow } = useAppStore();
  const { isOpen, position, selectedGraphType } = graphWindow;
  
  const windowRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const pendingPosRef = useRef(position);
  const rafRef = useRef<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    // ヘッダー部分のみでドラッグを開始
    if ((e.target as HTMLElement).closest('.graph-window-header')) {
      setIsDragging(true);
      const rect = windowRef.current!.getBoundingClientRect();
      dragOffsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      pendingPosRef.current = position;
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffsetRef.current.x;
      const newY = e.clientY - dragOffsetRef.current.y;
      
      // 画面外に出ないように制限
      const maxX = window.innerWidth - (windowRef.current?.offsetWidth || 400);
      const maxY = window.innerHeight - (windowRef.current?.offsetHeight || 300);
      pendingPosRef.current = {
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      };

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          const el = windowRef.current;
          if (el) {
            const { x, y } = pendingPosRef.current;
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
          }
          rafRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setGraphWindowPosition(pendingPosRef.current);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setGraphWindowPosition]);

  useEffect(() => {
    // ウィンドウ開閉や外部更新時にDOMの位置を同期
    const el = windowRef.current;
    if (el) {
      el.style.left = `${position.x}px`;
      el.style.top = `${position.y}px`;
    }
    pendingPosRef.current = position;
  }, [isOpen, position]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      ref={windowRef}
      className="graph-window"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: '400px',
        height: '320px',
        backgroundColor: '#2a2a2a',
        border: '1px solid #444',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* ヘッダー */}
      <div
        className="graph-window-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: '#1a1a1a',
          borderBottom: '1px solid #444',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        {/* 左側：グラフタイプ選択 */}
        <select
          value={selectedGraphType}
          onChange={(e) => setGraphType(e.target.value)}
          style={{
            padding: '4px 8px',
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            outline: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {GRAPH_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>

        {/* 右側：閉じるボタン */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleGraphWindow();
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#888',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: '1',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
        >
          ✕
        </button>
      </div>

      {/* グラフ表示エリア */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'stretch',
          padding: 0,
          backgroundColor: '#1a1a1a',
        }}
      >
        {selectedGraphType === 'histogram' ? (
          <div style={{ width: '100%', height: '100%' }}>
            {/* Lazy import to avoid circular deps */}
            <HistogramMount previewCanvasRef={previewCanvasRef} />
          </div>
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            color: '#666',
            fontSize: '14px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: '8px' }}>📊</div>
              <div>{GRAPH_TYPES.find(t => t.value === selectedGraphType)?.label}</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                (Coming soon...)
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Separate small component to avoid top-level import cycles
const HistogramMount: React.FC<{ previewCanvasRef?: React.RefObject<HTMLCanvasElement> }>
  = ({ previewCanvasRef }) => {
  const [Comp, setComp] = React.useState<React.ComponentType<{ previewCanvasRef?: React.RefObject<HTMLCanvasElement> }> | null>(null);
  useEffect(() => {
    let mounted = true;
    import('../graphs').then(mod => {
      if (mounted) setComp(() => mod.HistogramView);
    });
    return () => { mounted = false; };
  }, []);
  return Comp ? <Comp previewCanvasRef={previewCanvasRef} /> : null;
};
