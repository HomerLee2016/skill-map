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
  slidingWindow?: boolean;
}

interface VisibleQuestionTrackerItemsArgs {
  totalQuestions: number;
  currentIndex?: number;
  limit?: number;
  questionNumbers?: number[];
  slidingWindow?: boolean;
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

export function getVisibleQuestionTrackerItems({
  totalQuestions,
  currentIndex,
  limit,
  questionNumbers,
  slidingWindow = false,
}: VisibleQuestionTrackerItemsArgs) {
  const questionCount = Math.max(totalQuestions, 0);

  if (slidingWindow) {
    const effectiveLimit = typeof limit === 'number' ? limit : 15;
    const reachedCount = Math.min(Math.max((currentIndex ?? 0) + 1, 0), questionCount);
    const visibleCount = Math.min(reachedCount, effectiveLimit);
    const startIndex = Math.max(reachedCount - visibleCount, 0);

    return Array.from({ length: visibleCount }, (_, offset) => {
      const actualIndex = startIndex + offset;
      const questionNumber = questionNumbers?.[actualIndex] ?? actualIndex + 1;
      const status = getQuestionTrackerStatus(questionNumber, {}, {});
      const isCurrent = currentIndex === actualIndex;

      return {
        id: actualIndex,
        label: questionNumber,
        status,
        isCurrent,
      };
    });
  }

  const visibleCount = typeof limit === 'number' ? Math.min(questionCount, limit) : questionCount;
  const startIndex = Math.max(questionCount - visibleCount, 0);

  return Array.from({ length: visibleCount }, (_, offset) => {
    const actualIndex = startIndex + offset;
    const questionNumber = questionNumbers?.[actualIndex] ?? actualIndex + 1;
    const status = getQuestionTrackerStatus(questionNumber, {}, {});
    const isCurrent = currentIndex === actualIndex;

    return {
      id: actualIndex,
      label: questionNumber,
      status,
      isCurrent,
    };
  });
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
  slidingWindow = false,
}: QuestionTrackerProps) {
  const items = getVisibleQuestionTrackerItems({
    totalQuestions,
    currentIndex,
    limit,
    questionNumbers,
    slidingWindow,
  }).map((item) => ({
    ...item,
    status: getQuestionTrackerStatus(item.label, answers, correctMap),
  }));

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
