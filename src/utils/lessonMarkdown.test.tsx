import assert from 'node:assert/strict';
import React from 'react';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonMarkdown } from './lessonMarkdown';

test('renders embedded HTML tags in lesson markdown', () => {
  const markup = renderToStaticMarkup(
    React.createElement(LessonMarkdown, { content: '# Hello\n\n<audio controls src="https://example.com/audio.mp3"></audio>' })
  );

  assert.match(markup, /<audio[^>]*controls[^>]*src="https:\/\/example\.com\/audio\.mp3"/);
});

test('rewrites google translate audio URLs to the local proxy route', () => {
  const markup = renderToStaticMarkup(
    React.createElement(LessonMarkdown, { content: '<audio controls src="https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=Hola"></audio>' })
  );

  assert.match(markup, /src="\/api\/audio-proxy\?url=https%3A%2F%2Ftranslate\.google\.com%2Ftranslate_tts%3Fie%3DUTF-8%26client%3Dtw-ob%26tl%3Des%26q%3DHola"/);
});
