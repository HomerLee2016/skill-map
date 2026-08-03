import { useEffect, useMemo, useState } from 'react';
import QuestionTracker from './QuestionTracker';
import AnswerQuestion from './AnswerQuestion';
import { buildIncorrectReviewQuestions } from '../utils/revision';

interface ReviewQuestion {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string | null;
  displayQuestionNumber?: number;
}

interface IncorrectReviewScreenProps {
  questions: ReviewQuestion[];
  answers: Record<number, string>;
  correctMap: Record<number, boolean>;
  title?: string;
  subtitle?: string;
  onFinish?: () => void;
}

function IncorrectReviewScreen({
  questions,
  answers,
  correctMap,
  title = 'Review incorrect answers',
  subtitle = 'Go through the questions you missed.',
  onFinish,
}: IncorrectReviewScreenProps) {
  const reviewQuestions = useMemo<ReviewQuestion[]>(() => 
    buildIncorrectReviewQuestions(questions, answers, correctMap).map((item) => item.question),
    [questions, answers, correctMap],
  );

  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    setCurrentIdx(0);
  }, [reviewQuestions.length]);

  if (reviewQuestions.length === 0) {
    return (
      <div className="tests-score">
        <p>You did not miss any questions.</p>
        {onFinish && (
          <button type="button" className="toolbar-btn" onClick={onFinish}>
            Back to Test/Summary
          </button>
        )}
      </div>
    );
  }

  const currentQuestion = reviewQuestions[currentIdx] ?? reviewQuestions[0];

  if (!currentQuestion) {
    return (
      <div className="tests-score">
        <p>No incorrect questions.</p>
        {onFinish && (
          <button type="button" className="toolbar-btn" onClick={onFinish}>
            Close review
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="test-question-container">
      <div className="tests-header">
        <h1>{title}</h1>
        <p className="tests-meta">{subtitle}</p>
      </div>
      <QuestionTracker
        totalQuestions={reviewQuestions.length}
        answers={Object.fromEntries(reviewQuestions.map((question) => [question.question_number, answers[question.question_number]]))}
        correctMap={Object.fromEntries(reviewQuestions.map((question) => [question.question_number, false]))}
        currentIndex={currentIdx}
        limit={reviewQuestions.length}
        onSelectQuestion={(index) => setCurrentIdx(index)}
        questionNumbers={reviewQuestions.map((question) => question.displayQuestionNumber ?? question.question_number)}
      />
      <AnswerQuestion
        key={`${currentQuestion.question_number}-${currentQuestion.question}`}
        q={currentQuestion}
        answers={answers}
        correctMap={correctMap}
        handleAnswerSelect={() => undefined}
        showNextButton={false}
        autoAdvanceOnCorrect={false}
        showAutoAdvanceToggle={false}
      />
      <div className="test-question__footer" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="toolbar-btn" onClick={onFinish}>
          Finish review
        </button>
      </div>
    </div>
  );
}

export default IncorrectReviewScreen;
