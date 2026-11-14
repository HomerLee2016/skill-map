import test from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { mergeRevisionRecordSets } from './revisionSyncMerge';
import { mergeTrees, mergeWorkspaceContents, remapRoadmapLinks } from './workspaceMerge';
import type { CompletedQuestionRecord } from './revisionDb';
import type { WorkspaceContent } from './workspaceTypes';

const empty = (): WorkspaceContent => ({
  lessons: [], tests: [], roadmaps: [],
  lessonStructure: { folders: [], items: [] },
  testsStructure: { revision: { folders: [], items: [] }, new_tests: { folders: [], items: [] } },
});
const q = (question: string) => ({ question_number: 1, question, options: ['a', 'b'], correct_answer: 'a' });

test('lv1 and lv2 from two friends merge into one workspace', () => {
  const lv1 = empty();
  lv1.lessons = [{ id: 'es-01', title: 'Greetings', content: '# Greetings' }];
  lv1.lessonStructure = { folders: [{ name: 'Spanish', items: ['es-01'], children: [] }], items: [] };
  const lv2 = empty();
  lv2.lessons = [{ id: 'es-02', title: 'Numbers', content: '# Numbers' }];
  lv2.lessonStructure = { folders: [{ name: 'Spanish', items: ['es-02'], children: [] }], items: [] };
  const { content, report } = mergeWorkspaceContents([{ name: 'Ann', content: lv1 }, { name: 'Bo', content: lv2 }]);
  assert.deepEqual(content.lessons.map((l) => l.id).sort(), ['es-01', 'es-02']);
  assert.equal(report.lessons.added, 2);
  assert.equal(content.lessonStructure.folders?.length, 1);
  assert.deepEqual(content.lessonStructure.folders?.[0].items, ['es-01', 'es-02']);
});

test('the same lesson from two sources is kept once and points at the kept id', () => {
  const a = empty(); a.lessons = [{ id: 'x', title: 'X', content: '# X\n' }];
  const b = empty(); b.lessons = [{ id: 'y', title: 'X', content: '# X' }];
  b.lessonStructure = { folders: [], items: ['y'] };
  const { content, report, idMaps } = mergeWorkspaceContents([{ name: 'A', content: a }, { name: 'B', content: b }]);
  assert.equal(content.lessons.length, 1);
  assert.equal(report.lessons.duplicates, 1);
  assert.equal(idMaps[1].lessons.get('y'), 'x');
  assert.deepEqual(content.lessonStructure.items, ['x']);
});

test('same id with different content keeps both, the newcomer renamed, and fixes roadmap links', () => {
  const a = empty();
  a.lessons = [{ id: 'l', title: 'Mine', content: 'mine' }];
  a.tests = [{ id: 't', title: 'Quiz', questions: [q('one')] }];
  const b = empty();
  b.lessons = [{ id: 'l', title: 'Theirs', content: 'theirs' }];
  b.tests = [{ id: 't', title: 'Quiz', questions: [q('two')] }];
  b.roadmaps = [{ id: 'r', name: 'Map', yaml: '- id: n\n  label: N\n  lessons: [l]\n  tests: [t]\n' }];
  const { content, report, idMaps } = mergeWorkspaceContents([{ name: 'Ann', content: a }, { name: 'Bo Lee', content: b }]);
  assert.equal(content.lessons.length, 2);
  assert.equal(report.lessons.renamed, 1);
  const renamed = content.lessons.find((l) => l.content === 'theirs')!;
  assert.equal(renamed.id, 'l-bo-lee');
  assert.equal(renamed.title, 'Theirs (Bo Lee)');
  assert.equal(content.lessons.find((l) => l.content === 'mine')!.id, 'l');
  const nodes = YAML.parse(content.roadmaps[0].yaml) as { lessons: string[]; tests: string[] }[];
  assert.deepEqual(nodes[0].lessons, ['l-bo-lee']);
  assert.deepEqual(nodes[0].tests, ['t-bo-lee']);
  assert.equal(idMaps[1].testTitles.get('Quiz'), 'Quiz (Bo Lee)');
});

