/** Returns the url only when it is an absolute http(s) link; roadmap yaml is untrusted, so `javascript:` and similar are dropped. */
export function safeExternalUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
