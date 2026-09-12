'use client';
import { appFetch } from '@/lib/app-fetch';
/* eslint-disable next/no-img-element -- Private collection evidence. */
import { useEffect, useState } from 'react';
import UserName from './user-name';
import { Avatar } from './my-profile';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
type Request = {
  id: string;
  status: string;
  set_name: string;
  image: string;
  note: string;
  reason?: string;
  created_at: string;
  user: { name: string; photo: string; role: string; user_verified: boolean };
};
export default function CmsVerifications() {
  const [rows, setRows] = useState<Request[]>([]),
    [filter, setFilter] = useState('pending'),
    [selected, setSelected] = useState<Request | null>(null),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await appFetch('/__local/verification-review');
    const d = (await r.json()) as { requests: Request[]; error?: string };
    if (!r.ok) throw Error(d.error);
    setRows(d.requests);
  }
  useEffect(() => {
    const timer = setTimeout(
      () => void load().catch((e) => setError(e.message)),
      0,
    );
    return () => clearTimeout(timer);
  }, []);
  async function review(decision: string) {
    setBusy(true);
    setError('');
    try {
      const r = await appFetch('/__local/verification-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected?.id, decision, reason }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter((r) => filter === 'all' || r.status === filter);
  return (
    <section>
      <div className="cms-toolbar">
        <select
          className="field"
          aria-label="Filter verification requests"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {['pending', 'approved', 'rejected', 'outdated', 'all'].map((v) => (
            <option key={v} value={v}>
              {v[0].toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
        <button
          className="button"
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          Refresh
        </button>
      </div>
      {error && !selected && (
        <p role="alert" className="cms-message">
          {error}
        </p>
      )}
      <div className="verification-queue">
        {visible.map((r) => (
          <article key={r.id}>
            <div className="verification-person">
              <Avatar photo={r.user.photo} />
              <UserName
                name={r.user.name}
                role={r.user.role}
                verified={r.user.user_verified}
              />
            </div>
            <h3>{r.set_name}</h3>
            <small>
              {r.status} · {new Date(r.created_at).toLocaleDateString()}
            </small>
            <button
              className="button"
              onClick={() => {
                setSelected(r);
                setReason('');
                setError('');
              }}
            >
              Review evidence
            </button>
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="empty">
          No {filter === 'all' ? '' : filter} verification requests.
        </p>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v && !busy) setSelected(null);
        }}
      >
        <DialogContent className="modal verification-review-modal">
          <DialogTitle>{selected?.set_name}</DialogTitle>
          <DialogDescription>
            Review the collector’s photo before approving the complete set.
          </DialogDescription>
          {selected && (
            <>
              <a href={selected.image} target="_blank" rel="noreferrer">
                <img
                  className="verification-evidence"
                  src={selected.image}
                  alt="Submitted collection evidence"
                />
              </a>
              <p>{selected.note}</p>
              {selected.reason && <p>Review note: {selected.reason}</p>}
              {['pending', 'outdated'].includes(selected.status) && (
                <>
                  <label className="form-label">
                    Review note (required to reject)
                    <textarea
                      className="field"
                      rows={2}
                      maxLength={300}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  {selected.status === 'outdated' && (
                    <p>
                      This checklist changed after submission. It cannot be
                      approved.
                    </p>
                  )}
                  <div className="verification-actions">
                    <button
                      className="button"
                      disabled={busy || !reason.trim()}
                      onClick={() => void review('rejected')}
                    >
                      Reject request
                    </button>
                    <button
                      className="button primary"
                      disabled={busy || selected.status !== 'pending'}
                      onClick={() => void review('approved')}
                    >
                      Approve collection
                    </button>
                  </div>
                </>
              )}
              {error && (
                <p role="alert" className="profile-error">
                  {error}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
