import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL,
    color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    -- Incremented on every content save; used for optimistic concurrency.
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS document_shares (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (document_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
  CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
`;

export const SEED_USERS = [
  { email: 'alice@ajaia.test', name: 'Alice Chen', color: '#2563eb' },
  { email: 'bob@ajaia.test', name: 'Bob Okafor', color: '#16a34a' },
  { email: 'carol@ajaia.test', name: 'Carol Diaz', color: '#c026d3' },
];

const WELCOME_HTML = `
<h1>Welcome to Ajaia Docs</h1>
<p>This document is owned by <strong>Alice</strong> and shared with <strong>Bob</strong> as an <em>editor</em>.
Sign in as Bob in another browser window to see it under <u>Shared with me</u>.</p>
<h2>Things to try</h2>
<ul>
  <li>Format text with the toolbar or <strong>Ctrl/Cmd + B / I / U</strong></li>
  <li>Import a <code>.txt</code>, <code>.md</code> or <code>.docx</code> file from the documents list</li>
  <li>Share a document as <em>viewer</em> or <em>editor</em> from the Share button</li>
</ul>
<ol>
  <li>Changes save automatically.</li>
  <li>If two people edit at once, the second save is rejected rather than silently overwriting.</li>
</ol>
`.trim();

/**
 * Open (or create) the SQLite database, apply the schema and seed demo data
 * on first run. Pass ':memory:' for tests.
 */
export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n > 0) return;

  const insertUser = db.prepare('INSERT INTO users (email, name, color) VALUES (?, ?, ?)');
  const ids = SEED_USERS.map((u) => Number(insertUser.run(u.email, u.name, u.color).lastInsertRowid));
  const [alice, bob] = ids;

  const docId = randomUUID();
  db.prepare('INSERT INTO documents (id, owner_id, title, content, updated_by) VALUES (?, ?, ?, ?, ?)')
    .run(docId, alice, 'Welcome to Ajaia Docs', WELCOME_HTML, alice);
  db.prepare("INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, 'editor')")
    .run(docId, bob);
}
