import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { temporal } from 'zundo';
import { LayerInstance } from '../types/Plugin';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  imageSrc: string | null;
  layers: LayerInstance[];
  transientParams: Record<string, Record<string, number>>; 
  selectedLayerId: string | null;
  isComparing: boolean;

  setImage: (src: string) => void;
  addLayer: (pluginId: string) => void;
  removeLayer: (id: string) => void;
  selectLayer: (id: string) => void;
  reorderLayers: (newLayers: LayerInstance[]) => void;
  setTransientParam: (layerId: string, key: string, value: number) => void;
  commitParam: (layerId: string, key: string, value: number) => void;
  setIsComparing: (isComparing: boolean) => void;
}

export const useAppStore = create(
  subscribeWithSelector(
    temporal<AppState>(
      (set, get) => ({
        imageSrc: null,
        layers: [],
        transientParams: {},
        selectedLayerId: null,
        isComparing: false,

        setImage: (src) => set({ imageSrc: src }),

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
      }),
      {
        // imageSrc と isComparing は履歴管理しない
        partialize: (state) => ({ layers: state.layers } as AppState),
        equality: (pastState, currentState) => {
          return JSON.stringify(pastState.layers) === JSON.stringify(currentState.layers);
        },
        limit: 50
      }
    )
  )
);