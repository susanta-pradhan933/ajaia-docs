export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

async function request(method, path, body) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, { error: 'Network error. Check your connection and try again.' });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  me: () => request('GET', '/api/auth/me'),
  users: () => request('GET', '/api/users'),
  login: (email) => request('POST', '/api/auth/login', { email }),
  logout: () => request('POST', '/api/auth/logout'),

  listDocs: () => request('GET', '/api/documents'),
  createDoc: (title) => request('POST', '/api/documents', title ? { title } : {}),
  getDoc: (id) => request('GET', `/api/documents/${id}`),
  getDocMeta: (id) => request('GET', `/api/documents/${id}/meta`),
  updateDoc: (id, patch) => request('PATCH', `/api/documents/${id}`, patch),
  deleteDoc: (id) => request('DELETE', `/api/documents/${id}`),
  importDoc: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/api/documents/import', fd);
  },

  listShares: (id) => request('GET', `/api/documents/${id}/shares`),
  addShare: (id, email, role) => request('POST', `/api/documents/${id}/shares`, { email, role }),
  removeShare: (id, userId) => request('DELETE', `/api/documents/${id}/shares/${userId}`),
};
