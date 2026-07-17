interface ToolbarProps {
  onAutoAlign: () => void;
  showDetails: boolean;
  setShowDetails: (value: boolean) => void;
  onAddNode: () => void;
  tipsOpen: boolean;
  setTipsOpen: (value: boolean) => void;
}

export function Toolbar({
  onAutoAlign,
  showDetails,
  setShowDetails,
  onAddNode,
  tipsOpen,
  setTipsOpen,
}: ToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        background: 'var(--toolbar-bg)',
        color: 'var(--toolbar-text)',
        borderBottom: '1px solid var(--toolbar-border)',
        width: 'auto',
        minWidth: 0,
        boxSizing: 'border-box',
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
          width: '100%',
        }}
        title="Auto-align tree"
      >
        ⚡ Auto-Align
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

      <button
        onClick={() => setTipsOpen(!tipsOpen)}
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#fff',
          padding: '6px 12px',
          cursor: 'pointer',
          borderRadius: '6px',
          width: '100%',
        }}
        title={tipsOpen ? 'Hide Tips' : 'Show Tips'}
      >
        {tipsOpen ? '💡 Hide Tips' : '💡 Show Tips'}
      </button>
      {tipsOpen && (
      <div className="tips-copy" style={{ fontSize: '11px', paddingTop: '6px', marginTop: '4px', lineHeight: '1.5' }}>
        <div>Left-drag empty space to box-select.</div>
        <div>Right-drag to pan the canvas.</div>
        <div>Drag bottom handle to top handle to link.</div>
        <div>Double-click a skill node to edit it.</div>
      </div>
    )}
    </div>
  );
}
