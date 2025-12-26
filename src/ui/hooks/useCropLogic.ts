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

  // Keep aspect ratio if required
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

  // Constraint check: ensure all corners are within rotated/panned image bounds
  const corners = [
    { x: newL, y: newT }, { x: newR, y: newT },
    { x: newR, y: newB }, { x: newL, y: newB }
  ];

  let valid = true;
  for (const p of corners) {
    const c = constrainPoint(p.x, p.y, currentState);
    if (Math.abs(c.x - p.x) > 0.1 || Math.abs(c.y - p.y) > 0.1) {
      valid = false;
      break;
    }
  }

  if (!valid) {
    // Anchor point selection (opposite corner or center for edge moves)
    let anx: number, any: number;
    if (dir === 'tl') { anx = newR; any = newB; }
    else if (dir === 'br') { anx = newL; any = newT; }
    else if (dir === 'tr') { anx = newL; any = newB; }
    else if (dir === 'bl') { anx = newR; any = newT; }
    else { anx = (newL + newR) / 2; any = (newT + newB) / 2; }

    // Binary search the scale factor between anchor and new rect to fit constraints
    let low = 0, high = 1, bestScale = 0;
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      const tL = anx + (newL - anx) * mid;
      const tR = anx + (newR - anx) * mid;
      const tT = any + (newT - any) * mid;
      const tB = any + (newB - any) * mid;
      const tCorners = [
        { x: tL, y: tT }, { x: tR, y: tT },
        { x: tR, y: tB }, { x: tL, y: tB }
      ];
      let ok = true;
      for (const p of tCorners) {
        const c = constrainPoint(p.x, p.y, currentState);
        if (Math.abs(c.x - p.x) > 0.1 || Math.abs(c.y - p.y) > 0.1) {
          ok = false;
          break;
        }
      }
      if (ok) { bestScale = mid; low = mid; }
      else { high = mid; }
    }
    newL = anx + (newL - anx) * bestScale;
    newR = anx + (newR - anx) * bestScale;
    newT = any + (newT - any) * bestScale;
    newB = any + (newB - any) * bestScale;
  }

  if (newR - newL < 50) newR = newL + 50;
  if (newB - newT < 50) newB = newT + 50;

  return {
    w: newR - newL,
    h: newB - newT,
    x: (newL + newR) / 2,
    y: (newT + newB) / 2,
  };
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
 * 点を画像の有効領域へ投影（制約行列で半平面内へ押し戻す）
 */
export function constrainPoint(x: number, y: number, currentState: CropperUIState) {
  const constraints = getConstraintsParams(currentState);
  let cx = x, cy = y;

  for (let i = 0; i < 10; i++) {
    let satisfied = true;
    for (const { a, b, d } of constraints) {
      const val = a * cx + b * cy;
      if (val > d + 1e-9) {
        satisfied = false;
        const diff = val - d;
        cx -= a * diff;
        cy -= b * diff;
      }
    }
    if (satisfied) break;
  }

  return { x: cx, y: cy };
}

/**
 * 回転・パン・スケールを考慮した半平面制約パラメータ
 */
export function getConstraintsParams(currentState: CropperUIState) {
  const rad = currentState.smoothRotation * Math.PI / 180;
  const C = Math.cos(-rad);
  const S = Math.sin(-rad);
  const limW = (currentState.currentImgWidth * currentState.scale) / 2;
  const limH = (currentState.currentImgHeight * currentState.scale) / 2;
  const constraints: Array<{ a: number; b: number; d: number }> = [];

  constraints.push({ a: C,  b: -S, d: limW + currentState.panX });
  constraints.push({ a: -C, b:  S, d: limW - currentState.panX });
  constraints.push({ a: S,  b:  C, d: limH + currentState.panY });
  constraints.push({ a: -S, b: -C, d: limH - currentState.panY });

  return constraints;
}

/**
 * ボックスが指定された相対位置で完全にカバーされるために必要な最小スケールを計算
 */
function getMinScaleForBox(
  boxW: number,
  boxH: number,
  relPanX: number,
  relPanY: number,
  currentState: CropperUIState
): number {
  // Box is centered at (0,0) locally, but Image is shifted by relPan
  // Image coverage condition:
  // For every box corner C (rotated):
  // |C - relPan * Scale| <= (ImgDim / 2) * Scale

  const corners = [
    { x: -boxW / 2, y: -boxH / 2 }, { x: boxW / 2, y: -boxH / 2 },
    { x: boxW / 2, y: boxH / 2 }, { x: -boxW / 2, y: boxH / 2 }
  ];

  const rad = currentState.smoothRotation * Math.PI / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);

  const halfImgW = currentState.currentImgWidth / 2;
  const halfImgH = currentState.currentImgHeight / 2;

  let minScale = 0;

  corners.forEach(p => {
    // Rotate corner to match image local space
    const rx = p.x * cos - p.y * sin;
    const ry = p.x * sin + p.y * cos;

    // Solve for Scale S:
    // |rx - relPanX * S| <= halfImgW * S
    // Let P = relPanX, L = halfImgW.
    // |rx - P*S| <= L*S
    // Case 1: rx > 0. rx - P*S <= L*S => rx <= (L+P)S => S >= rx/(L+P).
    // Case 2: rx < 0. -(rx - P*S) <= L*S => -rx + P*S <= L*S => -rx <= (L-P)S => S >= -rx/(L-P).
    // Combine: S >= |rx| / (L + sign(rx)*P)

    const denomX = halfImgW + (rx >= 0 ? relPanX : -relPanX);
    const s_req_x = denomX > 0 ? Math.abs(rx) / denomX : 0;

    const denomY = halfImgH + (ry >= 0 ? relPanY : -relPanY);
    const s_req_y = denomY > 0 ? Math.abs(ry) / denomY : 0;

    minScale = Math.max(minScale, s_req_x, s_req_y);
  });

  return minScale;
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

  // 1. Calculate Relative Pan (normalized) from current state
  const rad = currentState.smoothRotation * Math.PI / 180;
  const C = Math.cos(-rad);
  const S = Math.sin(-rad);
  
  // Project Box Offset to Local
  const boxLocalX = currentState.boxOffsetX * C - currentState.boxOffsetY * S;
  const boxLocalY = currentState.boxOffsetX * S + currentState.boxOffsetY * C;
  
  // RelPan is the vector from Box Center to Image Center, in unscaled pixels
  // Current Pan is Local Image Center.
  const relPanX = (currentState.panX - boxLocalX) / currentState.scale;
  const relPanY = (currentState.panY - boxLocalY) / currentState.scale;
  
  // 2. Determine Required Scale for New Box to fit
  const minRequiredScale = getMinScaleForBox(targetBoxW, targetBoxH, relPanX, relPanY, currentState);
  
  // 3. Determine Base Target Scale (Zoom to fit viewport logic)
  const baseTargetScale = currentState.scale * (targetBoxW / currentState.boxWidth);
  
  // 4. Final Target Scale is the larger of the two
  // This ensures that if the new aspect ratio pushes corners out, we zoom in.
  const targetScale = Math.max(baseTargetScale, minRequiredScale);
  
  // 5. Calculate Target Pan
  const targetPanX = relPanX * targetScale;
  const targetPanY = relPanY * targetScale;

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
