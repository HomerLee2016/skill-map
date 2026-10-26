import { createPortal } from 'react-dom';
import type { PendingConflict } from '../hooks/useCloudSync';
import type { ConflictChoice, SideSummary } from '../services/syncConflict';

interface SyncConflictDialogProps {
  conflict: PendingConflict;
  busy: boolean;
  onChoose: (choice: ConflictChoice) => void;
}

function SideColumn({ title, side }: { title: string; side: SideSummary }) {
  return (
    <div className="sync-conflict-side">
      <strong>{title}</strong>
      <ul>
        <li>{side.questions} questions</li>
        <li>{side.stars} ⭐ total</li>
        <li>{side.lessons} lessons · {side.tests} tests · {side.roadmaps} roadmaps</li>
      </ul>
    </div>
  );
}

/** Shown once per device when this device and the cloud both hold data that differs. */
export function SyncConflictDialog({ conflict, busy, onChoose }: SyncConflictDialogProps) {
  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-dialog">
        <h3 className="modal-title">Two copies found</h3>
        <p>This device and your cloud account both have progress. Which one should be kept?</p>
        <div className="sync-conflict-sides">
          <SideColumn title="This device" side={conflict.device} />
          <SideColumn title="Cloud account" side={conflict.cloud} />
        </div>
        <div className="modal-actions">
          <button type="button" className="toolbar-btn" disabled={busy} onClick={() => onChoose('merge')}>
            Merge both (newest wins)
          </button>
          <button type="button" className="toolbar-btn" disabled={busy} onClick={() => onChoose('cloud')}>
            Keep cloud
          </button>
          <button type="button" className="toolbar-btn" disabled={busy} onClick={() => onChoose('device')}>
            Keep this device
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
