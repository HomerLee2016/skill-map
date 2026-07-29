export interface CompletedQuestionRow {
  id?: number;
  questionName: string;
  options: string[];
  correctAnswer: string;
  lastTime: string;
  nextRevisionTime?: string | null;
  proficiency?: string | null;
  quizTitle: string;
}
