import { useState } from 'react';
import { createPortal } from 'react-dom';

interface RemoveRecordsDialogProps {
  records: { id: number; question_name: string; quiz_title: string }[];
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

/** Confirms removing revision records; synced devices drop them too. */
export function RemoveRecordsDialog({ records, onCancel, onConfirm }: RemoveRecordsDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = records.length;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the records');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Remove revision records">
      <div className="modal-dialog">
        <h3 className="modal-title">Remove {count} revision record{count !== 1 ? 's' : ''}</h3>
        <p className="remove-warning remove-warning--danger">
          This removes the selected question{count !== 1 ? 's' : ''} and {count !== 1 ? 'their' : 'its'} progress from your revision
          history, on every device you are signed in on. Answering the question again later adds it back.
        </p>
        <ul className="remove-records-list">
          {records.slice(0, 5).map((record) => (
            <li key={record.id}><strong>{record.quiz_title}</strong>: {record.question_name}</li>
          ))}
          {count > 5 ? <li>…and {count - 5} more</li> : null}
        </ul>
        {error ? <p className="tree-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="toolbar-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="toolbar-btn remove-confirm remove-confirm--danger" disabled={busy} onClick={() => { void confirm(); }}>
            {busy ? 'Removing…' : `Remove ${count} record${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
