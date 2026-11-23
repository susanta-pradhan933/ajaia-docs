# AI workflow note

## Tools I used

- **Claude Code (Claude Opus 5.5)**, inside VS Code, as the main engineering assistant. I gave it the full assignment brief. It proposed the stack and scope, wrote most of the code, ran the commands, and handled the GitHub and Render setup with me.
- **Playwright** (driving the Edge browser already on my machine) for scripted end-to-end checks of the real UI. The AI wrote the script; I used the results and screenshots to judge whether the product actually worked.

To be clear about the split: most of the code in this repo was written by AI. My job was to set the direction, decide what is in and out of scope, insist on proof that things work, and make the calls about accounts, publishing and deployment.

## Where AI materially sped up the work

- **Getting to a working full-stack slice fast.** The schema, Express routes, upload pipeline, React screens and styling took minutes, not hours. That left time for the parts that matter in a docs product: not losing work, access control, and import quality.
- **Tests I would likely have cut under time pressure.** The API test suite builds a real `.docx` in memory, so Word import is tested without a binary fixture file.
- **Two-user browser testing.** One script signs in as Alice and Bob in separate sessions and walks through the whole flow: create, format, autosave, reload, share, a live update, a conflict, downgrade to viewer, import, a user with no access, and mobile width. I re-ran it after every fix and once more against the live deployment.
- **Deployment chores:** the Dockerfile, the Render blueprint, the GitHub repo and the git account setup.

## What was changed or rejected

- **Real-time co-editing was rejected.** CRDT/WebSocket collaboration is the obvious "Google Docs" move. It is also the riskiest thing to build in a 4–6 hour timebox. I went with version-checked saves plus polling instead: nobody's work is silently overwritten, and collaborators still see each other's changes within a few seconds.
- **APIs were checked, not trusted from memory.** TipTap v3 changed several APIs from v2. Before use, they were checked against the type definitions actually installed, not written from memory.
- **A bug in the first draft was caught by testing, not review.** The browser run showed unexpected permission errors when an editor was downgraded to viewer. TipTap's `setEditable()` fires an update event by default, and autosave treated that as an edit. The fix: `setEditable(canEdit, false)`, plus a guard in the update handler. Unit tests would not have caught this.
- **The deployment would have failed; a local check caught it first.** Before pushing, I had the Docker image built locally. `npm ci` failed inside Linux because the lockfile generated on Windows was missing some optional packages. Regenerating the lockfile fixed it, so Render's build worked first time.
- **Smaller fixes:** a Windows-incompatible `start` script, and a cramped document header on mobile that only showed up in a 390 px screenshot.

## How I checked correctness, UX and reliability

- **Automated tests:** 12 API integration tests pass (`npm test`). They cover permission boundaries (a viewer can't write, an editor can't share or delete, a user with no access gets 404, revoking access works), conflict detection, HTML sanitization, input validation, and all three import formats.
- **Real-browser runs** against the production build, both locally and on the live Render URL. The only console errors left are the two deliberate ones: the 409 conflict and the 404 "no access".
- **Visual review** of screenshots of each main screen at desktop and phone width, instead of assuming the generated CSS looked right.
- **I did not treat "the AI says it's done" as done.** Every claim of "working" in the README and SUBMISSION is backed by a test or a browser run above.
