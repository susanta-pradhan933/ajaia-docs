import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatRelative } from '../time.js';

const ACCEPT = '.txt,.md,.docx';

export default function DocumentList() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const fileInput = useRef(null);

  const load = useCallback(() => {
    api.listDocs().then(setDocs).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    setBusy('create');
    setError('');
    try {
      const doc = await api.createDoc();
      navigate(`/doc/${doc.id}`, { state: { focusTitle: true } });
    } catch (e) {
      setError(e.message);
      setBusy('');
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPT.split(',').includes(ext)) {
      setError(`"${file.name}" is not supported. Upload a .txt, .md or .docx file.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(`"${file.name}" is larger than 5 MB.`);
      return;
    }
    setBusy('import');
    setError('');
    try {
      const doc = await api.importDoc(file);
      navigate(`/doc/${doc.id}`);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  const remove = async (doc) => {
    if (!confirm(`Delete "${doc.title}"? This also removes access for everyone it's shared with.`)) return;
    try {
      await api.deleteDoc(doc.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <main className="page">
      <div className="list-actions">
        <button className="btn btn-primary" onClick={create} disabled={!!busy}>
          {busy === 'create' ? 'Creating…' : '+ New document'}
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()} disabled={!!busy}>
          {busy === 'import' ? 'Importing…' : '⇪ Import file'}
        </button>
        <input ref={fileInput} type="file" accept={ACCEPT} onChange={onFile} hidden />
        <span className="muted small">Import turns a <b>.txt</b>, <b>.md</b> or <b>.docx</b> file (max 5 MB) into a new editable document.</span>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!docs && !error && <p className="muted">Loading documents…</p>}

      {docs && (
        <>
          <Section title="My documents" empty="You don't own any documents yet. Create one or import a file.">
            {docs.owned.map((d) => (
              <DocRow key={d.id} doc={d}
                meta={<>{d.share_count > 0 ? <span className="badge">Shared with {d.share_count}</span> : <span className="badge badge-muted">Private</span>}</>}
                action={<button className="btn btn-ghost btn-sm" onClick={() => remove(d)} aria-label={`Delete ${d.title}`}>Delete</button>}
              />
            ))}
          </Section>
          <Section title="Shared with me" empty="Nothing has been shared with you yet.">
            {docs.shared.map((d) => (
              <DocRow key={d.id} doc={d}
                meta={<><span className="muted small">Owner: {d.owner_name}</span><span className={`badge badge-${d.role}`}>{d.role === 'editor' ? 'Can edit' : 'View only'}</span></>}
              />
            ))}
          </Section>
        </>
      )}
    </main>
  );
}

function Section({ title, empty, children }) {
  const items = [children].flat().filter(Boolean);
  return (
    <section className="doc-section">
      <h2>{title}</h2>
      {items.length ? <ul className="doc-list">{children}</ul> : <p className="muted empty">{empty}</p>}
    </section>
  );
}

function DocRow({ doc, meta, action }) {
  return (
    <li className="doc-row">
      <Link to={`/doc/${doc.id}`} className="doc-link">
        <span className="doc-icon" aria-hidden>▤</span>
        <span className="doc-title">{doc.title}</span>
      </Link>
      <span className="doc-meta">
        {meta}
        <span className="muted small" title={new Date(doc.updated_at).toLocaleString()}>Edited {formatRelative(doc.updated_at)}</span>
        {action}
      </span>
    </li>
  );
}