test('identical roadmaps collapse, different ones with the same id both stay', () => {
  const yaml = '- id: n\n  label: N\n';
  const a = empty(); a.roadmaps = [{ id: 'r', name: 'Map', yaml }];
  const b = empty(); b.roadmaps = [{ id: 'r', name: 'Map', yaml }];
  const c = empty(); c.roadmaps = [{ id: 'r', name: 'Map', yaml: '- id: z\n  label: Z\n' }];
  const { content, report } = mergeWorkspaceContents([{ name: 'A', content: a }, { name: 'B', content: b }, { name: 'C', content: c }]);
  assert.equal(content.roadmaps.length, 2);
  assert.equal(report.roadmaps.duplicates, 1);
  assert.equal(content.roadmaps[1].id, 'r-c');
});

test('the sources are not modified', () => {
  const a = empty(); a.lessons = [{ id: 'l', title: 'A', content: 'a' }];
  const b = empty(); b.lessons = [{ id: 'l', title: 'B', content: 'b' }];
  mergeWorkspaceContents([{ name: 'A', content: a }, { name: 'B', content: b }]);
  assert.equal(b.lessons[0].id, 'l');
  assert.equal(b.lessons[0].title, 'B');
});

test('folder trees merge by name, nested, without listing an item twice', () => {
  const merged = mergeTrees(
    { folders: [{ name: 'Spanish', items: ['a'], children: [{ name: 'Beginner', items: ['b'], children: [] }] }], items: [] },
    { folders: [{ name: 'Spanish', items: ['a', 'c'], children: [{ name: 'Beginner', items: ['d'], children: [] }, { name: 'Advanced', items: ['e'], children: [] }] }], items: ['f'] },
    (id) => id,
  );
  assert.deepEqual(merged.folders?.[0].items, ['a', 'c']);
  assert.deepEqual(merged.folders?.[0].children?.map((c) => [c.name, c.items]), [['Beginner', ['b', 'd']], ['Advanced', ['e']]]);
  assert.deepEqual(merged.items, ['f']);
});

test('roadmap links in nested trees are remapped and untouched yaml is returned as is', () => {
  const yaml = 'id: root\nlabel: R\nchildren:\n  - id: k\n    label: K\n    lessons: [a]\n';
  const out = remapRoadmapLinks(yaml, new Map([['a', 'a-2']]), new Map());
  assert.ok(out.includes('a-2'));
  assert.equal(remapRoadmapLinks(yaml, new Map(), new Map()), yaml);
  assert.equal(remapRoadmapLinks('{{{', new Map([['a', 'b']]), new Map()), '{{{');
});

const record = (hash: string, last: string, quiz = 'Quiz'): CompletedQuestionRecord => ({
  id: 7, hash, last_time: last, quiz_title: quiz, question_name: 'q', options: ['a'], correct_answer: 'a',
});

test('revision records merge by question: newest answer wins, renamed tests keep their link, local ids are dropped', () => {
  const merged = mergeRevisionRecordSets([
    { records: [record('h1', '2026-01-01T00:00:00Z'), record('h2', '2026-01-01T00:00:00Z')], titles: new Map() },
    { records: [record('h1', '2026-02-01T00:00:00Z', 'Old title'), record('h3', '2026-01-01T00:00:00Z', 'Old title')], titles: new Map([['Old title', 'New title']]) },
  ]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((r) => r.hash === 'h1')!.last_time, '2026-02-01T00:00:00Z');
  assert.equal(merged.find((r) => r.hash === 'h3')!.quiz_title, 'New title');
  assert.ok(merged.every((r) => r.id === undefined));
});

test('merging into an existing target reports only what the others added, and merging again changes nothing', () => {
  const target = empty();
  target.lessons = [{ id: 'lesson-1', title: 'Greetings', content: 'g' }];
  const other = empty();
  other.lessons = [{ id: 'lesson-1', title: 'Past', content: 'p' }, { id: 'lesson-2', title: 'Food', content: 'f' }];
  const first = mergeWorkspaceContents([{ name: 'T', content: target }, { name: 'O', content: other }], { firstIsTarget: true });
  assert.deepEqual(first.report.lessons, { added: 2, duplicates: 0, renamed: 1 });
  const second = mergeWorkspaceContents([{ name: 'T', content: first.content }, { name: 'O', content: other }], { firstIsTarget: true });
  assert.deepEqual(second.report.lessons, { added: 0, duplicates: 2, renamed: 0 });
  assert.equal(second.content.lessons.length, 3);
});
