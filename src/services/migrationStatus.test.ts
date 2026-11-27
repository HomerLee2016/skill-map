import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMigrationReport, type MigrationRow } from './migrationStatus';

const row = (filename: string, logged: boolean, objects_ok: boolean | null): MigrationRow => ({ filename, logged, applied_at: logged ? '2026-11-27T00:00:00Z' : null, objects_ok });

test('classifies each script by log row and object check', () => {
  const report = buildMigrationReport(['a.sql', 'b.sql', 'c.sql', 'd.sql', 'e.sql'], [
    row('a.sql', true, true),
    row('b.sql', true, null),
    row('c.sql', true, false),
    row('e.sql', false, false),
  ]);
  assert.deepEqual(report.entries.map((e) => [e.filename, e.state]), [
    ['a.sql', 'verified'], ['b.sql', 'logged'], ['c.sql', 'broken'], ['d.sql', 'missing'], ['e.sql', 'missing'],
  ]);
  assert.equal(report.allApplied, false);
});

test('all applied when every script is verified or logged', () => {
  const report = buildMigrationReport(['a.sql', 'b.sql'], [row('a.sql', true, true), row('b.sql', true, null)]);
  assert.equal(report.allApplied, true);
});

test('reports scripts the database knows but this build does not', () => {
  const report = buildMigrationReport(['a.sql'], [row('a.sql', true, true), row('z.sql', true, null), row('y.sql', false, true)]);
  assert.deepEqual(report.unknownToApp, ['z.sql']);
  assert.equal(report.allApplied, true);
});
