import test from 'node:test';
import assert from 'node:assert/strict';
import { activeFilterCount, applyReaction, arrangeShared, toggleStar, toggleVote, type Reaction, type SharedStats } from './sharedReactions';
import type { SharedWorkspaceSummary } from './sharedWorkspaces';

const item = (id: string, name: string, updatedAt: string): SharedWorkspaceSummary => ({
  id, ownerId: 'o', sourceWorkspaceKey: id, name, description: '', ownerLabel: 'Ann', tags: [],
  lessonCount: 0, testCount: 0, roadmapCount: 0, publishedAt: updatedAt, updatedAt,
});

test('voting twice the same way clears it, the other way switches', () => {
  const none: Reaction = { vote: 0, starred: true };
  const up = toggleVote(none, 1);
  assert.deepEqual(up, { vote: 1, starred: true });
  assert.equal(toggleVote(up, 1).vote, 0);
  assert.equal(toggleVote(up, -1).vote, -1);
  assert.equal(toggleStar(up).starred, false);
});

test('totals follow a change of one user reaction', () => {
  const stats: SharedStats = { upvotes: 3, downvotes: 1, stars: 2 };
  assert.deepEqual(applyReaction(stats, { vote: 1, starred: false }, { vote: -1, starred: true }), { upvotes: 2, downvotes: 2, stars: 3 });
  assert.deepEqual(applyReaction(stats, { vote: 0, starred: false }, { vote: 1, starred: false }), { upvotes: 4, downvotes: 1, stars: 2 });
});

test('browse list: sort by score or stars, filter to my starred, search', () => {
  const a = item('a', 'Spanish', '2026-01-01');
  const b = item('b', 'Japanese', '2026-02-01');
  const c = item('c', 'Spanish advanced', '2026-03-01');
  const stats = new Map([['a', { upvotes: 5, downvotes: 0, stars: 1 }], ['b', { upvotes: 1, downvotes: 3, stars: 9 }]]);
  const mine = new Map<string, Reaction>([['b', { vote: 0, starred: true }]]);
  const ids = (list: SharedWorkspaceSummary[]) => list.map((x) => x.id);
  assert.deepEqual(ids(arrangeShared([a, b, c], stats, mine, { sort: 'newest', starredOnly: false })), ['c', 'b', 'a']);
  assert.deepEqual(ids(arrangeShared([a, b, c], stats, mine, { sort: 'top', starredOnly: false })), ['a', 'c', 'b']);
  assert.deepEqual(ids(arrangeShared([a, b, c], stats, mine, { sort: 'stars', starredOnly: false })), ['b', 'a', 'c']);
  assert.deepEqual(ids(arrangeShared([a, b, c], stats, mine, { sort: 'newest', starredOnly: true })), ['b']);
  assert.deepEqual(ids(arrangeShared([a, b, c], stats, mine, { title: 'spanish', sort: 'top', starredOnly: false })), ['a', 'c']);
});

test('browse list: filter by title, author and publish day, sort by title, author and oldest', () => {
  const make = (id: string, name: string, owner: string, at: string): SharedWorkspaceSummary => ({ ...item(id, name, at), ownerLabel: owner });
  const a = make('a', 'Spanish basics', 'Ann', '2026-03-10T12:00:00Z');
  const b = make('b', 'Japanese', 'Bo', '2026-03-20T12:00:00Z');
  const c = make('c', 'Spanish advanced', 'Cy', '2026-04-05T12:00:00Z');
  a.tags = ['spanish', 'grammar'];
  b.tags = ['language'];
  const none = new Map<string, SharedStats>();
  const mine = new Map<string, Reaction>();
  const ids = (list: SharedWorkspaceSummary[]) => list.map((x) => x.id);
  const base = { sort: 'newest' as const, starredOnly: false };
  assert.deepEqual(ids(arrangeShared([a, b, c], none, mine, { ...base, title: 'SPANISH' })), ['c', 'a']);
  assert.deepEqual(ids(arrangeShared([a, b, c], none, mine, { ...base, author: 'bo' })), ['b']);
  assert.deepEqual(ids(arrangeShared([a, b, c], none, mine, { ...base, tag: 'LANG' })), ['b']);
  assert.deepEqual(ids(arrangeShared([a, b, c], none, mine, { ...base, tag: 'gram' })), ['a']);
  assert.deepEqual(ids(arrangeShared([a, b, c], none, mine, { ...base, publishedAfter: '2026-03-15' })), ['c', 'b']);
  assert.deepEqual(ids(arrangeShared([a, b, c], none, mine, { ...base, publishedBefore: '2026-03-20' })), ['b', 'a']);
  assert.deepEqual(ids(arrangeShared([a, b, c], none, mine, { ...base, publishedAfter: '2026-03-12', publishedBefore: '2026-03-25' })), ['b']);
  assert.deepEqual(ids(arrangeShared([a, b, c], none, mine, { ...base, sort: 'oldest' })), ['a', 'b', 'c']);
  assert.deepEqual(ids(arrangeShared([a, b, c], none, mine, { ...base, sort: 'title' })), ['b', 'c', 'a']);
  assert.deepEqual(ids(arrangeShared([a, b, c], none, mine, { ...base, sort: 'author' })), ['a', 'b', 'c']);
});

test('filter badge counts only the filters that are on', () => {
  assert.equal(activeFilterCount({ starredOnly: false }), 0);
  assert.equal(activeFilterCount({ title: ' ', author: 'x', tag: 'y', publishedAfter: '2026-01-01', starredOnly: true }), 4);
});
