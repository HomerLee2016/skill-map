import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { supabase } from '../../lib/supabaseClient';
import { cloneSharedWorkspace, fetchSharedContent, unpublishWorkspace, type SharedWorkspaceSummary } from '../../services/sharedWorkspaces';
import type { WorkspaceContent } from '../../services/workspaceTypes';

interface BrowseSharedPanelProps {
  shared: SharedWorkspaceSummary[];
  loading: boolean;
  error: string | null;
  onChanged: () => Promise<void>;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function Titles({ label, titles }: { label: string; titles: string[] }) {
  if (titles.length === 0) return null;
  return (
    <div className="sharing-preview-group">
      <strong>{label}</strong>
      <ul>{titles.map((title, index) => <li key={`${title}-${index}`}>{title}</li>)}</ul>
    </div>
  );
}

/** What other people shared: preview titles, clone into a new workspace of your own. */
export function BrowseSharedPanel({ shared, loading, error, onChanged }: BrowseSharedPanelProps) {
  const { user } = useAuth();
  const { selectCloudWorkspace, refreshCloudWorkspaces } = useWorkspace();
  const [query, setQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<WorkspaceContent | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return shared;
    return shared.filter((item) => `${item.name} ${item.description} ${item.ownerLabel}`.toLowerCase().includes(needle));
  }, [shared, query]);

  const togglePreview = async (item: SharedWorkspaceSummary) => {
    if (previewId === item.id) { setPreviewId(null); return; }
    setPreviewId(item.id);
    setPreview(null);
    if (!supabase) return;
    try {
      setPreview(await fetchSharedContent(supabase, item.id));
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not load the preview', error: true });
    }
  };

  const startClone = (item: SharedWorkspaceSummary) => {
    setCloningId(item.id);
    setCloneName(item.name);
    setMessage(null);
  };

  const confirmClone = async (item: SharedWorkspaceSummary) => {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      const created = await cloneSharedWorkspace(supabase, item.id, cloneName);
      await refreshCloudWorkspaces();
      await selectCloudWorkspace(created);
      setCloningId(null);
      setMessage({ text: `Cloned into a new workspace "${created.name}" and opened it. Your other workspaces are untouched.` });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not clone', error: true });
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async (item: SharedWorkspaceSummary) => {
    if (!supabase || !window.confirm(`Stop sharing "${item.name}"?`)) return;
    try {
      await unpublishWorkspace(supabase, item.id);
      await onChanged();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not unpublish', error: true });
    }
  };

  return (
    <div className="sharing-browse">
      <input
        className="modal-input sharing-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search shared workspaces"
        aria-label="Search shared workspaces"
      />
      {message ? <p className={message.error ? 'tree-error' : 'sharing-ok'} role="status">{message.text}</p> : null}
      {error ? <p className="tree-error">{error}</p> : null}
      {loading && shared.length === 0 ? <p className="sharing-muted">Loading…</p> : null}
      {!loading && !error && visible.length === 0 ? <p className="sharing-muted">{shared.length === 0 ? 'Nobody has shared a workspace yet.' : 'No match.'}</p> : null}
      <ul className="sharing-cards">
        {visible.map((item) => {
          const mine = item.ownerId === user?.id;
          return (
            <li key={item.id} className="sharing-card">
              <div className="sharing-card-head">
                <h3 className="sharing-card-title">{item.name}</h3>
                {mine ? <span className="sharing-badge">Yours</span> : null}
              </div>
              <div className="sharing-muted">
                by {item.ownerLabel} · updated {new Date(item.updatedAt).toLocaleDateString()}
              </div>
              {item.description ? <p className="sharing-card-desc">{item.description}</p> : null}
              <div className="sharing-counts">
                <span>{plural(item.lessonCount, 'lesson')}</span><span>{plural(item.testCount, 'test')}</span><span>{plural(item.roadmapCount, 'roadmap')}</span>
              </div>
              {previewId === item.id ? (
                <div className="sharing-preview">
                  {preview ? (
                    <>
                      <Titles label="Lessons" titles={preview.lessons.map((lesson) => lesson.title)} />
                      <Titles label="Tests" titles={preview.tests.map((test) => test.title)} />
                      <Titles label="Roadmaps" titles={preview.roadmaps.map((roadmap) => roadmap.name)} />
                    </>
                  ) : <span className="sharing-muted">Loading…</span>}
                </div>
              ) : null}
              {cloningId === item.id ? (
                <div className="sharing-clone-form">
                  <label className="modal-label">
                    Name of your new workspace
                    <input className="modal-input" value={cloneName} maxLength={200} onChange={(event) => setCloneName(event.target.value)} aria-label="New workspace name" />
                  </label>
                  <div className="sharing-actions">
                    <button type="button" className="toolbar-btn" disabled={busy} onClick={() => { void confirmClone(item); }}>{busy ? 'Cloning…' : 'Clone'}</button>
                    <button type="button" className="modal-btn-cancel" disabled={busy} onClick={() => setCloningId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="sharing-actions">
                  <button type="button" className="modal-btn-cancel" onClick={() => { void togglePreview(item); }}>{previewId === item.id ? 'Hide contents' : 'Preview'}</button>
                  {mine ? (
                    <button type="button" className="toolbar-btn sharing-btn-danger" onClick={() => { void unpublish(item); }}>Unpublish</button>
                  ) : (
                    <button type="button" className="toolbar-btn" onClick={() => startClone(item)}>Clone to new workspace</button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
