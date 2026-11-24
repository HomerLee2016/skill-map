import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeStarQuestion, isStarOptions, normalizeQuestions, parseStarQuestion, parseTestYaml, serializeTest, validateTest,
} from './testYaml';

const STAR_YAML = `quiz_title: "1日目のテスト"
questions:
  - question_number: 1
    question: "折り紙を図（ ）折りましょう。"
    options: ["っぽく", "みたい", "らしく", "のように"]
    correct_answer: "のように"
    explanation: "正解: 図のように"
    audio_track_url: "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ja&q=%E6%8A%98"
  - question_number: 6
    question: |
      ここで ____ ____ ★ ____ されています。

      1: 多くの国に
      2: 車は
      3: 輸出
      4: 作られた
    options: ["1", "2", "3", "4"]
    correct_answer: 1
`;

test('the JLPT star example from the guide parses and validates', () => {
  const parsed = parseTestYaml(STAR_YAML);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.title, '1日目のテスト');
  assert.deepEqual(parsed.questions.map((q) => q.question_number), [1, 2]);
  assert.equal(parsed.questions[1].correct_answer, '1', 'a bare number is read as the option text "1"');
  assert.ok(isStarOptions(parsed.questions[1].options));
  assert.deepEqual(validateTest(parsed.title, parsed.questions), { errors: [], warnings: [] });
});

test('a star question keeps its multi-line block when written back as YAML', () => {
  const parsed = parseTestYaml(STAR_YAML);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const yaml = serializeTest(parsed.title, parsed.questions);
  assert.match(yaml, /question: \|-?\n\s+ここで/);
  const again = parseTestYaml(yaml);
  assert.ok(again.ok && again.questions[1].question === parsed.questions[1].question);
});

test('star questions split into sentence and four choices and back', () => {
  const split = parseStarQuestion('ここで ____ ____ ★ ____ されています。\n\n1: 多くの国に\n2: 車は\n3: 輸出\n4: 作られた');
  assert.deepEqual(split, { sentence: 'ここで ____ ____ ★ ____ されています。', choices: ['多くの国に', '車は', '輸出', '作られた'] });
  assert.equal(composeStarQuestion(split!.sentence, split!.choices), 'ここで ____ ____ ★ ____ されています。\n\n1: 多くの国に\n2: 車は\n3: 輸出\n4: 作られた');
  assert.equal(parseStarQuestion('only a sentence'), null);
});

test('problems are reported per question and block saving', () => {
  const { errors, warnings } = validateTest('', [
    { question_number: 1, question: '', options: ['a', 'a', ''], correct_answer: 'z' },
    { question_number: 2, question: 'q', options: ['1', '2', '3', '4'], correct_answer: '9' },
    { question_number: 3, question: 'q', options: ['a', 'b', 'c'], correct_answer: 'a', audio_track_url: 'http://x' },
  ]);
  assert.ok(errors.includes('The test needs a title (quiz_title).'));
  assert.ok(errors.includes('Question 1: the question is empty.'));
  assert.ok(errors.includes('Question 1: every option needs text.'));
  assert.ok(errors.includes('Question 1: two options are the same.'));
  assert.ok(errors.includes('Question 1: the correct answer must be one of the options.'));
  assert.ok(errors.some((e) => e.startsWith('Question 2: a star question needs')));
  assert.ok(warnings.some((w) => w.startsWith('Question 3: the guides use exactly 4 options')));
  assert.ok(warnings.some((w) => w.startsWith('Question 3: the audio link')));
});

test('bad YAML and wrong shapes give a readable error', () => {
  assert.equal(parseTestYaml('quiz_title: [').ok, false);
  assert.equal(parseTestYaml('- just a list').ok, false);
  const noList = parseTestYaml('quiz_title: x\nquestions: nope');
  assert.deepEqual(noList.ok ? [] : noList.errors, ['"questions:" must be a list.']);
});

test('unknown keys are dropped with a warning and questions are renumbered', () => {
  const parsed = parseTestYaml('quiz_title: t\nquestions:\n  - question_number: 7\n    type: fill\n    question: q\n    options: [a, b, c, d]\n    correct_answer: a\n');
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.questions[0].question_number, 1);
  assert.deepEqual(parsed.warnings, ['Question 1: the key "type" is not part of the format and is dropped.']);
  assert.deepEqual(normalizeQuestions(parsed.questions), parsed.questions);
});
