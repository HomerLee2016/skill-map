import type { SortMode } from '../../services/sharedReactions';
import { PopoverMenu } from './PopoverMenu';
import { BASIC_SORTS, PAGE_SIZES, type useBrowseView } from './useBrowseView';

const SORT_LABELS: Record<SortMode, string> = {
  newest: 'Newest published',
  oldest: 'Oldest published',
  title: 'Title A to Z',
  author: 'Author A to Z',
  top: 'Top rated',
  stars: 'Most starred',
};

const FilterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4Z" /></svg>
);
const SortIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16" /><path d="m3 16 4 4 4-4" /><path d="M17 20V4" /><path d="m13 8 4-4 4 4" /></svg>
);

interface BrowseToolbarProps {
  view: ReturnType<typeof useBrowseView>;
  /** Votes and stars available: adds "My starred only" and the vote-based sorts. */
  hasReactions: boolean;
  total: number;
}

/** Filter and sort icons (each opens a small panel), the rows-to-show picker and the result count. */
export function BrowseToolbar({ view, hasReactions, total }: BrowseToolbarProps) {
  const { values, set, filterCount, visible } = view;
  const sortChoices: SortMode[] = hasReactions ? [...BASIC_SORTS, 'top', 'stars'] : BASIC_SORTS;
  return (
    <div className="sharing-toolbar sharing-toolbar--icons">
      <PopoverMenu label="Filter" icon={<FilterIcon />} badge={filterCount}>
        <label className="modal-label">
          Title contains
          <input className="modal-input" value={values.title} onChange={(event) => set.title(event.target.value)} aria-label="Filter by title" />
        </label>
        <label className="modal-label">
          Author contains
          <input className="modal-input" value={values.author} onChange={(event) => set.author(event.target.value)} aria-label="Filter by author" />
        </label>
        <label className="modal-label">
          Published on or after
          <input className="modal-input" type="date" value={values.publishedAfter} max={values.publishedBefore || undefined} onChange={(event) => set.publishedAfter(event.target.value)} aria-label="Published after" />
        </label>
        <label className="modal-label">
          Published on or before
          <input className="modal-input" type="date" value={values.publishedBefore} min={values.publishedAfter || undefined} onChange={(event) => set.publishedBefore(event.target.value)} aria-label="Published before" />
        </label>
        {hasReactions ? (
          <label className="sharing-check">
            <input type="checkbox" checked={values.starredOnly} onChange={(event) => set.starredOnly(event.target.checked)} />
            <span>My starred only</span>
          </label>
        ) : null}
        <button type="button" className="sharing-link-btn" onClick={view.clearFilters} disabled={filterCount === 0}>Clear filters</button>
      </PopoverMenu>
      <PopoverMenu label="Sort" icon={<SortIcon />}>
        <div className="sharing-sort-list" role="radiogroup" aria-label="Sort shared workspaces">
          {sortChoices.map((mode) => (
            <label key={mode} className="sharing-check">
              <input type="radio" name="shared-sort" checked={values.sort === mode} onChange={() => set.sort(mode)} />
              <span>{SORT_LABELS[mode]}</span>
            </label>
          ))}
        </div>
      </PopoverMenu>
      <label className="sharing-toolbar-item sharing-page-size">
        <span className="sharing-muted">Show</span>
        <select className="modal-input sharing-sort" value={values.pageSize} aria-label="Rows to show" onChange={(event) => set.pageSize(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => <option key={size} value={size}>Top {size}</option>)}
        </select>
      </label>
      <span className="sharing-muted sharing-count" role="status">{visible.length === total ? `${total} workspace${total === 1 ? '' : 's'}` : `${visible.length} of ${total}`}</span>
    </div>
  );
}
