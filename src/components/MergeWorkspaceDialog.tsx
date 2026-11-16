import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { supabase } from '../lib/supabaseClient';
import { mergeCloudWorkspaces, type MergeOutcome } from '../services/cloudMerge';
import { getCompletedQuestionsForKey } from '../services/revisionDb';
import { newWorkspaceKey } from '../services/sharedWorkspaces';
import type { WorkspaceListEntry } from '../utils/workspaceList';

interface MergeWorkspaceDialogProps {
  entries: WorkspaceListEntry[];
  onClose: () => void;
}

/** Merge two or more of your workspaces into one (new, or one that has no folder on this device) so revision is managed together. */
export function MergeWorkspaceDialog({ entries, onClose }: MergeWorkspaceDialogProps) {
  const { user } = useAuth();
  const { workspace, workspaceKey, hasLocalContent, refreshCloudWorkspaces, selectCloudWorkspace, refreshWorkspace } = useWorkspace();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [targetMode, setTargetMode] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState('Merged workspace');
  const [existingKey, setExistingKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<MergeOutcome | null>(null);

  const mergeable = entries.filter((entry) => entry.inCloud);
  const picked = mergeable.filter((entry) => checked.has(entry.key));
  // A workspace backed by a folder on this device is not a merge target: its folder is the working copy.
  const targetChoices = picked.filter((entry) => !entry.local);
  const existing = targetChoices.find((entry) => entry.key === existingKey) ?? targetChoices[0];
  const effectiveMode = targetMode === 'existing' && existing ? 'existing' : 'new';
  const canMerge = picked.length >= 2 && (effectiveMode === 'existing' || newName.trim().length > 0) && !busy && Boolean(user);

  const toggle = (key: string, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(key); else next.delete(key);
    setChecked(next);
  };

  const run = async () => {
    if (!supabase || !canMerge) return;
    setBusy(true);
    setError(null);
    try {
      const target = effectiveMode === 'existing' && existing
        ? { key: existing.key, name: existing.name }
        : { key: newWorkspaceKey('merged'), name: newName.trim() };
      // The target (when it already exists) goes first so its own lessons keep their ids.
      const ordered = effectiveMode === 'existing' && existing
        ? [existing, ...picked.filter((entry) => entry.key !== existing.key)]
        : picked;
      const result = await mergeCloudWorkspaces(
        supabase,
        ordered.map((entry) => ({ key: entry.key, name: entry.name, content: entry.key === workspaceKey && hasLocalContent ? workspace : undefined })),
        target,
        getCompletedQuestionsForKey,
      );
      await refreshCloudWorkspaces();
      if (result.targetKey === workspaceKey) await refreshWorkspace();
      setOutcome(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge');
    } finally {
      setBusy(false);
    }
  };

  const openMerged = async () => {
    if (!outcome) return;
    await selectCloudWorkspace({ key: outcome.targetKey, name: outcome.targetName });
    onClose();
  };

  const line = (label: string, report: { added: number; duplicates: number; renamed: number }) => (
    <li key={label}>
      <strong>{label}:</strong> {report.added} added{report.duplicates ? `, ${report.duplicates} duplicate${report.duplicates === 1 ? '' : 's'} skipped` : ''}
      {report.renamed ? `, ${report.renamed} kept under a new name (same id, different content)` : ''}
    </li>
  );

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Merge workspaces">
      <div className="modal-dialog merge-dialog">
        <h3 className="modal-title">Merge workspaces</h3>
        {outcome ? (
          <>
            <p className="sharing-ok" role="status">Merged into "{outcome.targetName}".</p>
            <ul className="merge-report">
              {line('Lessons', outcome.report.lessons)}
              {line('Tests', outcome.report.tests)}
              {line('Roadmaps', outcome.report.roadmaps)}
              <li><strong>Revision:</strong> {outcome.revisionRecords} question record{outcome.revisionRecords === 1 ? '' : 's'} carried over</li>
            </ul>
            <p className="sharing-muted">The original workspaces were not changed.</p>
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={onClose}>Close</button>
              <button type="button" className="toolbar-btn" onClick={() => { void openMerged(); }}>Open merged workspace</button>
            </div>
          </>
        ) : (
          <>
            <p className="sharing-muted">
              Pick two or more workspaces from your account. Their lessons, tests, roadmaps and revision progress are
              combined; identical items are kept once. The originals stay as they are.
            </p>
            <div className="merge-list" role="group" aria-label="Workspaces to merge">
              {entries.map((entry) => (
                <label key={entry.key} className={entry.inCloud ? 'sharing-check' : 'sharing-check sharing-check--disabled'}>
                  <input type="checkbox" disabled={!entry.inCloud || busy} checked={checked.has(entry.key)} onChange={(event) => toggle(entry.key, event.target.checked)} />
                  <span>{entry.name}{entry.inCloud ? '' : ' (not in your account yet: open it while signed in first)'}</span>
                </label>
              ))}
            </div>
            <fieldset className="merge-target">
              <legend className="modal-label">Merge into</legend>
              <label className="sharing-check">
                <input type="radio" name="merge-target" checked={effectiveMode === 'new'} onChange={() => setTargetMode('new')} />
                <span>A new workspace</span>
              </label>
              {effectiveMode === 'new' ? (
                <input className="modal-input" value={newName} maxLength={200} onChange={(event) => setNewName(event.target.value)} aria-label="Merged workspace name" />
              ) : null}
              <label className={targetChoices.length === 0 ? 'sharing-check sharing-check--disabled' : 'sharing-check'}>
                <input type="radio" name="merge-target" disabled={targetChoices.length === 0} checked={effectiveMode === 'existing'} onChange={() => setTargetMode('existing')} />
                <span>One of the selected workspaces{targetChoices.length === 0 ? ' (needs one without a folder on this device)' : ''}</span>
              </label>
              {effectiveMode === 'existing' ? (
                <select className="modal-input" value={existing?.key ?? ''} onChange={(event) => setExistingKey(event.target.value)} aria-label="Existing target workspace">
                  {targetChoices.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
                </select>
              ) : null}
            </fieldset>
            {error ? <p className="tree-error">{error}</p> : null}
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="toolbar-btn" disabled={!canMerge} onClick={() => { void run(); }}>
                {busy ? 'Merging…' : picked.length >= 2 ? `Merge ${picked.length} workspaces` : 'Merge'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
