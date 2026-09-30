import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readRecords } from './records.ts';

function fixture(run: (path: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'smol-viewer-'));
  try { run(join(dir, 'records.sqlite3')); } finally { rmSync(dir, { recursive: true }); }
}

test('reads records without changing the database', () => fixture(path => {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL('../../skills/smol-factory/assets/foundation/records.schema.sql', import.meta.url), 'utf8'));
  const record = { schemaVersion: 1, repository: { githubHost: 'github.com', name: 'example/repo' }, item: { kind: 'issue', number: 1 } };
  db.prepare('INSERT INTO item_records VALUES (?, ?, ?, ?, ?, ?)').run('github.com', 'example/repo', 'issue', 1, 1, JSON.stringify(record));
  db.close();
  const before = readFileSync(path);
  assert.deepEqual(readRecords(path), [record]);
  assert.deepEqual(readFileSync(path), before);
}));

test('does not create a missing database', () => fixture(path => {
  assert.throws(() => readRecords(path));
  assert.equal(existsSync(path), false);
}));

test('rejects unknown database versions', () => fixture(path => {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA user_version = 2');
  db.close();
  assert.throws(() => readRecords(path), /version/);
}));

test('rejects inconsistent stored identities', () => fixture(path => {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE item_records (github_host, repository, kind, number, revision, payload); PRAGMA user_version = 1;');
  db.prepare('INSERT INTO item_records VALUES (?, ?, ?, ?, ?, ?)').run('github.com', 'example/repo', 'issue', 1, 1, '{}');
  db.close();
  assert.throws(() => readRecords(path), /identity/);
}));
