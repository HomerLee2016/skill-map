import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonMarkdown } from './lessonMarkdown';

test('renders embedded HTML tags in lesson markdown', () => {
  const markup = renderToStaticMarkup(
    <LessonMarkdown content={'# Hello\n\n<audio controls src="https://example.com/audio.mp3"></audio>'} />
  );

  assert.match(markup, /<audio[^>]*controls[^>]*src="https:\/\/example\.com\/audio\.mp3"/);
});
