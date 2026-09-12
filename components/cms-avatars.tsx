'use client';
/* eslint-disable next/no-img-element -- Managed local avatar images. */
import { useEffect, useState } from 'react';
type Item = {
  id: string;
  name: string;
  image: string;
  position: number;
  enabled: boolean;
};
export default function CmsAvatars() {
  const [rows, setRows] = useState<Item[]>([]),
    [editing, setEditing] = useState<Item | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function load() {
    const r = await fetch('/__local/avatars?manage=1');
    const d = (await r.json()) as { avatars: Item[]; error?: string };
    if (!r.ok) throw Error(d.error);
    setRows(d.avatars);
  }
  useEffect(() => {
    const timer = setTimeout(
      () => void load().catch((e) => setError(e.message)),
      0,
    );
    return () => clearTimeout(timer);
  }, []);
  async function post(endpoint: string, body: unknown) {
    const r = await fetch('/__local/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = (await r.json()) as { url?: string; error?: string };
    if (!r.ok) throw Error(d.error);
    return d;
  }
  return (
    <section>
      <p className="profile-note">
        Manage the 13 avatar selections. Uploaded profile photos remain
        available to users.
      </p>
      {error && (
        <p role="alert" className="cms-message">
          {error}
        </p>
      )}
      {editing && (
        <form
          className="community-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await post('save', { kind: 'avatars', row: editing });
              await load();
              setEditing(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Save failed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Edit avatar</h2>
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
            Image URL
            <input
              className="field"
              required
              value={editing.image}
              onChange={(e) =>
                setEditing({ ...editing, image: e.target.value })
              }
            />
          </label>
          <label>
            Replace image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError('');
                try {
                  if (file.size > 12 * 1024 * 1024)
                    throw Error('Image must be under 12 MB.');
                  const base64 = await new Promise<string>(
                    (resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () =>
                        resolve(
                          (typeof reader.result === 'string'
                            ? reader.result
                            : ''
                          ).split(',')[1],
                        );
                      reader.onerror = reject;
                      reader.readAsDataURL(file);
                    },
                  );
                  const d = await post('upload', {
                    purpose: 'avatar',
                    type: file.type,
                    base64,
                  });
                  setEditing((current) =>
                    current ? { ...current, image: d.url || '' } : current,
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Upload failed.');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          <label>
            Order
            <input
              className="field"
              type="number"
              min="0"
              value={editing.position}
              onChange={(e) =>
                setEditing({ ...editing, position: Number(e.target.value) })
              }
            />
          </label>
          <label>
            <span>
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) =>
                  setEditing({ ...editing, enabled: e.target.checked })
                }
              />{' '}
              Available for selection
            </span>
          </label>
          <button className="button primary" disabled={busy}>
            Save avatar
          </button>{' '}
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => setEditing(null)}
          >
            Cancel
          </button>
        </form>
      )}
      <div className="cms-avatar-grid">
        {rows.map((row) => (
          <article key={row.id}>
            <img src={row.image} alt={row.name} />
            <h3>{row.name}</h3>
            <small>
              {row.enabled ? 'Available' : 'Hidden'} · Order {row.position}
            </small>
            <button
              className="button"
              onClick={() => {
                setError('');
                setEditing({ ...row });
              }}
            >
              Edit
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
