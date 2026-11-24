import { useState } from 'react';
import { createPortal } from 'react-dom';

const CONFIRM_WORD = 'CLEAR';

interface ClearLocalRevisionDialogProps {
  recordCount: number;
  /** Signed in with a cloud copy: the next sync pulls the cloud records back. */
  signedIn: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

/** Warns before wiping this device's revision records for the open workspace; the typed word guards against a stray click. */
export function ClearLocalRevisionDialog({ recordCount, signedIn, onCancel, onConfirm }: ClearLocalRevisionDialogProps) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim().toUpperCase() === CONFIRM_WORD;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear the local revision data');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Clear local revision data">
      <div className="modal-dialog">
        <h3 className="modal-title">Clear local revision data</h3>
        <p className="remove-warning remove-warning--danger">
          This deletes all {recordCount} revision record{recordCount !== 1 ? 's' : ''} stored on <strong>this device</strong> for the
          open workspace. Your lessons, tests and roadmaps are not touched.
        </p>
        <p className="remove-warning">
          {signedIn
            ? 'The cloud copy is not changed. The next sync downloads its records again, so anything wrong in the cloud comes back. If you have not synced, progress that only exists on this device is lost.'
            : 'You are not signed in, so nothing else holds this progress. Export your revision data first if you want to keep a copy.'}
        </p>
        <label className="modal-label">
          Type <strong>{CONFIRM_WORD}</strong> to confirm
          <input
            className="modal-input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={busy}
            autoFocus
          />
        </label>
        {error ? <p className="tree-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="toolbar-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="toolbar-btn remove-confirm remove-confirm--danger" disabled={busy || !ready} onClick={() => { void confirm(); }}>
            {busy ? 'Clearing…' : 'Clear local data'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
