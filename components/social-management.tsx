'use client';
/* eslint-disable next/no-html-link-for-pages -- Full-page links follow the local app routing. */
import { useEffect, useState } from 'react';
import { socialApi } from '@/lib/social-api';
type Row = {
  id: string;
  owner?: string;
  set?: string;
  text?: string;
  deleted?: boolean;
  offer?: boolean;
  author_id?: string;
  user_id?: string;
  read?: boolean;
  created_at?: string;
  edited_at?: string;
};
type Data = {
  comments: Row[];
  notifications: Row[];
  visits: unknown[];
  users: { id: string; name: string }[];
  collections: {
    id: string;
    name: string;
    visits: number;
    comments: number;
    offers: number;
  }[];
};
export default function SocialManagement() {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState('comments'),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setData(await socialApi<Data>('moderation'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, []);
  async function remove(id: string) {
    setBusy(true);
    try {
      await socialApi('moderation', { action: 'delete', id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }
  const rows = data
    ? (tab === 'comments' ? data.comments : data.notifications)
        .filter((r) =>
          (
            r.text +
            ' ' +
            data.users.find((u) => u.id === (r.author_id || r.user_id))?.name
          )
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .filter(
          (r) =>
            filter === 'all' || (tab === 'comments' ? !r.deleted : !r.read),
        )
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    : [];
  return (
    <>
      <div className="cms-stats">
        {data &&
          [
            ['Visits', data.visits.length],
            ['Comments', data.comments.filter((c) => !c.deleted).length],
            [
              'Offers',
              data.comments.filter((c) => c.offer && !c.deleted).length,
            ],
          ].map(([label, count]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{count}</strong>
            </div>
          ))}
      </div>
      <details className="cms-panel">
        <summary>Visits, comments & offers by collection</summary>
        <div className="cms-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Collection</th>
                <th>Visits</th>
                <th>Comments</th>
                <th>Offers</th>
              </tr>
            </thead>
            <tbody>
              {data?.collections
                .filter((s) => s.visits || s.comments || s.offers)
                .sort((a, b) => b.visits - a.visits)
                .map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.visits}</td>
                    <td>{s.comments}</td>
                    <td>{s.offers}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="cms-toolbar">
        <select
          className="field"
          aria-label="Social management section"
          value={tab}
          onChange={(e) => {
            setTab(e.target.value);
            setFilter('all');
          }}
        >
          <option value="comments">Comments & offers</option>
          <option value="notifications">Notification status</option>
        </select>
        <input
          className="field"
          aria-label="Search social records"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="field"
          aria-label="Filter social records"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All · newest first</option>
          <option value="active">
            {tab === 'comments' ? 'Visible comments' : 'Unread'}
          </option>
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="cms-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Author / Recipient</th>
              <th>Content</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {
                    data?.users.find((u) => u.id === (r.author_id || r.user_id))
                      ?.name
                  }
                </td>
                <td>
                  {r.text || 'Deleted comment'}
                  {r.edited_at && <small> · Edited</small>}
                </td>
                <td>
                  {tab === 'comments'
                    ? r.deleted
                      ? 'Removed'
                      : r.offer
                        ? 'Offer'
                        : 'Comment'
                    : r.read
                      ? 'Read'
                      : 'Unread'}
                </td>
                <td>
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                </td>
                <td>
                  {r.owner && (
                    <a
                      className="button"
                      href={
                        '/collectors?user=' +
                        encodeURIComponent(r.owner) +
                        (r.set ? '&set=' + encodeURIComponent(r.set) : '') +
                        '#comment-' +
                        r.id
                      }
                    >
                      View
                    </a>
                  )}
                  {tab === 'comments' && !r.deleted && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void remove(r.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p>No matching records.</p>}
      </div>
    </>
  );
}
