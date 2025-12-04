import React from 'react';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  onCommit: (val: boolean) => void;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, checked, onChange, onCommit }) => {
  return (
    <div className="control-container" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
          onCommit(e.target.checked);
        }}
        style={{ marginRight: '8px', transform: 'scale(1.2)' }}
      />
      <label>{label}</label>
    </div>
  );
};