// src/components/ProgressBar.tsx
import React from 'react';

interface ProgressBarProps {
  progress: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(255, 255, 255, 0.95)',
        padding: '10px 20px',
        borderRadius: '20px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        pointerEvents: 'auto',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>🚀 Progress</span>
      <div
        style={{
          width: '150px',
          height: '8px',
          background: '#e0e0e0',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: '#2e7d32',
            transition: 'width 0.4s ease-out',
          }}
        />
      </div>
      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2e7d32' }}>{progress}%</span>
    </div>
  );
};
