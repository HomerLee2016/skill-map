import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { supabase } from '../../lib/supabaseClient';
import { formatPublishedAt, myPublished, unpublishedOptions, type WorkspaceOption } from '../../services/publishedList';
import { unpublishWorkspace, type SharedWorkspaceSummary } from '../../services/sharedWorkspaces';
import { PublishWorkspaceDialog } from './PublishWorkspaceDialog';

interface ShareWorkspacePanelProps {
  shared: SharedWorkspaceSummary[];
  onChanged: () => Promise<void>;
}

type Dialog = { kind: 'publish' } | { kind: 'edit'; item: SharedWorkspaceSummary } | { kind: 'unpublish'; item: SharedWorkspaceSummary };

/** "Publish new workspace" button on top, then everything you have published with edit and unpublish actions. */
export function ShareWorkspacePanel({ shared, onChanged }: ShareWorkspacePanelProps) {
  const { user } = useAuth();
  const { workspaceKey, workspaceSelectionLabel, cloudWorkspaces, hasLocalContent } = useWorkspace();
  const options = useMemo<WorkspaceOption[]>(() => {
    const list = cloudWorkspaces.map((entry) => ({ key: entry.key, name: entry.name }));
    // The open folder workspace may not be in the cloud yet; its content is on screen, so it can still be shared.
    if (hasLocalContent && !list.some((entry) => entry.key === workspaceKey)) list.unshift({ key: workspaceKey, name: workspaceSelectionLabel });
    return list;
  }, [cloudWorkspaces, hasLocalContent, workspaceKey, workspaceSelectionLabel]);

  const mine = useMemo(() => myPublished(shared, user?.id), [shared, user?.id]);
  const available = useMemo(() => unpublishedOptions(options, mine), [options, mine]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const close = () => setDialog(null);

  const handleUnpublish = async (item: SharedWorkspaceSummary) => {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      await unpublishWorkspace(supabase, item.id);
      await onChanged();
      setMessage({ text: `Unpublished "${item.name}". It no longer appears in the hub.` });
      close();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Could not unpublish', error: true });
      close();
    } finally {
      setBusy(false);
    }
  };

  const afterPublish = (text: string) => async () => {
    await onChanged();
    setMessage({ text });
  };

  const publishHint = options.length === 0
    ? 'Open or sync a workspace first. Only workspaces in your account (or the one that is open) can be shared.'
    : available.length === 0 ? 'Every workspace you can share is already published. Edit one below to refresh its snapshot.' : null;

  return (
    <div className="sharing-form">
      <div className="sharing-actions">
        <button type="button" className="toolbar-btn" disabled={available.length === 0} onClick={() => { setMessage(null); setDialog({ kind: 'publish' }); }}>
          Publish new workspace
        </button>
      </div>
      {publishHint ? <p className="sharing-muted">{publishHint}</p> : null}
      {message ? <p className={message.error ? 'tree-error' : 'sharing-ok'} role="status">{message.text}</p> : null}

      <h3 className="sharing-section-title">Published by you</h3>
      {mine.length === 0 ? (
        <p className="sharing-muted">Nothing published yet. Use "Publish new workspace" to share a snapshot with other signed-in users.</p>
      ) : (
        <ul className="published-list">
          {mine.map((item) => {
            const source = options.find((entry) => entry.key === item.sourceWorkspaceKey);
            const changed = item.updatedAt !== item.publishedAt;
            return (
              <li key={item.id} className="published-row">
                <div className="published-info">
                  <div className="published-title">{item.name}</div>
                  <div className="published-meta">
                    Published {formatPublishedAt(item.publishedAt)}
                    {changed ? ` · updated ${formatPublishedAt(item.updatedAt)}` : ''}
                  </div>
                  <div className="published-meta">
                    {item.lessonCount} lessons, {item.testCount} tests, {item.roadmapCount} roadmaps
                    {source ? ` · from workspace "${source.name}"` : ' · source workspace not in your account'}
                  </div>
                </div>
                <div className="published-actions">
                  <button type="button" className="icon-btn" aria-label={`Edit published ${item.name}`} title={source ? 'Edit' : 'The source workspace is gone, so it cannot be updated'} disabled={!source} onClick={() => { setMessage(null); setDialog({ kind: 'edit', item }); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                  <button type="button" className="icon-btn icon-btn--danger" aria-label={`Unpublish ${item.name}`} title="Unpublish" onClick={() => { setMessage(null); setDialog({ kind: 'unpublish', item }); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.kind === 'publish' ? (
        <PublishWorkspaceDialog options={available} onClose={close} onDone={afterPublish('Published. Other signed-in users can now find it under "Browse shared".')} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <PublishWorkspaceDialog options={options.filter((entry) => entry.key === dialog.item.sourceWorkspaceKey)} published={dialog.item} onClose={close} onDone={afterPublish('Snapshot updated. Friends see the new version.')} />
      ) : null}
      {dialog?.kind === 'unpublish' ? createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Unpublish workspace">
          <div className="modal-dialog">
            <h3 className="modal-title">Unpublish workspace?</h3>
            <p className="sharing-muted">
              "{dialog.item.name}", published {formatPublishedAt(dialog.item.publishedAt)}, will no longer appear in the hub.
              Workspaces people already cloned keep their copy. Your own workspace is not changed.
            </p>
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={close} disabled={busy}>Cancel</button>
              <button type="button" className="toolbar-btn sharing-btn-danger" disabled={busy} onClick={() => { void handleUnpublish(dialog.item); }}>{busy ? 'Working…' : 'Unpublish'}</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
