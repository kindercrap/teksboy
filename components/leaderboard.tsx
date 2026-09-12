'use client';
import { appFetch } from '@/lib/app-fetch';
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Avatar } from './my-profile';
import UserName from './user-name';
type Ranking = {
  id: string;
  name: string;
  photo: string;
  role: string;
  user_verified?: boolean;
  completed: number;
  verified: number;
  rank: number;
};
export default function Leaderboard() {
  const [verifiedCollections, setVerifiedCollections] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [group, setGroup] = useState('all'),
    [groups, setGroups] = useState<{ id: string; name: string }[]>([]),
    [rows, setRows] = useState<Ranking[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const r = await appFetch(
          '/__local/leaderboard?group=' +
            encodeURIComponent(group) +
            (verifiedOnly ? '&verified=1' : '') +
            (verifiedCollections ? '&verifiedCollections=1' : ''),
          { signal: controller.signal },
        );
        if (!r.ok) throw Error('Could not load the leaderboard.');
        const data = (await r.json()) as {
          rows: Ranking[];
          groups: { id: string; name: string }[];
        };
        setRows(data.rows);
        setGroups(data.groups);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Could not load the leaderboard.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [group, refresh, verifiedOnly, verifiedCollections]);
  return (
    <section className="leaderboard">
      <div className="page-title">
        <h1>
          <Trophy size={25} /> TOP 10 COLLECTORS
        </h1>
        <p>
          {verifiedCollections
            ? 'Ranked by verified completed collections.'
            : 'Ranked by completed collections.'}
        </p>
      </div>
      <div className="leaderboard-toolbar">
        <label>
          Collection group
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="field"
          >
            <option value="all">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="verified-filter">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
          />{' '}
          Verified collectors only
        </label>
        <label className="verified-filter">
          <input
            type="checkbox"
            checked={verifiedCollections}
            onChange={(e) => setVerifiedCollections(e.target.checked)}
          />{' '}
          Verified collections only
        </label>
        <button
          className="button"
          onClick={() => setRefresh((n) => n + 1)}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      {loading ? (
        <p className="empty">Loading rankings…</p>
      ) : error ? (
        <p className="empty" role="alert">
          {error}
        </p>
      ) : !rows.length ? (
        <div className="empty">
          <Trophy />
          <h2>No completed sets yet.</h2>
          <p>Complete a collection to earn your place.</p>
        </div>
      ) : (
        <div className="leaderboard-table">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Collector</th>
                <th>Completed collections</th>
                <th>Verified complete</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={
                    r.rank <= 3 ? 'podium-row podium-' + r.rank : undefined
                  }
                >
                  <td className="leaderboard-rank">
                    {r.rank <= 3 && (
                      <Trophy
                        className={'rank-trophy rank-' + r.rank}
                        aria-label={
                          ['', 'Gold trophy', 'Silver trophy', 'Bronze trophy'][
                            r.rank
                          ]
                        }
                      />
                    )}{' '}
                    #{r.rank}
                  </td>
                  <td>
                    <a
                      href={'/collectors?user=' + encodeURIComponent(r.id)}
                      className="leaderboard-identity"
                    >
                      <Avatar photo={r.photo} />
                      <UserName
                        name={r.name}
                        verified={r.user_verified}
                        role={r.role}
                      />
                    </a>
                  </td>
                  <td className="leaderboard-score" data-label="Completed">
                    {r.completed}
                  </td>
                  <td data-label="Verified complete">{r.verified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="leaderboard-note">
        Equal completed totals share a rank. Role badges do not affect ranking.
        The verified collections filter counts verified completed sets only.
      </p>
    </section>
  );
}
