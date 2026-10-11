export function TreeGlobalActions({
  onExpandAll,
  onCollapseAll,
}: {
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <div className="tree-global-actions">
      <button
        type="button"
        className="tree-global-actions-btn"
        title="Expand all folders"
        onClick={onExpandAll}
      >
        📂 Expand All
      </button>
      <button
        type="button"
        className="tree-global-actions-btn"
        title="Collapse all folders"
        onClick={onCollapseAll}
      >
        📁 Collapse All
      </button>
    </div>
  );
}

