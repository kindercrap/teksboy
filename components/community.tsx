'use client';
/* eslint-disable next/no-img-element -- CMS-managed community photos. */
import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  UserRound,
  Globe,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-react';
import './community.css';
type Entry = {
  id: string;
  name: string;
  description: string;
  url: string;
  image: string;
  type: string;
  status: string;
  position: number;
};
export default function Community({
  management = false,
}: {
  management?: boolean;
}) {
  const [linkTypes, setLinkTypes] = useState<
    { id: string; name: string; layout: string; color?: string }[]
  >([]);
  const types = Object.fromEntries(linkTypes.map((t) => [t.id, t.name]));
  const isProfile = (type: string) =>
    linkTypes.find((t) => t.id === type)?.layout === 'profile';
  const [rows, setRows] = useState<Entry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [editing, setEditing] = useState<Entry | null>(null),
    [deleting, setDeleting] = useState<Entry | null>(null),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch(
        '/__local/community' + (management ? '?manage=1' : ''),
      );
      const d = (await r.json()) as {
        rows: Entry[];
        types: { id: string; name: string; layout: string; color?: string }[];
        error?: string;
      };
      if (!r.ok) throw Error(d.error);
      setRows(d.rows);
      setLinkTypes(d.types);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load links.');
    } finally {
      setLoading(false);
    }
  }, [management]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function post(endpoint: string, body: unknown) {
    const r = await fetch('/__local/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = (await r.json()) as { error?: string; url?: string };
    if (!r.ok) throw Error(d.error);
    return d;
  }
  async function save(remove = false) {
    setBusy(true);
    setError('');
    try {
      await post(
        remove ? 'delete' : 'save',
        remove
          ? { kind: 'community', id: deleting?.id }
          : { kind: 'community', row: editing },
      );
      setEditing(null);
      setDeleting(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  async function move(id: string, other: string) {
    setBusy(true);
    setError('');
    try {
      await post('community-move', { id, other });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reorder.');
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter(
    (r) =>
      (filter === 'all' || r.type === filter) &&
      (r.name + ' ' + r.description)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="community-page">
      {!management && (
        <header>
          <h1>COMMUNITY LINKS</h1>
          <p>Find groups, pages, and collectors to connect with.</p>
        </header>
      )}
      <div className="community-toolbar">
        <input
          className="field"
          aria-label="Search community links"
          placeholder="Find a group or collector…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="field"
          aria-label="Community link type"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All links</option>
          {Object.entries(types).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {management && (
          <button
            className="button primary"
            onClick={() => {
              setError('');
              setEditing({
                id: '',
                name: '',
                description: '',
                url: '',
                image: '',
                type: linkTypes[0]?.id || '',
                status: 'draft',
                position: rows.length,
              });
            }}
          >
            Add link
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="cms-message">
          {error}
        </p>
      )}
      {deleting && (
        <div className="community-editor">
          <p>Delete “{deleting.name}”?</p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void save(true)}
          >
            Delete
          </button>{' '}
          <button className="button" onClick={() => setDeleting(null)}>
            Cancel
          </button>
        </div>
      )}
      {editing && (
        <form
          className="community-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>{editing.id ? 'Edit community link' : 'New community link'}</h2>
          <label>
            Title
            <input
              className="field"
              required
              maxLength={150}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label>
            Type
            <select
              className="field"
              value={editing.type}
              onChange={(e) => setEditing({ ...editing, type: e.target.value })}
            >
              {Object.entries(types).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visit URL
            <input
              className="field"
              required
              type="url"
              value={editing.url}
              onChange={(e) => setEditing({ ...editing, url: e.target.value })}
            />
          </label>
          <label>
            Description
            <textarea
              className="field"
              maxLength={1000}
              value={editing.description}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
          </label>
          <label>
            {isProfile(editing.type) ? 'Display photo' : 'Cover photo'} URL
            <input
              className="field"
              value={editing.image}
              onChange={(e) =>
                setEditing({ ...editing, image: e.target.value })
              }
            />
          </label>
          <label>
            Upload photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError('');
                try {
                  if (file.size > 12 * 1024 * 1024)
                    throw Error('Photo must be under 12 MB.');
                  const encoded = await new Promise<string>(
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
                    purpose: 'community',
                    type: file.type,
                    base64: encoded,
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
            Status
            <select
              className="field"
              value={editing.status}
              onChange={(e) =>
                setEditing({ ...editing, status: e.target.value })
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label>
            Sort position
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

          <div>
            <button className="button primary" disabled={busy}>
              Save link
            </button>{' '}
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {loading ? (
        <p>Loading community links…</p>
      ) : !visible.length ? (
        <p>No matching links.</p>
      ) : (
        <div className="community-grid">
          {visible.map((r, index) => (
            <article
              className={
                'community-card ' + (isProfile(r.type) ? 'profile-link' : '')
              }
              key={r.id}
            >
              <div className="community-photo">
                {r.image ? (
                  <img
                    src={r.image}
                    alt={r.name}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : isProfile(r.type) ? (
                  <UserRound size={34} />
                ) : r.type === 'website' ? (
                  <Globe size={34} />
                ) : (
                  <Users size={34} />
                )}
              </div>
              <div className="community-content">
                <span
                  className="community-type-badge role-badge"
                  style={{
                    color:
                      linkTypes.find((t) => t.id === r.type)?.color ||
                      '#00cddd',
                    backgroundColor:
                      (linkTypes.find((t) => t.id === r.type)?.color ||
                        '#00cddd') + '20',
                    borderColor:
                      (linkTypes.find((t) => t.id === r.type)?.color ||
                        '#00cddd') + '70',
                  }}
                >
                  {types[r.type]}
                </span>
                <h2>{r.name}</h2>
                <p>{r.description}</p>
                <div className="community-actions">
                  <a
                    className="button outline-primary"
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit <ExternalLink size={12} />
                  </a>
                  {management && (
                    <>
                      <small>{r.status}</small>
                      <button
                        className="button"
                        title="Move earlier"
                        aria-label={'Move ' + r.name + ' earlier'}
                        disabled={busy || index === 0}
                        onClick={() => void move(r.id, visible[index - 1].id)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="button"
                        title="Move later"
                        aria-label={'Move ' + r.name + ' later'}
                        disabled={busy || index === visible.length - 1}
                        onClick={() => void move(r.id, visible[index + 1].id)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        className="button"
                        onClick={() => {
                          setError('');
                          setEditing({ ...r });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Edit
                      </button>
                      <button className="button" onClick={() => setDeleting(r)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
