import YAML from 'yaml';
import { isAllowedAudioUrl } from '../utils/audioUrl';

// Limits and rules for anything published to (or cloned from) the sharing hub. The database enforces the same
// limits in supabase/migrations/20261117000000_sharing_hub_hardening.sql; keep the two in step.

export const LIMITS = {
  /** Serialized size of one published snapshot (bytes). */
  totalBytes: 1_000_000,
  items: 500,
  id: 200,
  title: 500,
  lessonChars: 200_000,
  yamlChars: 200_000,
  questions: 2000,
  options: 20,
  text: 5000,
  folderDepth: 12,
  nodeDepth: 30,
  nodes: 2000,
} as const;

/** Control characters other than tab, newline and carriage return. */
export const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// --- lessons: Markdown only. The one raw HTML element allowed is <audio> with the text-to-speech url. ---

const AUDIO_OPEN = /<audio(?:\s+(?:controls|loop)(?:="")?|\s+preload="[a-z]+"|\s+type="audio\/[a-z0-9.+-]+"|\s+src="https:\/\/translate\.google\.com\/translate_tts\?[^"<>]*")*\s*>/gi;
const AUDIO_CLOSE = /<\/audio\s*>/gi;
const AUTOLINK = /<https?:\/\/[^\s<>]+>/gi;
const ANY_TAG = /<\s*\/?\s*[a-zA-Z!?][^<>]*>?/g;
const KEEP_OR_TAG = new RegExp(`(${AUDIO_OPEN.source})|(${AUDIO_CLOSE.source})|(${AUTOLINK.source})|(${ANY_TAG.source})`, 'gi');

const IMAGE = /!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g;
const BAD_LINK = /\]\(\s*<?\s*(?!https?:)[a-z][a-z0-9+.-]*:[^)]*\)/gi;
const ENTITY_LINK = /\]\([^)]*&#\w[^)]*\)/g;
const BAD_REF_DEF = /(^|\n)[ ]{0,3}\[[^\]\n]+\]:[ \t]*<?(?!https?:)[a-z][a-z0-9+.-]*:[^\n]*/gi;

function stripAllowedHtml(markdown: string): string {
  return markdown.replace(KEEP_OR_TAG, (match, audioOpen, audioClose, autolink) => (audioOpen || audioClose || autolink ? '' : match));
}

/** Why a lesson cannot be published (empty when it is plain Markdown plus allowed audio players). */
export function lessonProblems(markdown: string): string[] {
  const problems: string[] = [];
  if (markdown.length > LIMITS.lessonChars) problems.push(`is longer than ${LIMITS.lessonChars.toLocaleString('en')} characters`);
  if (new RegExp(CONTROL_CHARS.source).test(markdown)) problems.push('contains control characters');
  if (new RegExp(IMAGE.source).test(markdown) || /<\s*img\b/i.test(markdown)) problems.push('contains an image (images are not supported)');
  const rest = stripAllowedHtml(markdown);
  const tag = /<\s*\/?\s*([a-zA-Z!?][\w:-]*)/.exec(rest);
  if (tag) problems.push(`contains raw HTML (<${tag[1]}>): only Markdown and <audio controls src="https://translate.google.com/translate_tts?..."> are allowed`);
  if (new RegExp(BAD_LINK.source, 'i').test(markdown) || new RegExp(BAD_REF_DEF.source, 'i').test(markdown) || new RegExp(ENTITY_LINK.source).test(markdown)) {
    problems.push('contains a link that is not http(s)');
  }
  return problems;
}

/** Clone-time clean-up of an untrusted lesson: removes everything lessonProblems would reject. */
export function cleanLessonMarkdown(markdown: string): string {
  let current = markdown.replace(CONTROL_CHARS, '');
  for (let pass = 0; pass < 5; pass += 1) {
    const next = current
      .replace(KEEP_OR_TAG, (match, audioOpen, audioClose, autolink) => (audioOpen || audioClose || autolink ? match : ''))
      .replace(IMAGE, '')
      .replace(BAD_LINK, '](#)')
      .replace(ENTITY_LINK, '](#)')
      .replace(BAD_REF_DEF, '$1');
    if (next === current) break;
    current = next;
  }
  return current;
}

// --- roadmap / test YAML ---

/**
 * Parses untrusted YAML as plain data: core schema, no anchors, aliases, merge keys or custom tags (these are the
 * ways to build billion-laughs documents or smuggle typed values). Returns undefined when the text breaks a rule.
 */
export function parseUntrustedYaml(text: string): unknown | undefined {
  if (text.length > LIMITS.yamlChars) return undefined;
  try {
    const doc = YAML.parseDocument(text, { schema: 'core', merge: false, uniqueKeys: true, prettyErrors: false });
    if (doc.errors.length > 0 || doc.warnings.length > 0) return undefined;
    let forbidden = false;
    YAML.visit(doc, {
      Alias() { forbidden = true; return YAML.visit.BREAK; },
      Node(_key, node) {
        if (node.anchor || node.tag) { forbidden = true; return YAML.visit.BREAK; }
        return undefined;
      },
    });
    return forbidden ? undefined : doc.toJS({ maxAliasCount: 0 });
  } catch {
    return undefined;
  }
}

// --- audio on test questions ---

export function allowedAudioUrlOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && isAllowedAudioUrl(value) ? value : undefined;
}
