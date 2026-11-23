# Architecture note

## Shape

```
Browser (React + TipTap) ──fetch/JSON──▶ Express API ──▶ SQLite (node:sqlite)
                                        └─ serves built SPA in production
```

There is one Node process and one deployable unit. In development, Vite runs as Express middleware, so `npm run dev` is the only command needed.

## What I prioritized and why

The brief asks for depth over breadth, so I picked the places where a document product breaks trust and made those solid.

1. **Never lose or silently overwrite someone's work.** Autosave is debounced, with retry on network failure. There is a save-status indicator and a warning before you close a tab with unsaved changes. Every save is a compare-and-swap on a `version` column: `UPDATE … WHERE id = ? AND version = ?`. A stale write returns **409** carrying the current document, and the UI lets the user choose which version to keep. Optimistic concurrency was a cheap way to make sharing safe without building real-time sync.
2. **Access control on the server.** All permission checks go through one function, `loadDoc(req, minRole)`, with the ranking owner > editor > viewer. A user with no access gets **404**, not 403, so document IDs don't leak. Most of the tests cover this logic.
3. **Safe stored content.** HTML is sanitized against an allow-list of exactly the nodes the editor supports. This runs on every save and every import, so a client that bypasses the editor can't store a script.
4. **An import that produces real documents.** Imports keep headings, lists and bold/italic from Markdown and Word files, instead of dumping plain text.

## Key decisions

| Decision | Why | Trade-off |
|---|---|---|
| **TipTap (ProseMirror)** editor | Mature schema-based editor with formatting commands, keyboard shortcuts, undo history and paste handling built in | ~215 KB gzipped bundle |
| **Store HTML**, not ProseMirror JSON | Imports produce HTML natively (mammoth, marked), it is easy to sanitize and inspect, and the editor parses it losslessly for the supported node set | Schema changes need care; JSON would be stricter |
| **SQLite via built-in `node:sqlite`** | Zero setup for reviewers and no native build step. The relational model suits users / documents / shares | Single writer; free hosting has an ephemeral disk. All SQL is in `app.js`, so moving to Postgres is mechanical |
| **Mocked auth** (pick a seeded user, httpOnly session cookie) | Sharing needs identities, not passwords. Real sessions keep the rest of the app honest | Anyone can sign in as any demo user. SSO would replace only `/api/auth/login` |
| **Share by email to existing users** | Clear intent and easy to demo | No invitations for people without an account |
| **Polling (4 s) + optimistic locking** instead of CRDT/WebSockets | Gives a "collaborative" feel and correctness in a fraction of the time | Not character-level live co-editing; simultaneous edits produce a conflict prompt rather than a merge |
| **Import creates a new document** (instead of attaching to or merging into one) | It is the clearest product story ("bring my existing doc in") and has the fewest edge cases | No attachments; no "import into this doc" |

## Data model

```
users(id, email, name, color)
sessions(token, user_id)
documents(id uuid, owner_id, title, content html, version, created_at, updated_at, updated_by)
document_shares(document_id, user_id, role ∈ {viewer, editor})   PK(document_id, user_id)
```

Ownership is a column, not a share row, so a document always has exactly one owner. Deleting a document cascades to its shares.

## Intentionally deprioritized

- Real-time co-editing (Yjs/CRDT), cursors and presence
- Comments, suggestion mode, version history
- Images, tables, links UI, fonts/colours, page layout, printing/export
- Real authentication, invitations, transferring ownership, link sharing
- Folders, search, pagination of the documents list

## Next 2–4 hours

1. **Version history:** a `document_versions` row on each save (or each N minutes), with a "restore" button. The `version` column already exists.
2. **Export to Markdown/PDF** (turndown for Markdown; print stylesheet for PDF).
3. **Durable hosted DB:** swap SQLite for hosted Postgres (Neon/Supabase free tier) so the live demo survives restarts.
4. **Frontend tests** for the autosave/conflict state machine (Vitest + Testing Library), plus a committed Playwright smoke test in CI.
5. Upgrade the polling to SSE so updates arrive instantly, and show "Bob is viewing" presence.
