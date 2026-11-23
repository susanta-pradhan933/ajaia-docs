import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { api } from '../api.js';
import { formatRelative } from '../time.js';
import Toolbar from './Toolbar.jsx';
import ShareDialog from './ShareDialog.jsx';

const SAVE_DEBOUNCE_MS = 800;
const RETRY_MS = 5000;
const POLL_MS = 4000;

export default function EditorPage({ user }) {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDoc(null);
    setError(null);
    api.getDoc(id).then(setDoc).catch(setError);
  }, [id]);

  if (error) {
    return (
      <main className="page">
        <p className="error">{error.status === 404 ? "This document doesn't exist or you don't have access to it." : error.message}</p>
        <Link to="/">← Back to documents</Link>
      </main>
    );
  }
  if (!doc) return <main className="page muted">Loading document…</main>;
  return <DocEditor key={doc.id} initial={doc} user={user} />;
}

const STATUS_TEXT = {
  saved: 'All changes saved',
  dirty: 'Unsaved changes…',
  saving: 'Saving…',
  error: "Couldn't save. Retrying…",
  conflict: 'Not saved: conflict',
  readonly: 'View only',
};

function DocEditor({ initial, user }) {
  const id = initial.id;
  const location = useLocation();
  const [meta, setMeta] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [titleError, setTitleError] = useState('');
  const [status, setStatus] = useState(initial.role === 'viewer' ? 'readonly' : 'saved');
  const [conflict, setConflict] = useState(null);
  const [notice, setNotice] = useState('');
  const [lostAccess, setLostAccess] = useState(false);
  const [showShare, setShowShare] = useState(false);

  // Refs hold save-loop state so editor callbacks (bound once) see fresh values.
  const versionRef = useRef(initial.version);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const conflictRef = useRef(null);
  const timerRef = useRef(null);
  const editorRef = useRef(null);
  const titleFocusRef = useRef(false);

  const canEdit = meta.role !== 'viewer' && !lostAccess;

  const save = useCallback(async () => {
    clearTimeout(timerRef.current);
    const editor = editorRef.current;
    if (!editor || savingRef.current || !dirtyRef.current || conflictRef.current) return;
    savingRef.current = true;
    dirtyRef.current = false;
    setStatus('saving');
    let retry = false;
    try {
      const res = await api.updateDoc(id, { content: editor.getHTML(), baseVersion: versionRef.current });
      versionRef.current = res.version;
      setMeta((m) => ({ ...m, version: res.version, updatedAt: res.updatedAt, updatedBy: res.updatedBy }));
      setStatus(dirtyRef.current ? 'dirty' : 'saved');
    } catch (e) {
      dirtyRef.current = true;
      if (e.status === 409) {
        conflictRef.current = e.body.current;
        setConflict(e.body.current);
        setStatus('conflict');
      } else if (e.status === 403 || e.status === 404) {
        setLostAccess(true);
        setStatus('readonly');
      } else {
        setStatus('error');
        retry = true;
      }
    } finally {
      savingRef.current = false;
    }
    // Edits made while the request was in flight (or a transient failure) → go again.
    if (dirtyRef.current && !conflictRef.current) {
      timerRef.current = setTimeout(() => save(), retry ? RETRY_MS : SAVE_DEBOUNCE_MS);
    }
  }, [id]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: initial.content,
    editable: initial.role !== 'viewer',
    editorProps: { attributes: { class: 'doc-content', 'aria-label': 'Document body' } },
    onUpdate: ({ editor: e }) => {
      if (!e.isEditable) return;
      dirtyRef.current = true;
      if (conflictRef.current) return;
      setStatus('dirty');
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => save(), SAVE_DEBOUNCE_MS);
    },
  });
  editorRef.current = editor;

  useEffect(() => {
    // emitUpdate=false: toggling editability is not a content change and must not trigger a save.
    editor?.setEditable(canEdit, false);
  }, [editor, canEdit]);

  // Ctrl/Cmd+S saves immediately; warn before closing with unsaved work.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    const onBeforeUnload = (e) => {
      if (dirtyRef.current || savingRef.current) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Navigating away inside the app: flush any pending edit.
      if (dirtyRef.current) save();
    };
  }, [save]);

  // Poll for other people's saves, title/role changes and revoked access.
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      try {
        const m = await api.getDocMeta(id);
        setMeta((prev) => ({ ...prev, role: m.role, updatedAt: m.updatedAt, updatedBy: m.updatedBy }));
        if (!titleFocusRef.current) setTitle(m.title);
        setStatus((s) => (m.role === 'viewer' ? 'readonly' : s === 'readonly' ? 'saved' : s));
        if (m.version > versionRef.current && !dirtyRef.current && !savingRef.current) {
          const full = await api.getDoc(id);
          if (dirtyRef.current || savingRef.current) return; // user started typing meanwhile
          editorRef.current?.commands.setContent(full.content, { emitUpdate: false });
          versionRef.current = full.version;
          setNotice(`Updated with ${full.updatedBy ?? 'a collaborator'}'s latest changes.`);
        }
      } catch (e) {
        if (e.status === 404 || e.status === 401) setLostAccess(true);
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const resolveConflict = (keepMine) => {
    const latest = conflictRef.current;
    versionRef.current = latest.version;
    conflictRef.current = null;
    setConflict(null);
    if (keepMine) {
      dirtyRef.current = true;
      save();
    } else {
      editor.commands.setContent(latest.content, { emitUpdate: false });
      dirtyRef.current = false;
      setStatus('saved');
    }
  };

  const commitTitle = async () => {
    titleFocusRef.current = false;
    const next = title.trim();
    if (next === meta.title) return setTitle(next);
    if (!next) {
      setTitle(meta.title);
      return setTitleError('Title cannot be empty.');
    }
    setTitleError('');
    try {
      const res = await api.updateDoc(id, { title: next });
      setMeta((m) => ({ ...m, title: res.title }));
      setTitle(res.title);
    } catch (e) {
      setTitleError(e.message);
      setTitle(meta.title);
    }
  };

  return (
    <main className="editor-page">
      <div className="doc-header">
        <div className="doc-header-main">
          <Link to="/" className="back" title="All documents" aria-label="All documents">←</Link>
          <div className="title-wrap">
            <input
              className="title-input"
              value={title}
              maxLength={200}
              readOnly={!canEdit}
              autoFocus={!!location.state?.focusTitle}
              onFocus={(e) => { titleFocusRef.current = true; if (location.state?.focusTitle) e.target.select(); }}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); editor?.commands.focus('start'); }
                if (e.key === 'Escape') { setTitle(meta.title); e.currentTarget.blur(); }
              }}
              aria-label="Document title"
            />
            <div className="doc-sub muted small">
              {meta.role === 'owner' ? 'Owned by you' : `Owned by ${meta.owner.name} · ${meta.role === 'editor' ? 'You can edit' : 'View only'}`}
              {meta.updatedBy && <> · Last edited by {meta.updatedBy === user.name ? 'you' : meta.updatedBy} {formatRelative(meta.updatedAt)}</>}
            </div>
          </div>
        </div>
        <div className="doc-header-actions">
          <span className={`save-status status-${status}`} aria-live="polite">{STATUS_TEXT[status]}</span>
          {meta.role === 'owner' && <button className="btn btn-primary" onClick={() => setShowShare(true)}>Share</button>}
        </div>
      </div>
      {titleError && <p className="error banner">{titleError}</p>}
      {lostAccess && <p className="error banner">You no longer have edit access to this document. Your latest changes may not be saved.</p>}
      {conflict && (
        <div className="banner banner-warn" role="alert">
          <span><b>{conflict.updatedBy ?? 'Someone'}</b> saved a newer version while you were editing. Your changes are not saved yet.</span>
          <span className="banner-actions">
            <button className="btn btn-sm" onClick={() => resolveConflict(false)}>Load their version</button>
            <button className="btn btn-sm btn-primary" onClick={() => resolveConflict(true)}>Overwrite with mine</button>
          </span>
        </div>
      )}
      {notice && <div className="banner banner-info">{notice}</div>}

      {canEdit && editor && <Toolbar editor={editor} />}
      <div className="paper-scroll">
        <div className="paper">
          <EditorContent editor={editor} />
        </div>
      </div>

      {showShare && <ShareDialog doc={{ ...meta, title }} currentUser={user} onClose={() => setShowShare(false)} />}
    </main>
  );
}
