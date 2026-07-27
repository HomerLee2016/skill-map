// src/components/AnswerQuestion.tsx
import React, { useMemo } from 'react';

interface Question {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
}

interface Props {
  q: Question;
  answers: Record<number, string>;
  correctMap: Record<number, boolean>;
  handleAnswerSelect: (question: any, selectedOption: string) => void;
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

const AnswerQuestion: React.FC<Props> = ({ q, answers, correctMap, handleAnswerSelect }) => {
  // Shuffle once per question instance
  const shuffledOptions = useMemo(() => shuffleArray(q.options), [q.question_number]);

  return (
    <fieldset className="test-question">
      <legend>{q.question_number}. {q.question}</legend>
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
    </fieldset>
  );
};

export default AnswerQuestion;
