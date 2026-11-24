import test from 'node:test';
import assert from 'node:assert/strict';
import { detectGuideLanguage, resolveGuide } from './promptGuideChoice';

const empty = { lessons: [], tests: [] };
const bundled = { japanese: 'JP', spanish: 'ES', generic: 'GEN' };

test('the workspace name picks the language', () => {
  assert.equal(detectGuideLanguage('jp-n3', empty), 'japanese');
  assert.equal(detectGuideLanguage('Japanese', empty), 'japanese');
  assert.equal(detectGuideLanguage('日本語', empty), 'japanese');
  assert.equal(detectGuideLanguage('spanish', empty), 'spanish');
  assert.equal(detectGuideLanguage('Español A1', empty), 'spanish');
  assert.equal(detectGuideLanguage('Calculus', empty), null);
});

test('without a telling name the audio language of lessons and tests decides', () => {
  const content = {
    lessons: [{ id: 'a', title: 'a', content: '<audio src="https://translate.google.com/translate_tts?tl=ja&q=x">' }],
    tests: [{ id: 't', title: 't', questions: [{ question_number: 1, question: 'q', options: [], correct_answer: '', audio_track_url: 'https://translate.google.com/translate_tts?tl=ja&q=y' }] }],
  };
  assert.equal(detectGuideLanguage('Default workspace', content), 'japanese');
  assert.equal(detectGuideLanguage('Default workspace', { lessons: [{ id: 'a', title: 'a', content: 'tl=es' }, { id: 'b', title: 'b', content: 'tl=ja' }], tests: [] }), null);
});

test('a guide saved in the workspace wins, then the language guide, then the general one', () => {
  assert.deepEqual(resolveGuide('jp', { ...empty, guide: 'MINE' }, bundled), { markdown: 'MINE', source: 'workspace', label: 'Saved for this workspace' });
  assert.equal(resolveGuide('jp', empty, bundled).markdown, 'JP');
  assert.equal(resolveGuide('spanish', { ...empty, guide: '  ' }, bundled).markdown, 'ES');
  assert.deepEqual([resolveGuide('x', empty, bundled).markdown, resolveGuide('x', empty, bundled).source], ['GEN', 'generic']);
});
