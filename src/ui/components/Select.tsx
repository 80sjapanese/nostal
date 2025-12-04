import React from 'react';

interface SelectProps {
  label: string;
  value: string | number;
  options: { label: string; value: string | number }[];
  onChange: (val: string | number) => void;
  onCommit: (val: string | number) => void;
}

export const Select: React.FC<SelectProps> = ({ label, value, options, onChange, onCommit }) => {
  return (
    <div className="control-container" style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '4px' }}>{label}</label>
      <select
        value={value}
        onChange={(e) => {
          // 数値なら数値型に変換して渡す
          const val = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
          onChange(val);
          onCommit(val);
        }}
        style={{ width: '100%', padding: '4px', background: '#333', color: '#fff', border: '1px solid #555' }}
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};