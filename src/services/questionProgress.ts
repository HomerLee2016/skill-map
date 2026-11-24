import { createQuestionHash } from './questionHash';
import type { TestQuestion } from './workspaceTypes';

export interface QuestionMove {
  from: { question_name: string; options: string[] };
  to: { question_name: string; options: string[]; correct_answer: string; explanation?: string; audio_track_url?: string };
}

/**
 * Questions that were edited in place: the old question at position N vanished and the new one at position N is not
 * an old question either. Their revision records (stars, next review) can follow them to the new text.
 * Position-based on purpose: it is the one signal that survives rewording, and a wrong guess only moves progress,
 * never deletes an answer.
 */
export function findEditedQuestions(before: TestQuestion[], after: TestQuestion[]): QuestionMove[] {
  const hash = (question: TestQuestion) => createQuestionHash(question.question, question.options);
  const oldHashes = new Set(before.map(hash));
  const newHashes = new Set(after.map(hash));
  const moves: QuestionMove[] = [];
  before.forEach((old, index) => {
    const next = after[index];
    if (!next || newHashes.has(hash(old)) || oldHashes.has(hash(next))) return;
    moves.push({
      from: { question_name: old.question, options: old.options },
      to: { question_name: next.question, options: next.options, correct_answer: next.correct_answer, explanation: next.explanation, audio_track_url: next.audio_track_url },
    });
  });
  return moves;
}
