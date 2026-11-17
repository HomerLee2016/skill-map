import assert from 'node:assert/strict';
import React from 'react';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonMarkdown } from './lessonMarkdown';

const render = (content: string) => renderToStaticMarkup(React.createElement(LessonMarkdown, { content }));

test('renders Markdown, and drops audio that is not text-to-speech', () => {
  const markup = render('# Hello\n\n<audio controls src="https://example.com/audio.mp3"></audio>');
  assert.match(markup, /<h1>Hello<\/h1>/);
  assert.doesNotMatch(markup, /<audio|example\.com/);
});

test('raw HTML, images, scripts and script links never reach the page', () => {
  const markup = render([
    '<script>alert(1)</script>', '<img src=x onerror=alert(2)>', '![pic](https://x.example/y.png)', '<iframe src="https://evil.example"></iframe>',
    '<video src="https://x.example/v.mp4"></video>', '<a href="javascript:alert(3)">js</a>', '[d](data:text/html,x)', '[e](&#106;avascript:alert(4))',
    '<div style="position:fixed" onclick="x()">styled</div>', '<form action="https://evil.example"><input name=p></form>',
  ].join('\n\n'));
  assert.doesNotMatch(markup, /<script|<img|<iframe|<video|<form|<input|onerror|onclick|javascript:|data:text|style=|evil\.example|x\.example/i);
});

test('external links open safely: http(s) only, noopener noreferrer', () => {
  const markup = render('[ok](https://example.com) [mail](mailto:a@b.c)');
  assert.match(markup, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer nofollow">ok<\/a>/);
  assert.doesNotMatch(markup, /mailto:/);
});

test('rewrites google translate audio URLs to the local proxy route', () => {
  const markup = renderToStaticMarkup(
    React.createElement(LessonMarkdown, { content: '<audio controls src="https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=Hola"></audio>' })
  );

  assert.match(markup, /src="\/api\/audio-proxy\?url=https%3A%2F%2Ftranslate\.google\.com%2Ftranslate_tts%3Fie%3DUTF-8%26client%3Dtw-ob%26tl%3Des%26q%3DHola"/);
});
