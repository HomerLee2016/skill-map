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
    <div className="toolbar">
      <button
        className="toolbar-btn"
        onClick={onAutoAlign}
        title="Auto-align tree"
      >
        ⚡ Auto-Align
      </button>

      <button
        className="toolbar-btn"
        onClick={() => setShowDetails(!showDetails)}
        title={showDetails ? 'Hide Details' : 'Show Details'}
      >
        {showDetails ? '👁️ Hide Details' : '👁️ Show Details'}
      </button>

      <button
        className="toolbar-btn"
        onClick={onAddNode}
        title="Add Skill Node"
      >
        ➕ Skill Node
      </button>

      <button
        className="toolbar-btn"
        onClick={() => setTipsOpen(!tipsOpen)}
        title={tipsOpen ? 'Hide Tips' : 'Show Tips'}
      >
        {tipsOpen ? '💡 Hide Tips' : '💡 Show Tips'}
      </button>
      {tipsOpen && (
        <div className="tips-copy">
          <div>Left-drag empty space to box-select.</div>
          <div>Right-drag to pan the canvas.</div>
          <div>Drag bottom handle to top handle to link.</div>
          <div>Double-click a skill node to edit it.</div>
        </div>
      )}
    </div>
  );
}
