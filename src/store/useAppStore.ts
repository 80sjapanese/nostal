import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { temporal } from 'zundo';
import { LayerInstance } from '../types/Plugin';
import type { CropState } from '../types/Crop';
import { v4 as uuidv4 } from 'uuid';

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

// moved to src/types/Crop.ts

interface AppState {
  imageSrc: string | null;
  originalImageSrc: string | null; // クロップ前のオリジナル画像
  layers: LayerInstance[];
  transientParams: Record<string, Record<string, number>>; 
  selectedLayerId: string | null;
  isComparing: boolean;
  isFullscreen: boolean;
  isCropMode: boolean;
  viewTransform: ViewTransform;
  cropState: CropState | null;

  setImage: (src: string) => void;
  addLayer: (pluginId: string) => void;
  removeLayer: (id: string) => void;
  selectLayer: (id: string) => void;
  reorderLayers: (newLayers: LayerInstance[]) => void;
  setTransientParam: (layerId: string, key: string, value: number) => void;
  commitParam: (layerId: string, key: string, value: number) => void;
  setIsComparing: (isComparing: boolean) => void;
  toggleFullscreen: () => void;
  setViewTransform: (transform: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  enterCropMode: () => void;
  exitCropMode: () => void;
  setCropState: (state: CropState) => void;
  applyCrop: (croppedImageSrc: string) => void;
}

export const useAppStore = create(
  subscribeWithSelector(
    temporal<AppState>(
      (set, get) => ({
        imageSrc: null,
        originalImageSrc: null,
        layers: [],
        transientParams: {},
        selectedLayerId: null,
        isComparing: false,
        isFullscreen: false,
        isCropMode: false,
        viewTransform: { x: 0, y: 0, scale: 1 },
        cropState: null,

        setImage: (src) => set({ imageSrc: src, originalImageSrc: src }),

        addLayer: (pluginId) => set((state) => {
          const newLayer: LayerInstance = {
            id: uuidv4(),
            pluginId,
            visible: true,
            params: {}
          };
          return { 
            layers: [...state.layers, newLayer],
            selectedLayerId: newLayer.id 
          };
        }),

        removeLayer: (id) => set((state) => ({
          layers: state.layers.filter((l) => l.id !== id),
          selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId
        })),

        selectLayer: (id) => set({ selectedLayerId: id }),

        reorderLayers: (newLayers) => set({ layers: newLayers }),

        setTransientParam: (layerId, key, value) => set((state) => ({
          transientParams: {
            ...state.transientParams,
            [layerId]: { ...(state.transientParams[layerId] || {}), [key]: value }
          }
        })),

        // ドラッグ終了時に確定（履歴に残る）
        commitParam: (layerId, key, value) => set((state) => {/* ...省略... */
          const { [layerId]: _, ...remainingTransients } = state.transientParams;
          return {
            transientParams: remainingTransients,
            layers: state.layers.map((l) => 
              l.id === layerId 
                ? { ...l, params: { ...l.params, [key]: value } }
                : l
            )
          };
        }),

        setIsComparing: (isComparing) => set({ isComparing }),

        toggleFullscreen: () => set((state) => ({ 
          isFullscreen: !state.isFullscreen,
          viewTransform: { x: 0, y: 0, scale: 1 } 
        })),

        setViewTransform: (transform) => set((state) => ({
          viewTransform: typeof transform === 'function' ? transform(state.viewTransform) : transform
        })),

        enterCropMode: () => set({ isCropMode: true }),
        
        exitCropMode: () => set({ isCropMode: false }),
        
        setCropState: (cropState) => set({ cropState }),
        
        applyCrop: (croppedImageSrc) => set({ 
          imageSrc: croppedImageSrc, 
          isCropMode: false 
        }),
      }),
      {
        // 履歴にはレイヤーと「適用済みの画像（imageSrc）」、およびその時点のcropStateを保存
        // equalityはlayersとimageSrcのみで判定し、cropStateだけの変更では履歴を増やさない
        partialize: (state) => ({
          layers: state.layers,
          imageSrc: state.imageSrc,
          cropState: state.cropState,
        } as unknown as AppState),
        equality: (pastState, currentState) => {
          const layersEqual = JSON.stringify(pastState.layers) === JSON.stringify(currentState.layers);
          const imageEqual = (pastState as any).imageSrc === (currentState as any).imageSrc;
          return layersEqual && imageEqual;
        },
        limit: 50
      }
    )
  )
);