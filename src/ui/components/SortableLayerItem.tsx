import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LayerInstance } from '../../types/Plugin';
import { getPlugin } from '../../core/pluginRegistry';

interface Props {
  layer: LayerInstance;
  isSelected: boolean;
  onClick: () => void;
}

export const SortableLayerItem: React.FC<Props> = ({ layer, isSelected, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: layer.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    padding: '10px 15px',
    backgroundColor: isSelected ? '#444' : '#222', // 選択時は明るく
    border: isSelected ? '1px solid #00aaff' : '1px solid #555',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'grab',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    minWidth: '100px',
    textAlign: 'center',
    boxShadow: isSelected ? '0 0 5px rgba(0, 170, 255, 0.5)' : 'none'
  };

  const pluginName = getPlugin(layer.pluginId)?.name || 'Unknown';

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners} 
      onClick={onClick} // これが確実に発火するように親側で制御する
    >
      {pluginName}
    </div>
  );
};