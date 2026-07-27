import type Database from 'better-sqlite3';

export async function applyRevisionColumnsMigration(sqlite?: Database.Database) {
  const db = sqlite;

  if (!db) {
    return;
  }

  const tableInfo = db.prepare("PRAGMA table_info(completed_questions)").all() as Array<{ name: string }>;
  const hasLastTime = tableInfo.some((column) => column.name === 'last_time');
  const hasNextRevisionTime = tableInfo.some((column) => column.name === 'next_revision_time');

  if (!hasLastTime) {
    db.exec("ALTER TABLE completed_questions ADD COLUMN last_time TEXT NOT NULL DEFAULT (datetime('now'))");
  }

  if (!hasNextRevisionTime) {
    db.exec("ALTER TABLE completed_questions ADD COLUMN next_revision_time TEXT");
  }

  db.exec("UPDATE completed_questions SET next_revision_time = COALESCE(next_revision_time, last_time)");
}
