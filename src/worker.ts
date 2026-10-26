// Cloudflare Worker entry. Serves GET /api/audio-proxy in production; the
// static site in dist/ is served by the assets binding (see wrangler.jsonc).
// Mirrors vite/plugins/audioProxy.ts, restricted to Google Translate TTS.

const ROUTE = '/api/audio-proxy';
const ALLOWED_HOST = 'translate.google.com';
const ALLOWED_PATH = '/translate_tts';
const MAX_URL_LENGTH = 600;

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export function isAllowedAudioUrl(remoteUrl: string): boolean {
  if (remoteUrl.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(remoteUrl);
    return url.protocol === 'https:' && url.hostname === ALLOWED_HOST && url.pathname === ALLOWED_PATH;
  } catch {
    return false;
  }
}

export async function handleAudioProxy(request: Request, fetchRemote: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  }

  const remoteUrl = new URL(request.url).searchParams.get('url');
  if (!remoteUrl) {
    return new Response('Missing audio url', { status: 400 });
  }
  if (!isAllowedAudioUrl(remoteUrl)) {
    return new Response('Audio url not allowed', { status: 403 });
  }

  try {
    const response = await fetchRemote(remoteUrl, { redirect: 'manual' });
    if (!response.ok) {
      return new Response('Audio upstream error', { status: response.status >= 400 && response.status < 600 ? response.status : 502 });
    }
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    if (!contentType.toLowerCase().startsWith('audio/')) {
      return new Response('Unexpected upstream content type', { status: 502 });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Audio proxy failed', { status: 500 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === ROUTE) {
      return handleAudioProxy(request);
    }
    return env.ASSETS.fetch(request);
  },
};
