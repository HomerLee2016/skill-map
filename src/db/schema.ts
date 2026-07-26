import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const completedQuestions = sqliteTable('completed_questions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionName: text('question_name').notNull(),
  options: text('options').notNull(), // JSON string representing the array of options
  correctAnswer: text('correct_answer').notNull(),
  lastTime: text('last_time').notNull(), // ISO 8601 string or timestamp
  proficiency: text('proficiency').notNull(),
  quizTitle: text('quiz_title').notNull(),
});

export type CompletedQuestion = typeof completedQuestions.$inferSelect;
export type NewCompletedQuestion = typeof completedQuestions.$inferInsert;
