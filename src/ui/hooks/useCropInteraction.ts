import { useEffect } from 'react';
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
  useEffect(() => {
    if (!state) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (state.isAnimating) return;
      
      const dx = e.clientX - state.lastMouseX;
      const dy = e.clientY - state.lastMouseY;

      if (state.isDraggingImage) {
        const rad = state.smoothRotation * Math.PI / 180;
        const cos = Math.cos(-rad);
        const sin = Math.sin(-rad);
        const localDx = dx * cos - dy * sin;
        const localDy = dx * sin + dy * cos;

        const newPanX = state.panX + localDx;
        const newPanY = state.panY + localDy;
        
        const clamped = clampPan({ ...state, panX: newPanX, panY: newPanY });
        updateState({
          ...clamped,
          lastMouseX: e.clientX,
          lastMouseY: e.clientY,
        });
      }

      if (state.isResizingBox && state.resizeDir) {
        const res = calculateResize(
          dx,
          dy,
          state.resizeDir,
          state.resizeStartBoxWidth,
          state.resizeStartBoxHeight,
          state.resizeStartBoxOffsetX,
          state.resizeStartBoxOffsetY,
          state.aspectRatioVal !== null,
          state
        );
        
        updateState({
          boxWidth: res.w,
          boxHeight: res.h,
          boxOffsetX: res.x,
          boxOffsetY: res.y,
        });
      }
    };

    const handleMouseUp = () => {
      if (!state) return;
      
      if (state.isResizingBox) {
        updateState({ isDraggingImage: false, isResizingBox: false });
        animateReset(state, updateState);
      } else {
        updateState({ isDraggingImage: false });
      }
    };

    if (state.isDraggingImage || state.isResizingBox) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [state, updateState]);
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
