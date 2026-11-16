import { useMemo, useState } from 'react';
import { activeFilterCount, arrangeShared, type Reaction, type SharedStats, type SortMode } from '../../services/sharedReactions';
import type { SharedWorkspaceSummary } from '../../services/sharedWorkspaces';

export type FilterKey = 'title' | 'author' | 'publishedAfter' | 'publishedBefore' | 'starredOnly';
const NONE_ON: Record<FilterKey, boolean> = { title: false, author: false, publishedAfter: false, publishedBefore: false, starredOnly: false };

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
  // A filter applies only while its checkbox is ticked; unticking keeps the typed value for later.
  const [on, setOn] = useState<Record<FilterKey, boolean>>(NONE_ON);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  // How many rows are drawn. Only these are in the page; it resets whenever the list changes shape.
  const [shown, setShown] = useState<number>(PAGE_SIZES[0]);

  const effectiveSort: SortMode = stats || BASIC_SORTS.includes(sort) ? sort : 'newest';
  const appliedTitle = on.title ? title : '';
  const appliedAuthor = on.author ? author : '';
  const appliedAfter = on.publishedAfter ? publishedAfter : '';
  const appliedBefore = on.publishedBefore ? publishedBefore : '';
  const appliedStarred = Boolean(stats) && on.starredOnly && starredOnly;
  const filterCount = activeFilterCount({ title: appliedTitle, author: appliedAuthor, publishedAfter: appliedAfter, publishedBefore: appliedBefore, starredOnly: appliedStarred });

  const visible = useMemo(
    () => arrangeShared(shared, stats ?? new Map(), mine, { title: appliedTitle, author: appliedAuthor, publishedAfter: appliedAfter, publishedBefore: appliedBefore, starredOnly: appliedStarred, sort: effectiveSort }),
    [shared, stats, mine, appliedTitle, appliedAuthor, appliedAfter, appliedBefore, appliedStarred, effectiveSort],
  );

  /** Wraps a setter so changing it also goes back to the first page of rows. */
  const reset = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setShown(pageSize); };
  const turn = (key: FilterKey, value: boolean) => { setOn((current) => ({ ...current, [key]: value })); setShown(pageSize); };

  return {
    values: { title, author, publishedAfter, publishedBefore, starredOnly, sort: effectiveSort, pageSize },
    on,
    set: {
      title: (value: string) => { setTitle(value); turn('title', value !== ''); },
      author: (value: string) => { setAuthor(value); turn('author', value !== ''); },
      publishedAfter: (value: string) => { setPublishedAfter(value); turn('publishedAfter', value !== ''); },
      publishedBefore: (value: string) => { setPublishedBefore(value); turn('publishedBefore', value !== ''); },
      starredOnly: (value: boolean) => { setStarredOnly(value); turn('starredOnly', value); },
      /** Ticks or unticks one filter without touching its value. */
      enabled: turn,
      sort: reset(setSort),
      pageSize: (size: number) => { setPageSize(size); setShown(size); },
    },
    clearFilters: () => { setTitle(''); setAuthor(''); setPublishedAfter(''); setPublishedBefore(''); setStarredOnly(false); setOn(NONE_ON); setShown(pageSize); },
    filterCount,
    visible,
    rows: visible.slice(0, shown),
    showMore: () => setShown(shown + pageSize),
    hideExtra: () => setShown(pageSize),
    expanded: shown > pageSize,
  };
}
