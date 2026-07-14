import React from 'react';

interface ToolbarProps {
  onAutoAlign: () => void;
  showDetails: boolean;
  setShowDetails: (value: boolean) => void;
  onAddNode: () => void;
}

export function Toolbar({
  onAutoAlign,
  showDetails,
  setShowDetails,
  onAddNode,
}: ToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 12px',
        background: '#222',
        color: '#fff',
        borderBottom: '1px solid #333',
      }}
    >
      <button
        onClick={onAutoAlign}
        style={{
          background: 'linear-gradient(45deg, #646cff, #4e9afe)',
          border: 'none',
          color: '#fff',
          padding: '6px 12px',
          cursor: 'pointer',
          borderRadius: '6px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        }}
        title="Auto‑align tree"
      >
        Auto‑Align
      </button>
      <label style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={showDetails}
          onChange={e => setShowDetails(e.target.checked)}
          style={{ marginRight: '4px' }}
        />
        {showDetails ? 'Hide Details' : 'Show Details'}
      </label>
      {/* YAML toggle moved to sidebar */}
      <button
        onClick={onAddNode}
        style={{
          background: '#555',
          border: 'none',
          color: '#fff',
          padding: '6px 10px',
          cursor: 'pointer',
          borderRadius: '4px',
          marginLeft: '8px',
        }}
        title="Add Skill Node"
      >
        + Skill Node
      </button>
    </div>
  );
}
