export {
  db,
  insertCompletedQuestion,
  getCompletedQuestionsByQuiz,
  getAllCompletedQuestions,
  getDueRevisionQuestions,
  exportRevisionData,
  importRevisionData,
  type CompletedQuestionRecord,
  type CompletedQuestionInsert,
} from './services/db';
