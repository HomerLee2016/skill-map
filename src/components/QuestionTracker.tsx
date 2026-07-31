export type QuestionTrackerStatus = 'correct' | 'incorrect' | 'unanswered';

interface QuestionTrackerProps {
  totalQuestions: number;
  answers: Record<number, string>;
  correctMap: Record<number, boolean>;
  onSelectQuestion?: (index: number) => void;
  currentIndex?: number;
  limit?: number;
  disabled?: boolean;
  questionNumbers?: number[];
}

export function getQuestionTrackerStatus(
  questionNumber: number,
  answers: Record<number, string>,
  correctMap: Record<number, boolean>,
): QuestionTrackerStatus {
  if (answers[questionNumber]) {
    return correctMap[questionNumber] ? 'correct' : 'incorrect';
  }

  return 'unanswered';
}

export function getFirstUnansweredQuestionIndex(
  totalQuestions: number,
  answers: Record<number, string>,
): number {
  for (let index = 0; index < totalQuestions; index += 1) {
    const questionNumber = index + 1;
    if (!answers[questionNumber]) {
      return index;
    }
  }

  return -1;
}

function QuestionTracker({
  totalQuestions,
  answers,
  correctMap,
  onSelectQuestion,
  currentIndex,
  limit,
  disabled = false,
  questionNumbers,
}: QuestionTrackerProps) {
  const questionCount = Math.max(totalQuestions, 0);
  const visibleCount = typeof limit === 'number' ? Math.min(questionCount, limit) : questionCount;
  const startIndex = Math.max(questionCount - visibleCount, 0);

  const items = Array.from({ length: visibleCount }, (_, offset) => {
    const actualIndex = startIndex + offset;
    const questionNumber = questionNumbers?.[actualIndex] ?? actualIndex + 1;
    const status = getQuestionTrackerStatus(questionNumber, answers, correctMap);
    const isCurrent = currentIndex === actualIndex;

    return {
      id: actualIndex,
      label: questionNumber,
      status,
      isCurrent,
    };
  });

  return (
    <div className="question-tracker" aria-label="Question progress tracker">
      {items.map((item) => {
        const classes = ['question-tracker__box', `question-tracker__box--${item.status}`];
        if (item.isCurrent) {
          classes.push('question-tracker__box--current');
        }

        return (
          <button
            key={item.id}
            type="button"
            className={classes.join(' ')}
            onClick={() => {
              if (!disabled && onSelectQuestion) {
                onSelectQuestion(item.id);
              }
            }}
            disabled={disabled}
            aria-label={`Question ${item.label}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export default QuestionTracker;
