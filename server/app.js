import express from 'express';
import multer from 'multer';
import { randomUUID, randomBytes } from 'node:crypto';
import { HttpError } from './errors.js';
import { sanitizeDocHtml } from './sanitize.js';
import { convertUpload, MAX_UPLOAD_BYTES, SUPPORTED_EXTENSIONS } from './importers.js';

const SESSION_COOKIE = 'ajaia_session';
const MAX_TITLE = 200;
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const ROLES = ['viewer', 'editor'];

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
    }),
  );
}

function validateTitle(title) {
  if (typeof title !== 'string') throw new HttpError(400, 'Title must be a string.');
  const t = title.trim();
  if (!t) throw new HttpError(400, 'Title cannot be empty.');
  if (t.length > MAX_TITLE) throw new HttpError(400, `Title must be at most ${MAX_TITLE} characters.`);
  return t;
}

/**
 * Build the API. All data access goes through `db` so tests can pass an
 * in-memory database.
 */
export function createApp({ db, secureCookies = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '3mb' }));

  const q = {
    userByEmail: db.prepare('SELECT id, email, name, color FROM users WHERE email = ?'),
    userBySession: db.prepare(`SELECT u.id, u.email, u.name, u.color FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`),
    allUsers: db.prepare('SELECT id, email, name, color FROM users ORDER BY name'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    docById: db.prepare('SELECT * FROM documents WHERE id = ?'),
    shareRole: db.prepare('SELECT role FROM document_shares WHERE document_id = ? AND user_id = ?'),
    ownedDocs: db.prepare(`
      SELECT d.id, d.title, d.updated_at, d.created_at,
             (SELECT COUNT(*) FROM document_shares s WHERE s.document_id = d.id) AS share_count
      FROM documents d WHERE d.owner_id = ? ORDER BY d.updated_at DESC`),
    sharedDocs: db.prepare(`
      SELECT d.id, d.title, d.updated_at, d.created_at, s.role,
             u.name AS owner_name, u.email AS owner_email
      FROM document_shares s
      JOIN documents d ON d.id = s.document_id
      JOIN users u ON u.id = d.owner_id
      WHERE s.user_id = ? ORDER BY d.updated_at DESC`),
    insertDoc: db.prepare(`INSERT INTO documents (id, owner_id, title, content, updated_by) VALUES (?, ?, ?, ?, ?)`),
    updateTitle: db.prepare(`UPDATE documents SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_by = ? WHERE id = ?`),
    // Compare-and-swap on version: only succeeds if nobody saved in between.
    updateContent: db.prepare(`
      UPDATE documents SET content = ?, version = version + 1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_by = ?
      WHERE id = ? AND version = ?`),
    deleteDoc: db.prepare('DELETE FROM documents WHERE id = ?'),
    shares: db.prepare(`
      SELECT u.id AS user_id, u.email, u.name, u.color, s.role, s.created_at
      FROM document_shares s JOIN users u ON u.id = s.user_id
      WHERE s.document_id = ? ORDER BY u.name`),
    upsertShare: db.prepare(`
      INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)
      ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`),
    deleteShare: db.prepare('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?'),
    userName: db.prepare('SELECT name FROM users WHERE id = ?'),
  };

  // ---- auth ---------------------------------------------------------------

  app.use((req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    req.user = token ? q.userBySession.get(token) ?? null : null;
    req.sessionToken = token;
    next();
  });

  const requireUser = (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in.'));
    next();
  };

  /**
   * Resolve the caller's role on a document. Returns 404 (not 403) when the
   * user has no access so document IDs don't leak to non-collaborators.
   */
  function loadDoc(req, minRole) {
    const doc = q.docById.get(req.params.id);
    if (!doc) throw new HttpError(404, 'Document not found.');
    let role = null;
    if (doc.owner_id === req.user.id) role = 'owner';
    else role = q.shareRole.get(doc.id, req.user.id)?.role ?? null;
    if (!role) throw new HttpError(404, 'Document not found.');

    const rank = { viewer: 1, editor: 2, owner: 3 };
    if (rank[role] < rank[minRole]) {
      throw new HttpError(403, minRole === 'owner'
        ? 'Only the owner can do that.'
        : 'You have view-only access to this document.');
    }
    return { doc, role };
  }

  function serializeDoc(doc, role) {
    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      version: doc.version,
      role,
      owner: { id: doc.owner_id, name: q.userName.get(doc.owner_id)?.name },
      updatedAt: doc.updated_at,
      updatedBy: doc.updated_by ? q.userName.get(doc.updated_by)?.name ?? null : null,
      createdAt: doc.created_at,
    };
  }

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = q.userByEmail.get(email);
    if (!user) throw new HttpError(401, 'Unknown user. Use one of the demo accounts.');
    const token = randomBytes(24).toString('hex');
    q.insertSession.run(token, user.id);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ user });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.sessionToken) q.deleteSession.run(req.sessionToken);
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });

  app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));

  // Public on purpose: the login screen lists demo accounts.
  app.get('/api/users', (_req, res) => res.json({ users: q.allUsers.all() }));

  // ---- documents ----------------------------------------------------------

  app.get('/api/documents', requireUser, (req, res) => {
    res.json({ owned: q.ownedDocs.all(req.user.id), shared: q.sharedDocs.all(req.user.id) });
  });

  app.post('/api/documents', requireUser, (req, res) => {
    const title = req.body?.title === undefined ? 'Untitled document' : validateTitle(req.body.title);
    const id = randomUUID();
    q.insertDoc.run(id, req.user.id, title, '', req.user.id);
    res.status(201).json(serializeDoc(q.docById.get(id), 'owner'));
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  app.post('/api/documents/import', requireUser, upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, `Attach a file (${SUPPORTED_EXTENSIONS.join(', ')}).`);
    // Browsers send multipart filenames as latin1; recover UTF-8 names.
    const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const { title, html } = await convertUpload({ originalname, buffer: req.file.buffer });
    const id = randomUUID();
    q.insertDoc.run(id, req.user.id, title, html, req.user.id);
    res.status(201).json(serializeDoc(q.docById.get(id), 'owner'));
  });

  app.get('/api/documents/:id', requireUser, (req, res) => {
    const { doc, role } = loadDoc(req, 'viewer');
    res.json(serializeDoc(doc, role));
  });

  /** Lightweight endpoint the editor polls to notice other people's saves. */
  app.get('/api/documents/:id/meta', requireUser, (req, res) => {
    const { doc, role } = loadDoc(req, 'viewer');
    const { content, ...meta } = serializeDoc(doc, role);
    res.json(meta);
  });

  app.patch('/api/documents/:id', requireUser, (req, res) => {
    const body = req.body ?? {};
    if (body.title === undefined && body.content === undefined) {
      throw new HttpError(400, 'Nothing to update. Send "title" and/or "content".');
    }
    const { doc } = loadDoc(req, 'editor');

    if (body.content !== undefined) {
      if (typeof body.content !== 'string') throw new HttpError(400, 'Content must be an HTML string.');
      if (Buffer.byteLength(body.content) > MAX_CONTENT_BYTES) throw new HttpError(413, 'Document is too large (2 MB max).');
      if (!Number.isInteger(body.baseVersion)) throw new HttpError(400, 'baseVersion is required when saving content.');
      const { changes } = q.updateContent.run(sanitizeDocHtml(body.content), req.user.id, doc.id, body.baseVersion);
      if (changes === 0) {
        const current = q.docById.get(doc.id);
        throw new HttpError(409, 'This document was changed by someone else since you opened it.', {
          current: serializeDoc(current, null),
        });
      }
    }
    if (body.title !== undefined) q.updateTitle.run(validateTitle(body.title), req.user.id, doc.id);

    const fresh = q.docById.get(doc.id);
    const { role } = loadDoc(req, 'viewer');
    res.json(serializeDoc(fresh, role));
  });

  app.delete('/api/documents/:id', requireUser, (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    q.deleteDoc.run(doc.id);
    res.status(204).end();
  });

  // ---- sharing (owner only) ----------------------------------------------

  app.get('/api/documents/:id/shares', requireUser, (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    res.json({ shares: q.shares.all(doc.id) });
  });

  app.post('/api/documents/:id/shares', requireUser, (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const role = req.body?.role ?? 'editor';
    if (!email) throw new HttpError(400, 'Enter an email address to share with.');
    if (!ROLES.includes(role)) throw new HttpError(400, `Role must be one of: ${ROLES.join(', ')}.`);
    const target = q.userByEmail.get(email);
    if (!target) throw new HttpError(404, `No user with email ${email}.`);
    if (target.id === doc.owner_id) throw new HttpError(400, 'You already own this document.');
    q.upsertShare.run(doc.id, target.id, role);
    res.status(201).json({ shares: q.shares.all(doc.id) });
  });

  app.delete('/api/documents/:id/shares/:userId', requireUser, (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    q.deleteShare.run(doc.id, Number(req.params.userId));
    res.json({ shares: q.shares.all(doc.id) });
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // ---- errors -------------------------------------------------------------

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`
        : err.message;
      return res.status(400).json({ error: message });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side.' : err.message, ...err.details });
  });

  return app;
}
