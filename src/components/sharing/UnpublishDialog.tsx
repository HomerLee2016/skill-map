import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatPublishedAt } from '../../services/publishedList';
import { unpublishWorkspace, type SharedWorkspaceSummary } from '../../services/sharedWorkspaces';
import { Modal } from './Modal';

interface UnpublishDialogProps {
  item: SharedWorkspaceSummary;
  onClose: () => void;
  /** Runs after the snapshot is gone, so the caller can reload its list and say so. */
  onDone: (item: SharedWorkspaceSummary) => Promise<void>;
}

/** Asks before removing a published snapshot from the hub. */
export function UnpublishDialog({ item, onClose, onDone }: UnpublishDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await unpublishWorkspace(supabase, item.id);
      await onDone(item);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unpublish');
      setBusy(false);
    }
  };

  return (
    <Modal title="Unpublish workspace">
      <h3 className="modal-title">Unpublish workspace?</h3>
      <p className="sharing-muted">
        "{item.name}", published {formatPublishedAt(item.publishedAt)}, will no longer appear in the hub.
        Workspaces people already cloned keep their copy. Your own workspace is not changed.
      </p>
      {error ? <p className="tree-error" role="alert">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="modal-btn-cancel" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="toolbar-btn sharing-btn-danger" disabled={busy} onClick={() => { void confirm(); }}>{busy ? 'Working…' : 'Unpublish'}</button>
      </div>
    </Modal>
  );
}
