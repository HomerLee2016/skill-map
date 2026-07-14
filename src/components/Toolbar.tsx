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
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        background: '#222',
        color: '#fff',
        borderBottom: '1px solid #333',
        width: '100%',
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
          width: '100%',
        }}
        title="Auto‑align tree"
      >
        ⚡ Auto‑Align
      </button>
      <button
        onClick={() => setShowDetails(!showDetails)}
        style={{
          background: 'linear-gradient(45deg, #646cff, #4e9afe)',
          border: 'none',
          color: '#fff',
          padding: '6px 12px',
          cursor: 'pointer',
          borderRadius: '6px',
          width: '100%',
        }}
        title={showDetails ? 'Hide Details' : 'Show Details'}
      >
        {showDetails ? '👁️ Hide Details' : '👁️ Show Details'}
      </button>
      <button
        onClick={onAddNode}
        style={{
          background: 'linear-gradient(45deg, #646cff, #4e9afe)',
          border: 'none',
          color: '#fff',
          padding: '6px 12px',
          cursor: 'pointer',
          borderRadius: '6px',
          width: '100%',
        }}
        title="Add Skill Node"
      >
        ➕ Skill Node
      </button>
    </div>
  );
}
