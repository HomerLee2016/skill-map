import test from 'node:test';
import assert from 'node:assert/strict';
import { fromUiQuestion, newUiQuestion, switchKind, toUiQuestion } from './testEditorModel';
import { parseTestYaml, serializeTest, validateTest } from './testYaml';

test('a standard question round-trips between UI fields and the stored question', () => {
  const question = { question_number: 1, question: 'Line one\nLine two', options: ['a', 'b', 'c', 'd'], correct_answer: 'c', explanation: 'because' };
  const ui = toUiQuestion(question);
  assert.equal(ui.kind, 'standard');
  assert.equal(ui.correct, 2);
  assert.deepEqual(fromUiQuestion(ui, 0), question);
});

test('picking the correct option in UI mode stores its text, even after the option is retyped', () => {
  const ui = { ...newUiQuestion(), question: 'Q', options: ['x', 'y', 'z', 'w'], correct: 1 };
  assert.equal(fromUiQuestion(ui, 4).correct_answer, 'y');
  assert.equal(fromUiQuestion(ui, 4).question_number, 5);
  assert.equal(fromUiQuestion({ ...ui, options: ['x', 'Y2', 'z', 'w'] }, 0).correct_answer, 'Y2');
});

test('a JLPT star question opens as sentence + four choices and saves in the guide format', () => {
  const stored = {
    question_number: 6,
    question: 'ここで ____ ____ ★ ____ されています。\n\n1: 多くの国に\n2: 車は\n3: 輸出\n4: 作られた',
    options: ['1', '2', '3', '4'],
    correct_answer: '1',
  };
  const ui = toUiQuestion(stored);
  assert.equal(ui.kind, 'star');
  assert.deepEqual(ui.choices, ['多くの国に', '車は', '輸出', '作られた']);
  assert.equal(ui.correct, 0);
  assert.deepEqual(fromUiQuestion(ui, 5), stored);
  const yaml = serializeTest('テスト', [fromUiQuestion(ui, 0)]);
  const again = parseTestYaml(yaml);
  assert.ok(again.ok);
  assert.deepEqual(validateTest('テスト', again.ok ? again.questions : []).errors, []);
});

test('a question whose options are 1-4 but whose text has no choice lines stays a standard question', () => {
  assert.equal(toUiQuestion({ question_number: 1, question: 'plain', options: ['1', '2', '3', '4'], correct_answer: '2' }).kind, 'standard');
});

test('switching kind keeps the typed text', () => {
  const star = switchKind({ ...newUiQuestion(), question: 'S ★\n\n1: a\n2: b\n3: c\n4: d', options: ['p', 'q', 'r', 's'], correct: 2 }, 'star');
  assert.equal(star.sentence, 'S ★');
  assert.deepEqual(star.choices, ['a', 'b', 'c', 'd']);
  const back = switchKind(star, 'standard');
  assert.match(back.question, /^S ★\n\n1: a/);
});

test('an unfinished question reports its problems instead of being saved silently', () => {
  const { errors } = validateTest('T', [fromUiQuestion(newUiQuestion(), 0)]);
  assert.ok(errors.includes('Question 1: the question is empty.'));
  assert.ok(errors.includes('Question 1: every option needs text.'));
  assert.ok(errors.includes('Question 1: the correct answer must be one of the options.'));
});
