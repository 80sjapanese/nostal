import { useEffect, useRef } from 'react';
import type { CropperUIState } from '../../types/Crop';
import { getRequiredScale } from './useCropState';
import { calculateResize, clampPan, animateReset } from './useCropLogic';

/**
 * クロップのマウスインタラクションを管理するフック
 */
export function useCropInteraction(
  state: CropperUIState | null,
  updateState: (updates: Partial<CropperUIState>) => void
) {
  // Keep refs to avoid reattaching listeners each state change
  const stateRef = useRef<CropperUIState | null>(state);
  const updateRef = useRef<typeof updateState>(updateState);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { updateRef.current = updateState; }, [updateState]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const st = stateRef.current;
      const upd = updateRef.current;
      if (!st || st.isAnimating) return;

      const dx = e.clientX - st.lastMouseX;
      const dy = e.clientY - st.lastMouseY;

      if (st.isDraggingImage) {
        const rad = st.smoothRotation * Math.PI / 180;
        const cos = Math.cos(-rad);
        const sin = Math.sin(-rad);
        const localDx = dx * cos - dy * sin;
        const localDy = dx * sin + dy * cos;

        const newPanX = st.panX + localDx;
        const newPanY = st.panY + localDy;

        const clamped = clampPan({ ...st, panX: newPanX, panY: newPanY });
        upd({
          ...clamped,
          lastMouseX: e.clientX,
          lastMouseY: e.clientY,
        });
      }

      if (st.isResizingBox && st.resizeDir) {
        const res = calculateResize(
          dx,
          dy,
          st.resizeDir,
          st.resizeStartBoxWidth,
          st.resizeStartBoxHeight,
          st.resizeStartBoxOffsetX,
          st.resizeStartBoxOffsetY,
          st.aspectRatioVal !== null,
          st
        );

        upd({
          boxWidth: res.w,
          boxHeight: res.h,
          boxOffsetX: res.x,
          boxOffsetY: res.y,
        });
      }
    };

    const handleMouseUp = () => {
      const st = stateRef.current;
      const upd = updateRef.current;
      if (!st) return;

      if (st.isResizingBox) {
        upd({ isDraggingImage: false, isResizingBox: false });
        animateReset(st, upd);
      } else {
        upd({ isDraggingImage: false });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);
}

/**
 * スケールとパンを回転に合わせて更新
 */
export function updateScaleAndPanForRotation(
  currentState: CropperUIState,
  updateState: (updates: Partial<CropperUIState>) => void
): void {
  const prevScale = currentState.scale;
  const reqScale = getRequiredScale(currentState);
  const newScale = Math.max(reqScale, currentState.baseScale);
  
  if (Math.abs(newScale - prevScale) > 1e-9 && prevScale > 0) {
    const ratio = newScale / prevScale;
    updateState({
      scale: newScale,
      panX: currentState.panX * ratio,
      panY: currentState.panY * ratio,
    });
  } else {
    updateState({ scale: Math.max(currentState.scale, reqScale) });
  }
}
