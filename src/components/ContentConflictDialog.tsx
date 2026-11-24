import { Modal } from './sharing/Modal';
import { describeRef, type ItemRef } from '../services/contentSync';
import type { ConflictChoice } from '../services/contentSyncRun';

interface ContentConflictDialogProps {
  refs: ItemRef[];
  busy: boolean;
  onChoose: (ref: ItemRef, choice: ConflictChoice) => void;
  onClose: () => void;
}

/** Items changed (or deleted) on this device and in your account since they last agreed; nothing was overwritten. */
export function ContentConflictDialog({ refs, busy, onChoose, onClose }: ContentConflictDialogProps) {
  return (
    <Modal title="Changes on two devices" className="ce-confirm">
      <h3 className="modal-title">Changed in two places</h3>
      <p className="ce-hint">These were edited here and in your account (or deleted in one place and edited in the other). Nothing was overwritten. Pick which version to keep for each.</p>
      <ul className="ce-conflicts">
        {refs.map((ref) => (
          <li key={ref}>
            <span className="ce-conflict-name">{describeRef(ref)}</span>
            <span className="ce-conflict-actions">
              <button type="button" className="toolbar-btn ce-btn" disabled={busy} onClick={() => onChoose(ref, 'cloud')}>Use account version</button>
              <button type="button" className="toolbar-btn ce-btn ce-btn--quiet" disabled={busy} onClick={() => onChoose(ref, 'device')}>Keep this device</button>
            </span>
          </li>
        ))}
      </ul>
      <div className="modal-actions"><button type="button" className="modal-btn-cancel" onClick={onClose}>Decide later</button></div>
    </Modal>
  );
}
