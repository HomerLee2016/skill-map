import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

const sql = (strings: TemplateStringsArray, ...values: unknown[]) =>
  String.raw({ raw: strings }, ...values);

export const completedQuestions = sqliteTable('completed_questions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionName: text('question_name').notNull(),
  options: text('options').notNull(), // JSON string representing the array of options
  correctAnswer: text('correct_answer').notNull(),
  lastTime: text('last_time').default(sql`(datetime('now'))`).notNull(), // ISO 8601 string or timestamp
  nextRevisionTime: text('next_revision_time'),
  proficiency: text('proficiency').notNull(),
  quizTitle: text('quiz_title').notNull(),
});

export type CompletedQuestion = typeof completedQuestions.$inferSelect;
export type NewCompletedQuestion = typeof completedQuestions.$inferInsert;
