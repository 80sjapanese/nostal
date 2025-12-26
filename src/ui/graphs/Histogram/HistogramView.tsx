import React, { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../../store/useAppStore';

interface Props {
  previewCanvasRef?: React.RefObject<HTMLCanvasElement>;
}

// Lightweight histogram: downsample preview canvas to 256x256, bin RGB on CPU, draw with 2D canvas
// Updates only when preview changes (via store subscription).
export const HistogramView: React.FC<Props> = ({ previewCanvasRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const throttleRef = useRef<number | null>(null);

  const drawHistogram = useCallback((forceImmediate = false) => {
    // Throttle rapid updates during drag (e.g., transientParams changes)
    // but allow immediate draw on mount
    if (!forceImmediate && throttleRef.current) return;
    if (!forceImmediate) {
      throttleRef.current = window.setTimeout(() => {
        throttleRef.current = null;
      }, 50); // 20 FPS max during rapid updates
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const src = previewCanvasRef?.current;
      if (!canvas || !src) {
        // Retry after a short delay if canvas isn't ready
        if (forceImmediate) {
          setTimeout(() => drawHistogram(true), 100);
        }
        return;
      }

      const w = canvas.clientWidth | 0;
      const h = canvas.clientHeight | 0;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      const scratch = scratchRef.current!;
      const sctx = scratch.getContext('2d', { willReadFrequently: true });
      const dctx = canvas.getContext('2d');
      if (!sctx || !dctx) return;

      // Downsample the preview canvas
      sctx.clearRect(0, 0, scratch.width, scratch.height);
      try {
        sctx.drawImage(src, 0, 0, scratch.width, scratch.height);
      } catch {
        // Canvas may not be ready or cross-origin
      }

      const img = sctx.getImageData(0, 0, scratch.width, scratch.height).data;

      // Compute histograms
      const bins = 256;
      const r = new Uint32Array(bins);
      const g = new Uint32Array(bins);
      const b = new Uint32Array(bins);

      for (let i = 0; i < img.length; i += 4) {
        r[img[i]]++;
        g[img[i + 1]]++;
        b[img[i + 2]]++;
      }

      // Normalize
      const maxVal =
        Math.max(
          r.reduce((a, v) => Math.max(a, v), 0),
          g.reduce((a, v) => Math.max(a, v), 0),
          b.reduce((a, v) => Math.max(a, v), 0)
        ) || 1;

      // Draw
      dctx.clearRect(0, 0, canvas.width, canvas.height);
      dctx.fillStyle = '#0f0f0f';
      dctx.fillRect(0, 0, canvas.width, canvas.height);

      const pad = 10;
      const width = canvas.width - pad * 2;
      const height = canvas.height - pad * 2;

      const drawLine = (arr: Uint32Array, color: string) => {
        dctx.strokeStyle = color;
        dctx.lineWidth = 1;
        dctx.beginPath();
        for (let i = 0; i < bins; i++) {
          const x = pad + (i / (bins - 1)) * width;
          const v = arr[i] / maxVal;
          const y = pad + height - v * height;
          if (i === 0) dctx.moveTo(x, y);
          else dctx.lineTo(x, y);
        }
        dctx.stroke();
      };

      // Draw RGB
      drawLine(r, 'rgba(255,0,0,0.8)');
      drawLine(g, 'rgba(0,255,0,0.8)');
      drawLine(b, 'rgba(0,0,255,0.8)');

      // grid
      dctx.strokeStyle = 'rgba(255,255,255,0.08)';
      dctx.lineWidth = 1;
      dctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const y = pad + (i / 4) * height;
        dctx.moveTo(pad, y);
        dctx.lineTo(pad + width, y);
      }
      dctx.stroke();

      rafRef.current = null;
    });
  }, [previewCanvasRef]);

  useEffect(() => {
    scratchRef.current = document.createElement('canvas');
    scratchRef.current.width = 256;
    scratchRef.current.height = 256;

    // Initial draw with retry
    drawHistogram(true);

    // Subscribe to store changes that affect the preview
    const unsubLayers = useAppStore.subscribe(
      (state: any) => state.layers,
      () => drawHistogram(false)
    );

    const unsubTransient = useAppStore.subscribe(
      (state: any) => state.transientParams,
      () => drawHistogram(false)
    );

    const unsubImage = useAppStore.subscribe(
      (state: any) => state.imageSrc,
      () => drawHistogram(false)
    );

    const unsubComparing = useAppStore.subscribe(
      (state: any) => state.isComparing,
      () => drawHistogram(false)
    );

    return () => {
      unsubLayers();
      unsubTransient();
      unsubImage();
      unsubComparing();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, [drawHistogram]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};
