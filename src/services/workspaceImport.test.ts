import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportedWorkspace, type ImportedFile } from './workspaceImport';

const file = (path: string, body: string): ImportedFile => ({ path, text: async () => body });

const QUIZ = 'quiz_title: Quiz One\nquestions: []\n';

test('a picked folder keeps its name and loads lessons, tests and roadmaps', async () => {
  const imported = await buildImportedWorkspace([
    file('Spanish/lessons/intro.md', '# Intro\nhola'),
    file('Spanish/tests/quiz-1.yaml', QUIZ),
    file('Spanish/tests/structure.yaml', 'revision: []\nnew_tests: []\n'),
    file('Spanish/roadmaps/map.yaml', 'name: Map\nnodes: []\n'),
    file('Spanish/notes.txt', 'ignored'),
    file('Spanish/.DS_Store', 'ignored'),
  ], 'fallback');
  assert.equal(imported.name, 'Spanish');
  assert.deepEqual(imported.content.lessons.map((lesson) => [lesson.id, lesson.title]), [['intro', 'Intro']]);
  assert.deepEqual(imported.content.tests.map((item) => item.title), ['Quiz One']);
  assert.equal(imported.content.roadmaps.length, 1);
});

test('a zip with lessons/ at the top level uses the fallback name', async () => {
  const imported = await buildImportedWorkspace([file('lessons/a.md', '# A'), file('__MACOSX/lessons/._a.md', 'x')], 'my-export');
  assert.equal(imported.name, 'my-export');
  assert.equal(imported.content.lessons.length, 1);
});

test('files outside the workspace folders are not imported', async () => {
  const imported = await buildImportedWorkspace([file('Spanish/other/a.md', '# A')], 'x');
  assert.equal(imported.content.lessons.length + imported.content.tests.length, 0);
});

test('a zip that would unpack to too much text is refused before inflating', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  const bomb = zipSync({ 'lessons/big.md': strToU8('a'.repeat(3_000_000)) });
  const upload = new File([bomb.slice().buffer], 'bomb.zip');
  const { filesFromZip } = await import('./workspaceImport');
  await assert.rejects(() => filesFromZip(upload), /too much text/);
  const fine = new File([zipSync({ 'lessons/a.md': strToU8('# A'), 'logo.png': strToU8('png') }).slice().buffer], 'ok.zip');
  assert.deepEqual((await filesFromZip(fine)).map((entry) => entry.path), ['lessons/a.md']);
});
