// The one audio source the app accepts in lessons and tests: Google Translate TTS, played through /api/audio-proxy.
// Shared by the Worker, the dev proxy, the lesson renderer and the publish/clone validators so they cannot drift apart.

export const AUDIO_ROUTE = '/api/audio-proxy';
export const AUDIO_HOST = 'translate.google.com';
export const AUDIO_PATH = '/translate_tts';
export const MAX_AUDIO_URL_LENGTH = 600;

export function isAllowedAudioUrl(remoteUrl: string): boolean {
  if (typeof remoteUrl !== 'string' || remoteUrl.length > MAX_AUDIO_URL_LENGTH) return false;
  try {
    const url = new URL(remoteUrl);
    return url.protocol === 'https:' && url.hostname === AUDIO_HOST && url.pathname === AUDIO_PATH && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

/** The same-origin proxy URL for an allowed audio url; undefined for anything else. */
export function toProxiedAudioUrl(src: unknown): string | undefined {
  return typeof src === 'string' && isAllowedAudioUrl(src) ? `${AUDIO_ROUTE}?url=${encodeURIComponent(src)}` : undefined;
}
