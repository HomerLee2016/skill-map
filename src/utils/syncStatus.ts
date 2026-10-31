export type SyncTrigger = 'manual' | 'revision' | 'workspace';

export interface LastSync {
  at: number;
  trigger: SyncTrigger;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** "sync 3 mins ago (after manual)" */
export function formatLastSync(last: LastSync, now: number): string {
  const elapsed = Math.max(0, now - last.at);
  let ago: string;
  if (elapsed < MINUTE) ago = 'just now';
  else if (elapsed < HOUR) ago = `${plural(Math.floor(elapsed / MINUTE), 'min')} ago`;
  else if (elapsed < DAY) ago = `${plural(Math.floor(elapsed / HOUR), 'hr')} ago`;
  else ago = `${plural(Math.floor(elapsed / DAY), 'day')} ago`;
  return `sync ${ago} (after ${last.trigger})`;
}
