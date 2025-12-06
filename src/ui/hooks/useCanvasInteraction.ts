import { useCallback, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';

/**
 * キャンバスに対するユーザー操作（比較、全画面表示、ドラッグ・ズーム）を管理するフック
 */
export const useCanvasInteraction = () => {
  const { 
    setIsComparing, 
    toggleFullscreen, 
    isFullscreen, 
    setViewTransform,
    viewTransform 
  } = useAppStore();

  const interactionRef = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    isDragging: false,
    initialTransform: { x: 0, y: 0, scale: 1 }
  });

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // タッチ操作の場合、スクロールを防ぐために preventDefault を呼ぶ必要がある場合があるが、
    // ここではCSSの touch-action: none で制御することを前提とする。
    
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    interactionRef.current = {
      startX: clientX,
      startY: clientY,
      startTime: Date.now(),
      isDragging: false,
      initialTransform: { ...viewTransform }
    };

    setIsComparing(true);
  }, [setIsComparing, viewTransform]);

  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isFullscreen) return;

    // マウスの場合、ボタンが押されていなければ無視
    const isMouseDown = 'buttons' in e ? (e.buttons === 1) : true;
    if (!isMouseDown) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const dx = clientX - interactionRef.current.startX;
    const dy = clientY - interactionRef.current.startY;

    // ドラッグ判定の閾値 (5px)
    if (!interactionRef.current.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      interactionRef.current.isDragging = true;
    }

    if (interactionRef.current.isDragging) {
      setViewTransform(prev => ({
        ...prev,
        x: interactionRef.current.initialTransform.x + dx,
        y: interactionRef.current.initialTransform.y + dy
      }));
    }
  }, [isFullscreen, setViewTransform]);

  const handleEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsComparing(false);

    const endTime = Date.now();
    const duration = endTime - interactionRef.current.startTime;
    const isDrag = interactionRef.current.isDragging;

    // ドラッグしておらず、かつ短時間のクリックであれば全画面切り替え
    // 全画面モードでドラッグした場合は切り替えない
    if (!isDrag && duration < 200) {
      toggleFullscreen();
    }
  }, [setIsComparing, toggleFullscreen]);

  const handleLeave = useCallback(() => {
    setIsComparing(false);
  }, [setIsComparing]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isFullscreen) return;
    
    // ズームロジック
    const scaleAmount = -e.deltaY * 0.001;
    const newScale = Math.max(0.1, Math.min(5, viewTransform.scale * (1 + scaleAmount)));
    
    setViewTransform(prev => ({
      ...prev,
      scale: newScale
    }));
  }, [isFullscreen, viewTransform, setViewTransform]);

  return {
    onMouseDown: handleStart,
    onMouseMove: handleMove,
    onMouseUp: handleEnd,
    onMouseLeave: handleLeave,
    
    onTouchStart: handleStart,
    onTouchMove: handleMove,
    onTouchEnd: handleEnd,
    onTouchCancel: handleEnd,
    
    onWheel: handleWheel,
    
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    
    style: { 
      cursor: isFullscreen ? 'grab' : 'pointer',
      touchAction: 'none' // ブラウザのスクロールなどを無効化
    } as React.CSSProperties
  };
};