'use client';
import { useEffect, useState } from 'react';
type Event = {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  category: string;
  target: string;
  detail: string;
};
export default function CmsActivity() {
  const [rows, setRows] = useState<Event[]>([]),
    [query, setQuery] = useState(''),
    [error, setError] = useState('');
  async function load() {
    try {
      const r = await fetch('/__local/activity');
      const d = (await r.json()) as { items: Event[]; error?: string };
      if (!r.ok) throw Error(d.error);
      setRows(d.items);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load activity.');
    }
  }
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <section>
      <div className="activity-tools">
        <input
          className="field"
          aria-label="Search activity"
          placeholder="Search activity…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <p className="profile-note">
        Latest 500 events · Activity is recorded from now on.
      </p>
      {error && <p role="alert">{error}</p>}
      <ol className="activity-timeline">
        {rows
          .filter((r) =>
            [r.actor, r.action, r.category, r.target]
              .join(' ')
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((r) => (
            <li key={r.id}>
              <time>{new Date(r.created_at).toLocaleString()}</time>
              <strong>
                {r.action}
                {r.target ? ' · ' + r.target : ''}
              </strong>
              <small>
                {r.actor} · {r.category}
                {r.detail ? ' · ' + r.detail : ''}
              </small>
            </li>
          ))}
      </ol>
      {!rows.length && <p>No activity recorded yet.</p>}
    </section>
  );
}
