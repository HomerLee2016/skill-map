import React from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

interface LessonMarkdownProps {
  content: string;
}

function AudioComponent(props: React.ComponentProps<'audio'>) {
  const src = typeof props.src === 'string' && props.src.includes('translate.google.com/translate_tts')
    ? `/api/audio-proxy?url=${encodeURIComponent(props.src)}`
    : props.src;

  return <audio {...props} src={src} preload="metadata" />;
}

export function LessonMarkdown({ content }: LessonMarkdownProps) {
  return (
    <Markdown
      rehypePlugins={[rehypeRaw]}
      components={{
        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        audio: AudioComponent,
      }}
    >
      {content}
    </Markdown>
  );
}
