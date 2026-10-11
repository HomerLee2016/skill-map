import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTestsStructure, titleFromMarkdown, toRoadmap, toTest } from './workspaceParsing';

test('titleFromMarkdown uses first h1 or falls back to the id', () => {
  assert.equal(titleFromMarkdown('intro\n# Hello World\n', 'x'), 'Hello World');
  assert.equal(titleFromMarkdown('no heading', 'my-lesson_one'), 'my lesson one');
});

test('toTest reads quiz_title and survives invalid yaml', () => {
  assert.deepEqual(toTest('t1', 'quiz_title: Quiz\nquestions: []'), { id: 't1', title: 'Quiz', questions: [] });
  assert.deepEqual(toTest('bad-id', 'a: [unclosed'), { id: 'bad-id', title: 'bad id', questions: [] });
});

test('toRoadmap labels from the yaml root node', () => {
  assert.equal(toRoadmap('r', '- id: a\n  label: Root').name, 'Root');
  assert.equal(toRoadmap('r', '').name, 'Untitled Roadmap');
});

test('parseTestsStructure falls back to empty trees', () => {
  assert.deepEqual(parseTestsStructure(''), { revision: { folders: [], items: [] }, new_tests: { folders: [], items: [] } });
  assert.deepEqual(parseTestsStructure('revision:\n  items: [a]').revision, { folders: [], items: ['a'] });
});
