import { extname, basename } from 'node:path';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { sanitizeDocHtml } from './sanitize.js';
import { HttpError } from './errors.js';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.docx'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Plain text: blank lines separate paragraphs, single newlines become <br>. */
export function textToHtml(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Convert an uploaded file into { title, html } for a new document.
 * Throws HttpError(400/415) for empty, unsupported or unreadable files.
 */
export async function convertUpload({ originalname, buffer }) {
  const ext = extname(originalname).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new HttpError(415, `Unsupported file type "${ext || 'none'}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  }
  if (!buffer?.length) throw new HttpError(400, 'The uploaded file is empty.');

  let html;
  if (ext === '.docx') {
    try {
      ({ value: html } = await mammoth.convertToHtml({ buffer }));
    } catch {
      throw new HttpError(400, 'Could not read this .docx file. Is it a valid Word document?');
    }
  } else {
    const text = buffer.toString('utf8');
    if (text.includes('\u0000')) throw new HttpError(400, 'This file looks binary, not text.');
    html = ext === '.md' ? marked.parse(text, { async: false }) : textToHtml(text);
  }

  const clean = sanitizeDocHtml(html);
  const title = basename(originalname, extname(originalname)).trim().slice(0, 200) || 'Imported document';
  return { title, html: clean || '<p></p>' };
}
