import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTag, normalizeTags, tagCounts } from './sharedTags';

test('a tag is trimmed, lowercased, without "#" and with single spaces', () => {
  assert.equal(normalizeTag('  #Spanish   Grammar '), 'spanish grammar');
  assert.equal(normalizeTag('###'), '');
  assert.equal(normalizeTag('x'.repeat(50)).length, MAX_TAG_LENGTH);
});

test('a tag list drops empty and duplicate tags and is capped', () => {
  assert.deepEqual(normalizeTags(['Spanish', ' spanish ', '', '#A1', 'a1']), ['spanish', 'a1']);
  assert.equal(normalizeTags(Array.from({ length: 25 }, (_, index) => `t${index}`)).length, MAX_TAGS);
});

test('tag counts list the most used first', () => {
  const counts = tagCounts([{ tags: ['b', 'a'] }, { tags: ['a'] }, { tags: [] }]);
  assert.deepEqual(counts, [{ tag: 'a', count: 2 }, { tag: 'b', count: 1 }]);
});
