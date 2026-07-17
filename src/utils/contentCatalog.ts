import YAML from 'yaml';

export interface LessonItem {
  id: string;
  title: string;
  content: string;
}

export interface TestQuestion {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
}

export interface TestItem {
  id: string;
  title: string;
  questions: TestQuestion[];
}

const lessonModules = import.meta.glob('../data/lessons/*.md', { query: '?raw', eager: true });
const testModules = import.meta.glob('../data/tests/*.yaml', { query: '?raw', eager: true });

function rawContent(module: unknown): string {
  return typeof module === 'string' ? module : (module as { default: string }).default;
}

export function titleFromMarkdown(content: string, id: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || id.replace(/[-_]/g, ' ');
}

export const lessons: LessonItem[] = Object.entries(lessonModules)
  .map(([path, module]) => {
    const content = rawContent(module);
    const id = path.split('/').pop()?.replace('.md', '') || 'untitled';
    return { id, title: titleFromMarkdown(content, id), content };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

export const tests: TestItem[] = Object.entries(testModules)
  .map(([path, module]) => {
    const content = rawContent(module);
    const id = path.split('/').pop()?.replace('.yaml', '') || 'untitled';
    try {
      const parsed = YAML.parse(content) as {
        quiz_title?: string;
        questions?: TestQuestion[];
      };
      return {
        id,
        title: parsed.quiz_title || id.replace(/[-_]/g, ' '),
        questions: parsed.questions || [],
      };
    } catch {
      return { id, title: id.replace(/[-_]/g, ' '), questions: [] };
    }
  })
  .sort((a, b) => a.title.localeCompare(b.title));

export function getLessonById(id: string): LessonItem | undefined {
  return lessons.find((lesson) => lesson.id === id);
}

export function getTestById(id: string): TestItem | undefined {
  return tests.find((test) => test.id === id);
}
