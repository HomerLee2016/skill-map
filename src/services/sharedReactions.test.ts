import test from 'node:test';
import assert from 'node:assert/strict';
import { applyReaction, arrangeShared, toggleStar, toggleVote, type Reaction, type SharedStats } from './sharedReactions';
import type { SharedWorkspaceSummary } from './sharedWorkspaces';

const item = (id: string, name: string, updatedAt: string): SharedWorkspaceSummary => ({
  id, ownerId: 'o', sourceWorkspaceKey: id, name, description: '', ownerLabel: 'Ann',
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
  assert.deepEqual(ids(arrangeShared([a, b, c], stats, mine, { query: '', sort: 'newest', starredOnly: false })), ['c', 'b', 'a']);
  assert.deepEqual(ids(arrangeShared([a, b, c], stats, mine, { query: '', sort: 'top', starredOnly: false })), ['a', 'c', 'b']);
  assert.deepEqual(ids(arrangeShared([a, b, c], stats, mine, { query: '', sort: 'stars', starredOnly: false })), ['b', 'a', 'c']);
  assert.deepEqual(ids(arrangeShared([a, b, c], stats, mine, { query: '', sort: 'newest', starredOnly: true })), ['b']);
  assert.deepEqual(ids(arrangeShared([a, b, c], stats, mine, { query: 'spanish', sort: 'top', starredOnly: false })), ['a', 'c']);
});
