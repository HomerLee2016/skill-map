import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAudioProxy, isAllowedAudioUrl } from './worker';

const TTS = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=es&q=Hola';
const proxyRequest = (remote?: string, method = 'GET') =>
  new Request(`https://skill-map.example/api/audio-proxy${remote === undefined ? '' : `?url=${encodeURIComponent(remote)}`}`, { method });

test('allowlist accepts only Google Translate TTS over https', () => {
  assert.equal(isAllowedAudioUrl(TTS), true);
  assert.equal(isAllowedAudioUrl('http://translate.google.com/translate_tts?q=a'), false);
  assert.equal(isAllowedAudioUrl('https://translate.google.com/other?q=a'), false);
  assert.equal(isAllowedAudioUrl('https://evil.example/translate_tts'), false);
  assert.equal(isAllowedAudioUrl('https://translate.google.com.evil.example/translate_tts'), false);
  assert.equal(isAllowedAudioUrl('https://user@evil.example/translate_tts'), false);
  assert.equal(isAllowedAudioUrl('not a url'), false);
});

test('returns 400 when url is missing', async () => {
  const response = await handleAudioProxy(proxyRequest(), async () => assert.fail('must not fetch'));
  assert.equal(response.status, 400);
});

test('returns 403 and does not fetch for disallowed hosts', async () => {
  const response = await handleAudioProxy(proxyRequest('https://example.com/a.mp3'), async () => assert.fail('must not fetch'));
  assert.equal(response.status, 403);
});

test('rejects non-GET methods', async () => {
  const response = await handleAudioProxy(proxyRequest(TTS, 'POST'), async () => assert.fail('must not fetch'));
  assert.equal(response.status, 405);
});

test('passes through audio with content type and cache header', async () => {
  const response = await handleAudioProxy(proxyRequest(TTS), async (input) => {
    assert.equal(String(input), TTS);
    return new Response('abc', { headers: { 'content-type': 'audio/mpeg' } });
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(await response.text(), 'abc');
});

test('defaults content type to audio/mpeg', async () => {
  const response = await handleAudioProxy(proxyRequest(TTS), async () => new Response(new Uint8Array([1, 2, 3])));
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
});

test('forwards upstream error status', async () => {
  const response = await handleAudioProxy(proxyRequest(TTS), async () => new Response('nope', { status: 429 }));
  assert.equal(response.status, 429);
  assert.equal(await response.text(), 'nope');
});

test('returns 500 when the upstream fetch throws', async () => {
  const response = await handleAudioProxy(proxyRequest(TTS), async () => {
    throw new Error('boom');
  });
  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'boom');
});
