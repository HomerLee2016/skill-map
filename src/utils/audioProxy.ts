import { toProxiedAudioUrl } from './audioUrl';

/** Proxied url for allowed audio; anything else is returned unchanged (relative/blob urls of local files). Lessons use the stricter toProxiedAudioUrl. */
export function getAudioSource(src: string | undefined) {
  if (typeof src !== 'string') return src;
  return toProxiedAudioUrl(src) ?? src;
}
