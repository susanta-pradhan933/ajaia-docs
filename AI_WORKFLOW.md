# AI workflow note

## Tools used

- **Claude Code (Claude Opus 5.5)** in VS Code. It scaffolded the project, drafted the server, the React components and the tests, ran commands, and drove browser checks.
- **Playwright (`playwright-core` + local Edge)**, scripted with AI help, to exercise the real UI end to end and capture the screenshots in `docs/screenshots/`.

## Where AI materially sped things up

- **Boilerplate and glue:** Express routes, the SQLite schema and seed, the multer upload pipeline, the fetch wrapper, and CSS. This is code I know how to write but would have spent most of the timebox typing.
- **Test scaffolding:** it generated the API integration suite, including a helper that builds a valid `.docx` in memory with JSZip. That meant Word import could be tested without a binary fixture.
- **End-to-end verification:** it wrote a two-browser Playwright script (Alice and Bob) that covers create → format → autosave → reload → share → live update → conflict → downgrade to viewer → import → no-access → mobile width. Doing that by hand after every change would have been slow and easy to skip.

## What I changed or rejected

- **Rejected building on remembered library APIs.** TipTap v3 changed several APIs from v2. Before using them, I checked the installed type definitions: StarterKit now bundles Underline, and `setContent(content, { emitUpdate })` takes an options object.
- **Caught a real bug that the first draft shipped.** The browser run showed unexpected **403s** when an editor was downgraded to viewer. Cause: TipTap's `setEditable()` emits an update event by default, which the autosave loop treated as an edit. Fixed with `setEditable(canEdit, false)` and an `isEditable` guard in `onUpdate`. Unit tests would not have caught this; only the real-browser run did.
- **Fixed a non-portable script.** The first `start` script used `NODE_ENV=production node …`, which fails on Windows shells. It became a `--production` flag.
- **Fixed a mobile layout problem.** The screenshot at 390 px showed the document title squeezed by the header actions, so the actions now wrap below the title.
- **Scope pushback:** AI tooling readily proposes CRDT/WebSocket real-time editing. I chose optimistic locking + polling instead (see `ARCHITECTURE.md`), because it gives correctness at a fraction of the risk in a 4–6 h box.

## How correctness, UX and reliability were verified

- `npm test`: 12 API tests pass. They cover permission boundaries (viewer can't write, editor can't share or delete, no-access returns 404, revoke works), conflict detection, sanitization, validation, and all three import formats.
- A scripted real-browser pass against the **production build** (not the dev server). It checks persisted HTML after reload, owned vs shared lists, live propagation of Bob's edit to Alice, the conflict banner and its resolution, read-only mode after downgrade, import results, error messages, and that there is no horizontal overflow on mobile. Console errors were checked; the only ones left are the intentional 409 and 404 responses.
- I reviewed the screenshots of every main screen to judge visual quality rather than trusting the generated CSS blindly.
