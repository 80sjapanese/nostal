import React from 'react';
import { useAppStore } from './store/useAppStore';
import { EditorLayout } from './ui/EditorLayout';
import './App.css';

const App: React.FC = () => {
  const imageSrc = useAppStore((state) => state.imageSrc);
  const setImage = useAppStore((state) => state.setImage);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImage(url);
    }
  };

  return (
    <div className="app-container">
      {!imageSrc ? (
        <div className="import-screen">
          <input 
            type="file" 
            id="fileInput" 
            accept="image/*" 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
          />
          <button 
            className="btn-import"
            onClick={() => document.getElementById('fileInput')?.click()}
          >
            Import a file
          </button>
        </div>
      ) : (
        <EditorLayout />
      )}
    </div>
  );
};

export default App;