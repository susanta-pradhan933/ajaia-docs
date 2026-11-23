import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';

export default function TopBar({ user, onLogout }) {
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden>▤</span> Ajaia Docs
      </Link>
      <div className="topbar-user">
        <Avatar user={user} />
        <span className="hide-sm">{user.name}</span>
        <button className="btn btn-ghost" onClick={onLogout}>Switch user</button>
      </div>
    </header>
  );
}
