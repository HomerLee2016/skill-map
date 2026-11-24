import type { WorkspaceContent } from './workspaceTypes';

export type GuideLanguage = 'japanese' | 'spanish';

const NAME_HINTS: Array<[GuideLanguage, RegExp]> = [
  ['japanese', /japan|日本|jlpt|(^|[^a-z])jp([^a-z]|$)|nihongo|(^|[^a-z])n[1-5]([^a-z0-9]|$)/i],
  ['spanish', /spanish|español|espanol|(^|[^a-z])es([^a-z]|$)/i],
];

/** Which language a workspace teaches: its name first, else the text-to-speech language (`tl=ja` / `tl=es`) of its content. */
export function detectGuideLanguage(name: string, content: Pick<WorkspaceContent, 'lessons' | 'tests'>): GuideLanguage | null {
  for (const [language, pattern] of NAME_HINTS) if (pattern.test(name)) return language;
  const votes: Record<GuideLanguage, number> = { japanese: 0, spanish: 0 };
  const texts = [
    ...content.lessons.map((lesson) => lesson.content),
    ...content.tests.flatMap((test) => test.questions.map((question) => question.audio_track_url ?? '')),
  ];
  for (const text of texts) {
    votes.japanese += (text.match(/tl=ja\b/g) ?? []).length;
    votes.spanish += (text.match(/tl=es\b/g) ?? []).length;
  }
  if (votes.japanese === votes.spanish) return null;
  return votes.japanese > votes.spanish ? 'japanese' : 'spanish';
}

export interface ResolvedGuide {
  markdown: string;
  /** `workspace` = saved for this workspace; `bundled` = the app's guide for the detected language; `generic` = neither. */
  source: 'workspace' | 'bundled' | 'generic';
  label: string;
}

export function resolveGuide(
  workspaceName: string,
  content: Pick<WorkspaceContent, 'lessons' | 'tests' | 'guide'>,
  bundled: Record<GuideLanguage | 'generic', string>,
): ResolvedGuide {
  if (content.guide?.trim()) return { markdown: content.guide, source: 'workspace', label: 'Saved for this workspace' };
  const language = detectGuideLanguage(workspaceName, content);
  if (language) return { markdown: bundled[language], source: 'bundled', label: language === 'japanese' ? 'Japanese N3 guide' : 'Spanish guide' };
  return { markdown: bundled.generic, source: 'generic', label: 'General guide' };
}
