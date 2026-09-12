'use client';
import { useState } from 'react';
import { Share2, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
export function ShareActions({ url, title }: { url: string; title: string }) {
  const [message, setMessage] = useState('');
  return (
    <div className="mobile-share-actions">
      <input
        className="field"
        aria-label="Share URL"
        value={url}
        readOnly
        onFocus={(e) => e.target.select()}
      />
      <a
        className="button facebook-share"
        href={
          'https://www.facebook.com/sharer/sharer.php?u=' +
          encodeURIComponent(url) +
          '&hashtag=%23teksboy'
        }
        target="_blank"
        rel="noopener noreferrer"
      >
        <span aria-hidden="true" className="facebook-letter">f</span>
        Share on Facebook
      </a>
      <button
        className="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setMessage('Link copied.');
          } catch {
            setMessage('Select the link above to copy it.');
          }
        }}
      >
        <Copy size={17} />
        Copy link
      </button>
      {typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' && (
          <button
            className="button"
            onClick={async () => {
              try {
                await navigator.share({
                  title,
                  text: title + ' #teksboy',
                  url,
                });
              } catch (e) {
                if (!(e instanceof Error && e.name === 'AbortError'))
                  setMessage('Use Copy link to share this checklist.');
              }
            }}
          >
            <Share2 size={17} />
            More sharing options
          </button>
        )}
      <small>#teksboy</small>
      <output>{message}</output>
      {/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) && (
        <p className="share-local-note">
          This local link works on your device. Facebook previews will work once
          the site and checklist are publicly available.
        </p>
      )}
    </div>
  );
}
export default function ChecklistShare({
  userId,
  setId,
  title,
}: {
  userId: string;
  setId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="button checklist-share" onClick={() => setOpen(true)}>
        <Share2 size={15} />
        Share checklist
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="modal mobile-share-modal">
          <DialogTitle>Share my checklist</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
          {open && (
            <ShareActions
              url={
                new URL(
                  '/collectors?user=' +
                    encodeURIComponent(userId) +
                    '&set=' +
                    encodeURIComponent(setId),
                  window.location.origin,
                ).href
              }
              title={title}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
