import { formatPublishedAt } from '../../services/publishedList';
import type { Reaction, SharedStats } from '../../services/sharedReactions';
import type { SharedWorkspaceSummary } from '../../services/sharedWorkspaces';
import { ReactionButtons } from './ReactionButtons';
import { TagChips } from './TagInput';

interface SharedTableProps {
  rows: SharedWorkspaceSummary[];
  userId: string | undefined;
  /** Null when votes and stars are not available (the Votes column is then left out). */
  stats: Map<string, SharedStats> | null;
  mine: Map<string, Reaction>;
  onReact: (sharedId: string, next: Reaction) => Promise<void>;
  onPreview: (item: SharedWorkspaceSummary) => void;
  onClone: (item: SharedWorkspaceSummary) => void;
  onUnpublish: (item: SharedWorkspaceSummary) => void;
  /** A tag chip was clicked: filter by it. */
  onTag: (tag: string) => void;
}

/** One compact row per shared workspace; stacks into blocks on a phone. */
export function SharedTable({ rows, userId, stats, mine, onReact, onPreview, onClone, onUnpublish, onTag }: SharedTableProps) {
  return (
    <table className="sharing-table">
      <thead>
        <tr><th>Title</th><th>Author</th><th>Published</th><th>Contents</th>{stats ? <th>Votes</th> : null}<th><span className="sr-only">Actions</span></th></tr>
      </thead>
      <tbody>
        {rows.map((item) => {
          const own = item.ownerId === userId;
          return (
            <tr key={item.id} className="sharing-row">
              <td className="sharing-cell-title">
                <span className="sharing-row-title">{item.name}</span>
                {own ? <span className="sharing-badge">Yours</span> : null}
                <TagChips tags={item.tags} onPick={onTag} />
              </td>
              <td className="sharing-cell-author">by {item.ownerLabel}</td>
              <td className="sharing-cell-date">{formatPublishedAt(item.publishedAt)}</td>
              <td className="sharing-cell-counts">{item.lessonCount} lessons · {item.testCount} tests · {item.roadmapCount} roadmaps</td>
              {stats ? (
                <td className="sharing-cell-votes">
                  <ReactionButtons stats={stats.get(item.id)} reaction={mine.get(item.id)} disabled={own} onReact={(next) => { void onReact(item.id, next); }} />
                </td>
              ) : null}
              <td className="sharing-cell-actions">
                <div className="sharing-row-actions">
                  <button type="button" className="modal-btn-cancel" onClick={() => onPreview(item)}>Preview</button>
                  {own
                    ? <button type="button" className="toolbar-btn sharing-btn-danger" onClick={() => onUnpublish(item)}>Unpublish</button>
                    : <button type="button" className="toolbar-btn" onClick={() => onClone(item)}>Clone</button>}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
