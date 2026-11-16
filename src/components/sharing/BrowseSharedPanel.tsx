import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import type { Reaction, SharedStats } from '../../services/sharedReactions';
import { fetchSharedContent, type SharedWorkspaceSummary } from '../../services/sharedWorkspaces';
import { tagCounts } from '../../services/sharedTags';
import type { WorkspaceContent } from '../../services/workspaceTypes';
import { BrowseToolbar } from './BrowseToolbar';
import { SharedTable } from './SharedTable';
import { CloneModal, PreviewModal } from './SharedWorkspaceModals';
import { UnpublishDialog } from './UnpublishDialog';
import { useBrowseView } from './useBrowseView';

interface BrowseSharedPanelProps {
  shared: SharedWorkspaceSummary[];
  loading: boolean;
  error: string | null;
  onChanged: () => Promise<void>;
  /** Totals per shared workspace; null when votes and stars are not available. */
  stats: Map<string, SharedStats> | null;
  mine: Map<string, Reaction>;
  onReact: (sharedId: string, next: Reaction) => Promise<void>;
}

/** What other people shared: a filterable, sortable table with preview and clone pop-ups. */
export function BrowseSharedPanel({ shared, loading, error, onChanged, stats, mine, onReact }: BrowseSharedPanelProps) {
  const { user } = useAuth();
  const view = useBrowseView(shared, stats, mine);
  const [preview, setPreview] = useState<{ item: SharedWorkspaceSummary; content: WorkspaceContent | null } | null>(null);
  const [cloning, setCloning] = useState<SharedWorkspaceSummary | null>(null);
  const [unpublishing, setUnpublishing] = useState<SharedWorkspaceSummary | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const openPreview = async (item: SharedWorkspaceSummary) => {
    setMessage(null);
    setPreview({ item, content: null });
    if (!supabase) return;
    try {
      const content = await fetchSharedContent(supabase, item.id);
      setPreview((current) => (current?.item.id === item.id ? { item, content } : current));
    } catch (err) {
      setPreview(null);
      setMessage({ text: err instanceof Error ? err.message : 'Could not load the preview', error: true });
    }
  };

  const { visible, rows } = view;
  const hidden = visible.length - rows.length;

  return (
    <div className="sharing-browse">
      <BrowseToolbar view={view} hasReactions={Boolean(stats)} total={shared.length} tags={tagCounts(shared)} />
      {message ? <p className={message.error ? 'tree-error' : 'sharing-ok'} role="status">{message.text}</p> : null}
      {error ? <p className="tree-error">{error}</p> : null}
      {loading && shared.length === 0 ? <p className="sharing-muted">Loading…</p> : null}
      {!loading && !error && visible.length === 0 ? <p className="sharing-muted">{shared.length === 0 ? 'Nobody has shared a workspace yet.' : 'No match.'}</p> : null}
      {rows.length > 0 ? (
        <SharedTable
          rows={rows}
          userId={user?.id}
          stats={stats}
          mine={mine}
          onReact={onReact}
          onPreview={(item) => { void openPreview(item); }}
          onClone={(item) => { setMessage(null); setCloning(item); }}
          onUnpublish={setUnpublishing}
          onTag={view.set.tag}
        />
      ) : null}
      {hidden > 0 ? (
        <div className="sharing-actions">
          <button type="button" className="modal-btn-cancel" onClick={view.showMore}>Show {Math.min(view.values.pageSize, hidden)} more ({hidden} hidden)</button>
        </div>
      ) : null}
      {view.expanded && visible.length > view.values.pageSize ? (
        <div className="sharing-actions">
          <button type="button" className="sharing-link-btn" onClick={view.hideExtra}>Hide extra rows</button>
        </div>
      ) : null}

      {preview ? (
        <PreviewModal
          item={preview.item}
          content={preview.content}
          canClone={preview.item.ownerId !== user?.id}
          onClone={() => { setCloning(preview.item); setPreview(null); }}
          onClose={() => setPreview(null)}
        />
      ) : null}
      {cloning ? (
        <CloneModal
          item={cloning}
          onClose={() => setCloning(null)}
          onCloned={(name) => { setCloning(null); setMessage({ text: `Cloned into a new workspace "${name}" and opened it. Your other workspaces are untouched.` }); }}
        />
      ) : null}
      {unpublishing ? (
        <UnpublishDialog item={unpublishing} onClose={() => setUnpublishing(null)} onDone={async () => { await onChanged(); }} />
      ) : null}
    </div>
  );
}
