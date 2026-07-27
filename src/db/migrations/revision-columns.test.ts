import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { applyRevisionColumnsMigration } from './20260727-add-revision-columns';

test('applyRevisionColumnsMigration adds revision columns and backfills values', async () => {
  const sqlite = new Database(':memory:');

  sqlite.exec(`
    CREATE TABLE completed_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_name TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      last_time TEXT NOT NULL DEFAULT (datetime('now')),
      proficiency TEXT,
      quiz_title TEXT
    );

    INSERT INTO completed_questions (question_name, options, correct_answer, proficiency, quiz_title)
    VALUES
      ('Question 1', '["A"]', 'A', 'beginner', 'Quiz A'),
      ('Question 2', '["B"]', 'B', 'intermediate', 'Quiz B');
  `);

  await applyRevisionColumnsMigration(sqlite);

  const columns = sqlite.prepare('PRAGMA table_info(completed_questions)').all() as Array<{ name: string }>;
  const columnNames = columns.map((column) => column.name);

  assert.ok(columnNames.includes('last_time'));
  assert.ok(columnNames.includes('next_revision_time'));

  const rows = sqlite.prepare('SELECT last_time, next_revision_time FROM completed_questions ORDER BY id').all() as Array<{
    last_time: string;
    next_revision_time: string | null;
  }>;

  assert.deepEqual(
    rows.map((row) => ({ last_time: row.last_time, next_revision_time: row.next_revision_time })),
    [
      { last_time: rows[0].last_time, next_revision_time: rows[0].last_time },
      { last_time: rows[1].last_time, next_revision_time: rows[1].last_time },
    ]
  );
});
