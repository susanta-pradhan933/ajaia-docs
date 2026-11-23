# Ajaia Docs

A lightweight collaborative document editor: create, format, import and share documents in the browser.

**Live app:** _TODO: add deployed URL_ · **Walkthrough video:** see [`VIDEO_URL.txt`](VIDEO_URL.txt)

## Demo accounts

There are no passwords. Sign-in is mocked: click an account on the login screen.

| User | Email | Seeded state |
|---|---|---|
| Alice Chen | `alice@ajaia.test` | Owns "Welcome to Ajaia Docs" |
| Bob Okafor | `bob@ajaia.test` | Has **editor** access to Alice's welcome doc |
| Carol Diaz | `carol@ajaia.test` | Nothing shared yet, so you can test "no access" |

**To test sharing**, use two browser sessions, for example a normal window as Alice and a private/incognito window as Bob. Each window keeps its own session cookie.

## What works

- **Documents:** create, rename (click the title), edit, delete (owner only). Changes autosave about 0.8 s after you stop typing; <kbd>Ctrl/Cmd+S</kbd> saves immediately. The status in the header shows *Saving… / All changes saved*.
- **Rich text:** bold, italic, underline, strikethrough, headings H1–H3, bulleted and numbered lists, quotes, undo/redo. Keyboard shortcuts and Markdown-style shortcuts (`# `, `- `, `1. `) also work.
- **File import:** **.txt, .md and .docx** up to **5 MB** become a new editable document titled after the file. Other types are rejected with a clear message, both in the browser and on the server. Sample files are in [`samples/`](samples/).
- **Sharing:** the owner shares by email as **Can edit** or **Can view**, can change the role, and can revoke access. The documents list separates **My documents** and **Shared with me**, and shows the owner and your access level.
- **Access control is enforced on the server:**
  - Viewers can't save.
  - Only the owner can share or delete.
  - Users with no access get a 404, so document IDs don't leak.
- **Concurrent edits:** every save carries the version it was based on. A stale save is rejected (HTTP 409) instead of silently overwriting. The user then picks **Load their version** or **Overwrite with mine**.
- **Live-ish updates:** an open document polls every 4 s. If a collaborator saved and you have no unsaved edits, their changes load automatically. Role changes and revoked access also show up in the open editor.

## Run locally

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`, so no native modules to compile). Tested on Node 24.

```bash
npm install
npm run dev        # http://localhost:3000, API + Vite hot reload in one process
```

Production mode:

```bash
npm run build      # builds the React app into dist/
npm start          # serves API + dist/ on $PORT (default 3000)
```

Data is stored in `data/ajaia.db` (SQLite). Delete that file to reset to the seeded demo state. Override the location with `DATABASE_FILE=/path/to/file.db`.

> Node 22/24 prints `ExperimentalWarning: SQLite is an experimental feature`. This is expected and harmless.

## Tests

```bash
npm test
```

There are 12 API integration tests (`node:test` + `supertest`) against an in-memory database. They cover:

- auth
- create / rename / save / reopen, with formatting preserved
- input validation
- HTML sanitization
- 409 conflict detection
- owner/editor/viewer permissions and revocation
- .md / .txt / .docx import, plus rejection of bad files

I also ran a scripted browser pass (Playwright driving Edge) over the full flow. It is not included in the repo; see [`AI_WORKFLOW.md`](AI_WORKFLOW.md).

## Deployment

The app is one Node process that serves both the API and the built frontend. It ships as a `Dockerfile` plus a Render Blueprint (`render.yaml`).

**Render (free):** push this folder to a GitHub repo, then on Render go to *New → Blueprint* and select the repo. No environment variables are required.

> **Free-tier caveat:** Render's free instances have an ephemeral filesystem. The SQLite file resets, and demo data is re-seeded, whenever the service restarts, redeploys, or spins down after about 15 minutes of inactivity. For durable storage, attach a persistent disk (paid) and set `DATABASE_FILE` to a path on it, or move to Postgres (see `ARCHITECTURE.md`).

Any Docker host works: `docker build -t ajaia-docs . && docker run -p 3000:3000 ajaia-docs`.

## Project layout

```
server/
  index.js       entry: opens DB, mounts API, serves SPA (prod) or Vite middleware (dev)
  app.js         Express routes: auth, documents, import, sharing, error handling
  db.js          SQLite schema + demo seed
  importers.js   .txt / .md / .docx → sanitized HTML
  sanitize.js    allow-list of tags the editor supports
client/src/
  components/EditorPage.jsx   TipTap editor, autosave loop, conflict handling, polling
  components/Toolbar.jsx      formatting toolbar
  components/ShareDialog.jsx  share / change role / revoke
  components/DocumentList.jsx owned vs shared lists, create, import
test/api.test.js              API integration tests
samples/                      files to try the import with
docs/screenshots/             screenshots of the main flows
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for design decisions and [`SUBMISSION.md`](SUBMISSION.md) for the deliverables checklist.
