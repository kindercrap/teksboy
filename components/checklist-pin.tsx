'use client';
import { useEffect, useState } from 'react';
import { Pin } from 'lucide-react';
export default function ChecklistPin({
  setId,
  onSaved,
}: {
  setId: string;
  onSaved: () => void;
}) {
  const [text, setText] = useState(''),
    [saved, setSaved] = useState(''),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetch('/__local/collector')
      .then(async (r) => {
        if (!r.ok) throw Error('Unable to load message.');
        return (await r.json()) as {
          metadata?: Record<string, { pinned_message?: string }>;
        };
      })
      .then((d) => {
        if (active) {
          const value = d.metadata?.[setId]?.pinned_message || '';
          setText(value);
          setSaved(value);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [setId]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/__local/collector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: { setId, text } }),
      });
      const d = (await r.json()) as {
        error?: string;
        metadata?: Record<string, { pinned_message?: string }>;
      };
      if (!r.ok) throw Error(d.error);
      if (d.metadata?.[setId]?.pinned_message !== text.trim())
        throw Error(
          'The server did not save your message. Restart the local server and try again. Your text is still here.',
        );
      setSaved(d.metadata[setId].pinned_message!);
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="checklist-pin editor-pin">
      {error && <p role="alert">{error}</p>}
      {editing ? (
        <>
          <label htmlFor="checklist-pin-text">Pinned message</label>
          <textarea
            id="checklist-pin-text"
            className="field"
            rows={3}
            maxLength={100}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <small>
            {text.length}/100 · Visible to everyone. Clear the text to remove
            it.
          </small>
          <div>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void save()}
            >
              Save message
            </button>{' '}
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                setText(saved);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            className="button"
            disabled={!ready}
            onClick={() => setEditing(true)}
          >
            <Pin size={13} />
            {saved ? 'Edit pinned message' : 'Add pinned message'}
          </button>
          {saved && <p>{saved}</p>}
        </>
      )}
    </aside>
  );
}
