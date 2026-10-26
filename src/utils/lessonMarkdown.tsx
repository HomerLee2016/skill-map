import React from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { getAudioSource } from './audioProxy';

interface LessonMarkdownProps {
  content: string;
}

// Raw HTML in lessons is allowed but sanitised; <audio> is added to the default allow-list.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'audio', 'source'],
  attributes: {
    ...defaultSchema.attributes,
    audio: ['src', 'controls', 'loop', 'preload'],
    source: ['src', 'type'],
  },
  protocols: { ...defaultSchema.protocols, src: ['http', 'https'] },
};

function AudioComponent(props: React.ComponentProps<'audio'>) {
  const src = getAudioSource(props.src);

  return <audio {...props} src={src} preload="metadata" />;
}

export function LessonMarkdown({ content }: LessonMarkdownProps) {
  return (
    <Markdown
      rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
      components={{
        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        audio: AudioComponent,
      }}
    >
      {content}
    </Markdown>
  );
}
