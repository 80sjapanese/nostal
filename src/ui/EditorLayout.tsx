import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Engine } from '../core/engine';
import { pluginRegistry } from '../core/pluginRegistry';
import { Slider } from './components/Slider';
import { TiledExporter } from '../core/exporter/TiledExporter';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from 'zustand';
import { Select } from './components/Select';
import { Checkbox } from './components/Checkbox';

// ... (SortableLayerItem code is same) ...
const SortableLayerItem = ({ layer, isSelected, onClick }: any) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: layer.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '10px',
    backgroundColor: isSelected ? '#444' : '#222',
    border: isSelected ? '1px solid #00aaff' : '1px solid #555',
    marginBottom: '4px',
    color: '#fff',
    cursor: 'pointer',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick}>
       {pluginRegistry[layer.pluginId]?.name || 'Unknown'}
    </div>
  );
};

export const EditorLayout: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null); // Export用に元画像を保持
  
// Store hooks
  const { 
    layers, selectedLayerId, transientParams, 
    addLayer, selectLayer, reorderLayers, 
    setTransientParam, commitParam, imageSrc 
  } = useAppStore();

  // 【修正2】 Undo/Redo (zundo) の取得方法を変更
  // useAppStore.temporal はストアのインスタンスなので、useStore() でラップしてフックとして使います
  const { undo, redo, pastStates, futureStates } = useStore(useAppStore.temporal, (state) => state);
  // Zundoの状態をReactで検知するためにuseStoreでラップする必要があるため、
  // 上の useStore(...) で temporal store の state を購読しています。

  const [activeCategory, setActiveCategory] = useState<string>('subjects');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new Engine(canvasRef.current);
    }
    return () => engineRef.current?.dispose();
  }, []);

  // Export用に画像要素を作っておく
  useEffect(() => {
    if (imageSrc) {
        const img = new Image();
        img.src = imageSrc;
        imageElementRef.current = img;
    }
  }, [imageSrc]);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);
  const selectedPlugin = selectedLayer ? pluginRegistry[selectedLayer.pluginId] : null;
  const libraryPlugins = Object.values(pluginRegistry).filter(p => p.category === activeCategory);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = layers.findIndex(l => l.id === active.id);
      const newIndex = layers.findIndex(l => l.id === over?.id);
      reorderLayers(arrayMove(layers, oldIndex, newIndex));
    }
  };

  const handleDownload = async () => {
    if (!imageElementRef.current || isExporting) return;
    setIsExporting(true);
    try {
        const blob = await TiledExporter.export(imageElementRef.current, layers);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'processed_image.png';
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Export failed", e);
        alert("Export failed");
    } finally {
        setIsExporting(false);
    }
  };

  const handleSavePreset = () => {
      const preset = JSON.stringify(layers, null, 2);
      console.log("--- PRESET DATA ---");
      console.log(preset);
      alert("Preset data logged to console.");
  };

  return (
    <div className="editor-container">
      {/* 1. Sidebar Categories */}
      <div className="sidebar-categories">
        {['subjects', 'lens', 'film', 'post', 'print'].map(cat => (
          <button 
            key={cat} 
            className={activeCategory === cat ? 'active' : ''}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 2. Library */}
      <div className="sidebar-library">
        <h3>Library</h3>
        <div className="plugin-list">
          {libraryPlugins.map(plugin => (
            <div 
              key={plugin.id} 
              className="plugin-item"
              onClick={() => addLayer(plugin.id)}
            >
              + {plugin.name}
            </div>
          ))}
        </div>
      </div>

      {/* 3. Main Area */}
      <div className="main-area">
        <div className="preview-area">
          <canvas ref={canvasRef} />
          
{/* Top Left: Undo/Redo */}
          <div className="toolbar-top-left">
             <button 
               onClick={() => undo()} // ここで undo を使用
               disabled={pastStates.length === 0} // ここで pastStates を使用
               title="Undo"
             >
                ◀
             </button>
             <button 
               onClick={() => redo()} // ここで redo を使用
               disabled={futureStates.length === 0} // ここで futureStates を使用
               title="Redo"
             >
                ▶
             </button>
          </div>

          {/* Top Right: Preset & Download */}
          <div className="toolbar-top-right">
             <button onClick={handleSavePreset} title="Save Preset">
                💾 Preset
             </button>
             <button onClick={handleDownload} disabled={isExporting} title="Download">
                {isExporting ? '...' : '⬇ Download'}
             </button>
          </div>
        </div>

        {/* 4. Layer Panel */}
        <div className="layer-panel">
          <h3>Layers</h3>
          <div className="layer-list-horizontal">
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={layers} strategy={verticalListSortingStrategy}>
                 <div style={{display: 'flex', gap: '8px', overflowX: 'auto'}}>
                    {layers.map(layer => (
                      <SortableLayerItem 
                        key={layer.id} 
                        layer={layer} 
                        isSelected={layer.id === selectedLayerId}
                        onClick={() => selectLayer(layer.id)}
                      />
                    ))}
                 </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>

      {/* 5. Controls */}
    <div className="sidebar-controls">
        <h3>Controls</h3>
        {selectedLayer && selectedPlugin ? (
          <div>
            <h4>{selectedPlugin.name}</h4>
            {selectedPlugin.parameters.map(param => {
              // 現在のパラメータ値を取得（マージ済み）
              const allParams = { ...selectedLayer.params, ...transientParams[selectedLayer.id] };
              const currentVal = allParams[param.key] ?? param.default;

              // 【重要】visibleIf の判定ロジック
              if (param.visibleIf) {
                const targetVal = allParams[param.visibleIf.key];
                // 依存先の値がまだ未設定ならデフォルト値を取得して比較
                const targetDefault = selectedPlugin.parameters.find(p => p.key === param.visibleIf!.key)?.default;
                const actualTargetVal = targetVal ?? targetDefault;

                if (actualTargetVal !== param.visibleIf.value) {
                  return null; // 非表示
                }
              }

              // 型に応じたコンポーネントの出し分け
              if (param.type === 'slider') {
                return (
                  <Slider
                    key={param.key}
                    label={param.label}
                    min={param.min}
                    max={param.max}
                    value={currentVal as number}
                    onChange={(val) => setTransientParam(selectedLayer.id, param.key, val)}
                    onCommit={(val) => commitParam(selectedLayer.id, param.key, val)}
                  />
                );
              }
              if (param.type === 'select') {
                return (
                  <Select
                    key={param.key}
                    label={param.label}
                    value={currentVal as string | number}
                    options={param.options}
                    onChange={(val) => setTransientParam(selectedLayer.id, param.key, val as number)}
                    onCommit={(val) => commitParam(selectedLayer.id, param.key, val as number)}
                  />
                );
              }
              if (param.type === 'checkbox') {
                return (
                  <Checkbox
                    key={param.key}
                    label={param.label}
                    checked={!!currentVal} // booleanにキャスト
                    onChange={(val) => setTransientParam(selectedLayer.id, param.key, val ? 1 : 0)} // GLSL用に数値化(0/1)推奨
                    onCommit={(val) => commitParam(selectedLayer.id, param.key, val ? 1 : 0)}
                  />
                );
              }
              return null;
            })}
          </div>
        ) : (
          <p>Select a layer to edit</p>
        )}
      </div>
    </div>
  );
};