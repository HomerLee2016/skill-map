import test from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { buildSnapshot, findPublishProblems, sanitizeLessonMarkdown, sanitizeRoadmapYaml, sanitizeSharedContent, selectAll } from './sharingSnapshot';
import { LIMITS, lessonProblems, parseUntrustedYaml } from './sharingValidation';
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

const TTS = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=Hola';

test('clone-time clean-up removes raw HTML, images and script links but keeps Markdown and TTS audio', () => {
  const dirty = `# Hi\n<script>alert(1)</script>\n<img src=x onerror="alert(2)">\n![pic](https://x/y.png)\n[a](javascript:alert(3))\n<a href="JaVaScript:alert(4)">x</a>\n<iframe src="https://evil"></iframe>\n<scr<script>ipt>alert(5)</scr</script>ipt>\n[b](&#106;avascript:alert(6))\n[c]: data:text/html,x\n**bold** <audio controls src="${TTS}"></audio> <audio src="https://evil.example/a.mp3" controls></audio>`;
  const clean = sanitizeLessonMarkdown(dirty);
  assert.ok(!/<script|<img|<iframe|<a |onerror|javascript:|data:text|&#106;|evil|!\[/i.test(clean), clean);
  assert.ok(clean.includes('**bold**'));
  assert.ok(clean.includes(`<audio controls src="${TTS}"></audio>`));
  assert.deepEqual(lessonProblems(clean), []);
});

test('lessons must be Markdown: publish rules reject HTML, images, odd links and foreign audio', () => {
  assert.deepEqual(lessonProblems(`# Fine\n\nSee [site](https://example.com) and <https://example.com/x>.\n\n<audio controls src="${TTS}" type="audio/mpeg">\n  Your browser does not support audio.\n</audio>`), []);
  for (const bad of [
    '<b>bold</b>', '<script>1</script>', '<img src=x>', '![a](b.png)', '![a][ref]', '[x](javascript:alert(1))', '[x](data:text/html,a)',
    '[x](&#106;avascript:1)', '[r]: vbscript:x', '<audio controls src="https://evil.example/a.mp3"></audio>', `<audio controls src="${TTS}" onerror="x()"></audio>`,
    '<video src="x"></video>', '<javascript:alert(1)>', 'a\u0001b', 'x'.repeat(LIMITS.lessonChars + 1),
  ]) assert.notDeepEqual(lessonProblems(bad), [], bad.slice(0, 40));
});

test('untrusted yaml is parsed as plain data only', () => {
  assert.deepEqual(parseUntrustedYaml('a: 1\nb: [x, y]\n'), { a: 1, b: ['x', 'y'] });
  for (const bad of ['a: &x 1\nb: *x\n', 'a: !!js/function "x"\n', 'a: !custom 1\n', 'a: [unclosed', 'a: 1\na: 2\n', 'x'.repeat(LIMITS.yamlChars + 1)]) {
    assert.equal(parseUntrustedYaml(bad), undefined, bad.slice(0, 30));
  }
  const bomb = ['a: &a [x,x,x,x,x,x,x,x,x]', ...'bcdefghi'.split('').map((k, i) => `${k}: &${k} [${'*' + 'abcdefghi'[i]},'.repeat(9)}]`)].join('\n');
  assert.equal(parseUntrustedYaml(bomb), undefined);
});

test('findPublishProblems explains what blocks a publish and passes a clean snapshot', () => {
  assert.deepEqual(findPublishProblems(content), []);
  const bad: WorkspaceContent = {
    ...content,
    lessons: [{ id: 'l1', title: 'Bad', content: '<script>x</script>' }, { id: '../x', title: 'Odd', content: 'ok' }],
    tests: [{ id: 't1', title: 'T', questions: [{ question_number: 1, question: 'Q', options: ['a'], correct_answer: 'a', audio_track_url: 'https://evil.example/a.mp3' }] }],
    roadmaps: [{ id: 'r1', name: 'Map', yaml: 'a: &x 1\nb: *x' }],
  };
  const text = findPublishProblems(bad).join('\n');
  assert.match(text, /Lesson "Bad" contains raw HTML/);
  assert.match(text, /not a valid name/);
  assert.match(text, /not Google text-to-speech/);
  assert.match(text, /Roadmap "Map" is not plain roadmap YAML/);
  assert.notDeepEqual(findPublishProblems({ ...content, lessons: [], tests: [], roadmaps: [] }), []);
  assert.match(findPublishProblems({ ...content, lessons: [{ id: 'big', title: 'Big', content: 'x'.repeat(LIMITS.lessonChars) }, ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, title: 'B', content: 'x'.repeat(LIMITS.lessonChars) }))] }).join('\n'), /larger than 1 MB/);
});

test('test questions keep only a text-to-speech audio link', () => {
  const cleaned = sanitizeSharedContent({ tests: [{ id: 't', title: 'T', questions: [
    { question: 'Q1', options: ['a'], correct_answer: 'a', audio_track_url: TTS },
    { question: 'Q2', options: ['a'], correct_answer: 'a', audio_track_url: 'https://evil.example/a.mp3' },
  ] }] });
  assert.equal(cleaned.tests[0].questions[0].audio_track_url, TTS);
  assert.equal(cleaned.tests[0].questions[1].audio_track_url, undefined);
});

test('roadmap yaml is rebuilt from known fields, with unsafe links dropped and progress reset', () => {
  const yaml = '- id: a\n  label: A\n  url: "javascript:alert(1)"\n  finished: true\n  evil: not-allowed\n  x: 5\n- id: b\n  label: B\n  url: https://ok.example/page\n  dependsOn: [a]\n';
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
  assert.equal(sanitizeRoadmapYaml('- id: a\n  evil: !!js/function "x"\n'), null);
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

test('the bundled lessons satisfy the publish rules', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../data/lessons/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.md'));
  assert.ok(files.length > 0);
  for (const file of files) assert.deepEqual(lessonProblems(readFileSync(new URL(file, dir), 'utf8')), [], file);
});
