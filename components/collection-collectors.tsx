'use client';
import { appFetch } from '@/lib/app-fetch';
import { useState } from 'react';
import { Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Avatar } from './my-profile';
import UserName from './user-name';
type Person = {
  id: string;
  name: string;
  photo: string;
  role: string;
  user_verified: boolean;
};
export default function CollectionCollectors({ setId }: { setId: string }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Person[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  async function show() {
    setOpen(true);
    setLoading(true);
    setError('');
    try {
      const r = await appFetch(
        '/__local/social/set-collectors?set=' + encodeURIComponent(setId),
      );
      const d = (await r.json()) as { collectors: Person[]; error?: string };
      if (!r.ok) throw Error(d.error);
      setRows(d.collectors);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load collectors.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <button className="button" onClick={() => void show()}>
        <Users size={14} />
        On Their Checklist
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="modal collection-collectors-modal">
          <DialogTitle>
            Collectors with this collection on their checklist
          </DialogTitle>
          <DialogDescription>
            Open a collector’s checklist to see their collection.
          </DialogDescription>
          {loading ? (
            <p>Loading collectors…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : !rows.length ? (
            <p>No collectors have added this set yet.</p>
          ) : (
            <div className="collection-collectors-list">
              {rows.map((u) => (
                <div key={u.id}>
                  <Avatar photo={u.photo} />
                  <UserName
                    name={u.name}
                    role={u.role}
                    verified={u.user_verified}
                  />
                  <a
                    className="button"
                    href={
                      '/collectors?user=' +
                      encodeURIComponent(u.id) +
                      '&set=' +
                      encodeURIComponent(setId)
                    }
                  >
                    View
                  </a>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
