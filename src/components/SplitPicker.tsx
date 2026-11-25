export interface SplitPickerItem {
  key: string;
  label: string;
  tag?: string;
  group: string;
}

interface SplitPickerProps {
  items: SplitPickerItem[];
  /** Keys on the right-hand side. */
  keep: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Group headings in display order. */
  groups: string[];
  leftTitle: string;
  rightTitle: string;
}

/**
 * Reusable left | right chooser. Click an item to move it across; the bulk buttons sit in the column they act on
 * ("Add all" on top of the left column pulls everything right, "Remove all" on top of the right column pushes it left).
 */
export function SplitPicker({ items, keep, onChange, groups, leftTitle, rightTitle }: SplitPickerProps) {
  const move = (key: string, toRight: boolean) => {
    const next = new Set(keep);
    if (toRight) next.add(key); else next.delete(key);
    onChange(next);
  };
  const setAll = (toRight: boolean) => onChange(toRight ? new Set(items.map((item) => item.key)) : new Set());

  const renderColumn = (right: boolean) => {
    const own = items.filter((item) => keep.has(item.key) === right);
    return (
      <div className={`split-picker-col ${right ? 'split-picker-col--right' : 'split-picker-col--left'}`}>
        <header className="split-picker-head">
          <strong>{right ? rightTitle : leftTitle} ({own.length})</strong>
        </header>
        <div className="split-picker-list">
          {groups.map((group) => {
            const inGroup = own.filter((item) => item.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group}>
                <div className="split-picker-group">{group} ({inGroup.length})</div>
                {inGroup.map((item) => {
                  const arrow = (
                    <button
                      type="button"
                      className="split-picker-arrow"
                      aria-label={`${right ? 'Remove' : 'Add'} ${item.label}`}
                      onClick={() => move(item.key, !right)}
                    >
                      {right ? '←' : '→'}
                    </button>
                  );
                  return (
                    <div key={item.key} className="split-picker-item">
                      {right ? arrow : null}
                      <span className="split-picker-label">{item.label}</span>
                      {item.tag ? <span className="split-picker-tag">{item.tag}</span> : null}
                      {right ? null : arrow}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="split-picker">
      {renderColumn(false)}
      <div className="split-picker-middle">
        <button type="button" className="modal-btn-cancel split-picker-bulk" title="Move all to the right" aria-label="Move all to the right" disabled={items.every((item) => keep.has(item.key))} onClick={() => setAll(true)}>&raquo;</button>
        <button type="button" className="modal-btn-cancel split-picker-bulk" title="Move all to the left" aria-label="Move all to the left" disabled={items.every((item) => !keep.has(item.key))} onClick={() => setAll(false)}>&laquo;</button>
      </div>
      {renderColumn(true)}
    </div>
  );
}
