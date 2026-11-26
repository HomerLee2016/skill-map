interface ContentActionsProps {
  /** Noun used in labels, e.g. "lesson" or "test". */
  noun: string;
  /** Why editing is blocked (shown as tooltip), or null when allowed. */
  blockedReason: string | null;
  onEdit: () => void;
  onDelete: () => void;
}

const svgProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

/** Icon-only Edit / Delete pair shown above a lesson or test (both secondary; see docs/UI-UX-RULES.md). */
export function ContentActions({ noun, blockedReason, onEdit, onDelete }: ContentActionsProps) {
  return (
    <div className="ce-content-actions">
      <button type="button" className="icon-btn" onClick={onEdit} disabled={blockedReason !== null} title={blockedReason ?? `Edit this ${noun}`} aria-label={`Edit ${noun}`}>
        <svg {...svgProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </button>
      <button type="button" className="icon-btn icon-btn--danger" onClick={onDelete} disabled={blockedReason !== null} title={blockedReason ?? `Delete this ${noun}`} aria-label={`Delete ${noun}`}>
        <svg {...svgProps}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
      </button>
    </div>
  );
}
