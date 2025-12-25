import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { renderCropPreview } from '../../core/crop/cropUtils';
import { useCropState, getCropStateFromUI } from '../hooks/useCropState';
import { useCropInteraction, updateScaleAndPanForRotation } from '../hooks/useCropInteraction';
import { animateReset } from '../hooks/useCropLogic';
import type { CropperUIState } from '../../types/Crop';

export const ImageCropper: React.FC = () => {
  const { originalImageSrc, cropState, setCropState, applyCrop, exitCropMode } = useAppStore();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<string>('free');
  
  const workspaceRef = useRef<HTMLDivElement>(null);
  const { state, updateState } = useCropState(img, cropState);

  // Setup mouse interaction
  useCropInteraction(state, updateState);

  // Load image on mount
  useEffect(() => {
    if (!originalImageSrc) return;
    
    const image = new Image();
    image.src = originalImageSrc;
    image.onload = () => {
      setImg(image);
    };
  }, [originalImageSrc]);

  // Initialize aspect ratio from crop state
  useEffect(() => {
    if (!cropState || !state) return;
    
    setRotation(cropState.smoothRotation);
    if (cropState.aspectRatioVal) {
      const val = cropState.aspectRatioVal;
      if (Math.abs(val - 1) < 0.01) setAspectRatio('1:1');
      else if (Math.abs(val - 3/2) < 0.01 || Math.abs(val - 2/3) < 0.01) setAspectRatio('3:2');
      else if (Math.abs(val - 4/3) < 0.01 || Math.abs(val - 3/4) < 0.01) setAspectRatio('4:3');
      else if (Math.abs(val - 16/9) < 0.01 || Math.abs(val - 9/16) < 0.01) setAspectRatio('16:9');
      else setAspectRatio('free');
    }
  }, [cropState, state]);

  // Save crop state when changes occur (debounced)
  useEffect(() => {
    if (!state) return;
    
    const timeoutId = setTimeout(() => {
      setCropState(getCropStateFromUI(state));
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [state, setCropState]);

  // Event handlers
  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setRotation(value);
    if (state) {
      updateState({ smoothRotation: value });
      updateScaleAndPanForRotation({ ...state, smoothRotation: value }, updateState);
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
    animateReset(newState, updateState);
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
    animateReset(newState, updateState);
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
      animateReset(newState, updateState);
    }
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

  const handleExport = async () => {
    if (!img || !state) return;
    const cropStateToExport = getCropStateFromUI(state);
    const dataURL = renderCropPreview(img, cropStateToExport, 1024);
    applyCrop(dataURL);
  };

  if (!img || !state) {
    return <div style={{ color: 'white' }}>Loading...</div>;
  }

  const isLandscape = state.boxWidth >= state.boxHeight;

  return (
    <div style={styles.container}>
      {/* Workspace */}
      <div
        ref={workspaceRef}
        onMouseDown={handleMouseDown}
        style={{
          ...styles.workspace,
          cursor: state.isDraggingImage ? 'grabbing' : 'grab',
        }}
      >
        {/* Image container */}
        <div style={{
          ...styles.imageRotationContainer,
          transform: `rotate(${state.smoothRotation}deg)`,
        }}>
          <div style={{
            ...styles.imageScaleContainer,
            transform: `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`,
          }}>
            <div style={{
              ...styles.imageBaseContainer,
              transform: `rotate(${state.baseRotationIndex * 90}deg) scale(${state.flipX}, ${state.flipY})`,
            }}>
              <img
                src={originalImageSrc!}
                alt="Crop target"
                style={styles.image}
              />
            </div>
          </div>
        </div>

        {/* Crop box */}
        <CropBox
          state={state}
          onHandleMouseDown={handleHandleMouseDown}
        />
      </div>

      {/* Toolbar */}
      <CropToolbar
        rotation={rotation}
        aspectRatio={aspectRatio}
        isLandscape={isLandscape}
        state={state}
        onRotationChange={handleRotationChange}
        onRotateBase={handleRotateBase}
        onFlipBase={handleFlipBase}
        onAspectChange={handleAspectChange}
        onToggleOrientation={toggleOrientation}
        onCancel={exitCropMode}
        onExport={handleExport}
        updateState={updateState}
      />
    </div>
  );
};

// Sub-components
interface CropBoxProps {
  state: CropperUIState;
  onHandleMouseDown: (e: React.MouseEvent, dir: string) => void;
}

const CropBox: React.FC<CropBoxProps> = ({ state, onHandleMouseDown }) => (
  <div style={{
    ...styles.cropBox,
    width: `${state.boxWidth}px`,
    height: `${state.boxHeight}px`,
    left: `calc(50% + ${state.boxOffsetX}px - ${state.boxWidth / 2}px)`,
    top: `calc(50% + ${state.boxOffsetY}px - ${state.boxHeight / 2}px)`,
  }}>
    {/* Grid lines */}
    <div style={styles.gridLineVertical1} />
    <div style={styles.gridLineVertical2} />
    <div style={styles.gridLineHorizontal1} />
    <div style={styles.gridLineHorizontal2} />

    {/* Corner handles */}
    {(['tl', 'tr', 'bl', 'br'] as const).map(dir => (
      <div
        key={dir}
        className="handle"
        onMouseDown={(e) => onHandleMouseDown(e, dir)}
        style={{
          ...styles.handleCorner,
          cursor: dir === 'tl' || dir === 'br' ? 'nwse-resize' : 'nesw-resize',
          ...(dir === 'tl' && { top: '-7px', left: '-7px' }),
          ...(dir === 'tr' && { top: '-7px', right: '-7px' }),
          ...(dir === 'bl' && { bottom: '-7px', left: '-7px' }),
          ...(dir === 'br' && { bottom: '-7px', right: '-7px' }),
        }}
      />
    ))}

    {/* Edge handles */}
    {(['t', 'b', 'l', 'r'] as const).map(dir => (
      <div
        key={dir}
        className="handle"
        onMouseDown={(e) => onHandleMouseDown(e, dir)}
        style={{
          ...styles.handleEdge,
          cursor: dir === 't' || dir === 'b' ? 'ns-resize' : 'ew-resize',
          ...(dir === 't' && { width: '24px', height: '6px', left: '50%', marginLeft: '-12px', top: '-3px' }),
          ...(dir === 'b' && { width: '24px', height: '6px', left: '50%', marginLeft: '-12px', bottom: '-3px' }),
          ...(dir === 'l' && { width: '6px', height: '24px', top: '50%', marginTop: '-12px', left: '-3px' }),
          ...(dir === 'r' && { width: '6px', height: '24px', top: '50%', marginTop: '-12px', right: '-3px' }),
        }}
      />
    ))}
  </div>
);

interface CropToolbarProps {
  rotation: number;
  aspectRatio: string;
  isLandscape: boolean;
  state: CropperUIState;
  onRotationChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRotateBase: (direction: number) => void;
  onFlipBase: (axis: 'h' | 'v') => void;
  onAspectChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onToggleOrientation: () => void;
  onCancel: () => void;
  onExport: () => void;
  updateState: (updates: Partial<CropperUIState>) => void;
}

const CropToolbar: React.FC<CropToolbarProps> = ({
  rotation,
  aspectRatio,
  isLandscape,
  state,
  onRotationChange,
  onRotateBase,
  onFlipBase,
  onAspectChange,
  onToggleOrientation,
  onCancel,
  onExport,
  updateState,
}) => (
  <div style={styles.toolbar}>
    <div style={styles.toolbarLeft}>
      <select value={aspectRatio} onChange={onAspectChange} style={styles.select}>
        <option value="free">Free</option>
        <option value="3:2">3 : 2</option>
        <option value="4:3">4 : 3</option>
        <option value="1:1">1 : 1</option>
        <option value="16:9">16 : 9</option>
      </select>

      <button
        onClick={onToggleOrientation}
        style={{
          ...styles.button,
          background: isLandscape ? '#0066cc' : '#2c2c2c',
        }}
        title="Landscape"
      >
        <span style={styles.iconLandscape} />
      </button>

      <button
        onClick={onToggleOrientation}
        style={{
          ...styles.button,
          background: !isLandscape ? '#0066cc' : '#2c2c2c',
        }}
        title="Portrait"
      >
        <span style={styles.iconPortrait} />
      </button>

      <div style={styles.divider} />

      <button onClick={() => onRotateBase(-1)} style={styles.button} title="Rotate Left">↺</button>
      <button onClick={() => onRotateBase(1)} style={styles.button} title="Rotate Right">↻</button>
      <button onClick={() => onFlipBase('h')} style={styles.button} title="Flip Horizontal">⇄</button>
      <button onClick={() => onFlipBase('v')} style={styles.button} title="Flip Vertical">⇅</button>

      <div style={styles.divider} />

      <span style={styles.label}>Angle</span>
      <input
        type="range"
        min="-45"
        max="45"
        value={rotation}
        step="0.01"
        onChange={onRotationChange}
        onMouseDown={() => updateState({ baseScale: state.scale })}
        style={styles.slider}
      />
      <span style={styles.angleValue}>
        {rotation.toFixed(2)}°
      </span>
    </div>

    <div style={styles.toolbarRight}>
      <button onClick={onCancel} style={styles.button}>Cancel</button>
      <button onClick={onExport} style={styles.buttonPrimary}>Apply Crop</button>
    </div>
  </div>
);

// Styles
const styles = {
  container: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#121212',
    display: 'flex',
    flexDirection: 'column' as const,
    zIndex: 10000,
  },
  workspace: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundImage: `
      linear-gradient(45deg, #1a1a1a 25%, transparent 25%),
      linear-gradient(-45deg, #1a1a1a 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #1a1a1a 75%),
      linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)
    `,
    backgroundSize: '20px 20px',
    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
  },
  imageRotationContainer: {
    position: 'absolute' as const,
    width: 0,
    height: 0,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  imageScaleContainer: {
    position: 'absolute' as const,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    willChange: 'transform' as const,
  },
  imageBaseContainer: {
    display: 'block' as const,
  },
  image: {
    display: 'block' as const,
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
    boxShadow: '0 0 30px rgba(0,0,0,0.6)',
  },
  cropBox: {
    position: 'absolute' as const,
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.9)',
    outline: '1px solid rgba(0, 0, 0, 0.4)',
    pointerEvents: 'none' as const,
    zIndex: 5,
    willChange: 'width, height, left, top' as const,
  },
  gridLineVertical1: {
    position: 'absolute' as const,
    width: '1px',
    height: '100%',
    top: 0,
    left: '33.33%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    pointerEvents: 'none' as const,
  },
  gridLineVertical2: {
    position: 'absolute' as const,
    width: '1px',
    height: '100%',
    top: 0,
    left: '66.66%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    pointerEvents: 'none' as const,
  },
  gridLineHorizontal1: {
    position: 'absolute' as const,
    height: '1px',
    width: '100%',
    left: 0,
    top: '33.33%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    pointerEvents: 'none' as const,
  },
  gridLineHorizontal2: {
    position: 'absolute' as const,
    height: '1px',
    width: '100%',
    left: 0,
    top: '66.66%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    pointerEvents: 'none' as const,
  },
  handleCorner: {
    position: 'absolute' as const,
    background: '#fff',
    border: '1px solid #000',
    pointerEvents: 'auto' as const,
    boxSizing: 'border-box' as const,
    boxShadow: '0 0 4px rgba(0,0,0,0.3)',
    zIndex: 10,
    width: '14px',
    height: '14px',
    borderRadius: '50%',
  },
  handleEdge: {
    position: 'absolute' as const,
    background: '#fff',
    border: '1px solid #000',
    pointerEvents: 'auto' as const,
    boxSizing: 'border-box' as const,
    boxShadow: '0 0 4px rgba(0,0,0,0.3)',
    zIndex: 10,
    borderRadius: '2px',
  },
  toolbar: {
    height: '80px',
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '0 30px',
    background: '#1e1e1e',
    zIndex: 20,
    borderTop: '1px solid #333',
    boxShadow: '0 -4px 10px rgba(0,0,0,0.2)',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: '20px',
  },
  toolbarRight: {
    display: 'flex',
    gap: '10px',
  },
  select: {
    padding: '8px 12px',
    background: '#2c2c2c',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  button: {
    padding: '8px 16px',
    background: '#2c2c2c',
    color: '#fff',
    border: '1px solid #444',
    cursor: 'pointer',
    borderRadius: '6px',
    fontSize: '13px',
    display: 'inline-flex',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '6px',
    transition: 'background 0.2s, border-color 0.2s',
    userSelect: 'none' as const,
  },
  buttonPrimary: {
    padding: '10px 24px',
    background: '#0066cc',
    color: '#fff',
    border: '1px solid #005bb5',
    cursor: 'pointer',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    display: 'inline-flex',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '6px',
    transition: 'background 0.2s, border-color 0.2s',
    userSelect: 'none' as const,
  },
  iconLandscape: {
    display: 'inline-block' as const,
    width: '14px',
    height: '9px',
    border: '2px solid currentColor',
    borderRadius: '1px',
  },
  iconPortrait: {
    display: 'inline-block' as const,
    width: '9px',
    height: '14px',
    border: '2px solid currentColor',
    borderRadius: '1px',
  },
  divider: {
    width: '1px',
    height: '30px',
    background: '#444',
  },
  label: {
    fontSize: '12px',
    color: '#aaa',
  },
  slider: {
    width: '300px',
  },
  angleValue: {
    width: '50px',
    textAlign: 'right' as const,
    fontSize: '13px',
    fontVariantNumeric: 'tabular-nums' as const,
  },
};
