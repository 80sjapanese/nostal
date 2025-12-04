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

  setImage: (src: string) => void;
  addLayer: (pluginId: string) => void;
  removeLayer: (id: string) => void;
  selectLayer: (id: string) => void;
  reorderLayers: (newLayers: LayerInstance[]) => void;
  setTransientParam: (layerId: string, key: string, value: number) => void;
  commitParam: (layerId: string, key: string, value: number) => void;
}

export const useAppStore = create(
  subscribeWithSelector(
    temporal<AppState>(
      (set, get) => ({
        imageSrc: null,
        layers: [],
        transientParams: {},
        selectedLayerId: null,

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

        // ドラッグ中はここだけ更新（履歴に残らない）
        setTransientParam: (layerId, key, value) => set((state) => ({
          transientParams: {
            ...state.transientParams,
            [layerId]: { ...(state.transientParams[layerId] || {}), [key]: value }
          }
        })),

        // ドラッグ終了時に確定（履歴に残る）
        commitParam: (layerId, key, value) => set((state) => {
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
      }),
      {
        // 【修正1】 imageSrc を履歴管理から除外。これでUndoしても画像は消えない。
        partialize: (state) => ({ layers: state.layers } as unknown as AppState),

        // 【修正2】 layersの中身が厳密に同じなら履歴に追加しない（ドラッグ中の微細な反応防止）
        equality: (pastState, currentState) => {
          return JSON.stringify(pastState.layers) === JSON.stringify(currentState.layers);
        },
        
        limit: 50
      }
    )
  )
);