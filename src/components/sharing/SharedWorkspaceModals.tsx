import { useState } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { supabase } from '../../lib/supabaseClient';
import { formatPublishedAt } from '../../services/publishedList';
import { MAX_REPORT_NOTE, REPORT_REASONS, reportSharedWorkspace, type ReportReason } from '../../services/sharedReports';
import { cloneSharedWorkspace, type SharedWorkspaceSummary } from '../../services/sharedWorkspaces';
import type { WorkspaceContent } from '../../services/workspaceTypes';
import { Modal } from './Modal';
import { TagChips } from './TagInput';

function Titles({ label, titles }: { label: string; titles: string[] }) {
  if (titles.length === 0) return null;
  return (
    <div className="sharing-preview-group">
      <strong>{label}</strong>
      <ul>{titles.map((title, index) => <li key={`${title}-${index}`}>{title}</li>)}</ul>
    </div>
  );
}

interface PreviewModalProps {
  item: SharedWorkspaceSummary;
  /** Null while the snapshot is still loading. */
  content: WorkspaceContent | null;
  canClone: boolean;
  onClone: () => void;
  onReport: () => void;
  onClose: () => void;
}

/** The titles inside one shared snapshot, in a pop-up. */
export function PreviewModal({ item, content, canClone, onClone, onReport, onClose }: PreviewModalProps) {
  return (
    <Modal title={`Preview ${item.name}`} className="sharing-modal" onBackdrop={onClose}>
      <h3 className="modal-title">{item.name}</h3>
      <div className="sharing-muted">by {item.ownerLabel} · published {formatPublishedAt(item.publishedAt)}</div>
      <TagChips tags={item.tags} />
      {item.description ? <p className="sharing-card-desc">{item.description}</p> : null}
      <div className="sharing-preview">
        {content ? (
          <>
            <Titles label="Lessons" titles={content.lessons.map((lesson) => lesson.title)} />
            <Titles label="Tests" titles={content.tests.map((test) => test.title)} />
            <Titles label="Roadmaps" titles={content.roadmaps.map((roadmap) => roadmap.name)} />
          </>
        ) : <span className="sharing-muted">Loading…</span>}
      </div>
      <div className="modal-actions">
        {canClone ? <button type="button" className="sharing-link-btn" onClick={onReport}>Report</button> : null}
        <button type="button" className="modal-btn-cancel" onClick={onClose}>Close</button>
        {canClone ? <button type="button" className="toolbar-btn" onClick={onClone}>Clone to new workspace</button> : null}
      </div>
    </Modal>
  );
}

interface CloneModalProps {
  item: SharedWorkspaceSummary;
  onClose: () => void;
  /** Called with the new workspace's name once it exists and is open. */
  onCloned: (name: string) => void;
}

/** Names and creates a new workspace of your own from a shared snapshot, then opens it. */
export function CloneModal({ item, onClose, onCloned }: CloneModalProps) {
  const { selectCloudWorkspace, refreshCloudWorkspaces } = useWorkspace();
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clone = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const created = await cloneSharedWorkspace(supabase, item.id, name);
      await refreshCloudWorkspaces();
      await selectCloudWorkspace(created);
      onCloned(created.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clone');
      setBusy(false);
    }
  };

  return (
    <Modal title="Clone to new workspace" className="sharing-modal" onBackdrop={busy ? undefined : onClose}>
      <h3 className="modal-title">Clone to new workspace</h3>
      <p className="sharing-muted">Copies "{item.name}" into a new workspace of your own. Revision progress starts empty.</p>
      <label className="modal-label">
        Name of your new workspace
        <input className="modal-input" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} aria-label="New workspace name" />
      </label>
      {error ? <p className="tree-error" role="alert">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="modal-btn-cancel" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="toolbar-btn" disabled={busy} onClick={() => { void clone(); }}>{busy ? 'Cloning…' : 'Clone'}</button>
      </div>
    </Modal>
  );
}

interface ReportModalProps {
  item: SharedWorkspaceSummary;
  onClose: () => void;
  /** Called once the report is saved. */
  onReported: () => void;
}

/** Asks why a share is being reported and files it; three reports from different people hide a share automatically. */
export function ReportModal({ item, onClose, onReported }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason>('malicious');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await reportSharedWorkspace(supabase, item.id, reason, note);
      onReported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report');
      setBusy(false);
    }
  };

  return (
    <Modal title="Report workspace" className="sharing-modal" onBackdrop={busy ? undefined : onClose}>
      <h3 className="modal-title">Report "{item.name}"</h3>
      <p className="sharing-muted">Tell us what is wrong. Reports are private; the author is not told who sent them.</p>
      <label className="modal-label">
        Reason
        <select className="modal-input" value={reason} onChange={(event) => setReason(event.target.value as ReportReason)} aria-label="Report reason">
          {REPORT_REASONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="modal-label">
        Details (optional)
        <textarea className="modal-input" rows={3} maxLength={MAX_REPORT_NOTE} value={note} onChange={(event) => setNote(event.target.value)} aria-label="Report details" />
      </label>
      {error ? <p className="tree-error" role="alert">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="modal-btn-cancel" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="toolbar-btn sharing-btn-danger" disabled={busy} onClick={() => { void send(); }}>{busy ? 'Sending…' : 'Send report'}</button>
      </div>
    </Modal>
  );
}
