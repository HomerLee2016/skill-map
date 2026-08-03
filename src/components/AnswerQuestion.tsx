// src/components/AnswerQuestion.tsx
import React, { useMemo } from 'react';

interface Question {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
  displayQuestionNumber?: number;
  explanation?: string | null;
}

interface Props {
  q: Question;
  answers: Record<number, string>;
  correctMap: Record<number, boolean>;
  handleAnswerSelect: (question: any, selectedOption: string) => void;
  onNextQuestion?: () => void;
  showNextButton?: boolean;
  autoAdvanceOnCorrect?: boolean;
  onAutoAdvanceChange?: (value: boolean) => void;
  showAutoAdvanceToggle?: boolean;
}

export function shouldAutoAdvanceOnCorrect({
  hasAnswered,
  isCorrectAnswer,
  autoAdvanceOnCorrect,
}: {
  hasAnswered: boolean;
  isCorrectAnswer: boolean;
  autoAdvanceOnCorrect?: boolean;
}) {
  return hasAnswered && isCorrectAnswer && !!autoAdvanceOnCorrect;
}

export function shouldShowNextButton({
  hasAnswered,
  isCorrectAnswer,
  autoAdvanceOnCorrect,
  showNextButton,
}: {
  hasAnswered: boolean;
  isCorrectAnswer: boolean;
  autoAdvanceOnCorrect?: boolean;
  showNextButton?: boolean;
}) {
  return !!hasAnswered && !!showNextButton && (!isCorrectAnswer || !autoAdvanceOnCorrect);
}

export function shouldShowAutoAdvanceToggle(showAutoAdvanceToggle?: boolean) {
  return showAutoAdvanceToggle !== false;
}

// Fisher-Yates shuffle returning a new array
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const AnswerQuestion: React.FC<Props> = ({
  q,
  answers,
  correctMap,
  handleAnswerSelect,
  onNextQuestion,
  showNextButton,
  autoAdvanceOnCorrect,
  onAutoAdvanceChange,
  showAutoAdvanceToggle,
}) => {
  // Shuffle once per question instance, and recompute when the question content changes.
  const shuffledOptions = useMemo(() => shuffleArray(q.options), [q.question, q.correct_answer, q.options.join('\u0000')]);
  const hasAnswered = !!answers[q.question_number];
  const isCorrectAnswer = hasAnswered && correctMap[q.question_number];
  const shouldShowManualNext = shouldShowNextButton({
    hasAnswered,
    isCorrectAnswer,
    autoAdvanceOnCorrect,
    showNextButton,
  });
  const showToggle = shouldShowAutoAdvanceToggle(showAutoAdvanceToggle);

  return (
    <div className="test-question">
      <div className="test-question__legend">
        <span className="test-question__prompt">{q.question}</span>
      </div>
      {shuffledOptions.map((opt) => {
        const chosen = answers[q.question_number] === opt;
        const isCorrect = correctMap[q.question_number];
        let className = 'option-box';
        if (chosen) {
          className += isCorrect ? ' correct' : ' incorrect';
        } else if (answers[q.question_number] && opt === q.correct_answer) {
          className += ' correct';
        }
        const disabled = !!answers[q.question_number];
        return (
          <div
            key={opt}
            className={className}
            onClick={() => !disabled && handleAnswerSelect(q, opt)}
            role="button"
          >
            <span>{opt}</span>
          </div>
        );
      })}
      {hasAnswered && q.explanation && (
        <div className="test-question__explanation">
          <div className="test-question__explanation-title">Explanation:</div>
          <div className="test-question__explanation-body">{q.explanation}</div>
        </div>
      )}
      <div className="test-question__footer">
        {showToggle && (
          <label className="toggle-switch test-question__toggle">
            <span className="test-question__toggle-label">Auto-next on correct</span>
            <span className={`toggle-track ${autoAdvanceOnCorrect ? 'toggle-track--on' : ''}`} aria-hidden="true">
              <span className="toggle-knob" />
            </span>
            <input
              type="checkbox"
              checked={!!autoAdvanceOnCorrect}
              onChange={(event) => onAutoAdvanceChange?.(event.target.checked)}
              className="toggle-input"
            />
          </label>
        )}
        {hasAnswered && shouldShowManualNext && onNextQuestion && (
          <button type="button" className="toolbar-btn test-question__next-button" onClick={onNextQuestion}>
            Next Question
          </button>
        )}
      </div>
    </div>
  );
};

export default AnswerQuestion;
