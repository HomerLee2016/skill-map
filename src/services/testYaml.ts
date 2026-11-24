import YAML from 'yaml';
import type { TestQuestion } from './workspaceTypes';

/** The options of a JLPT star question: the numbered choices live inside the question text. */
export const STAR_OPTIONS = ['1', '2', '3', '4'];
const MAX_TEST_BYTES = 1_000_000;
const KNOWN_KEYS = new Set(['question_number', 'question', 'options', 'correct_answer', 'explanation', 'audio_track_url']);
const AUDIO_PREFIX = 'https://translate.google.com/translate_tts';

export interface TestProblems {
  /** Block saving. */
  errors: string[];
  /** Shown, but the test can still be saved. */
  warnings: string[];
}

export type ParsedTest =
  | { ok: true; title: string; questions: TestQuestion[]; warnings: string[] }
  | { ok: false; errors: string[] };

export function isStarOptions(options: string[]): boolean {
  return options.length === STAR_OPTIONS.length && options.every((option, index) => option === STAR_OPTIONS[index]);
}

const CHOICE_LINE = /^\s*([1-4])\s*[:：.．)）]\s*(.*)$/;

/** Splits a star question into its sentence and four choices; null when the text does not hold all four numbered lines. */
export function parseStarQuestion(question: string): { sentence: string; choices: string[] } | null {
  const lines = question.replace(/\r\n/g, '\n').split('\n');
  const choices: Record<string, string> = {};
  const sentenceLines: string[] = [];
  for (const line of lines) {
    const match = CHOICE_LINE.exec(line);
    if (match && !(match[1] in choices)) choices[match[1]] = match[2].trim();
    else sentenceLines.push(line);
  }
  if (!STAR_OPTIONS.every((number) => number in choices)) return null;
  return { sentence: sentenceLines.join('\n').trim(), choices: STAR_OPTIONS.map((number) => choices[number]) };
}

export function composeStarQuestion(sentence: string, choices: string[]): string {
  const list = STAR_OPTIONS.map((number, index) => `${number}: ${(choices[index] ?? '').trim()}`).join('\n');
  return `${sentence.trim()}\n\n${list}`;
}

function asText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/** Looks only at the shape; `validateTest` judges the content. */
export function parseTestYaml(text: string): ParsedTest {
  let parsed: unknown;
  try {
    parsed = YAML.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : 'invalid YAML';
    return { ok: false, errors: [`The YAML could not be read: ${reason}`] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['The YAML must start with "quiz_title:" and "questions:".'] };
  }
  const root = parsed as { quiz_title?: unknown; questions?: unknown };
  if (!Array.isArray(root.questions)) return { ok: false, errors: ['"questions:" must be a list.'] };
  const warnings: string[] = [];
  const questions = root.questions.map((raw, index): TestQuestion => {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    for (const key of Object.keys(item)) {
      if (!KNOWN_KEYS.has(key)) warnings.push(`Question ${index + 1}: the key "${key}" is not part of the format and is dropped.`);
    }
    const question: TestQuestion = {
      question_number: index + 1,
      question: asText(item.question).replace(/\s+$/, ''),
      options: Array.isArray(item.options) ? item.options.map(asText) : [],
      correct_answer: asText(item.correct_answer),
    };
    if (asText(item.explanation).trim()) question.explanation = asText(item.explanation).replace(/\s+$/, '');
    if (asText(item.audio_track_url).trim()) question.audio_track_url = asText(item.audio_track_url).trim();
    return question;
  });
  return { ok: true, title: asText(root.quiz_title).trim(), questions, warnings };
}

/** Rules from the prompt guides: four distinct options, an answer that is one of them, star choices inside the question. */
export function validateTest(title: string, questions: TestQuestion[]): TestProblems {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!title.trim()) errors.push('The test needs a title (quiz_title).');
  if (questions.length === 0) errors.push('Add at least one question.');
  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!question.question.trim()) errors.push(`${label}: the question is empty.`);
    const options = question.options;
    if (options.some((option) => !option.trim())) errors.push(`${label}: every option needs text.`);
    if (new Set(options).size !== options.length) errors.push(`${label}: two options are the same.`);
    if (options.length < 2) errors.push(`${label}: needs at least 2 options.`);
    else if (options.length !== 4) warnings.push(`${label}: the guides use exactly 4 options (this one has ${options.length}).`);
    if (!question.correct_answer || !options.includes(question.correct_answer)) errors.push(`${label}: the correct answer must be one of the options.`);
    if (isStarOptions(options) && !parseStarQuestion(question.question)) {
      errors.push(`${label}: a star question needs the lines "1: …" to "4: …" inside the question text.`);
    }
    if (question.audio_track_url && !question.audio_track_url.startsWith(AUDIO_PREFIX)) {
      warnings.push(`${label}: the audio link is not a Google Translate TTS link, so it may not play.`);
    }
  });
  if (new TextEncoder().encode(serializeTest(title, questions)).length > MAX_TEST_BYTES) {
    errors.push('This test is larger than 1 MB. Split it into two tests.');
  }
  return { errors, warnings };
}

/** The test as YAML in the guides' layout; multi-line text becomes `|` blocks so star questions stay readable. */
export function serializeTest(title: string, questions: TestQuestion[]): string {
  const ordered = questions.map((question, index) => {
    const out: Record<string, unknown> = {
      question_number: index + 1,
      question: question.question.replace(/\s+$/, ''),
      options: question.options,
      correct_answer: question.correct_answer,
    };
    if (question.explanation?.trim()) out.explanation = question.explanation.replace(/\s+$/, '');
    if (question.audio_track_url?.trim()) out.audio_track_url = question.audio_track_url.trim();
    return out;
  });
  return YAML.stringify({ quiz_title: title, questions: ordered }, { lineWidth: 0, blockQuote: 'literal' });
}

/** The same question, renumbered and trimmed: what is stored after an edit. */
export function normalizeQuestions(questions: TestQuestion[]): TestQuestion[] {
  const parsed = parseTestYaml(serializeTest('x', questions));
  return parsed.ok ? parsed.questions : questions;
}

export function emptyQuestion(): TestQuestion {
  return { question_number: 1, question: '', options: ['', '', '', ''], correct_answer: '' };
}

export function blankTestYaml(): string {
  return serializeTest('', [emptyQuestion()]);
}
