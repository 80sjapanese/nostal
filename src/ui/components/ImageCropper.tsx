import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { CropState as CoreCropState } from '../../types/Crop';
import { CropRenderer } from '../../core/crop/CropRenderer';

const TARGET_VIEWPORT_SIZE = 550;

interface CropperState {
  naturalWidth: number;
  naturalHeight: number;
  currentImgWidth: number;
  currentImgHeight: number;
  
  scale: number;
  baseScale: number;
  smoothRotation: number;
  baseRotationIndex: number;
  flipX: number;
  flipY: number;
  panX: number;
  panY: number;

  boxWidth: number;
  boxHeight: number;
  boxOffsetX: number;
  boxOffsetY: number;

  aspectRatioVal: number | null;
  
  isDraggingImage: boolean;
  lastMouseX: number;
  lastMouseY: number;

  isResizingBox: boolean;
  resizeDir: string | null;
  resizeStartBoxWidth: number;
  resizeStartBoxHeight: number;
  resizeStartBoxOffsetX: number;
  resizeStartBoxOffsetY: number;

  isAnimating: boolean;
}

export const ImageCropper: React.FC = () => {
  const { originalImageSrc, cropState, setCropState, applyCrop, exitCropMode } = useAppStore();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [state, setState] = useState<CropperState | null>(null);
  const [rotation, setRotation] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<string>('free');
  
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Load image on mount
  useEffect(() => {
    if (!originalImageSrc) return;
    
    const image = new Image();
    image.src = originalImageSrc;
    image.onload = () => {
      setImg(image);
      initializeState(image);
    };
  }, [originalImageSrc]);

  const initializeState = (image: HTMLImageElement) => {
    if (cropState) {
      // Restore previous crop state
      setState({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        currentImgWidth: image.naturalWidth,
        currentImgHeight: image.naturalHeight,
        ...cropState,
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
      setRotation(cropState.smoothRotation);
      if (cropState.aspectRatioVal) {
        // Determine aspect ratio string from value
        const val = cropState.aspectRatioVal;
        if (Math.abs(val - 1) < 0.01) setAspectRatio('1:1');
        else if (Math.abs(val - 3/2) < 0.01 || Math.abs(val - 2/3) < 0.01) setAspectRatio('3:2');
        else if (Math.abs(val - 4/3) < 0.01 || Math.abs(val - 3/4) < 0.01) setAspectRatio('4:3');
        else if (Math.abs(val - 16/9) < 0.01 || Math.abs(val - 9/16) < 0.01) setAspectRatio('16:9');
        else setAspectRatio('free');
      }
    } else {
      // Initialize new crop state
      const imgAspect = image.naturalWidth / image.naturalHeight;
      let boxW, boxH;
      
      if (imgAspect > 1) {
        boxW = TARGET_VIEWPORT_SIZE;
        boxH = TARGET_VIEWPORT_SIZE / imgAspect;
      } else {
        boxH = TARGET_VIEWPORT_SIZE;
        boxW = TARGET_VIEWPORT_SIZE * imgAspect;
      }

      const initialScale = boxW / image.naturalWidth;

      setState({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        currentImgWidth: image.naturalWidth,
        currentImgHeight: image.naturalHeight,
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
  };

  const updateState = (updates: Partial<CropperState>) => {
    setState(prev => prev ? { ...prev, ...updates } : null);
  };

  // Save crop state when changes occur (debounced)
  useEffect(() => {
    if (!state) return;
    
    const timeoutId = setTimeout(() => {
      setCropState({
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
      });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [state, setCropState]);

  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setRotation(value);
    if (state) {
      updateState({ smoothRotation: value });
      updateScaleAndPanForRotation({ ...state, smoothRotation: value });
    }
  };

  const handleRotateBase = (direction: number) => {
    if (!state) return;
    
    let newIndex = state.baseRotationIndex + direction;
    if (newIndex < 0) newIndex = 3;
    if (newIndex > 3) newIndex = 0;

    const tempW = state.currentImgWidth;
    const tempBoxW = state.boxWidth;
    
    let newOffsetX, newOffsetY, newPanX, newPanY;
    
    if (direction === 1) {
      newOffsetX = -state.boxOffsetY;
      newOffsetY = state.boxOffsetX;
      newPanX = -state.panY;
      newPanY = state.panX;
    } else {
      newOffsetX = state.boxOffsetY;
      newOffsetY = -state.boxOffsetX;
      newPanX = state.panY;
      newPanY = -state.panX;
    }

    const newAspectRatioVal = state.aspectRatioVal !== null ? 1 / state.aspectRatioVal : null;

    const newState = {
      ...state,
      baseRotationIndex: newIndex,
      currentImgWidth: state.currentImgHeight,
      currentImgHeight: tempW,
      boxWidth: state.boxHeight,
      boxHeight: tempBoxW,
      boxOffsetX: newOffsetX,
      boxOffsetY: newOffsetY,
      panX: newPanX,
      panY: newPanY,
      aspectRatioVal: newAspectRatioVal,
    };

    updateState(newState);
    animateReset(newState);
  };

  const handleFlipBase = (axis: 'h' | 'v') => {
    if (!state) return;
    
    if (axis === 'h') {
      updateState({
        flipX: state.flipX * -1,
        panX: state.panX * -1,
        boxOffsetX: state.boxOffsetX * -1,
      });
    } else {
      updateState({
        flipY: state.flipY * -1,
        panY: state.panY * -1,
        boxOffsetY: state.boxOffsetY * -1,
      });
    }
  };

  const toggleOrientation = () => {
    if (!state) return;
    
    const newAspectRatioVal = state.aspectRatioVal !== null ? 1 / state.aspectRatioVal : null;
    
    const newState = {
      ...state,
      boxWidth: state.boxHeight,
      boxHeight: state.boxWidth,
      aspectRatioVal: newAspectRatioVal,
    };

    updateState(newState);
    animateReset(newState);
  };

  const handleAspectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setAspectRatio(val);
    
    if (!state) return;
    
    if (val === 'free') {
      updateState({ aspectRatioVal: null });
    } else {
      const parts = val.split(':');
      const isLandscape = state.boxWidth >= state.boxHeight;
      const num1 = parseFloat(parts[0]);
      const num2 = parseFloat(parts[1]);
      
      let ratio;
      if (isLandscape) {
        ratio = Math.max(num1, num2) / Math.min(num1, num2);
      } else {
        ratio = Math.min(num1, num2) / Math.max(num1, num2);
      }
      
      const newState = { ...state, aspectRatioVal: ratio };
      updateState(newState);
      animateReset(newState);
    }
  };

  const updateScaleAndPanForRotation = (currentState: CropperState) => {
    // Implementation of scale and pan calculation for rotation
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
  };

  const getRequiredScale = (currentState: CropperState): number => {
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
  };

  const getBoxCorners = (currentState: CropperState) => {
    const halfW = currentState.boxWidth / 2;
    const halfH = currentState.boxHeight / 2;
    return [
      { x: currentState.boxOffsetX - halfW, y: currentState.boxOffsetY - halfH },
      { x: currentState.boxOffsetX + halfW, y: currentState.boxOffsetY - halfH },
      { x: currentState.boxOffsetX + halfW, y: currentState.boxOffsetY + halfH },
      { x: currentState.boxOffsetX - halfW, y: currentState.boxOffsetY + halfH },
    ];
  };

  const animateReset = (currentState: CropperState) => {
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
    
      // Use rotated-space projection so drag preview and final match
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
      }
    };
    
    requestAnimationFrame(loop);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!state || state.isAnimating) return;
    if ((e.target as HTMLElement).classList.contains('handle')) return;
    
    updateState({
      isDraggingImage: true,
      lastMouseX: e.clientX,
      lastMouseY: e.clientY,
    });
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!state || state.isAnimating) return;
    
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
      
      updateState({
        panX: newPanX,
        panY: newPanY,
        lastMouseX: e.clientX,
        lastMouseY: e.clientY,
      });
      
      clampPan({ ...state, panX: newPanX, panY: newPanY });
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
      animateReset(state);
    } else {
      updateState({ isDraggingImage: false });
    }
  };

  const handleHandleMouseDown = (e: React.MouseEvent, dir: string) => {
    if (!state || state.isAnimating) return;
    
    updateState({
      isResizingBox: true,
      resizeDir: dir,
      resizeStartBoxWidth: state.boxWidth,
      resizeStartBoxHeight: state.boxHeight,
      resizeStartBoxOffsetX: state.boxOffsetX,
      resizeStartBoxOffsetY: state.boxOffsetY,
      lastMouseX: e.clientX,
      lastMouseY: e.clientY,
    });
    
    e.stopPropagation();
    e.preventDefault();
  };

  const clampPan = (currentState: CropperState) => {
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
    
    updateState({ panX: clampedPanX, panY: clampedPanY });
  };

  const calculateResize = (
    dx: number,
    dy: number,
    dir: string,
    startW: number,
    startH: number,
    startOffX: number,
    startOffY: number,
    keepRatio: boolean,
    currentState: CropperState
  ) => {
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

    // Constraint check
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
      let anx, any;
      if (dir === 'tl') { anx = newR; any = newB; }
      else if (dir === 'br') { anx = newL; any = newT; }
      else if (dir === 'tr') { anx = newL; any = newB; }
      else if (dir === 'bl') { anx = newR; any = newT; }
      else { anx = (newL + newR) / 2; any = (newT + newB) / 2; }
      
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
  };

  const constrainPoint = (x: number, y: number, currentState: CropperState) => {
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
  };

  const getConstraintsParams = (currentState: CropperState) => {
    const rad = currentState.smoothRotation * Math.PI / 180;
    const C = Math.cos(-rad);
    const S = Math.sin(-rad);
    const limW = (currentState.currentImgWidth * currentState.scale) / 2;
    const limH = (currentState.currentImgHeight * currentState.scale) / 2;
    const constraints = [];
    
    constraints.push({ a: C, b: -S, d: limW + currentState.panX });
    constraints.push({ a: -C, b: S, d: limW - currentState.panX });
    constraints.push({ a: S, b: C, d: limH + currentState.panY });
    constraints.push({ a: -S, b: -C, d: limH - currentState.panY });
    
    return constraints;
  };

  const handleExport = async () => {
    if (!img || !state) return;
    const cropState: CoreCropState = {
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
    const dataURL = CropRenderer.renderPreview(img, cropState, 1024);
    applyCrop(dataURL);
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => handleMouseMove(e);
    const handleUp = () => handleMouseUp();
    
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [state]);

  if (!img || !state) {
    return <div style={{ color: 'white' }}>Loading...</div>;
  }

  const isLandscape = state.boxWidth >= state.boxHeight;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#121212',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10000,
    }}>
      {/* Workspace */}
      <div
        ref={workspaceRef}
        onMouseDown={handleMouseDown}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          cursor: state.isDraggingImage ? 'grabbing' : 'grab',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundImage: `
            linear-gradient(45deg, #1a1a1a 25%, transparent 25%),
            linear-gradient(-45deg, #1a1a1a 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #1a1a1a 75%),
            linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
        }}
      >
        {/* Image container */}
        <div style={{
          position: 'absolute',
          width: 0,
          height: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          transform: `rotate(${state.smoothRotation}deg)`,
        }}>
          <div style={{
            position: 'absolute',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            transform: `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`,
            willChange: 'transform',
          }}>
            <div style={{
              display: 'block',
              transform: `rotate(${state.baseRotationIndex * 90}deg) scale(${state.flipX}, ${state.flipY})`,
            }}>
              <img
                src={originalImageSrc!}
                alt="Crop target"
                style={{
                  display: 'block',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  boxShadow: '0 0 30px rgba(0,0,0,0.6)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Crop box */}
        <div
          style={{
            position: 'absolute',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            outline: '1px solid rgba(0, 0, 0, 0.4)',
            pointerEvents: 'none',
            zIndex: 5,
            willChange: 'width, height, left, top',
            width: `${state.boxWidth}px`,
            height: `${state.boxHeight}px`,
            left: `calc(50% + ${state.boxOffsetX}px - ${state.boxWidth / 2}px)`,
            top: `calc(50% + ${state.boxOffsetY}px - ${state.boxHeight / 2}px)`,
          }}
        >
          {/* Grid lines */}
          <div style={{ position: 'absolute', width: '1px', height: '100%', top: 0, left: '33.33%', backgroundColor: 'rgba(255, 255, 255, 0.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', width: '1px', height: '100%', top: 0, left: '66.66%', backgroundColor: 'rgba(255, 255, 255, 0.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', height: '1px', width: '100%', left: 0, top: '33.33%', backgroundColor: 'rgba(255, 255, 255, 0.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', height: '1px', width: '100%', left: 0, top: '66.66%', backgroundColor: 'rgba(255, 255, 255, 0.3)', pointerEvents: 'none' }} />

          {/* Handles */}
          {['tl', 'tr', 'bl', 'br'].map(dir => (
            <div
              key={dir}
              className="handle"
              onMouseDown={(e) => handleHandleMouseDown(e, dir)}
              style={{
                position: 'absolute',
                background: '#fff',
                border: '1px solid #000',
                pointerEvents: 'auto',
                boxSizing: 'border-box',
                boxShadow: '0 0 4px rgba(0,0,0,0.3)',
                zIndex: 10,
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                cursor: dir === 'tl' || dir === 'br' ? 'nwse-resize' : 'nesw-resize',
                ...(dir === 'tl' && { top: '-7px', left: '-7px' }),
                ...(dir === 'tr' && { top: '-7px', right: '-7px' }),
                ...(dir === 'bl' && { bottom: '-7px', left: '-7px' }),
                ...(dir === 'br' && { bottom: '-7px', right: '-7px' }),
              }}
            />
          ))}

          {['t', 'b', 'l', 'r'].map(dir => (
            <div
              key={dir}
              className="handle"
              onMouseDown={(e) => handleHandleMouseDown(e, dir)}
              style={{
                position: 'absolute',
                background: '#fff',
                border: '1px solid #000',
                pointerEvents: 'auto',
                boxSizing: 'border-box',
                boxShadow: '0 0 4px rgba(0,0,0,0.3)',
                zIndex: 10,
                borderRadius: '2px',
                cursor: dir === 't' || dir === 'b' ? 'ns-resize' : 'ew-resize',
                ...(dir === 't' && { width: '24px', height: '6px', left: '50%', marginLeft: '-12px', top: '-3px' }),
                ...(dir === 'b' && { width: '24px', height: '6px', left: '50%', marginLeft: '-12px', bottom: '-3px' }),
                ...(dir === 'l' && { width: '6px', height: '24px', top: '50%', marginTop: '-12px', left: '-3px' }),
                ...(dir === 'r' && { width: '6px', height: '24px', top: '50%', marginTop: '-12px', right: '-3px' }),
              }}
            />
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        height: '80px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 30px',
        background: '#1e1e1e',
        zIndex: 20,
        borderTop: '1px solid #333',
        boxShadow: '0 -4px 10px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <select
            value={aspectRatio}
            onChange={handleAspectChange}
            style={{
              padding: '8px 12px',
              background: '#2c2c2c',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <option value="free">Free</option>
            <option value="3:2">3 : 2</option>
            <option value="4:3">4 : 3</option>
            <option value="1:1">1 : 1</option>
            <option value="16:9">16 : 9</option>
          </select>

          <button
            onClick={toggleOrientation}
            className={isLandscape ? 'active' : ''}
            style={{
              padding: '6px 10px',
              background: isLandscape ? '#0066cc' : '#2c2c2c',
              color: '#fff',
              border: '1px solid #444',
              cursor: 'pointer',
              borderRadius: '6px',
            }}
            title="Landscape"
          >
            <span style={{ display: 'inline-block', width: '14px', height: '9px', border: '2px solid currentColor', borderRadius: '1px' }} />
          </button>

          <button
            onClick={toggleOrientation}
            className={!isLandscape ? 'active' : ''}
            style={{
              padding: '6px 10px',
              background: !isLandscape ? '#0066cc' : '#2c2c2c',
              color: '#fff',
              border: '1px solid #444',
              cursor: 'pointer',
              borderRadius: '6px',
            }}
            title="Portrait"
          >
            <span style={{ display: 'inline-block', width: '9px', height: '14px', border: '2px solid currentColor', borderRadius: '1px' }} />
          </button>

          <div style={{ width: '1px', height: '30px', background: '#444' }} />

          <button onClick={() => handleRotateBase(-1)} style={buttonStyle} title="Rotate Left">↺</button>
          <button onClick={() => handleRotateBase(1)} style={buttonStyle} title="Rotate Right">↻</button>
          <button onClick={() => handleFlipBase('h')} style={buttonStyle} title="Flip Horizontal">⇄</button>
          <button onClick={() => handleFlipBase('v')} style={buttonStyle} title="Flip Vertical">⇅</button>

          <div style={{ width: '1px', height: '30px', background: '#444' }} />

          <span style={{ fontSize: '12px', color: '#aaa' }}>Angle</span>
          <input
            type="range"
            min="-45"
            max="45"
            value={rotation}
            step="0.01"
            onChange={handleRotationChange}
            onMouseDown={() => state && updateState({ baseScale: state.scale })}
            style={{ width: '300px' }}
          />
          <span style={{ width: '50px', textAlign: 'right', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
            {rotation.toFixed(2)}°
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={exitCropMode} style={buttonStyle}>Cancel</button>
          <button
            onClick={handleExport}
            style={{
              ...buttonStyle,
              background: '#0066cc',
              borderColor: '#005bb5',
              fontWeight: 'bold',
              padding: '10px 24px',
              fontSize: '14px',
            }}
          >
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#2c2c2c',
  color: '#fff',
  border: '1px solid #444',
  cursor: 'pointer',
  borderRadius: '6px',
  fontSize: '13px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  transition: 'background 0.2s, border-color 0.2s',
  userSelect: 'none',
};
