import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import JSZip from 'jszip';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

let app;

beforeEach(() => {
  app = createApp({ db: openDb(':memory:') });
});

/** Log in as a seeded user and return a supertest agent that keeps the cookie. */
async function loginAs(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email }).expect(200);
  return agent;
}

describe('auth', () => {
  test('rejects unauthenticated access and unknown users', async () => {
    await request(app).get('/api/documents').expect(401);
    await request(app).post('/api/auth/login').send({ email: 'mallory@evil.test' }).expect(401);
  });
});

describe('documents', () => {
  test('create, rename, save and reopen preserves formatting', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: created } = await alice.post('/api/documents').send({}).expect(201);
    assert.equal(created.title, 'Untitled document');
    assert.equal(created.role, 'owner');

    await alice.patch(`/api/documents/${created.id}`).send({ title: '  Q3 plan  ' }).expect(200);
    const html = '<h2>Goals</h2><p><strong>Bold</strong> <em>it</em> <u>u</u></p><ul><li><p>one</p></li></ul>';
    await alice.patch(`/api/documents/${created.id}`).send({ content: html, baseVersion: created.version }).expect(200);

    const { body: reopened } = await alice.get(`/api/documents/${created.id}`).expect(200);
    assert.equal(reopened.title, 'Q3 plan');
    assert.equal(reopened.content, html);
    assert.equal(reopened.version, created.version + 1);
  });

  test('validates input', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: '   ' }).expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: 'x'.repeat(201) }).expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({ content: '<p>hi</p>' }).expect(400); // no baseVersion
    await alice.patch(`/api/documents/${doc.id}`).send({}).expect(400);
  });

  test('strips unsafe HTML on save', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    const { body } = await alice.patch(`/api/documents/${doc.id}`)
      .send({ content: '<p onclick="x()">ok<script>alert(1)</script><img src=x onerror=alert(1)></p>', baseVersion: doc.version })
      .expect(200);
    assert.equal(body.content, '<p>ok</p>');
  });

  test('rejects a stale save instead of overwriting (409)', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    await alice.patch(`/api/documents/${doc.id}`).send({ content: '<p>first</p>', baseVersion: doc.version }).expect(200);

    const res = await alice.patch(`/api/documents/${doc.id}`).send({ content: '<p>stale</p>', baseVersion: doc.version }).expect(409);
    assert.equal(res.body.current.content, '<p>first</p>');
  });
});

describe('sharing and access control', () => {
  test('owner shares with an editor; owned vs shared lists differ', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const bob = await loginAs('bob@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({ title: 'Roadmap' }).expect(201);

    // Before sharing, Bob cannot see the doc at all (404, not 403, to avoid leaking IDs).
    await bob.get(`/api/documents/${doc.id}`).expect(404);

    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'editor' }).expect(201);

    const { body: bobList } = await bob.get('/api/documents').expect(200);
    const shared = bobList.shared.find((d) => d.id === doc.id);
    assert.ok(shared, 'doc appears under Shared with me');
    assert.equal(shared.role, 'editor');
    assert.equal(shared.owner_name, 'Alice Chen');
    assert.ok(!bobList.owned.some((d) => d.id === doc.id), 'doc is not in Bob\'s owned list');

    const { body: bobView } = await bob.get(`/api/documents/${doc.id}`).expect(200);
    assert.equal(bobView.role, 'editor');
    await bob.patch(`/api/documents/${doc.id}`).send({ content: '<p>Bob was here</p>', baseVersion: bobView.version }).expect(200);

    // Editors cannot manage sharing or delete.
    await bob.post(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.test' }).expect(403);
    await bob.delete(`/api/documents/${doc.id}`).expect(403);
  });

  test('viewer can read but not edit; revoking removes access', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const carol = await loginAs('carol@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    const { body: shareRes } = await alice.post(`/api/documents/${doc.id}/shares`)
      .send({ email: 'carol@ajaia.test', role: 'viewer' }).expect(201);
    const carolId = shareRes.shares[0].user_id;

    const { body: view } = await carol.get(`/api/documents/${doc.id}`).expect(200);
    assert.equal(view.role, 'viewer');
    await carol.patch(`/api/documents/${doc.id}`).send({ content: '<p>nope</p>', baseVersion: view.version }).expect(403);
    await carol.patch(`/api/documents/${doc.id}`).send({ title: 'nope' }).expect(403);

    await alice.delete(`/api/documents/${doc.id}/shares/${carolId}`).expect(200);
    await carol.get(`/api/documents/${doc.id}`).expect(404);
  });

  test('share validation', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'nobody@ajaia.test' }).expect(404);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'alice@ajaia.test' }).expect(400);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'admin' }).expect(400);
  });
});

describe('file import', () => {
  test('markdown becomes a formatted document titled after the file', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const md = '# Launch notes\n\nSome **bold** and _italic_ text.\n\n- one\n- two\n\n1. first\n';
    const { body } = await alice.post('/api/documents/import')
      .attach('file', Buffer.from(md), 'launch-notes.md').expect(201);
    assert.equal(body.title, 'launch-notes');
    assert.match(body.content, /<h1>Launch notes<\/h1>/);
    assert.match(body.content, /<strong>bold<\/strong>/);
    assert.match(body.content, /<ul>\s*<li>one<\/li>/);
    assert.match(body.content, /<ol>/);
  });

  test('plain text keeps paragraphs and escapes HTML', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body } = await alice.post('/api/documents/import')
      .attach('file', Buffer.from('Hello <b>world</b>\nline 2\n\nPara 2'), 'notes.txt').expect(201);
    assert.equal(body.content, '<p>Hello &lt;b&gt;world&lt;/b&gt;<br />line 2</p><p>Para 2</p>');
  });

  test('docx is converted with mammoth', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body } = await alice.post('/api/documents/import')
      .attach('file', await makeDocx('Quarterly review', 'Hello from Word'), 'review.docx').expect(201);
    assert.equal(body.title, 'review');
    assert.match(body.content, /<h1>Quarterly review<\/h1>/);
    assert.match(body.content, /<p>Hello from Word<\/p>/);
  });

  test('rejects unsupported, empty and missing files', async () => {
    const alice = await loginAs('alice@ajaia.test');
    await alice.post('/api/documents/import').attach('file', Buffer.from('x'), 'image.png').expect(415);
    await alice.post('/api/documents/import').attach('file', Buffer.alloc(0), 'empty.txt').expect(400);
    await alice.post('/api/documents/import').expect(400);
    await alice.post('/api/documents/import').attach('file', Buffer.from('not a zip'), 'broken.docx').expect(400);
  });
});

/** Build a minimal valid .docx (heading + paragraph) in memory. */
async function makeDocx(heading, para) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${heading}</w:t></w:r></w:p>
<w:p><w:r><w:t>${para}</w:t></w:r></w:p>
</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
