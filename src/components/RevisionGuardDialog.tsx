import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SplitPicker } from './SplitPicker';
import type { RevisionChangeRow, RevisionChangeKey } from '../services/revisionGuard';

interface RevisionGuardDialogProps {
  rows: RevisionChangeRow[];
  /** The blocked rows and whether to remember them, or `null` to skip the revision sync. */
  onDone: (answer: { blocked: Set<RevisionChangeKey>; remember: boolean } | null) => void;
}

const groupOf = (row: RevisionChangeRow) => `${row.op === 'insert' ? 'Add' : 'Delete'} ${row.direction === 'cloud' ? 'in cloud' : 'on this device'}`;
const GROUPS = ['Add in cloud', 'Delete in cloud', 'Add on this device', 'Delete on this device'];

/** A sync that would add or delete many revision rows: same left | right picker; left rows are blocked. */
export function RevisionGuardDialog({ rows, onDone }: RevisionGuardDialogProps) {
  const [keep, setKeep] = useState(() => new Set(rows.map((row) => row.key)));
  const [remember, setRemember] = useState(true);
  const items = rows.map((row) => ({ key: row.key, label: row.label, tag: row.quiz, group: groupOf(row) }));
  const blocked = rows.filter((row) => !keep.has(row.key)).map((row) => row.key);
  const inserts = rows.filter((row) => row.op === 'insert').length;
  const deletes = rows.length - inserts;

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-dialog split-review-dialog">
        <h3 className="modal-title">Large revision change</h3>
        <p>This sync would add {inserts} and delete {deletes} revision rows. Nothing has been written yet. Move any row to the left to block it.</p>
        <SplitPicker items={items} keep={keep} onChange={setKeep} groups={GROUPS} leftTitle="Blocked" rightTitle="Applying" />
        <label className="split-review-remember">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          Remember blocked rows for this workspace (future syncs will not touch them)
        </label>
        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={() => setKeep(new Set(rows.map((row) => row.key)))}>Reset</button>
          <button type="button" className="modal-btn-cancel" onClick={() => onDone(null)}>Cancel (skip revision sync)</button>
          <button type="button" className="modal-btn-save" onClick={() => onDone({ blocked: new Set(blocked), remember })}>Apply my choices</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
