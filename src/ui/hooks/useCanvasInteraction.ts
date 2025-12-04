import { useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';

/**
 * キャンバスに対するユーザー操作（比較、将来的なドラッグ・ズーム）を管理するフック
 */
export const useCanvasInteraction = () => {
  const setIsComparing = useAppStore((state) => state.setIsComparing);

  // マウスダウン / タッチ開始
  const handleStart = useCallback(() => {
    setIsComparing(true);
  }, [setIsComparing]);

  // マウスアップ / マウスリーブ / タッチ終了
  const handleEnd = useCallback(() => {
    setIsComparing(false);
  }, [setIsComparing]);

  return {
    // これらを対象のdivやcanvasにスプレッド展開する
    onMouseDown: handleStart,
    onMouseUp: handleEnd,
    onMouseLeave: handleEnd,
    
    onTouchStart: handleStart,
    onTouchEnd: handleEnd,
    onTouchCancel: handleEnd,
    
    // 右クリックメニュー防止（長押し時の妨げになるため）
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    
    // 将来的にドラッグ操作を追加する場合はここに onMouseMove などを追加
    style: { cursor: 'pointer' } as React.CSSProperties // 押せる感触を出す
  };
};