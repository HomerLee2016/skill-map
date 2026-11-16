import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { supabase } from '../../lib/supabaseClient';
import { fetchCloudWorkspace } from '../../services/cloudWorkspace';
import type { WorkspaceOption } from '../../services/publishedList';
import { publishWorkspace, type SharedWorkspaceSummary } from '../../services/sharedWorkspaces';
import { buildSnapshot, countSelection, selectAll, type ShareSelection } from '../../services/sharingSnapshot';
import type { WorkspaceContent } from '../../services/workspaceTypes';
import { ItemChecklist } from './ItemChecklist';
import { Modal } from './Modal';
import { TagInput } from './TagInput';

interface PublishWorkspaceDialogProps {
  /** Workspaces the user can pick from (new publish) or the one workspace being updated (edit). */
  options: WorkspaceOption[];
  /** Set when editing an existing snapshot; the workspace is then fixed. */
  published?: SharedWorkspaceSummary;
  /** Tags already in use in the hub, offered while typing. */
  tagSuggestions?: string[];
  onClose: () => void;
  onDone: () => Promise<void>;
}

const EMPTY_SELECTION: ShareSelection = { lessonIds: new Set(), testIds: new Set(), roadmapIds: new Set() };

/** Modal form: pick a workspace, tick what to share, publish a snapshot (or update the one already published). */
export function PublishWorkspaceDialog({ options, published, tagSuggestions, onClose, onDone }: PublishWorkspaceDialogProps) {
  const { user } = useAuth();
  const { workspace, workspaceKey } = useWorkspace();
  const [selectedKey, setSelectedKey] = useState(published?.sourceWorkspaceKey ?? '');
  const activeKey = options.some((entry) => entry.key === selectedKey) ? selectedKey : (options.find((entry) => entry.key === workspaceKey) ?? options[0])?.key ?? '';
  const activeName = options.find((entry) => entry.key === activeKey)?.name ?? '';

  const [content, setContent] = useState<WorkspaceContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<ShareSelection>(EMPTY_SELECTION);
  // The title follows the picked workspace until the user types one; an update starts from its published title.
  const [customName, setCustomName] = useState<string | null>(null);
  const name = customName ?? published?.name ?? activeName;
  const [description, setDescription] = useState(published?.description ?? '');
  const [ownerLabel, setOwnerLabel] = useState(published?.ownerLabel === 'Anonymous' ? '' : published?.ownerLabel ?? '');
  const [tags, setTags] = useState<string[]>(published?.tags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the chosen workspace's content: the open one is already in memory, others come from the cloud.
  useEffect(() => {
    if (!activeKey) { setContent(null); return; }
    let cancelled = false;
    setContent(null);
    setLoadError(null);
    const load = async (): Promise<WorkspaceContent | null> => {
      if (activeKey === workspaceKey) return workspace;
      return supabase ? fetchCloudWorkspace(supabase, activeKey) : null;
    };
    load().then((loaded) => {
      if (cancelled) return;
      setContent(loaded);
      setSelection(loaded ? selectAll(loaded) : EMPTY_SELECTION);
    }).catch((err: unknown) => {
      if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not read this workspace');
    });
    return () => { cancelled = true; };
  }, [activeKey, workspaceKey, workspace]);

  const total = countSelection(selection);

  const handlePublish = async () => {
    if (!supabase || !user || !content) return;
    setBusy(true);
    setError(null);
    try {
      await publishWorkspace(supabase, user.id, {
        sourceWorkspaceKey: activeKey,
        name: name || activeName,
        description,
        ownerLabel,
        tags,
        snapshot: buildSnapshot(content, selection),
      });
      await onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish');
      setBusy(false);
    }
  };

  const title = published ? 'Update published workspace' : 'Publish new workspace';
  return (
    <Modal title={title} className="publish-dialog">
      <h3 className="modal-title">{title}</h3>
      {published ? (
        <p className="sharing-note">
          Updating replaces the snapshot others see. Workspaces people already cloned keep their copy.
        </p>
      ) : null}
      <label className="modal-label">
        Workspace to share
        <select className="modal-input" value={activeKey} disabled={Boolean(published)} onChange={(event) => setSelectedKey(event.target.value)} aria-label="Workspace to share">
          {options.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
        </select>
      </label>
      {loadError ? <p className="tree-error">{loadError}</p> : null}
      {!content && !loadError ? <p className="sharing-muted">Loading…</p> : null}
      {content ? (
        <>
          <p className="sharing-muted">Tick what to include. This is a snapshot taken now, not live. Revision progress is never shared.</p>
          <div className="sharing-checklists">
            <ItemChecklist title="Lessons" items={content.lessons} selected={selection.lessonIds} onChange={(lessonIds) => setSelection({ ...selection, lessonIds })} />
            <ItemChecklist title="Tests" items={content.tests} selected={selection.testIds} onChange={(testIds) => setSelection({ ...selection, testIds })} />
            <ItemChecklist title="Roadmaps" items={content.roadmaps.map((roadmap) => ({ id: roadmap.id, title: roadmap.name }))} selected={selection.roadmapIds} onChange={(roadmapIds) => setSelection({ ...selection, roadmapIds })} />
          </div>
          <label className="modal-label">
            Title
            <input className="modal-input" value={name} maxLength={200} onChange={(event) => setCustomName(event.target.value)} aria-label="Shared title" />
          </label>
          <label className="modal-label">
            Description (optional)
            <textarea className="modal-input modal-textarea" value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} aria-label="Shared description" />
          </label>
          <div className="modal-label">
            Tags (optional)
            <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
            <span className="sharing-muted">Short labels that help people find it, e.g. spanish, beginner.</span>
          </div>
          <label className="modal-label">
            Shown to others as
            <input className="modal-input" value={ownerLabel} maxLength={100} onChange={(event) => setOwnerLabel(event.target.value)} placeholder="Anonymous" aria-label="Shown as" />
            <span className="sharing-muted">Your email is never shown. Leave empty to appear as Anonymous.</span>
          </label>
        </>
      ) : null}
      {error ? <p className="tree-error" role="alert">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="modal-btn-cancel" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="toolbar-btn" disabled={busy || !content || total === 0 || !activeKey} onClick={() => { void handlePublish(); }}>
          {busy ? 'Working…' : published ? 'Update snapshot' : 'Publish snapshot'}
        </button>
      </div>
    </Modal>
  );
}
