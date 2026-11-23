import sanitizeHtml from 'sanitize-html';

/**
 * The editor only understands a small set of nodes/marks, so we store only
 * those. This runs on every save and on every import, which keeps stored HTML
 * safe to render even if a client bypasses the editor.
 */
const OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'h1', 'h2', 'h3', 'ul', 'ol', 'li',
    'blockquote', 'code', 'pre', 'hr', 'a',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'], ol: ['start'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // Imported docs may contain h4–h6; fold them into the levels we support.
    h4: 'h3', h5: 'h3', h6: 'h3',
  },
};

export function sanitizeDocHtml(html) {
  return sanitizeHtml(html, OPTIONS).trim();
}
