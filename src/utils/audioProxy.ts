export function getAudioSource(src: string | undefined) {
  if (typeof src !== 'string') {
    return src;
  }

  if (!src.includes('translate.google.com/translate_tts')) {
    return src;
  }

  return `/api/audio-proxy?url=${encodeURIComponent(src)}`;
}
