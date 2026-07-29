import React from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { getAudioSource } from './audioProxy';

interface LessonMarkdownProps {
  content: string;
}

function AudioComponent(props: React.ComponentProps<'audio'>) {
  const src = getAudioSource(props.src);

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
