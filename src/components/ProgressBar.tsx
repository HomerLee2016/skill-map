// src/components/ProgressBar.tsx
import React from 'react';

interface ProgressBarProps {
  progress: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  return (
    <div className="progress-hud">
      <span className="hud-title">🚀 Progress</span>
      <div className="hud-track">
        <div className="hud-fill" style={{ width: `${progress}%` }} />
      </div>
      <span className="hud-percent">{progress}%</span>
    </div>
  );
};
