'use client';
import { appFetch } from '@/lib/app-fetch';
/* eslint-disable next/no-img-element -- Original local card and proof previews. */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import UserName from './user-name';
import type { CmsData, CmsRow } from './local-cms';
async function request(endpoint: string, body: unknown) {
  const response = await appFetch('/__local/' + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { error?: string; url?: string };
  if (!response.ok) throw Error(result.error || 'Save failed.');
  return result;
}
export default function Collectors({
  data,
  refresh,
  initialCollector = null,
  initialScope = 'all',
}: {
  initialCollector?: string | null;
  initialScope?: string;
  data: CmsData;
  refresh: () => Promise<void>;
}) {
  const [scope, setScope] = useState(initialScope);
  const [search, setSearch] = useState(''),
    [collector, setCollector] = useState<string | null>(initialCollector),
    [draft, setDraft] = useState<CmsRow | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [sort, setSort] = useState('name'),
    [status, setStatus] = useState('all'),
    [verification, setVerification] = useState('all');
  const [setFilter, setSetFilter] = useState('all'),
    [collectionSort, setSetSort] = useState('name');
  const user = data.users.find((u) => u.id === collector);
  const sets = data.checklists.filter((l) => l.user_id === collector);
  const collection = data.collections.find((s) => s.id === draft?.set_id);
  function open(row: CmsRow) {
    setError('');
    setDraft(structuredClone(row));
  }
  function toggle(id: string) {
    setDraft((p) =>
      p
        ? {
            ...p,
            owned: p.owned?.includes(id)
              ? p.owned.filter((c) => c !== id)
              : [...(p.owned || []), id],
            verified: false,
          }
        : p,
    );
  }
  const complete = (l: CmsRow) => {
    const s = data.collections.find((s) => s.id === l.set_id);
    return !!s?.cards?.length && s.cards.every((c) => l.owned?.includes(c.id));
  };
  return (
    <>
      {!user ? (
        <>
          {scope !== 'all' && (
            <p className="profile-note">
              Showing{' '}
              {scope === 'active'
                ? 'active collectors with checklists'
                : scope === 'verified'
                  ? 'collectors with verified completed collections'
                  : 'collectors with completed collections'}
              . Use Reset to show everyone.
            </p>
          )}
          <div className="cms-toolbar">
            <input
              className="field"
              placeholder="Find a collector…"
              aria-label="Find a collector"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="field"
              aria-label="Filter collector status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <select
              className="field"
              aria-label="Filter verified collectors"
              value={verification}
              onChange={(e) => setVerification(e.target.value)}
            >
              <option value="all">All users</option>
              <option value="verified">Verified users</option>
              <option value="unverified">Unverified users</option>
            </select>
            <select
              className="field"
              aria-label="Sort collectors"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">Name A–Z</option>
              <option value="collections">Most collections</option>
              <option value="complete">Most completed</option>
              <option value="verified">Most verified complete</option>
            </select>
            <button
              className="button"
              onClick={() => {
                setScope('all');
                setSearch('');
                setStatus('all');
                setVerification('all');
                setSort('name');
              }}
            >
              Reset
            </button>
          </div>
          <div className="cms-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Collector</th>
                  <th>Collections</th>
                  <th>Complete</th>
                  <th>Verified complete</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.users
                  .filter(
                    (u) =>
                      scope === 'all' ||
                      data.checklists.some(
                        (l) =>
                          l.user_id === u.id &&
                          (scope === 'active'
                            ? u.status === 'active'
                            : complete(l) &&
                              (scope !== 'verified' || l.verified)),
                      ),
                  )
                  .filter((u) =>
                    (u.name || '').toLowerCase().includes(search.toLowerCase()),
                  )
                  .filter(
                    (u) =>
                      (status === 'all' || u.status === status) &&
                      (verification === 'all' ||
                        !!u.user_verified === (verification === 'verified')),
                  )
                  .sort((a, b) => {
                    if (sort === 'name')
                      return (a.name || '').localeCompare(b.name || '');
                    const count = (id: string) =>
                      data.checklists.filter(
                        (l) =>
                          l.user_id === id &&
                          (sort === 'collections' ||
                            (complete(l) &&
                              (sort !== 'verified' || l.verified))),
                      ).length;
                    return (
                      count(b.id) - count(a.id) ||
                      (a.name || '').localeCompare(b.name || '')
                    );
                  })
                  .map((u) => {
                    const lists = data.checklists.filter(
                      (l) => l.user_id === u.id,
                    );
                    return (
                      <tr key={u.id}>
                        <td>
                          <UserName
                            name={u.name}
                            verified={u.user_verified}
                            role={u.role}
                          />
                          <small className="collector-account-status">
                            {u.status}
                          </small>
                        </td>
                        <td>{lists.length}</td>
                        <td>{lists.filter(complete).length}</td>
                        <td>
                          {
                            lists.filter((l) => l.verified && complete(l))
                              .length
                          }
                        </td>
                        <td>
                          <button
                            className="button"
                            onClick={() => setCollector(u.id)}
                          >
                            Manage collections
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="cms-toolbar">
            <button className="button" onClick={() => setCollector(null)}>
              ← All collectors
            </button>
            <UserName
              name={user.name}
              verified={user.user_verified}
              role={user.role}
            />
            <button
              className="button primary"
              onClick={() =>
                open({
                  id: '',
                  user_id: user.id,
                  set_id: '',
                  owned: [],
                  verified: false,
                  proof: '',
                  notes: '',
                })
              }
            >
              Add collection
            </button>
          </div>
          <div className="cms-toolbar">
            <select
              className="field"
              aria-label="Filter collector collections"
              value={setFilter}
              onChange={(e) => setSetFilter(e.target.value)}
            >
              <option value="all">All collections</option>
              <option value="complete">Completed</option>
              <option value="progress">In progress</option>
              <option value="verified">Verified collections</option>
              <option value="unverified">Unverified collections</option>
            </select>
            <select
              className="field"
              aria-label="Sort collector collections"
              value={collectionSort}
              onChange={(e) => setSetSort(e.target.value)}
            >
              <option value="name">Name A–Z</option>
              <option value="collected">Most collected cards</option>
            </select>
          </div>
          <div className="cms-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Collection</th>
                  <th>Collected</th>
                  <th>Verification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sets
                  .filter(
                    (l) =>
                      setFilter === 'all' ||
                      (setFilter === 'complete'
                        ? complete(l)
                        : setFilter === 'progress'
                          ? !complete(l)
                          : setFilter === 'verified'
                            ? !!l.verified
                            : !l.verified),
                  )
                  .sort((a, b) =>
                    collectionSort === 'collected'
                      ? (b.owned?.length || 0) - (a.owned?.length || 0)
                      : (
                          data.collections.find((s) => s.id === a.set_id)
                            ?.name || ''
                        ).localeCompare(
                          data.collections.find((s) => s.id === b.set_id)
                            ?.name || '',
                        ),
                  )
                  .map((l) => {
                    const s = data.collections.find((s) => s.id === l.set_id);
                    return (
                      <tr key={l.id}>
                        <td>{s?.name || l.set_id}</td>
                        <td>
                          {l.owned?.length || 0} / {s?.cards?.length || 0}
                        </td>
                        <td>
                          {l.verified ? (
                            <span className="verification-badge">
                              ✓ Verified
                            </span>
                          ) : (
                            'Not verified'
                          )}
                        </td>
                        <td>
                          <button className="button" onClick={() => open(l)}>
                            Review / edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {!sets.length && (
              <p className="cms-empty">
                This collector has no collections yet.
              </p>
            )}
          </div>
        </>
      )}
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(null);
        }}
      >
        <DialogContent className="modal collector-review">
          <DialogTitle>Review collection</DialogTitle>
          <DialogDescription>
            {user?.name} · Checklist and verification
          </DialogDescription>
          {draft && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  await request('checklist', { row: draft });
                  await refresh();
                  setDraft(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Save failed.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="form-label">
                Collection
                <select
                  required
                  disabled={!!draft.id || busy}
                  className="field"
                  value={draft.set_id}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      set_id: e.target.value,
                      owned: [],
                      verified: false,
                    })
                  }
                >
                  <option value="">Choose collection</option>
                  {data.collections
                    .filter(
                      (s) =>
                        s.id === draft.set_id ||
                        !sets.some((l) => l.set_id === s.id),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              {collection && (
                <>
                  <div className="cms-toolbar">
                    <strong>
                      {draft.owned?.length || 0} /{' '}
                      {collection.cards?.length || 0} collected
                    </strong>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          owned: collection.cards?.map((c) => c.id) || [],
                          verified: false,
                        })
                      }
                    >
                      Mark all collected
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        setDraft({ ...draft, owned: [], verified: false })
                      }
                    >
                      Mark all missing
                    </button>
                  </div>
                  <div className="collector-card-grid">
                    {collection.cards?.map((c) => (
                      <button
                        type="button"
                        disabled={busy}
                        key={c.id}
                        aria-label={'Card ' + c.number}
                        aria-pressed={draft.owned?.includes(c.id)}
                        onClick={() => toggle(c.id)}
                      >
                        <img src={c.image} alt="" loading="lazy" />
                        <span>
                          {draft.owned?.includes(c.id)
                            ? '✓ Collected'
                            : '− Missing'}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <label className="verification-toggle">
                <input
                  type="checkbox"
                  checked={!!draft.verified}
                  disabled={busy || !collection}
                  onChange={(e) =>
                    setDraft({ ...draft, verified: e.target.checked })
                  }
                />{' '}
                Verified collection
              </label>
              <p className="profile-note">
                Proof is optional. Changing collected cards or replacing proof
                clears verification. Save those changes first, then verify. Only
                verified complete sets count toward leaderboard rank.
              </p>
              {draft.verified_at && (
                <p className="profile-note">
                  Verified {new Date(draft.verified_at).toLocaleString()} by{' '}
                  {data.users.find((u) => u.id === draft.verified_by)?.name ||
                    'Administrator'}
                </p>
              )}
              <label className="form-label">
                Proof image (optional)
                <input
                  type="file"
                  disabled={busy}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setBusy(true);
                    setError('');
                    try {
                      const base64 = await new Promise<string>(
                        (resolve, reject) => {
                          const r = new FileReader();
                          r.onload = () =>
                            resolve((r.result as string).split(',')[1]);
                          r.onerror = reject;
                          r.readAsDataURL(file);
                        },
                      );
                      const result = await request('upload', {
                        purpose: 'proof',
                        type: file.type,
                        base64,
                      });
                      setDraft((p) =>
                        p ? { ...p, proof: result.url, verified: false } : p,
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : 'Upload failed.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
              {draft.proof && (
                <div className="collector-proof">
                  <a href={draft.proof} target="_blank" rel="noreferrer">
                    <img src={draft.proof} alt="Collection proof" />
                  </a>
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      setDraft({ ...draft, proof: '', verified: false })
                    }
                  >
                    Remove proof
                  </button>
                </div>
              )}
              <label className="form-label">
                Private admin note
                <textarea
                  className="field"
                  maxLength={2000}
                  rows={3}
                  value={draft.notes || ''}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                />
              </label>
              <p className="profile-note">
                Notes and proof images are visible only inside the CMS.
              </p>
              {error && (
                <p className="cms-form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="profile-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={busy || !collection}
                >
                  {busy ? 'Saving…' : 'Save review'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
