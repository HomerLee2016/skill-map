import React from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { toProxiedAudioUrl } from './audioUrl';

interface LessonMarkdownProps {
  content: string;
}

// Lessons are Markdown. The only raw HTML that survives is <audio controls src=...>, and its source must be the
// allow-listed text-to-speech url (see audioUrl.ts). No images, media files, frames, forms or inline styles.
const FORBIDDEN_TAGS = new Set(['img', 'picture', 'video', 'source', 'track', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'style', 'link', 'meta', 'base']);

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []).filter((tag) => !FORBIDDEN_TAGS.has(tag)), 'audio'],
  attributes: {
    ...defaultSchema.attributes,
    audio: ['src', 'controls', 'loop', 'preload'],
  },
  // Links may only be http(s) (no javascript:, data:, vbscript:, mailto:); audio src is re-checked in AudioComponent.
  protocols: { ...defaultSchema.protocols, href: ['http', 'https'], src: ['https'] },
};

function AudioComponent({ node: _node, src, controls, loop }: React.ComponentProps<'audio'> & { node?: unknown }) {
  const proxied = toProxiedAudioUrl(src);
  if (!proxied) return <em className="lesson-audio-blocked">[audio removed: only text-to-speech audio is supported]</em>;
  return <audio src={proxied} controls={controls ?? true} loop={loop} preload="metadata" />;
}

export function LessonMarkdown({ content }: LessonMarkdownProps) {
  return (
    <Markdown
      rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
      components={{
        a: ({ node: _node, href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>,
        audio: AudioComponent,
      }}
    >
      {content}
    </Markdown>
  );
}
