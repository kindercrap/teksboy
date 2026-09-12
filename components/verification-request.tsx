'use client';
import { appFetch } from '@/lib/app-fetch';
import { useEffect, useState, useCallback } from 'react';
import { BadgeCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
type Status = {
  complete: boolean;
  verified: boolean;
  request: null | { status: string; reason: string };
};
export default function VerificationRequest({
  setId,
  name,
}: {
  setId: string;
  name: string;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [open, setOpen] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await appFetch(
      '/__local/verification?set=' + encodeURIComponent(setId),
    );
    const d = (await r.json()) as Status & { error?: string };
    if (!r.ok) throw Error(d.error);
    setStatus(d);
  }, [setId]);
  useEffect(() => {
    const timer = setTimeout(
      () => void load().catch((e) => setError(e.message)),
      0,
    );
    return () => clearTimeout(timer);
  }, [load]);
  async function submit() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size > 8 * 1024 * 1024
      )
        throw Error('Choose a JPG, PNG or WebP photo under 8 MB.');
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(
            (typeof reader.result === 'string' ? reader.result : '').split(
              ',',
            )[1],
          );
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await appFetch('/__local/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId, type: file.type, base64, note }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      await load();
      setOpen(false);
      setFile(null);
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit.');
    } finally {
      setBusy(false);
    }
  }
  if (status?.verified) return null;
  return (
    <div className="verification-request">
      {status?.request?.status === 'pending' ? (
        <p>Verification requested · Awaiting review</p>
      ) : (
        <>
          <button
            className="button"
            disabled={!status?.complete}
            onClick={() => {
              setError('');
              setOpen(true);
            }}
          >
            <BadgeCheck size={14} />
            Request set verification
          </button>
          {status && !status.complete && (
            <p>
              Save your completed checklist first, then reopen it to request
              verification.
            </p>
          )}
          {status?.request?.status === 'rejected' && (
            <p>Previous request declined: {status.request.reason}</p>
          )}
          {status?.request?.status === 'outdated' && (
            <p>Your checklist changed. Please submit an updated photo.</p>
          )}
        </>
      )}
      {error && !open && <p role="alert">{error}</p>}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="modal verification-modal">
          <DialogTitle>Verify your completed set</DialogTitle>
          <DialogDescription>
            Submit a clear photo of your complete {name} collection. Arrange the
            cards so a reviewer can see the whole set. Your evidence photo is
            visible only to you and CMS reviewers.
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="form-label">
              Collection photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <p className="profile-note">JPG, PNG or WebP · Up to 8 MB</p>
            <label className="form-label">
              Note for the reviewer (optional)
              <textarea
                className="field"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p className="profile-note">
              Approval adds a verified collection badge. You will be notified of
              the result.
            </p>
            {error && (
              <p role="alert" className="profile-error">
                {error}
              </p>
            )}
            <small className="character-count">
              {note.length}/300 characters
            </small>
            <div className="verification-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy || !file}>
                {busy ? 'Submitting…' : 'Submit for review'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
