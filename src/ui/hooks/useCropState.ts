import { useState, useEffect } from 'react';
import type { CropState, CropperUIState } from '../../types/Crop';

const TARGET_VIEWPORT_SIZE = 550;

export function useCropState(
  img: HTMLImageElement | null,
  initialCropState: CropState | null
) {
  const [state, setState] = useState<CropperUIState | null>(null);

  useEffect(() => {
    if (!img) return;

    if (initialCropState) {
      // Restore previous crop state
      setState({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        currentImgWidth: img.naturalWidth,
        currentImgHeight: img.naturalHeight,
        ...initialCropState,
        isDraggingImage: false,
        lastMouseX: 0,
        lastMouseY: 0,
        isResizingBox: false,
        resizeDir: null,
        resizeStartBoxWidth: 0,
        resizeStartBoxHeight: 0,
        resizeStartBoxOffsetX: 0,
        resizeStartBoxOffsetY: 0,
        isAnimating: false,
      });
    } else {
      // Initialize new crop state
      const imgAspect = img.naturalWidth / img.naturalHeight;
      let boxW: number, boxH: number;

      if (imgAspect > 1) {
        boxW = TARGET_VIEWPORT_SIZE;
        boxH = TARGET_VIEWPORT_SIZE / imgAspect;
      } else {
        boxH = TARGET_VIEWPORT_SIZE;
        boxW = TARGET_VIEWPORT_SIZE * imgAspect;
      }

      const initialScale = boxW / img.naturalWidth;

      setState({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        currentImgWidth: img.naturalWidth,
        currentImgHeight: img.naturalHeight,
        scale: initialScale,
        baseScale: initialScale,
        smoothRotation: 0,
        baseRotationIndex: 0,
        flipX: 1,
        flipY: 1,
        panX: 0,
        panY: 0,
        boxWidth: boxW,
        boxHeight: boxH,
        boxOffsetX: 0,
        boxOffsetY: 0,
        aspectRatioVal: null,
        isDraggingImage: false,
        lastMouseX: 0,
        lastMouseY: 0,
        isResizingBox: false,
        resizeDir: null,
        resizeStartBoxWidth: 0,
        resizeStartBoxHeight: 0,
        resizeStartBoxOffsetX: 0,
        resizeStartBoxOffsetY: 0,
        isAnimating: false,
      });
    }
  }, [img, initialCropState]);

  const updateState = (updates: Partial<CropperUIState>) => {
    setState(prev => prev ? { ...prev, ...updates } : null);
  };

  return { state, updateState };
}

export function getCropStateFromUI(state: CropperUIState): CropState {
  return {
    scale: state.scale,
    baseScale: state.baseScale,
    smoothRotation: state.smoothRotation,
    baseRotationIndex: state.baseRotationIndex,
    flipX: state.flipX,
    flipY: state.flipY,
    panX: state.panX,
    panY: state.panY,
    boxWidth: state.boxWidth,
    boxHeight: state.boxHeight,
    boxOffsetX: state.boxOffsetX,
    boxOffsetY: state.boxOffsetY,
    aspectRatioVal: state.aspectRatioVal,
  };
}

export function getBoxCorners(state: CropperUIState) {
  const halfW = state.boxWidth / 2;
  const halfH = state.boxHeight / 2;
  return [
    { x: state.boxOffsetX - halfW, y: state.boxOffsetY - halfH },
    { x: state.boxOffsetX + halfW, y: state.boxOffsetY - halfH },
    { x: state.boxOffsetX + halfW, y: state.boxOffsetY + halfH },
    { x: state.boxOffsetX - halfW, y: state.boxOffsetY + halfH },
  ];
}

export function getRequiredScale(currentState: CropperUIState): number {
  const corners = getBoxCorners(currentState);
  const rad = currentState.smoothRotation * Math.PI / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  let requiredScale = 0;
  const halfImgW = currentState.currentImgWidth / 2;
  const halfImgH = currentState.currentImgHeight / 2;

  corners.forEach(p => {
    const rx = p.x * cos - p.y * sin;
    const ry = p.x * sin + p.y * cos;
    const distX = Math.abs(rx - currentState.panX);
    const distY = Math.abs(ry - currentState.panY);
    const sX = distX / halfImgW;
    const sY = distY / halfImgH;
    requiredScale = Math.max(requiredScale, sX, sY);
  });

  return requiredScale;
}
