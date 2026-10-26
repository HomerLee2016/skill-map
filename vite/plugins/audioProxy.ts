import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { isAllowedAudioUrl } from '../../src/worker.ts';

const ROUTE = '/api/audio-proxy';

// Forwards GET /api/audio-proxy?url=<remote> to the remote URL so the browser
// can play audio that would otherwise be blocked by CORS. Dev and preview only.
async function handleAudioProxy(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.method !== 'GET') return next();

  const url = typeof req.url === 'string' ? req.url : '';
  const parsed = new URL(url, 'http://localhost');
  const remoteUrl = parsed.searchParams.get('url');

  if (!remoteUrl) {
    res.statusCode = 400;
    res.end('Missing audio url');
    return;
  }

  if (!isAllowedAudioUrl(remoteUrl)) {
    res.statusCode = 403;
    res.end('Audio url not allowed');
    return;
  }

  try {
    const response = await fetch(remoteUrl, { redirect: 'manual' });
    if (!response.ok) {
      res.statusCode = response.status;
      res.end(await response.text());
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.statusCode = 500;
    res.end((error instanceof Error && error.message) || 'Audio proxy failed');
  }
}

export function audioProxyPlugin(): Plugin {
  return {
    name: 'audio-proxy-plugin',
    configureServer(server) {
      server.middlewares.use(ROUTE, handleAudioProxy);
    },
    configurePreviewServer(server) {
      server.middlewares.use(ROUTE, handleAudioProxy);
    },
  };
}
