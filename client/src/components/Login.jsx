import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

/**
 * Mocked auth: pick one of the seeded accounts. A real build would put SSO
 * here; the rest of the app only depends on the session cookie.
 */
export default function Login({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.users().then((d) => setUsers(d.users)).catch((e) => setError(e.message));
  }, []);

  const login = async (email) => {
    setBusy(email);
    setError('');
    try {
      const { user } = await api.login(email);
      onLogin(user);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <h1><span className="brand-mark" aria-hidden>▤</span> Ajaia Docs</h1>
        <p className="muted">Demo sign-in. Pick an account. To test sharing, use a second browser (or a private window) signed in as someone else.</p>
        <div className="login-users">
          {users.map((u) => (
            <button key={u.id} className="login-user" onClick={() => login(u.email)} disabled={!!busy}>
              <Avatar user={u} size={36} />
              <span>
                <strong>{u.name}</strong>
                <span className="muted small">{u.email}</span>
              </span>
              {busy === u.email && <span className="muted small">Signing in…</span>}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
