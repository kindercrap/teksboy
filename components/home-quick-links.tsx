'use client';
import { useEffect, useState } from 'react';
import {
  Users,
  UserRound,
  Library,
  Trophy,
  Heart,
  Globe,
  Star,
  MessagesSquare,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { appFetch } from '@/lib/app-fetch';
import { ContentSkeleton } from './content-skeleton';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';

export type HomeCard = {
  id: string;
  icon: string;
  title: string;
  description: string;
  cta: string;
  url: string;
  enabled: boolean;
  visibility: string;
  position: number;
  dynamic: boolean;
  memberTitle?: string;
  memberDescription?: string;
  memberCta?: string;
  memberUrl?: string;
};
const icons = {
  users: Users,
  community: MessagesSquare,
  user: UserRound,
  cards: Library,
  trophy: Trophy,
  heart: Heart,
  globe: Globe,
  star: Star,
};
const empty: HomeCard = {
  id: '',
  icon: 'cards',
  title: '',
  description: '',
  cta: 'View',
  url: '/',
  enabled: true,
  visibility: 'everyone',
  position: 0,
  dynamic: false,
  memberTitle: 'My Profile',
  memberDescription: 'View and manage your collection.',
  memberCta: 'View My Profile',
  memberUrl: '/collectors?mine=1',
};
async function request(body?: unknown, management = false) {
  const r = await appFetch(
    '/__local/homepage' + (management ? '?manage=1' : ''),
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const d = (await r.json()) as { rows: HomeCard[]; error?: string };
  if (!r.ok) throw Error(d.error || 'Could not load homepage cards.');
  return d as { rows: HomeCard[] };
}
export default function HomeQuickLinks({
  userId,
  ready,
  onLogin,
}: {
  userId?: string;
  ready: boolean;
  onLogin: () => void;
}) {
  const [rows, setRows] = useState<HomeCard[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    request()
      .then((d) => {
        if (active) setRows(d.rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!ready || !rows) return <ContentSkeleton count={3} />;
  return (
    <section className="home-quick-links" aria-label="Homepage quick links">
      <div className="page-title">
        <h1>Welcome to Teksboy</h1>
      </div>
      <div className="home-card-grid">
        {rows
          .filter(
            (r) =>
              r.enabled &&
              (r.visibility === 'everyone' ||
                (userId
                  ? r.visibility === 'member'
                  : r.visibility === 'guest')),
          )
          .map((r) => {
            const Icon = icons[r.icon as keyof typeof icons] || Library,
              member = r.dynamic && !!userId;
            return (
              <article className="home-quick-card" key={r.id}>
                <Icon className="home-card-icon" size={28} />
                <h2>{member ? r.memberTitle : r.title}</h2>
                <p>{member ? r.memberDescription : r.description}</p>
                {r.dynamic && !userId ? (
                  <button className="button primary" onClick={onLogin}>
                    {r.cta}
                  </button>
                ) : (
                  <a
                    className="button outline-primary"
                    href={member ? r.memberUrl : r.url}
                  >
                    {member ? r.memberCta : r.cta}
                  </a>
                )}
              </article>
            );
          })}
      </div>
    </section>
  );
}
export function CmsHomeQuickLinks() {
  const [rows, setRows] = useState<HomeCard[] | null>(null),
    [editing, setEditing] = useState<HomeCard | null>(null),
    [deleting, setDeleting] = useState<HomeCard | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    request(undefined, true)
      .then((d) => setRows(d.rows))
      .catch((e) => { setError(e.message); setRows([]); });
  }, []);
  async function act(body: unknown) {
    setBusy(true);
    setError('');
    try {
      const d = await request(body, true);
      setRows(d.rows);
      setEditing(null);
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cms-home-cards">
      <button
        className="button primary"
        onClick={() => setEditing({ ...empty })}
      >
        Add New Homepage Card
      </button>
      {error && <p role="alert">{error}</p>}
      {!rows ? (
        <ContentSkeleton kind="rows" count={3} />
      ) : (
        <div className="home-management-list">
          {rows.map((r, i) => (
            <article key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <small>
                  {r.enabled ? 'Enabled' : 'Disabled'} · {r.visibility}
                  {r.dynamic ? ' · Dynamic login/profile' : ''}
                </small>
              </div>
              <div className="home-management-actions">
                <button
                  className="button"
                  aria-label={'Move ' + r.title + ' up'}
                  disabled={busy || !i}
                  onClick={() =>
                    void act({
                      action: 'move',
                      id: r.id,
                      other: rows[i - 1].id,
                    })
                  }
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="button"
                  aria-label={'Move ' + r.title + ' down'}
                  disabled={busy || i === rows.length - 1}
                  onClick={() =>
                    void act({
                      action: 'move',
                      id: r.id,
                      other: rows[i + 1].id,
                    })
                  }
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setEditing({ ...r })}
                >
                  Edit
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void act({
                      action: 'save',
                      row: { ...r, enabled: !r.enabled },
                    })
                  }
                >
                  {r.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  className="button danger-link"
                  disabled={busy}
                  onClick={() => setDeleting(r)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o && !busy) setEditing(null);
        }}
      >
        <DialogContent className="home-card-editor">
          <DialogTitle>
            {editing?.id ? 'Edit homepage card' : 'Add New Homepage Card'}
          </DialogTitle>
          <DialogDescription>
            Choose the content, destination and audience for this quick link.
          </DialogDescription>
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act({ action: 'save', row: editing });
              }}
            >
              <label>
                Icon
                <select
                  className="field"
                  value={editing.icon}
                  onChange={(e) =>
                    setEditing({ ...editing, icon: e.target.value })
                  }
                >
                  {Object.keys(icons).map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              {(['title', 'description', 'cta', 'url'] as const).map((k) => (
                <label key={k}>
                  {
                    {
                      title: 'Title',
                      description: 'Description',
                      cta: 'CTA label',
                      url: 'Destination URL / internal path',
                    }[k]
                  }
                  <input
                    className="field"
                    required={k !== 'description'}
                    maxLength={
                      k === 'description'
                        ? 220
                        : k === 'url'
                          ? 500
                          : k === 'title'
                            ? 60
                            : 40
                    }
                    value={editing[k]}
                    onChange={(e) =>
                      setEditing({ ...editing, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                Visible to
                <select
                  className="field"
                  value={editing.visibility}
                  onChange={(e) =>
                    setEditing({ ...editing, visibility: e.target.value })
                  }
                >
                  <option value="everyone">Everyone</option>
                  <option value="member">Logged-in users only</option>
                  <option value="guest">Logged-out users only</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={editing.dynamic}
                  onChange={(e) =>
                    setEditing({ ...editing, dynamic: e.target.checked })
                  }
                />
                Dynamic Google login / profile card
              </label>
              {editing.dynamic && (
                <fieldset>
                  <legend>Logged-in state</legend>
                  <small>
                    The logged-out button uses the existing Google sign-in flow.
                  </small>
                  {(
                    [
                      'memberTitle',
                      'memberDescription',
                      'memberCta',
                      'memberUrl',
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {
                        {
                          memberTitle: 'Title',
                          memberDescription: 'Description',
                          memberCta: 'CTA label',
                          memberUrl: 'Destination',
                        }[k]
                      }
                      <input
                        className="field"
                        required
                        maxLength={
                          k === 'memberDescription'
                            ? 220
                            : k === 'memberUrl'
                              ? 500
                              : k === 'memberTitle'
                                ? 60
                                : 40
                        }
                        value={editing[k] || ''}
                        onChange={(e) =>
                          setEditing({ ...editing, [k]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              )}
              {error && <p role="alert">{error}</p>}
              <div className="confirmation-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  Save card
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Delete homepage card?</DialogTitle>
          <DialogDescription>
            Remove “{deleting?.title}” from the homepage. Other cards will stay
            in place.
          </DialogDescription>
          <div className="confirmation-actions">
            <button className="button" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void act({ action: 'delete', id: deleting?.id })}
            >
              Delete card
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
