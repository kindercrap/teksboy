'use client';
import { useEffect, useState } from 'react';
type LinkType = { id: string; name: string; layout: string; color?: string };
export default function CommunityTypes() {
  const [rows, setRows] = useState<LinkType[]>([]),
    [editing, setEditing] = useState<LinkType | null>(null),
    [deleting, setDeleting] = useState<LinkType | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch('/__local/community-types');
    if (!r.ok) throw Error('Could not load types.');
    const d = (await r.json()) as { types: LinkType[] };
    setRows(d.types);
  }
  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch((e) => setError(e.message)),
      0,
    );
    return () => clearTimeout(timer);
  }, []);
  async function save(remove = false) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/__local/' + (remove ? 'delete' : 'save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          remove
            ? { kind: 'community-types', id: deleting?.id }
            : { kind: 'community-types', row: editing },
        ),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      setEditing(null);
      setDeleting(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cms-roles">
      <button
        className="button primary"
        onClick={() => {
          setError('');
          setEditing({ id: '', name: '', layout: 'cover', color: '#00cddd' });
        }}
      >
        Add type
      </button>
      {error && (
        <p role="alert" className="cms-message">
          {error}
        </p>
      )}
      {editing && (
        <form
          className="community-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>{editing.id ? 'Edit type' : 'New type'}</h2>
          <label>
            Name
            <input
              className="field"
              required
              maxLength={60}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label>
            Badge color
            <input
              type="color"
              value={editing.color || '#00cddd'}
              onChange={(e) =>
                setEditing({ ...editing, color: e.target.value })
              }
            />
            <span
              className="role-badge"
              style={{
                color: editing.color || '#00cddd',
                backgroundColor: (editing.color || '#00cddd') + '20',
                borderColor: (editing.color || '#00cddd') + '70',
              }}
            >
              {editing.name || 'Type preview'}
            </span>
          </label>
          <label>
            Photo layout
            <select
              className="field"
              value={editing.layout}
              onChange={(e) =>
                setEditing({ ...editing, layout: e.target.value })
              }
            >
              <option value="cover">Cover photo</option>
              <option value="profile">Round profile photo</option>
            </select>
          </label>
          <button className="button primary" disabled={busy}>
            Save type
          </button>{' '}
          <button
            type="button"
            className="button"
            onClick={() => setEditing(null)}
          >
            Cancel
          </button>
        </form>
      )}
      {deleting && (
        <div className="community-editor">
          <p>
            Delete {deleting.name}? Move any links using it to another type
            first.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void save(true)}
          >
            Delete type
          </button>{' '}
          <button className="button" onClick={() => setDeleting(null)}>
            Cancel
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Photo layout</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span
                  className="role-badge"
                  style={{
                    color: r.color,
                    backgroundColor: r.color + '20',
                    borderColor: r.color + '70',
                  }}
                >
                  {r.name}
                </span>
              </td>
              <td>
                {r.layout === 'profile' ? 'Round profile photo' : 'Cover photo'}
              </td>
              <td>
                <button
                  className="button"
                  onClick={() => {
                    setError('');
                    setEditing({ ...r });
                  }}
                >
                  Edit
                </button>{' '}
                <button
                  className="button"
                  onClick={() => {
                    setError('');
                    setDeleting(r);
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
