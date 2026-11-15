import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { supabase } from '../lib/supabaseClient';
import { duplicateCloudWorkspace, type DuplicateOutcome } from '../services/cloudMerge';
import { getCompletedQuestionsForKey } from '../services/revisionDb';
import { newWorkspaceKey } from '../services/sharedWorkspaces';
import type { WorkspaceListEntry } from '../utils/workspaceList';

interface DuplicateWorkspaceDialogProps {
  entries: WorkspaceListEntry[];
  onClose: () => void;
}

/** Pick one of your workspaces and copy it (content and revision progress) into a new one to experiment in. */
export function DuplicateWorkspaceDialog({ entries, onClose }: DuplicateWorkspaceDialogProps) {
  const { user } = useAuth();
  const { workspace, workspaceKey, hasLocalContent, refreshCloudWorkspaces, selectCloudWorkspace } = useWorkspace();
  const choices = entries.filter((entry) => entry.inCloud);
  const [sourceKey, setSourceKey] = useState(() => (choices.find((entry) => entry.key === workspaceKey) ?? choices[0])?.key ?? '');
  const source = choices.find((entry) => entry.key === sourceKey);
  const [customName, setCustomName] = useState<string | null>(null);
  const name = customName ?? (source ? `${source.name} (copy)` : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DuplicateOutcome | null>(null);

  const run = async () => {
    if (!supabase || !user || !source || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setOutcome(await duplicateCloudWorkspace(
        supabase,
        { key: source.key, name: source.name, content: source.key === workspaceKey && hasLocalContent ? workspace : undefined },
        { key: newWorkspaceKey('copy'), name: name.trim() },
        getCompletedQuestionsForKey,
      ));
      await refreshCloudWorkspaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate');
    } finally {
      setBusy(false);
    }
  };

  const openCopy = async () => {
    if (!outcome) return;
    await selectCloudWorkspace({ key: outcome.targetKey, name: outcome.targetName });
    onClose();
  };

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Duplicate workspace">
      <div className="modal-dialog merge-dialog">
        <h3 className="modal-title">Duplicate workspace</h3>
        {outcome ? (
          <>
            <p className="sharing-ok" role="status">Created "{outcome.targetName}".</p>
            <ul className="merge-report">
              <li><strong>Copied:</strong> {outcome.counts.lessons} lessons, {outcome.counts.tests} tests, {outcome.counts.roadmaps} roadmaps</li>
              <li><strong>Revision:</strong> {outcome.revisionRecords} question record{outcome.revisionRecords === 1 ? '' : 's'}</li>
            </ul>
            <p className="sharing-muted">The original was not changed. Edit the copy freely.</p>
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={onClose}>Close</button>
              <button type="button" className="toolbar-btn" onClick={() => { void openCopy(); }}>Open the copy</button>
            </div>
          </>
        ) : (
          <>
            <p className="sharing-muted">
              Makes an independent copy of a workspace in your account: lessons, tests, roadmaps, folders and revision
              progress. Changes to the copy never affect the original. The copy has no folder on this device; it lives in your account.
            </p>
            <label className="modal-label">
              Workspace to duplicate
              <select className="modal-input" value={sourceKey} onChange={(event) => { setSourceKey(event.target.value); setCustomName(null); }} aria-label="Workspace to duplicate">
                {choices.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
              </select>
            </label>
            <label className="modal-label">
              Name of the copy
              <input className="modal-input" value={name} maxLength={200} onChange={(event) => setCustomName(event.target.value)} aria-label="Name of the copy" />
            </label>
            {error ? <p className="tree-error">{error}</p> : null}
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="toolbar-btn" disabled={busy || !source || !name.trim()} onClick={() => { void run(); }}>{busy ? 'Duplicating…' : 'Duplicate'}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
