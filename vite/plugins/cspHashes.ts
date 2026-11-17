import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const PLACEHOLDER = '__INLINE_SCRIPT_HASHES__';

// The single-file build inlines the app script into index.html, so the Content-Security-Policy cannot simply say
// "no inline scripts". Instead of 'unsafe-inline', the build lists the sha256 of each inline script in dist/_headers:
// only those exact scripts run, and injected markup cannot add its own.
export function cspHashesPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'csp-script-hashes',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    closeBundle: {
      order: 'post',
      handler() {
        const dist = join(config.root, config.build.outDir);
        const headersPath = join(dist, '_headers');
        const htmlPath = join(dist, 'index.html');
        if (!existsSync(headersPath) || !existsSync(htmlPath)) return;
        const html = readFileSync(htmlPath, 'utf8');
        const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
          .filter((match) => match[1].length > 0)
          .map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
        const headers = readFileSync(headersPath, 'utf8');
        if (!headers.includes(PLACEHOLDER)) throw new Error(`public/_headers must contain ${PLACEHOLDER} in script-src`);
        writeFileSync(headersPath, headers.replace(PLACEHOLDER, hashes.join(' ')));
      },
    },
  };
}
