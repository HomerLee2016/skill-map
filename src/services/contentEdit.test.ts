import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countRoadmapLinks, deleteLessonFromContent, deleteTestFromContent, removeIdFromTree, removeRoadmapLink,
  saveLessonInContent, saveTestInContent, suggestId, validateNewId,
} from './contentEdit';
import type { WorkspaceContent } from './workspaceTypes';

const ROADMAP = `# my roadmap
- id: week_1
  label: Week 1
  lessons:
    - l1
    - l2
  tests:
    - t1
- id: week_2
  label: Week 2
  lessons:
    - l1
  dependsOn:
    - week_1
`;

function sample(): WorkspaceContent {
  return {
    lessons: [{ id: 'l1', title: 'One', content: '# One' }, { id: 'l2', title: 'Two', content: '# Two' }],
    tests: [{ id: 't1', title: 'T one', questions: [] }],
    roadmaps: [{ id: 'r', name: 'R', yaml: ROADMAP }],
    lessonStructure: { folders: [{ name: 'A', items: ['l1'], children: [{ name: 'B', items: ['l1', 'l2'] }] }], items: ['l2'] },
    testsStructure: { revision: { items: ['t1'] }, new_tests: { folders: [{ name: 'F', items: ['t1'] }] } },
  };
}

test('new ids are file-safe, unique ignoring case, and not reserved', () => {
  assert.equal(validateNewId('jp-n3_w1', ['other']), null);
  assert.match(validateNewId('has space', []) ?? '', /letters, numbers/);
  assert.match(validateNewId('../x', []) ?? '', /letters, numbers/);
  assert.match(validateNewId('Structure', []) ?? '', /reserved/);
  assert.match(validateNewId('L1', ['l1']) ?? '', /already exists/);
});

test('a suggested id comes from the title and avoids existing ones', () => {
  assert.equal(suggestId('Greetings & Politeness!', 'lesson', []), 'greetings-politeness');
  assert.equal(suggestId('Greetings', 'lesson', ['greetings', 'greetings-2']), 'greetings-3');
  assert.equal(suggestId('日本語', 'lesson', []), 'lesson');
});

test('saving a lesson replaces the same id, takes its title from the first heading and keeps the list sorted', () => {
  const next = saveLessonInContent(sample(), { id: 'l1', content: '# Alpha\nbody' });
  assert.deepEqual(next.lessons.map((l) => [l.id, l.title]), [['l1', 'Alpha'], ['l2', 'Two']]);
  assert.equal(saveLessonInContent(next, { id: 'new', content: 'no heading' }).lessons.find((l) => l.id === 'new')?.title, 'new');
});

test('saving a test replaces the same id', () => {
  const next = saveTestInContent(sample(), { id: 't1', title: 'Renamed', questions: [] });
  assert.deepEqual(next.tests.map((t) => t.title), ['Renamed']);
});

test('deleting a lesson removes it from every folder and roadmap link, and says what else must be saved', () => {
  const result = deleteLessonFromContent(sample(), 'l1');
  assert.deepEqual(result.content.lessons.map((l) => l.id), ['l2']);
  assert.deepEqual(result.content.lessonStructure, { folders: [{ name: 'A', items: [], children: [{ name: 'B', items: ['l2'] }] }], items: ['l2'] });
  assert.deepEqual(result.changedStructures, ['lessons']);
  assert.equal(result.changedRoadmaps.length, 1);
  const yaml = result.changedRoadmaps[0].yaml;
  assert.match(yaml, /# my roadmap/, 'comments survive');
  assert.doesNotMatch(yaml, /l1/);
  assert.match(yaml, /- l2/);
  assert.doesNotMatch(yaml.split('week_2')[1], /lessons:/, 'an emptied list is removed');
  assert.match(yaml, /dependsOn:/);
});

test('deleting a test cleans both test folders and the roadmap', () => {
  const result = deleteTestFromContent(sample(), 't1');
  assert.deepEqual(result.content.testsStructure, { revision: { items: [] }, new_tests: { folders: [{ name: 'F', items: [] }] } });
  assert.deepEqual(result.changedStructures, ['tests']);
  assert.doesNotMatch(result.changedRoadmaps[0].yaml, /tests:/);
});

test('deleting an item nothing links to changes nothing else', () => {
  const content = sample();
  content.lessons.push({ id: 'free', title: 'Free', content: '# Free' });
  const result = deleteLessonFromContent(content, 'free');
  assert.deepEqual(result.changedRoadmaps, []);
  assert.deepEqual(result.changedStructures, []);
  assert.equal(removeRoadmapLink('not: [valid', 'lessons', 'x'), null);
});

test('links are found inside nested roadmap children and counted per roadmap', () => {
  const nested = '- id: a\n  children:\n    - id: b\n      tests:\n        - t9\n';
  assert.match(removeRoadmapLink(nested, 'tests', 't9') ?? 'null', /id: b/);
  assert.equal(countRoadmapLinks([{ id: 'x', name: 'x', yaml: nested }, { id: 'y', name: 'y', yaml: ROADMAP }], 'tests', 't9'), 1);
  assert.deepEqual(removeIdFromTree({ items: ['a', 'b'] }, 'a'), { items: ['b'] });
});
