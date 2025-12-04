import React from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  onCommit: (val: number) => void;
}

export const Slider: React.FC<SliderProps> = ({ label, value, min, max, onChange, onCommit }) => {
  return (
    <div className="slider-container" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <label>{label}</label>
        <input 
          type="number" 
          value={value} 
          min={min} 
          max={max}
          onChange={(e) => {
             const v = Number(e.target.value);
             onChange(v);
             onCommit(v); // 数値入力は即コミット
          }}
          style={{ width: '60px', textAlign: 'right' }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        // ドラッグ中：onChange（Transient更新）
        onChange={(e) => onChange(Number(e.target.value))}
        // ドラッグ終了：onMouseUp/TouchEnd（Commit更新 -> 履歴追加）
        onMouseUp={(e) => onCommit(Number(e.currentTarget.value))}
        onTouchEnd={(e) => onCommit(Number(e.currentTarget.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
};