import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api.js';
import Login from './components/Login.jsx';
import DocumentList from './components/DocumentList.jsx';
import EditorPage from './components/EditorPage.jsx';
import TopBar from './components/TopBar.jsx';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still loading

  useEffect(() => {
    api.me().then(({ user }) => setUser(user)).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="center muted">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  return (
    <>
      <TopBar user={user} onLogout={logout} />
      <Routes>
        <Route path="/" element={<DocumentList user={user} />} />
        <Route path="/doc/:id" element={<EditorPage user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
