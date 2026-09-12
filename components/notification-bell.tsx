'use client';
/* eslint-disable next/no-html-link-for-pages -- Full-page navigation follows this app's local routing. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { socialApi } from '@/lib/social-api';
type Notice = {
  id: string;
  text: string;
  link: string;
  read: boolean;
  created_at: string;
};
export default function NotificationBell() {
  const [panelTop, setPanelTop] = useState(70);
  const [items, setItems] = useState<Notice[]>([]),
    [open, setOpen] = useState(false),
    [error, setError] = useState('');
  async function refresh() {
    try {
      setItems((await socialApi<{ items: Notice[] }>('notifications')).items);
    } catch {
      setItems([]);
    }
  }
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0),
      timer = setInterval(() => void refresh(), 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="notification-bell">
      <button
        className="icon-button"
        aria-label={
          'Notifications, ' + items.filter((i) => !i.read).length + ' unread'
        }
        aria-expanded={open}
        onClick={(e) => {
          setPanelTop(
            Math.max(
              12,
              Math.min(
                e.currentTarget.getBoundingClientRect().bottom + 8,
                window.innerHeight - 320,
              ),
            ),
          );
          setOpen(!open);
          void refresh();
        }}
      >
        <Bell size={18} />
        {items.some((i) => !i.read) && (
          <b>{items.filter((i) => !i.read).length}</b>
        )}
      </button>
      {open &&
        createPortal(
          <section
            className="notification-list notification-portal"
            style={{ top: panelTop, maxHeight:`calc(100dvh - ${panelTop + 16}px)` }}
          >
            <h2>Notifications</h2>
            <button
              className="button"
              onClick={() =>
                void socialApi('notifications', {})
                  .then(refresh)
                  .catch((e) => setError(e.message))
              }
            >
              Mark all read
            </button>
            {error && <p role="alert">{error}</p>}
            {items.length ? (
              items.slice(0, 50).map((n) => (
                <a
                  className={n.read ? '' : 'unread'}
                  key={n.id}
                  href={n.link}
                  onClick={(e) => {
                    e.preventDefault();
                    void socialApi('notifications', { id: n.id })
                      .then(() => window.location.assign(n.link))
                      .catch((e) => setError(e.message));
                  }}
                >
                  {n.text}
                  <small>{new Date(n.created_at).toLocaleString()}</small>
                </a>
              ))
            ) : (
              <p>No notifications yet.</p>
            )}
            <button className="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </section>,
          document.body,
        )}
    </div>
  );
}
