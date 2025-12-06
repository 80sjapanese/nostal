import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Engine } from '../core/engine';
import { pluginRegistry } from '../core/pluginRegistry';
import { Slider } from './components/Slider';
import { Select } from './components/Select';
import { Checkbox } from './components/Checkbox';
import { TiledExporter } from '../core/exporter/TiledExporter';
import { useCanvasInteraction } from './hooks/useCanvasInteraction';
// 作成したコンポーネントをインポート
import { SortableLayerItem } from './components/SortableLayerItem';
import { useStore } from 'zustand';

// dnd-kit 関連
import { 
  DndContext, 
  closestCenter, 
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { 
  SortableContext, 
  arrayMove, 
  horizontalListSortingStrategy // 横並びなのでこちらが適切
} from '@dnd-kit/sortable';

export const EditorLayout: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  
  const { 
    layers, selectedLayerId, transientParams, 
    addLayer, selectLayer, reorderLayers, 
    setTransientParam, commitParam, imageSrc,
    isFullscreen, viewTransform
  } = useAppStore();

  const { undo, redo, pastStates, futureStates } = useStore(useAppStore.temporal, (state) => state);
  const [activeCategory, setActiveCategory] = useState<string>('subjects');
  const [isExporting, setIsExporting] = useState(false);

  const canvasInteraction = useCanvasInteraction();

  // 【重要】ドラッグの感度設定
  // 5px以上動かさないとドラッグイベントを開始しない
  // これにより、単なるクリック(0px移動)は onClick として処理されるようになる
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new Engine(canvasRef.current);
    }
    return () => engineRef.current?.dispose();
  }, []);

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
    /* ... 既存のダウンロード処理 ... */
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
        console.error(e);
        alert("Export failed");
    } finally {
        setIsExporting(false);
    }
  };

  const handleSavePreset = () => {
      const preset = JSON.stringify(layers, null, 2);
      console.log(preset);
      alert("Preset logged.");
  };

  const stopPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
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
        <div 
          className="preview-area" 
          {...canvasInteraction}
          style={{
            ...canvasInteraction.style,
            ...(isFullscreen ? {
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 9999,
              backgroundColor: '#0a0a0a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: 0
            } : {})
          }}
        >
          <canvas 
            ref={canvasRef} 
            style={{
              transform: isFullscreen 
                ? `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})` 
                : 'none',
              transition: 'none',
              transformOrigin: 'center',
              // Ensure canvas fits within the container (screen in fullscreen mode)
              maxWidth: '100%',
              maxHeight: '100%',
              display: 'block',
              boxShadow: isFullscreen ? '0 0 50px rgba(0,0,0,0.5)' : 'none'
            }}
          />
          
          {!isFullscreen && (
            <>
              <div 
                className="toolbar-top-left"
                onMouseDown={stopPropagation}
                onMouseUp={stopPropagation}
                onTouchStart={stopPropagation}
                onTouchEnd={stopPropagation}
                onClick={stopPropagation}
              >
                 <button onClick={() => undo()} disabled={pastStates.length === 0}>◀</button>
                 <button onClick={() => redo()} disabled={futureStates.length === 0}>▶</button>
              </div>

              <div 
                className="toolbar-top-right"
                onMouseDown={stopPropagation}
                onMouseUp={stopPropagation}
                onTouchStart={stopPropagation}
                onTouchEnd={stopPropagation}
                onClick={stopPropagation}
              >
                 <button onClick={handleSavePreset}>💾</button>
                 <button onClick={handleDownload} disabled={isExporting}>⬇</button>
              </div>
            </>
          )}
        </div>

        {/* 4. Layer Panel */}
        <div className="layer-panel">
          <h3>Layers</h3>
          <div className="layer-list-horizontal">
            {/* センサーを適用 */}
            <DndContext 
              sensors={sensors} 
              collisionDetection={closestCenter} 
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={layers} 
                strategy={horizontalListSortingStrategy} // 横並び用ストラテジーに変更
              >
                 <div style={{display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px'}}>
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
            <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '1rem' }}>
              ID: {selectedLayer.id.slice(0,8)}...
            </div>
            
            {selectedPlugin.parameters.map(param => {
              const allParams = { ...selectedLayer.params, ...transientParams[selectedLayer.id] };
              const currentVal = allParams[param.key] ?? param.default;

              // visibleIf ロジック
              if (param.visibleIf) {
                const targetVal = allParams[param.visibleIf.key];
                const targetDefault = selectedPlugin.parameters.find(p => p.key === param.visibleIf!.key)?.default;
                const actualTargetVal = targetVal ?? targetDefault;

                if (actualTargetVal !== param.visibleIf.value) {
                  return null;
                }
              }

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
                    checked={!!currentVal}
                    onChange={(val) => setTransientParam(selectedLayer.id, param.key, val ? 1 : 0)}
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