import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const port = Number(process.env.PORT ?? 3000);
const dbFile = process.env.DATABASE_FILE ?? join(root, 'data', 'ajaia.db');

const db = openDb(dbFile);
const app = createApp({ db, secureCookies: isProd && process.env.INSECURE_COOKIES !== '1' });
if (isProd) app.set('trust proxy', 1);

if (isProd) {
  // Serve the built SPA; any non-API route falls back to index.html.
  const dist = join(root, 'dist');
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
} else {
  // Dev: run Vite as middleware so one process serves API + HMR frontend.
  const { createServer } = await import('vite');
  const vite = await createServer({ root: join(root, 'client'), server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`Ajaia Docs running at http://localhost:${port} (${isProd ? 'production' : 'development'})`);
  console.log(`SQLite database: ${dbFile}`);
});
