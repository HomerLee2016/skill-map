import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { buildImportedWorkspace } from './workspaceImport';
import { buildWorkspaceZip, safeFileName, workspaceZipFileName } from './workspaceExport';
import type { WorkspaceContent } from './workspaceTypes';

const content: WorkspaceContent = {
  lessons: [{ id: 'intro', title: 'Intro', content: '# Intro\nhola' }, { id: 'a/b', title: 'Slash', content: '# Slash' }],
  tests: [{ id: 'quiz-1', title: 'Quiz One', questions: [{ question_number: 1, question: 'Q?', options: ['a', 'b'], correct_answer: 'a', explanation: 'because' }] }],
  roadmaps: [{ id: 'map', name: 'Map', yaml: 'name: Map\nnodes: []\n' }],
  lessonStructure: { folders: [], items: ['intro'] } as never,
  testsStructure: { revision: { folders: [], items: [] }, new_tests: { folders: [], items: ['quiz-1'] } } as never,
};

test('zip holds editable files in folders and re-imports to the same content', async () => {
  const entries = unzipSync(buildWorkspaceZip('Spanish', content));
  assert.deepEqual(Object.keys(entries).sort(), [
    'Spanish/lessons/a-b.md', 'Spanish/lessons/intro.md', 'Spanish/lessons/structure.yaml',
    'Spanish/roadmaps/map.yaml', 'Spanish/tests/quiz-1.yaml', 'Spanish/tests/structure.yaml',
  ]);
  const imported = await buildImportedWorkspace(
    Object.entries(entries).map(([path, bytes]) => ({ path, text: async () => strFromU8(bytes) })),
    'x',
  );
  assert.equal(imported.name, 'Spanish');
  assert.deepEqual(imported.content.tests, content.tests);
  assert.deepEqual(imported.content.roadmaps.map((r) => [r.id, r.yaml]), [['map', 'name: Map\nnodes: []\n']]);
  assert.deepEqual(imported.content.lessons.map((l) => l.content).sort(), ['# Intro\nhola', '# Slash']);
  assert.deepEqual(imported.content.lessonStructure, content.lessonStructure);
  assert.deepEqual(imported.content.testsStructure, content.testsStructure);
});

test('file names are made safe and unique', () => {
  assert.equal(safeFileName('My: Space?', 'w'), 'My- Space-');
  assert.equal(safeFileName('..', 'w'), 'w');
  assert.equal(workspaceZipFileName('japanese'), 'japanese.zip');
  const dup = unzipSync(buildWorkspaceZip('w', { ...content, lessons: [
    { id: 'x', title: 'x', content: '1' }, { id: 'X', title: 'X', content: '2' },
  ] }));
  assert.ok(dup['w/lessons/x.md'] && dup['w/lessons/X-2.md']);
});
