import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

export default function ShareDialog({ doc, currentUser, onClose }) {
  const dialog = useRef(null);
  const [shares, setShares] = useState(null);
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    api.listShares(doc.id).then((d) => setShares(d.shares)).catch((e) => setError(e.message));
    api.users().then((d) => setUsers(d.users)).catch(() => {});
  }, [doc.id]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const d = await fn();
      setShares(d.shares);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setError('Enter an email address.');
    if (await run(() => api.addShare(doc.id, email.trim(), role))) setEmail('');
  };

  const sharedIds = new Set(shares?.map((s) => s.user_id));
  const suggestions = users.filter((u) => u.id !== currentUser.id && !sharedIds.has(u.id));

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} onClick={(e) => e.target === dialog.current && dialog.current.close()}>
      <div className="dialog-body">
        <h2>Share “{doc.title}”</h2>
        <form className="share-form" onSubmit={submit}>
          <input type="email" list="share-users" placeholder="Email, e.g. bob@ajaia.test" value={email}
            onChange={(e) => setEmail(e.target.value)} aria-label="Email to share with" autoFocus />
          <datalist id="share-users">
            {suggestions.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Access level">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn btn-primary" disabled={busy}>Share</button>
        </form>
        {suggestions.length > 0 && (
          <p className="muted small">Demo users: {suggestions.map((u) => (
            <button key={u.id} type="button" className="link-btn" onClick={() => setEmail(u.email)}>{u.email}</button>
          ))}</p>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        <h3>People with access</h3>
        <ul className="share-list">
          <li>
            <Avatar user={currentUser} />
            <span className="grow">{currentUser.name} <span className="muted small">(you)</span></span>
            <span className="muted small">Owner</span>
          </li>
          {shares?.map((s) => (
            <li key={s.user_id}>
              <Avatar user={{ name: s.name, color: s.color, email: s.email }} />
              <span className="grow">{s.name} <span className="muted small">{s.email}</span></span>
              <select value={s.role} disabled={busy} aria-label={`Access for ${s.name}`}
                onChange={(e) => run(() => api.addShare(doc.id, s.email, e.target.value))}>
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.removeShare(doc.id, s.user_id))}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button className="btn" onClick={() => dialog.current.close()}>Done</button>
        </div>
      </div>
    </dialog>
  );
}
