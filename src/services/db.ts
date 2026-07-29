export {
  revisionStore as db,
  insertCompletedQuestion,
  getCompletedQuestionsByQuiz,
  getAllCompletedQuestions,
  getDueRevisionQuestions,
  exportRevisionData,
  importRevisionData,
  type CompletedQuestionRecord,
  type CompletedQuestionInsert,
} from '../utils/revision';
