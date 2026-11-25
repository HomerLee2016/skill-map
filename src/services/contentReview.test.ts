import test from 'node:test';
import assert from 'node:assert/strict';
import { countLabel, findReviewItems, resolveReview, withoutReviewItems } from './contentReview';
import { hashContent, planContentSync } from './contentSync';
import type { WorkspaceContent } from './workspaceTypes';
import { emptyStructureTree, emptyTestsStructure } from './workspaceParsing';

const content = (lessons: string[], tests: string[]): WorkspaceContent => ({
  lessons: lessons.map((id) => ({ id, title: `Lesson ${id}`, content: id })),
  tests: tests.map((id) => ({ id, title: `Test ${id}`, questions: [] })),
  roadmaps: [], lessonStructure: emptyStructureTree(), testsStructure: emptyTestsStructure(),
});

const plan = (local: WorkspaceContent, cloud: WorkspaceContent, base: Record<string, string> | null) =>
  planContentSync({ local: hashContent(local), cloud: hashContent(cloud), tombstoned: new Set(), base });

test('items on one side only are listed; changed items on both sides are not', () => {
  const local = content(['both', 'mine'], ['t-mine']);
  const cloud = content(['both', 'theirs'], ['t-theirs']);
  const items = findReviewItems(plan(local, cloud, null), local, cloud, null);
  assert.deepEqual(items.map((item) => `${item.origin}:${item.ref}`).sort(), ['cloud:lessons:theirs', 'cloud:tests:t-theirs', 'device:lessons:mine', 'device:tests:t-mine']);
  assert.equal(items.find((item) => item.ref === 'lessons:theirs')?.title, 'Lesson theirs');
});

test('cloud-only items default to kept; device-only only when new since the last sync', () => {
  const local = content(['new', 'dropped'], []);
  const cloud = content(['cloudy'], []);
  const base = { 'lessons:dropped': hashContent(local)['lessons:dropped'] };
  const items = findReviewItems(plan(local, cloud, base), local, cloud, base);
  const keep = (ref: string) => items.find((item) => item.ref === ref)?.keepByDefault;
  assert.equal(keep('lessons:cloudy'), true);
  assert.equal(keep('lessons:new'), true);
  assert.equal(keep('lessons:dropped'), false);
});

test('reviewed items are taken out of the automatic plan', () => {
  const local = content(['mine', 'both'], []);
  const cloud = content(['theirs', 'both'], []);
  const p = plan(local, cloud, null);
  const items = findReviewItems(p, local, cloud, null);
  const rest = withoutReviewItems(p, items);
  assert.deepEqual([rest.push, rest.pull], [[], []]);
});

test('resolveReview maps each choice to push, pull or the right side for removal', () => {
  const local = content(['mine', 'mine2'], ['t-mine']);
  const cloud = content(['theirs', 'theirs2'], []);
  const items = findReviewItems(plan(local, cloud, null), local, cloud, null);
  const outcome = resolveReview(items, new Set(['lessons:mine', 'lessons:theirs']));
  assert.deepEqual(outcome.push, ['lessons:mine']);
  assert.deepEqual(outcome.pull, ['lessons:theirs']);
  assert.deepEqual(outcome.removeFromDevice.sort(), ['lessons:mine2', 'tests:t-mine']);
  assert.deepEqual(outcome.removeFromCloud, ['lessons:theirs2']);
});

test('countLabel pluralises', () => {
  const items = findReviewItems(plan(content(['a', 'b'], ['t']), content([], []), null), content(['a', 'b'], ['t']), content([], []), null);
  assert.equal(countLabel(items), '1 test, 2 lessons');
});
