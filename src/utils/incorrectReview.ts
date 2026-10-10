export interface IncorrectReviewItem<TQuestion> {
  question: TQuestion;
  selectedAnswer: string;
}

export function buildIncorrectReviewQuestions<TQuestion extends {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string | null;
  displayQuestionNumber?: number;
}>(
  questions: TQuestion[],
  answers: Record<number, string>,
  correctMap: Record<number, boolean>,
): IncorrectReviewItem<TQuestion>[] {
  return questions
    .filter((question) => {
      const selectedAnswer = answers[question.question_number];
      if (!selectedAnswer) {
        return false;
      }

      const correctness = correctMap[question.question_number];
      if (typeof correctness === 'boolean') {
        return correctness === false;
      }

      return selectedAnswer !== question.correct_answer;
    })
    .map((question) => ({
      question,
      selectedAnswer: answers[question.question_number],
    }));
}
