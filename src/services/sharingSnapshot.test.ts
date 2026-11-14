import test from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { buildSnapshot, sanitizeLessonMarkdown, sanitizeRoadmapYaml, sanitizeSharedContent, selectAll } from './sharingSnapshot';
import type { WorkspaceContent } from './workspaceTypes';

const content: WorkspaceContent = {
  lessons: [
    { id: 'l1', title: 'One', content: '# One' },
    { id: 'l2', title: 'Two', content: '# Two' },
  ],
  tests: [{ id: 't1', title: 'T', questions: [{ question_number: 1, question: 'Q', options: ['a', 'b'], correct_answer: 'a' }] }],
  roadmaps: [{ id: 'r1', name: 'Map', yaml: '- id: a\n  label: A\n  finished: true\n  lessons: [l1, l2]\n' }],
  lessonStructure: { folders: [{ name: 'F', items: ['l1', 'l2'], children: [{ name: 'Sub', items: ['l2'], children: [] }] }], items: ['l1'] },
  testsStructure: { revision: { folders: [], items: ['t1'] }, new_tests: { folders: [], items: [] } },
};

test('the snapshot holds only ticked items and prunes folder trees to them', () => {
  const selection = selectAll(content);
  selection.lessonIds.delete('l2');
  selection.testIds.clear();
  const snapshot = buildSnapshot(content, selection);
  assert.deepEqual(snapshot.lessons.map((item) => item.id), ['l1']);
  assert.equal(snapshot.tests.length, 0);
  assert.deepEqual(snapshot.lessonStructure.folders?.[0].items, ['l1']);
  assert.deepEqual(snapshot.lessonStructure.folders?.[0].children?.[0].items, []);
  assert.deepEqual(snapshot.testsStructure.revision.items, []);
  assert.equal(snapshot.roadmaps.length, 1);
});

test('the snapshot has no revision data and does not alias the workspace', () => {
  const snapshot = buildSnapshot(content, selectAll(content));
  assert.deepEqual(Object.keys(snapshot).sort(), ['lessonStructure', 'lessons', 'roadmaps', 'tests', 'testsStructure']);
  snapshot.lessons[0].title = 'changed';
  assert.equal(content.lessons[0].title, 'One');
});

test('lesson markdown loses scripts, handlers and script urls but keeps normal content', () => {
  const dirty = '# Hi\n<script>alert(1)</script>\n<img src=x onerror="alert(2)">\n[a](javascript:alert(3))\n<a href="JaVaScript:alert(4)">x</a>\n<iframe src="https://evil"></iframe>\n<scr<script>ipt>alert(5)</scr</script>ipt>\n**bold** <audio src="https://ok/a.mp3" controls></audio>';
  const clean = sanitizeLessonMarkdown(dirty);
  assert.ok(!/<script|onerror|javascript:|<iframe|alert\(/i.test(clean), clean);
  assert.ok(clean.includes('**bold**'));
  assert.ok(clean.includes('<audio src="https://ok/a.mp3" controls></audio>'));
});

test('roadmap yaml is rebuilt from known fields, with unsafe links dropped and progress reset', () => {
  const yaml = '- id: a\n  label: A\n  url: "javascript:alert(1)"\n  finished: true\n  evil: !!js/function "x"\n  x: 5\n- id: b\n  label: B\n  url: https://ok.example/page\n  dependsOn: [a]\n';
  const out = sanitizeRoadmapYaml(yaml, true);
  assert.ok(out);
  const nodes = YAML.parse(out!) as Record<string, unknown>[];
  assert.equal(nodes[0].url, undefined);
  assert.equal(nodes[0].finished, false);
  assert.equal(nodes[0].evil, undefined);
  assert.equal(nodes[0].x, 5);
  assert.equal(nodes[1].url, 'https://ok.example/page');
  assert.deepEqual(nodes[1].dependsOn, ['a']);
});

test('roadmap yaml that is not a roadmap is dropped', () => {
  assert.equal(sanitizeRoadmapYaml('just: [unclosed'), null);
  assert.equal(sanitizeRoadmapYaml('hello'), null);
});

test('shared content of any shape is cleaned: bad ids, duplicates, broken questions, oversize lists', () => {
  const cleaned = sanitizeSharedContent({
    lessons: [
      { id: '../../etc/passwd', title: 'x'.repeat(900), content: 'ok' },
      { id: '__proto__', title: 'p', content: 'p' },
      { id: 'dup', title: 'a', content: 'a' },
      { id: 'dup', title: 'b', content: 'b' },
      { id: 'no-content', title: 'n' },
      { id: '日本語-01', title: 'jp', content: 'jp' },
      null,
    ],
    tests: [{ id: 't', title: 'T', questions: [{ question: 'Q', options: ['a', 5, 'b'], correct_answer: 'a' }, { question: 'bad' }, 'nope'] }],
    roadmaps: [{ id: 'r', name: 'R', yaml: '- id: a\n  finished: true\n' }, { id: 'bad', name: 'x', yaml: '{{{' }],
    lessonStructure: { folders: [{ name: '', items: ['x'] }, { name: 'ok', items: ['dup', 7], children: 'no' }], items: 'no' },
    testsStructure: 'no',
  });
  assert.deepEqual(cleaned.lessons.map((item) => item.id), ['..-..-etc-passwd', 'dup', '日本語-01']);
  assert.equal(cleaned.lessons[0].title.length, 500);
  assert.equal(cleaned.lessons[1].content, 'a');
  assert.deepEqual(cleaned.tests[0].questions.map((q) => q.options), [['a', 'b']]);
  assert.equal(cleaned.roadmaps.length, 1);
  assert.ok(YAML.stringify(YAML.parse(cleaned.roadmaps[0].yaml)).includes('finished: false'));
  assert.deepEqual(cleaned.lessonStructure.folders, [{ name: 'ok', items: ['dup'], children: [] }]);
  assert.deepEqual(cleaned.lessonStructure.items, []);
  assert.deepEqual(cleaned.testsStructure.revision, { folders: [], items: [] });
});

test('null or non-object shared content gives an empty workspace', () => {
  assert.equal(sanitizeSharedContent(null).lessons.length, 0);
  assert.equal(sanitizeSharedContent('x').roadmaps.length, 0);
});
