import type { CropperUIState } from '../../types/Crop';
import { getBoxCorners } from './useCropState';

const TARGET_VIEWPORT_SIZE = 550;

/**
 * クロップボックスのリサイズ計算
 */
export function calculateResize(
  dx: number,
  dy: number,
  dir: string,
  startW: number,
  startH: number,
  startOffX: number,
  startOffY: number,
  keepRatio: boolean,
  currentState: CropperUIState
): { w: number; h: number; x: number; y: number } {
  const halfW = startW / 2;
  const halfH = startH / 2;
  let newL = startOffX - halfW;
  let newR = startOffX + halfW;
  let newT = startOffY - halfH;
  let newB = startOffY + halfH;

  if (dir.includes('l')) newL += dx;
  if (dir.includes('r')) newR += dx;
  if (dir.includes('t')) newT += dy;
  if (dir.includes('b')) newB += dy;

  if (newL > newR) [newL, newR] = [newR, newL];
  if (newT > newB) [newT, newB] = [newB, newT];

  if (keepRatio && currentState.aspectRatioVal) {
    const ratio = currentState.aspectRatioVal;
    
    if (dir === 'l' || dir === 'r') {
      const targetH = (newR - newL) / ratio;
      const hDiff = targetH - (newB - newT);
      newT -= hDiff / 2;
      newB += hDiff / 2;
    } else if (dir === 't' || dir === 'b') {
      const targetW = (newB - newT) * ratio;
      const wDiff = targetW - (newR - newL);
      newL -= wDiff / 2;
      newR += wDiff / 2;
    } else {
      const currentW = newR - newL;
      const currentH = newB - newT;
      if (currentW / currentH > ratio) {
        const targetH = currentW / ratio;
        if (dir.includes('t')) newT = newB - targetH;
        else newB = newT + targetH;
      } else {
        const targetW = currentH * ratio;
        if (dir.includes('l')) newL = newR - targetW;
        else newR = newL + targetW;
      }
    }
  }

  const w = Math.max(newR - newL, 50);
  const h = Math.max(newB - newT, 50);
  const x = (newL + newR) / 2;
  const y = (newT + newB) / 2;

  return { w, h, x, y };
}

/**
 * パン位置をクランプして画像がボックスから外れないようにする
 */
export function clampPan(currentState: CropperUIState): { panX: number; panY: number } {
  const rad = currentState.smoothRotation * Math.PI / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const corners = getBoxCorners(currentState);
  
  let minRx = Infinity, maxRx = -Infinity;
  let minRy = Infinity, maxRy = -Infinity;
  
  corners.forEach(p => {
    const rx = p.x * cos - p.y * sin;
    const ry = p.x * sin + p.y * cos;
    if (rx < minRx) minRx = rx;
    if (rx > maxRx) maxRx = rx;
    if (ry < minRy) minRy = ry;
    if (ry > maxRy) maxRy = ry;
  });
  
  const limitW = (currentState.currentImgWidth * currentState.scale) / 2;
  const limitH = (currentState.currentImgHeight * currentState.scale) / 2;
  
  const minPanX = maxRx - limitW;
  const maxPanX = minRx + limitW;
  const minPanY = maxRy - limitH;
  const maxPanY = minRy + limitH;
  
  let clampedPanX = currentState.panX;
  let clampedPanY = currentState.panY;
  
  if (minPanX > maxPanX) clampedPanX = (minPanX + maxPanX) / 2;
  else clampedPanX = Math.max(minPanX, Math.min(maxPanX, currentState.panX));
  
  if (minPanY > maxPanY) clampedPanY = (minPanY + maxPanY) / 2;
  else clampedPanY = Math.max(minPanY, Math.min(maxPanY, currentState.panY));
  
  return { panX: clampedPanX, panY: clampedPanY };
}

/**
 * アニメーションでボックスとビューをリセット
 */
export function animateReset(
  currentState: CropperUIState,
  updateState: (updates: Partial<CropperUIState>) => void,
  onComplete?: () => void
): void {
  if (currentState.isAnimating) return;
  updateState({ isAnimating: true });

  const targetSize = TARGET_VIEWPORT_SIZE;
  let targetAspect;
  
  if (currentState.aspectRatioVal !== null) {
    targetAspect = currentState.aspectRatioVal;
  } else {
    targetAspect = currentState.boxWidth / currentState.boxHeight;
  }
  
  let targetBoxW, targetBoxH;
  if (targetAspect > 1) {
    targetBoxW = targetSize;
    targetBoxH = targetSize / targetAspect;
  } else {
    targetBoxH = targetSize;
    targetBoxW = targetSize * targetAspect;
  }

  // Calculate the scale multiplier based on box size change
  const scaleMultiplier = targetBoxW / currentState.boxWidth;
  const rad = currentState.smoothRotation * Math.PI / 180;
  const C = Math.cos(-rad);
  const S = Math.sin(-rad);
  const boxLocalX = currentState.boxOffsetX * C - currentState.boxOffsetY * S;
  const boxLocalY = currentState.boxOffsetX * S + currentState.boxOffsetY * C;
  const targetScale = currentState.scale * scaleMultiplier;
  const targetPanX = (currentState.panX - boxLocalX) * scaleMultiplier;
  const targetPanY = (currentState.panY - boxLocalY) * scaleMultiplier;

  const start = {
    w: currentState.boxWidth,
    h: currentState.boxHeight,
    offX: currentState.boxOffsetX,
    offY: currentState.boxOffsetY,
    s: currentState.scale,
    px: currentState.panX,
    py: currentState.panY,
  };
  
  const end = {
    w: targetBoxW,
    h: targetBoxH,
    offX: 0,
    offY: 0,
    s: targetScale,
    px: targetPanX,
    py: targetPanY,
  };

  const duration = 300;
  const startTime = performance.now();

  const loop = (now: number) => {
    const p = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);

    updateState({
      boxWidth: start.w + (end.w - start.w) * ease,
      boxHeight: start.h + (end.h - start.h) * ease,
      boxOffsetX: start.offX + (end.offX - start.offX) * ease,
      boxOffsetY: start.offY + (end.offY - start.offY) * ease,
      scale: start.s + (end.s - start.s) * ease,
      panX: start.px + (end.px - start.px) * ease,
      panY: start.py + (end.py - start.py) * ease,
    });

    if (p < 1) {
      requestAnimationFrame(loop);
    } else {
      // Finalize without additional scale/pan correction to avoid jump
      updateState({
        boxWidth: end.w,
        boxHeight: end.h,
        boxOffsetX: 0,
        boxOffsetY: 0,
        scale: end.s,
        panX: end.px,
        panY: end.py,
        baseScale: end.s,
        isAnimating: false,
      });
      onComplete?.();
    }
  };
  
  requestAnimationFrame(loop);
}
