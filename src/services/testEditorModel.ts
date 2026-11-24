import { composeStarQuestion, isStarOptions, parseStarQuestion, STAR_OPTIONS } from './testYaml';
import type { TestQuestion } from './workspaceTypes';

/** What the form-style (UI mode) editor holds for one question: plain fields instead of YAML. */
export interface UiQuestion {
  key: string;
  /** `star` = JLPT star: a sentence with ____ ★ blanks and four numbered choices inside the question text. */
  kind: 'standard' | 'star';
  question: string;
  options: string[];
  /** Index of the correct option, -1 when none is picked yet. */
  correct: number;
  sentence: string;
  choices: string[];
  explanation: string;
  audio: string;
}

let counter = 0;
const nextKey = () => `q${(counter += 1)}`;

export function newUiQuestion(kind: UiQuestion['kind'] = 'standard'): UiQuestion {
  return { key: nextKey(), kind, question: '', options: ['', '', '', ''], correct: -1, sentence: '', choices: ['', '', '', ''], explanation: '', audio: '' };
}

export function toUiQuestion(question: TestQuestion): UiQuestion {
  const base = newUiQuestion();
  const common = { ...base, explanation: question.explanation ?? '', audio: question.audio_track_url ?? '' };
  const split = isStarOptions(question.options) ? parseStarQuestion(question.question) : null;
  if (split) {
    return { ...common, kind: 'star', sentence: split.sentence, choices: split.choices, correct: STAR_OPTIONS.indexOf(question.correct_answer) };
  }
  return { ...common, question: question.question, options: question.options.length ? [...question.options] : base.options, correct: question.options.indexOf(question.correct_answer) };
}

export function fromUiQuestion(ui: UiQuestion, index: number): TestQuestion {
  const star = ui.kind === 'star';
  const options = star ? [...STAR_OPTIONS] : ui.options.map((option) => option.trim());
  const question: TestQuestion = {
    question_number: index + 1,
    question: star ? composeStarQuestion(ui.sentence, ui.choices) : ui.question.replace(/\s+$/, ''),
    options,
    correct_answer: options[ui.correct] ?? '',
  };
  if (ui.explanation.trim()) question.explanation = ui.explanation.trim();
  if (ui.audio.trim()) question.audio_track_url = ui.audio.trim();
  return question;
}

export const toUiQuestions = (questions: TestQuestion[]): UiQuestion[] => questions.map(toUiQuestion);
export const fromUiQuestions = (questions: UiQuestion[]): TestQuestion[] => questions.map(fromUiQuestion);

/** Switching a question to the other kind keeps what was typed: the star choices become options and back where they fit. */
export function switchKind(ui: UiQuestion, kind: UiQuestion['kind']): UiQuestion {
  if (ui.kind === kind) return ui;
  if (kind === 'star') {
    const split = parseStarQuestion(ui.question);
    return { ...ui, kind, sentence: split?.sentence ?? ui.question, choices: split?.choices ?? ['', '', '', ''], correct: Math.min(ui.correct, 3) };
  }
  return { ...ui, kind, question: composeStarQuestion(ui.sentence, ui.choices), options: ['', '', '', ''], correct: -1 };
}
