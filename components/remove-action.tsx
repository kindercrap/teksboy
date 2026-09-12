'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
export default function RemoveAction({
  kind,
  id,
  onRemoved,
  disabled = false,
}: {
  kind: 'account' | 'checklist' | 'comment';
  id?: string;
  disabled?: boolean;
  onRemoved?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const label =
    kind === 'account'
      ? 'Delete account'
      : kind === 'checklist'
        ? 'Remove checklist'
        : 'Remove comment';
  const description =
    kind === 'account'
      ? 'Permanently delete your profile, checklists, progress, comments and verification evidence. You will be signed out. This cannot be undone.'
      : kind === 'checklist'
        ? 'Permanently remove this checklist from your profile, including all collected teks progress, its pinned message, comments and verification evidence. This cannot be undone.'
        : 'Permanently remove your comment. Replies from other collectors will remain. This cannot be undone.';
  async function remove() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/__local/remove-' + kind, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, confirm: true }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      setOpen(false);
      if (onRemoved) await onRemoved();
      else window.location.assign(kind === 'account' ? '/' : '/checklist');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to remove.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="button danger-link"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Trash2 size={13} />
        {label}
      </button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="modal remove-confirm">
          <DialogTitle>{label} permanently?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {error && (
            <p role="alert" className="profile-error">
              {error}
            </p>
          )}
          <div className="confirmation-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? 'Removing…' : label}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
