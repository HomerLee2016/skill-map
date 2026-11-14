import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { supabase } from '../../lib/supabaseClient';
import { fetchCloudWorkspace } from '../../services/cloudWorkspace';
import { publishWorkspace, unpublishWorkspace, type SharedWorkspaceSummary } from '../../services/sharedWorkspaces';
import { buildSnapshot, countSelection, selectAll, type ShareSelection } from '../../services/sharingSnapshot';
import type { WorkspaceContent } from '../../services/workspaceTypes';
import { ItemChecklist } from './ItemChecklist';

interface ShareWorkspacePanelProps {
  shared: SharedWorkspaceSummary[];
  onChanged: () => Promise<void>;
}

const EMPTY_SELECTION: ShareSelection = { lessonIds: new Set(), testIds: new Set(), roadmapIds: new Set() };

/** Pick one of your workspaces, tick what to share, publish a snapshot. */
export function ShareWorkspacePanel({ shared, onChanged }: ShareWorkspacePanelProps) {
  const { user } = useAuth();
  const { workspace, workspaceKey, workspaceSelectionLabel, cloudWorkspaces, hasLocalContent } = useWorkspace();
  const options = useMemo(() => {
    const list = cloudWorkspaces.map((entry) => ({ key: entry.key, name: entry.name }));
    // The open folder workspace may not be in the cloud yet; its content is on screen, so it can still be shared.
    if (hasLocalContent && !list.some((entry) => entry.key === workspaceKey)) list.unshift({ key: workspaceKey, name: workspaceSelectionLabel });
    return list;
  }, [cloudWorkspaces, hasLocalContent, workspaceKey, workspaceSelectionLabel]);

  const [selectedKey, setSelectedKey] = useState('');
  const [content, setContent] = useState<WorkspaceContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<ShareSelection>(EMPTY_SELECTION);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const activeKey = options.some((entry) => entry.key === selectedKey) ? selectedKey : (options.find((entry) => entry.key === workspaceKey) ?? options[0])?.key ?? '';
  const activeName = options.find((entry) => entry.key === activeKey)?.name ?? '';
  const published = shared.find((item) => item.ownerId === user?.id && item.sourceWorkspaceKey === activeKey);

  // Load the chosen workspace's content: the open one is already in memory, others come from the cloud.
  useEffect(() => {
    if (!activeKey) { setContent(null); return; }
    let cancelled = false;
    setContent(null);
    setLoadError(null);
    setMessage(null);
    const load = async (): Promise<WorkspaceContent | null> => {
      if (activeKey === workspaceKey) return workspace;
      return supabase ? fetchCloudWorkspace(supabase, activeKey) : null;
    };
    load().then((loaded) => {
      if (cancelled) return;
      setContent(loaded);
      setSelection(loaded ? selectAll(loaded) : EMPTY_SELECTION);
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not read this workspace');
    });
    return () => { cancelled = true; };
  }, [activeKey, workspaceKey, workspace]);

  // Name and description follow the workspace (or what was published before).
  useEffect(() => {
    setName(published?.name ?? activeName);
    setDescription(published?.description ?? '');
    if (published) setOwnerLabel(published.ownerLabel);
    // Only when the workspace changes or its published state appears/disappears.
  }, [activeKey, Boolean(published)]);

  const total = countSelection(selection);

  const handlePublish = async () => {
    if (!supabase || !user || !content) return;
    setBusy(true);
    setMessage(null);
    try {
      await publishWorkspace(supabase, user.id, {
        sourceWorkspaceKey: activeKey,
        name: name || activeName,
        description,
        ownerLabel,
        snapshot: buildSnapshot(content, selection),
      });
      await onChanged();
      setMessage({ text: published ? 'Snapshot updated. Friends see the new version.' : 'Published. Other signed-in users can now find it under "Browse shared".' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Could not publish', error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleUnpublish = async () => {
    if (!supabase || !published) return;
    if (!window.confirm(`Stop sharing "${published.name}"? Workspaces people already cloned keep their copy.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await unpublishWorkspace(supabase, published.id);
      await onChanged();
      setMessage({ text: 'Unpublished. It no longer appears in the hub.' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Could not unpublish', error: true });
    } finally {
      setBusy(false);
    }
  };

  if (options.length === 0) {
    return <p className="sharing-muted">Open or sync a workspace first. Only workspaces in your account (or the one that is open) can be shared.</p>;
  }

  return (
    <div className="sharing-form">
      <label className="modal-label">
        Workspace to share
        <select className="modal-input" value={activeKey} onChange={(event) => setSelectedKey(event.target.value)} aria-label="Workspace to share">
          {options.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
        </select>
      </label>
      {published ? (
        <p className="sharing-note">
          Currently shared: {published.lessonCount} lessons, {published.testCount} tests, {published.roadmapCount} roadmaps
          (updated {new Date(published.updatedAt).toLocaleString()}). Publishing again replaces that snapshot.
        </p>
      ) : null}
      {loadError ? <p className="tree-error">{loadError}</p> : null}
      {!content && !loadError ? <p className="sharing-muted">Loading…</p> : null}
      {content ? (
        <>
          <p className="sharing-muted">
            Tick what to include. This is a snapshot taken now, not live. Revision progress is never shared.
          </p>
          <div className="sharing-checklists">
            <ItemChecklist title="Lessons" items={content.lessons} selected={selection.lessonIds} onChange={(lessonIds) => setSelection({ ...selection, lessonIds })} />
            <ItemChecklist title="Tests" items={content.tests} selected={selection.testIds} onChange={(testIds) => setSelection({ ...selection, testIds })} />
            <ItemChecklist title="Roadmaps" items={content.roadmaps.map((roadmap) => ({ id: roadmap.id, title: roadmap.name }))} selected={selection.roadmapIds} onChange={(roadmapIds) => setSelection({ ...selection, roadmapIds })} />
          </div>
          <label className="modal-label">
            Title
            <input className="modal-input" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} aria-label="Shared title" />
          </label>
          <label className="modal-label">
            Description (optional)
            <textarea className="modal-input modal-textarea" value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} aria-label="Shared description" />
          </label>
          <label className="modal-label">
            Shown to others as
            <input className="modal-input" value={ownerLabel} maxLength={100} onChange={(event) => setOwnerLabel(event.target.value)} placeholder="Anonymous" aria-label="Shown as" />
            <span className="sharing-muted">Your email is never shown. Leave empty to appear as Anonymous.</span>
          </label>
          {message ? <p className={message.error ? 'tree-error' : 'sharing-ok'} role="status">{message.text}</p> : null}
          <div className="sharing-actions">
            <button type="button" className="toolbar-btn" disabled={busy || total === 0} onClick={() => { void handlePublish(); }}>
              {busy ? 'Working…' : published ? 'Update snapshot' : 'Publish snapshot'}
            </button>
            {published ? (
              <button type="button" className="toolbar-btn sharing-btn-danger" disabled={busy} onClick={() => { void handleUnpublish(); }}>Unpublish</button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
