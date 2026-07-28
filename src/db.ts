// src/db.ts
// SQLite DB setup using better-sqlite3 and drizzle-orm
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { applyRevisionColumnsMigration } from './db/migrations/20260727-add-revision-columns';
import { DEFAULT_PROFICIENCY, getDowngradedProficiency, getNextProficiency, getNextRevisionTime, normalizeProficiency } from './utils/revision';

// Initialize the database (file will be created in the project root)
const sqlite = new Database('skill-map.db');
// Ensure the table exists for first run
sqlite.exec(`
CREATE TABLE IF NOT EXISTS completed_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_name TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  selected_answer TEXT,
  correct INTEGER,
  last_time TEXT NOT NULL DEFAULT (datetime('now')),
  next_revision_time TEXT,
  proficiency TEXT,
  quiz_title TEXT,
  hash TEXT NOT NULL UNIQUE
);
`);
export const db = drizzle(sqlite);

await applyRevisionColumnsMigration(sqlite);

sqlite.prepare(`
  UPDATE completed_questions
  SET proficiency = CASE
    WHEN trim(COALESCE(proficiency, '')) = '' THEN ?
    ELSE proficiency
  END
  WHERE proficiency IS NULL OR trim(COALESCE(proficiency, '')) = ''
`).run(DEFAULT_PROFICIENCY);

// Table to store completed test questions and question metadata
export const completed_questions = sqliteTable('completed_questions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  question_name: text('question_name').notNull(),
  options: text('options').notNull(), // JSON array of option strings
  correct_answer: text('correct_answer').notNull(),
  selected_answer: text('selected_answer'),
  correct: integer('correct'),
  last_time: text('last_time').notNull(), // ISO timestamp string
  next_revision_time: text('next_revision_time'),
  proficiency: text('proficiency'),
  quiz_title: text('quiz_title'),
  hash: text('hash').notNull().unique(),
});

// Example function to insert or update a completed question entry
export async function insertCompletedQuestion(entry: {
  question_name: string;
  options: string[];
  correct_answer: string;
  last_time: string; // ISO string
  proficiency?: string;
  quiz_title: string;
  selected_answer?: string;
  correct?: number;
  question_id?: number;
}) {
  const hash = createHash('sha256')
    .update(entry.question_name + JSON.stringify(entry.options))
    .digest('hex');

  const existing = entry.question_id != null
    ? await db
      .select()
      .from(completed_questions)
      .where(eq(completed_questions.id, entry.question_id))
      .get()
    : await db
      .select()
      .from(completed_questions)
      .where(eq(completed_questions.hash, hash))
      .get();

  const isCorrect = entry.correct === 1;
  const currentProficiency = normalizeProficiency(existing?.proficiency ?? entry.proficiency);
  const resolvedProficiency = normalizeProficiency(isCorrect ? getNextProficiency(currentProficiency) : getDowngradedProficiency(currentProficiency));
  const nextRevisionTime = getNextRevisionTime(entry.last_time, resolvedProficiency);

  if (existing) {
    await db
      .update(completed_questions)
      .set({
        selected_answer: entry.selected_answer ?? null,
        correct: entry.correct ?? 0,
        last_time: entry.last_time,
        next_revision_time: nextRevisionTime,
        proficiency: resolvedProficiency,
        quiz_title: entry.quiz_title,
      })
      .where(eq(completed_questions.id, existing.id))
      .run();
    return;
  }

  await db
    .insert(completed_questions)
    .values({
      question_name: entry.question_name,
      options: JSON.stringify(entry.options),
      correct_answer: entry.correct_answer,
      selected_answer: entry.selected_answer ?? null,
      correct: entry.correct ?? 0,
      last_time: entry.last_time,
      next_revision_time: nextRevisionTime,
      proficiency: resolvedProficiency,
      quiz_title: entry.quiz_title,
      hash,
    })
    .run();
}

// Example function to fetch all completed questions for a given quiz
export async function getCompletedQuestionsByQuiz(quizTitle: string) {
  return await db.select().from(completed_questions).where(eq(completed_questions.quiz_title, quizTitle)).all();
}

export async function getDueRevisionQuestions(now: string = new Date().toISOString()) {
  return await db
    .select()
    .from(completed_questions)
    .where(drizzleSql`${completed_questions.next_revision_time} <= ${now}`)
    .all();
}
