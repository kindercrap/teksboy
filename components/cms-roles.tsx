'use client';
import { appFetch } from '@/lib/app-fetch';
import { useState } from 'react';
import { useRoles, type RoleDefinition } from './role-provider';
const choices = [
  ['dashboard', 'Dashboard & analytics'],
  ['groups', 'Collection groups'],
  ['collections', 'Collections & teks images'],
  ['tracks', 'BGM playlists'],
  ['users', 'Users'],
  ['collectors', 'Collectors & verification'],
  ['social', 'Comments management'],
  ['community', 'Community Links'],
  ['avatars','Avatar selections'],
];
export default function CmsRoles() {
  const { roles } = useRoles();
  const [editing, setEditing] = useState<RoleDefinition | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState<RoleDefinition | null>(null);
  async function request(endpoint: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      const r = await appFetch('/__local/' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      window.dispatchEvent(new Event('roles-updated'));
      setEditing(null);
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save role.');
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
          setEditing({ id: '', name: '', color: '#00d9ed', permissions: [] });
        }}
      >
        Add role
      </button>
      {error && (
        <p role="alert" className="cms-message">
          {error}
        </p>
      )}
      <div className="leaderboard-table">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Permissions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td>
                  <span
                    className={
                      'role-badge ' +
                      (r.name === 'Super Admin' ? 'super-admin' : '')
                    }
                    style={
                      r.name === 'Super Admin'
                        ? undefined
                        : {
                            color: r.color,
                            backgroundColor: r.color + '20',
                            borderColor: r.color + '70',
                          }
                    }
                  >
                    {r.name}
                  </span>
                </td>
                <td>
                  {r.name === 'Super Admin'
                    ? 'Full access, including role management'
                    : choices
                        .filter(([id]) => r.permissions.includes(id))
                        .map(([, label]) => label)
                        .join(', ') || 'Collector access'}
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
                  {!r.builtin && (
                    <button className="button" onClick={() => setDeleting(r)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deleting && (
        <div className="cms-role-editor">
          <p>Delete {deleting.name}? Users must be reassigned first.</p>
          <button className="button" onClick={() => setDeleting(null)}>
            Cancel
          </button>{' '}
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void request('delete', { kind: 'roles', id: deleting.id })
            }
          >
            Delete role
          </button>
        </div>
      )}
      {editing && (
        <form
          className="cms-role-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void request('role', { row: editing });
          }}
        >
          <h2>{editing.id ? 'Edit role' : 'New role'}</h2>
          <span
            className={
              'role-badge ' +
              (editing.name === 'Super Admin' ? 'super-admin' : '')
            }
            style={
              editing.name === 'Super Admin'
                ? undefined
                : {
                    color: editing.color,
                    backgroundColor: editing.color + '20',
                    borderColor: editing.color + '70',
                  }
            }
          >
            {editing.name || 'Badge preview'}
          </span>
          <label>
            Role name
            <input
              className="field"
              required
              maxLength={40}
              disabled={editing.builtin}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label>
            Badge color{' '}
            <input
              type="color"
              value={editing.color}
              onChange={(e) =>
                setEditing({ ...editing, color: e.target.value })
              }
            />
          </label>
          {editing.name === 'Super Admin' && (
            <p>Super Admin keeps its rainbow badge and full access.</p>
          )}
          <fieldset disabled={editing.name === 'Super Admin'}>
            <legend>Can manage</legend>
            {choices.map(([id, label]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={editing.permissions.includes(id)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      permissions: e.target.checked
                        ? [...editing.permissions, id]
                        : editing.permissions.filter((p) => p !== id),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p>
            Only Super Admin can manage roles or assign a different role to a
            user.
          </p>
          <button className="button primary" disabled={busy}>
            Save role
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
    </section>
  );
}
