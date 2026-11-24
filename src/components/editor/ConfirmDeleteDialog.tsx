import { useState, type ReactNode } from 'react';
import { Modal } from '../sharing/Modal';

interface ConfirmDeleteDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function ConfirmDeleteDialog({ title, children, confirmLabel = 'Delete', onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.');
      setBusy(false);
    }
  };
  return (
    <Modal title={title} className="ce-confirm">
      <h3 className="modal-title">{title}</h3>
      <div className="ce-confirm-body">{children}</div>
      {error ? <p className="ce-error" role="alert">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="modal-btn-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="modal-btn-save ce-danger" onClick={() => { void run(); }} disabled={busy}>{busy ? 'Deleting…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}
