import { useMemo, useState } from 'react';
import { activeFilterCount, arrangeShared, type Reaction, type SharedStats, type SortMode } from '../../services/sharedReactions';
import type { SharedWorkspaceSummary } from '../../services/sharedWorkspaces';

export const PAGE_SIZES = [10, 20, 50] as const;
export const BASIC_SORTS: SortMode[] = ['newest', 'oldest', 'title', 'author'];

/**
 * Filter, sort and paging state of the browse table, and the rows it results in.
 * Votes and stars are optional (null stats): then only the basic sorts and filters apply.
 */
export function useBrowseView(shared: SharedWorkspaceSummary[], stats: Map<string, SharedStats> | null, mine: Map<string, Reaction>) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [publishedAfter, setPublishedAfter] = useState('');
  const [publishedBefore, setPublishedBefore] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [starredOnly, setStarredOnly] = useState(false);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  // How many rows are drawn. Only these are in the page; it resets whenever the list changes shape.
  const [shown, setShown] = useState<number>(PAGE_SIZES[0]);

  const effectiveSort: SortMode = stats || BASIC_SORTS.includes(sort) ? sort : 'newest';
  const effectiveStarredOnly = Boolean(stats) && starredOnly;
  const filterCount = activeFilterCount({ title, author, publishedAfter, publishedBefore, starredOnly: effectiveStarredOnly });

  const visible = useMemo(
    () => arrangeShared(shared, stats ?? new Map(), mine, { title, author, publishedAfter, publishedBefore, sort: effectiveSort, starredOnly: effectiveStarredOnly }),
    [shared, stats, mine, title, author, publishedAfter, publishedBefore, effectiveSort, effectiveStarredOnly],
  );

  /** Wraps a setter so changing it also goes back to the first page of rows. */
  const reset = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setShown(pageSize); };

  return {
    values: { title, author, publishedAfter, publishedBefore, sort: effectiveSort, starredOnly: effectiveStarredOnly, pageSize },
    set: {
      title: reset(setTitle), author: reset(setAuthor), publishedAfter: reset(setPublishedAfter), publishedBefore: reset(setPublishedBefore),
      sort: reset(setSort), starredOnly: reset(setStarredOnly),
      pageSize: (size: number) => { setPageSize(size); setShown(size); },
    },
    clearFilters: () => { setTitle(''); setAuthor(''); setPublishedAfter(''); setPublishedBefore(''); setStarredOnly(false); setShown(pageSize); },
    filterCount,
    visible,
    rows: visible.slice(0, shown),
    showMore: () => setShown(shown + pageSize),
    hideExtra: () => setShown(pageSize),
    expanded: shown > pageSize,
  };
}
