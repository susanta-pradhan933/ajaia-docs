# Submission

## Links

- **Live app:** https://ajaia-docs-988q.onrender.com (Render free tier: first load after ~15 min idle takes ~30–50 s to wake; data resets to the demo seed on restart)
- **Walkthrough video:** https://drive.google.com/file/d/1ERbEhmq5PHFFDZJiApAt5ilAUWi8ETbw/view (also in `VIDEO_URL.txt`)
- **Google Drive folder:** https://drive.google.com/drive/folders/1aH4pnM7jvl5RFF-NwJKFSSc8XYTAg70_
- **Test accounts:** `alice@ajaia.test`, `bob@ajaia.test`, `carol@ajaia.test`. No password: click the account on the login screen. Use two browser windows (one private) to test sharing.

## What's included

| Item | Location |
|---|---|
| Source code (server) | `server/` |
| Source code (frontend) | `client/` |
| Automated tests | `test/api.test.js` (`npm test`) |
| Setup & run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| Walkthrough video URL | `VIDEO_URL.txt` |
| Screenshots of main flows | `docs/screenshots/` |
| Sample files for import (.md, .txt, .docx) | `samples/` |
| Deployment config | `Dockerfile`, `render.yaml` |
| Dependency manifest / lockfile | `package.json`, `package-lock.json` |

`node_modules/`, `dist/` and `data/` are generated and excluded.

## Status

**Working end to end:**

- Create, rename, edit, autosave, reopen and delete documents
- Rich text: bold, italic, underline, strikethrough, H1–H3, bulleted and numbered lists, quotes, undo/redo
- Import of .txt / .md / .docx into a new document (5 MB limit), with clear errors for other files
- Sharing: owner grants **editor** or **viewer** access by email, changes roles, and revokes access; "My documents" and "Shared with me" are separate lists
- Server-side permission enforcement
- Version-conflict detection with a resolve prompt
- Collaborator changes appear within about 4 s
- Persistence in SQLite

**Stretch item included:** role-based permissions (viewer vs editor).

**Incomplete / deliberately out of scope:**

- Real-time character-level co-editing
- Comments, version history, export
- Real authentication
- Images and tables

**On the free hosting tier**, the database resets when the instance restarts. Demo data re-seeds automatically.

**Next 2–4 hours:**

1. Version history with restore
2. Markdown/PDF export
3. Hosted Postgres for durable live data
4. Frontend tests for the autosave/conflict logic, plus a Playwright smoke test in CI
