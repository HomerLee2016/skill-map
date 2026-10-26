import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { WorkspaceListEntry } from '../utils/workspaceList';

interface RemoveWorkspaceDialogProps {
  entry: WorkspaceListEntry;
  /** Signed in, so the cloud copy can be deleted. */
  canDeleteCloud: boolean;
  onCancel: () => void;
  onConfirm: (alsoCloud: boolean) => Promise<void>;
}

/** Removing needs the workspace name typed in; the cloud copy is only deleted when its own checkbox is ticked. */
export function RemoveWorkspaceDialog({ entry, canDeleteCloud, onCancel, onConfirm }: RemoveWorkspaceDialogProps) {
  const cloudOnly = !entry.local;
  const [typed, setTyped] = useState('');
  const [alsoCloud, setAlsoCloud] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deletesCloud = cloudOnly || alsoCloud;
  const matches = typed.trim() === entry.name;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(deletesCloud);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the workspace');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Remove ${entry.name}`}>
      <div className="modal-dialog">
        <h3 className="modal-title">{cloudOnly ? 'Delete cloud workspace' : 'Remove workspace'}</h3>
        {cloudOnly ? (
          <p className="remove-warning remove-warning--danger">
            This permanently deletes <strong>{entry.name}</strong> from your account: its lessons, tests, roadmaps
            and revision progress, on every device. It cannot be undone. Files on your computer are not touched.
          </p>
        ) : (
          <p className="remove-warning">
            This removes <strong>{entry.name}</strong> from this device&apos;s recent list. Your folder and its files
            are not deleted{entry.inCloud ? ', and the cloud copy stays in your account.' : '.'}
          </p>
        )}
        {entry.local && entry.inCloud && canDeleteCloud ? (
          <label className="remove-cloud-option">
            <input type="checkbox" checked={alsoCloud} onChange={(event) => setAlsoCloud(event.target.checked)} />
            <span>
              Also permanently delete the cloud copy (lessons, tests, roadmaps and revision progress on all
              devices, including your phone). Cannot be undone.
            </span>
          </label>
        ) : null}
        <label className="modal-label">
          Type <strong>{entry.name}</strong> to confirm
          <input
            className="modal-input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Workspace name"
          />
        </label>
        {error ? <p className="tree-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="toolbar-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={deletesCloud ? 'toolbar-btn remove-confirm remove-confirm--danger' : 'toolbar-btn remove-confirm'}
            disabled={!matches || busy || (deletesCloud && !canDeleteCloud)}
            onClick={() => { void confirm(); }}
          >
            {busy ? 'Removing…' : deletesCloud ? 'Delete cloud copy' : 'Remove from this device'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
