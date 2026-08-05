import test from 'node:test';
import assert from 'node:assert/strict';
import { getAudioSource } from './audioProxy';

test('rewrites Google TTS URLs to the local audio proxy endpoint', () => {
  const source = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=Seis Hola Amigo el Hotel Ciao. Que esta';
  const expected = '/api/audio-proxy?url=https%3A%2F%2Ftranslate.google.com%2Ftranslate_tts%3Fie%3DUTF-8%26client%3Dtw-ob%26tl%3Des%26q%3DSeis%20Hola%20Amigo%20el%20Hotel%20Ciao.%20Que%20esta';

  assert.equal(getAudioSource(source), expected);
});
