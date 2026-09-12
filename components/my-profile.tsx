'use client';
import { appFetch } from '@/lib/app-fetch';
/* eslint-disable next/no-img-element -- Local avatar previews include uploaded data URLs. */
import RemoveAction from './remove-action';
import { useEffect, useState } from 'react';
import { UserRound, Upload, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export type ProfileInfo = {
  bio?: string;
  facebookUrl?: string;
  displayName: string;
  photo: string;
  leaderboardVisible?: boolean;
};
export const emptyProfile: ProfileInfo = { displayName: '', photo: '' };
export const profileKey = (id: string) => `teksboy-profile-${id}`;

export function Avatar({
  photo,
  className = '',
}: {
  photo: string;
  className?: string;
}) {
  const [failed, setFailed] = useState('');
  return (
    <span className={'profile-avatar ' + className}>
      {photo && failed !== photo ? (
        <img src={photo} alt="Avatar" onError={() => setFailed(photo)} />
      ) : (
        <UserRound aria-label="Default profile photo" />
      )}
    </span>
  );
}
export default function MyProfile({
  profile,
  email,
  role,
  onClose,
  onSave,
}: {
  profile: ProfileInfo;
  email: string;
  role: string;
  onClose: () => void;
  onSave: (value: ProfileInfo) => void | Promise<void>;
}) {
  const [presets, setPresets] = useState<
    { id: string; name: string; image: string }[]
  >([]);
  useEffect(() => {
    void appFetch('/__local/avatars')
      .then(async (r) => {
        if (!r.ok) throw Error('Avatar choices unavailable.');
        return (await r.json()) as {
          avatars: { id: string; name: string; image: string }[];
        };
      })
      .then((d) => setPresets(d.avatars))
      .catch(() => {});
  }, []);
  const [draft, setDraft] = useState(profile);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError('Choose a JPG, PNG or WebP image under 5 MB.');
      return;
    }
    setLoading(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Image processing unavailable.');
      const size = Math.min(image.width, image.height);
      ctx.drawImage(
        image,
        (image.width - size) / 2,
        (image.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      setDraft((p) => ({ ...p, photo: canvas.toDataURL('image/webp', 0.85) }));
    } catch {
      setError('This image could not be opened. Try another photo.');
    } finally {
      URL.revokeObjectURL(url);
      setLoading(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent className="modal profile-modal">
        <DialogTitle>My Profile</DialogTitle>
        <DialogDescription>
          A name and photo for your collection.
        </DialogDescription>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            if ((draft.bio || '').length > 90) {
              setError('Please shorten your bio to 90 characters.');
              return;
            }
            try {
              setLoading(true);
              await onSave({ ...draft, displayName: draft.displayName.trim() });
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : 'Your profile could not be saved. Please try again.',
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="profile-preview">
            <Avatar photo={draft.photo} />
            <div>
              <strong>{draft.displayName.trim() || 'Your profile'}</strong>
              <label className="button profile-upload">
                <Upload size={14} />
                {loading ? 'Preparing…' : 'Upload photo'}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={loading}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
          <fieldset className="avatar-choices">
            <legend>Or choose a character</legend>
            <div className="avatar-options">
              <button
                type="button"
                disabled={loading}
                className={!draft.photo ? 'selected' : ''}
                aria-pressed={!draft.photo}
                onClick={() => setDraft((p) => ({ ...p, photo: '' }))}
              >
                <Avatar photo="" />
                <span>Default</span>
              </button>
              {presets.map(({ id, name, image: photo }) => {
                return (
                  <button
                    type="button"
                    disabled={loading}
                    key={id}
                    aria-label={name}
                    className={draft.photo === photo ? 'selected' : ''}
                    aria-pressed={draft.photo === photo}
                    onClick={() => setDraft((p) => ({ ...p, photo }))}
                  >
                    <Avatar photo={photo} />
                    <span>{name}</span>
                    {draft.photo === photo && (
                      <Check className="avatar-check" size={13} />
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="form-label" htmlFor="profile-name">
            Display name
          </label>
          <input
            id="profile-name"
            className="field"
            autoComplete="off"
            placeholder="What should we call you?"
            maxLength={40}
            value={draft.displayName}
            onChange={(e) =>
              setDraft((p) => ({ ...p, displayName: e.target.value }))
            }
            aria-describedby="profile-name-note"
          />
          <p id="profile-name-note" className="profile-note">
            Once provided, your display name will appear instead of your email
            address, so your email isn’t shown in your profile.
          </p>
          <label className="form-label" htmlFor="profile-facebook">
            Facebook profile link
          </label>
          <input
            id="profile-facebook"
            className="field"
            type="url"
            maxLength={500}
            placeholder="https://www.facebook.com/yourprofile"
            value={draft.facebookUrl || ''}
            onChange={(e) =>
              setDraft((p) => ({ ...p, facebookUrl: e.target.value }))
            }
          />
          <label className="form-label" htmlFor="profile-bio">
            Bio / intro
          </label>
          <textarea
            id="profile-bio"
            aria-invalid={(draft.bio || '').length > 90}
            aria-describedby="profile-bio-limit"
            className="field"
            maxLength={90}
            rows={3}
            value={draft.bio || ''}
            placeholder="Tell other collectors a little about yourself…"
            onChange={(e) => setDraft((p) => ({ ...p, bio: e.target.value }))}
          />
          <small
            id="profile-bio-limit"
            className={
              (draft.bio || '').length > 90 ? 'profile-error' : 'profile-note'
            }
          >
            {(draft.bio || '').length}/90 characters · Public on your profile
          </small>
          {(draft.bio || '').length > 90 && (
            <p className="profile-error" role="alert">
              Your existing bio exceeds the new limit. Remove{' '}
              {(draft.bio || '').length - 90} characters to save.
            </p>
          )}
          <p className="profile-email">Signed in as {email}</p>
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          <div className="profile-actions">
            <button
              type="button"
              className="button"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={loading || (draft.bio || '').length > 90}
            >
              Save profile
            </button>
          </div>
        </form>
        {role !== 'Super Admin' && (
          <div className="profile-danger-zone">
            <RemoveAction kind="account" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
