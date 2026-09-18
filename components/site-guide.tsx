'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, Layers } from 'lucide-react';
import { appFetch } from '@/lib/app-fetch';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';

type Feature = 'archives' | 'checklist' | 'collectors' | 'community';
type Step = { selector: string; text: string };
const guides: Record<Feature, { title: string; steps: Step[] }> = {
  archives: {
    title: 'Explore Teks Sets',
    steps: [
      {
        selector: '.navigation-drawer .archive-tools, .sidebar .archive-tools',
        text: 'Search by collection name, or filter and sort the series.',
      },
      {
        selector:
          '.navigation-drawer .category-list section, .sidebar .category-list section',
        text: 'Open a group to see its sets. Collections Overview shows all the sets in that group.',
      },
    ],
  },
  checklist: {
    title: 'Your checklist',
    steps: [
      {
        selector: '.checklist-modal .teks-card',
        text: 'Tap a card to mark it collected or missing. Each card has a number you can use when talking with other collectors.',
      },
      {
        selector:
          '.checklist-modal .checklist-tools, .checklist-modal .checklist-toolbar',
        text: 'Filter missing cards, check the whole set, or download your missing cards to share.',
      },
      {
        selector: '.checklist-modal [data-guide-save]',
        text: 'Changes save automatically. Check the save status before leaving; your progress appears on your public profile.',
      },
    ],
  },
  collectors: {
    title: 'Meet the collectors',
    steps: [
      {
        selector: '.social-page .social-heading',
        text: 'Discover collectors here, or use Leaderboard to see the most completed collections.',
      },
      {
        selector: '.collector-summary, .collector-profile-header',
        text: 'Open a collector’s profile to explore their checklists and leave a friendly comment.',
      },
    ],
  },
  community: {
    title: 'Find your community',
    steps: [
      {
        selector: '.community-page h1, .community-heading, .community-toolbar',
        text: 'Find community groups, pages, sellers and collectors in one place.',
      },
      {
        selector: '.community-card',
        text: 'Read the description and use Visit to open the community link.',
      },
    ],
  },
};
function readStored(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as string[];
  } catch {
    return [];
  }
}
function visible(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(
    (el) =>
      el.getBoundingClientRect().width > 0 &&
      el.getBoundingClientRect().height > 0,
  );
}

const storageKey = 'teksboy-guide-v1';
export default function SiteGuide({
  ready,
  guest = false,
  userId,
  view,
  archivesOpen,
  checklistOpen,
}: {
  ready: boolean;
  guest?: boolean;
  userId?: string;
  view: string;
  archivesOpen: boolean;
  checklistOpen: boolean;
}) {
  const [loaded, setLoaded] = useState(false),
    [completed, setCompleted] = useState<string[]>([]),
    [welcome, setWelcome] = useState(false),
    [picker, setPicker] = useState(false),
    [active, setActive] = useState<Feature | null>(null),
    [index, setIndex] = useState(0),
    [steps, setSteps] = useState<Step[]>([]),
    [rect, setRect] = useState<{
      top: number;
      left: number;
      width: number;
      height: number;
      vh: number;
      vw: number;
    } | null>(null);
  const completion = useRef<string[]>([]),
    tooltip = useRef<HTMLDialogElement>(null),
    previousFocus = useRef<HTMLElement | null>(null),
    pending = useRef(new Set<string>());
  const persist = useCallback(
    async (keys: string[]) => {
      const all = [...new Set([...completion.current, ...keys])];
      completion.current = all;
      setCompleted(all);
      try {
        localStorage.setItem(
          storageKey + (userId ? ':' + userId : ''),
          JSON.stringify(all),
        );
      } catch {}
      if (userId) {
        try {
          const r = await appFetch('/__local/guide-progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: all }),
          });
          if (!r.ok) throw Error();
          pending.current.clear();
        } catch {
          keys.forEach((k) => pending.current.add(k));
        }
      }
    },
    [userId],
  );
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      let saved = [
        ...readStored(storageKey),
        ...readStored(storageKey + (userId ? ':' + userId : '')),
      ];
      if (userId) {
        try {
          const r = await appFetch('/__local/guide-progress');
          if (!r.ok) throw Error();
          const d = (await r.json()) as { completed: string[] };
          saved.push(...d.completed);
        } catch {
          /* Browser copy prevents repeated interruptions while offline. */
        }
      }
      if (cancelled) return;
      saved = [...new Set(saved)].filter((k) => k === 'welcome' || k in guides);
      completion.current = saved;
      setCompleted(saved);
      setWelcome(!saved.includes('welcome'));
      setLoaded(true);
      if (userId && saved.length) void persist(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, userId, persist]);
  useEffect(() => {
    const retry = () => {
      if (pending.current.size) void persist([...pending.current]);
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [persist]);
  const start = useCallback((feature: Feature) => {
    const found = guides[feature].steps.filter((s) => visible(s.selector)).map(s => guest && s.selector.includes('data-guide-save') ? {...s, text:'Changes save automatically in this browser. Sign in to sync your guest checklist across devices.'} : s);
    if (!found.length) return false;
    previousFocus.current = document.activeElement as HTMLElement;
    setSteps(found);
    setIndex(0);
    setActive(feature);
    setPicker(false);
    return true;
  }, [guest]);
  useEffect(() => {
    if (!loaded || welcome || active || picker) return;
    const feature: Feature | null = checklistOpen
      ? 'checklist'
      : archivesOpen ||
          (view === 'database' && !!visible('.sidebar .archive-tools'))
        ? 'archives'
        : view === 'collectors'
          ? 'collectors'
          : view === 'community'
            ? 'community'
            : null;
    let replay = '';
    try {
      replay = sessionStorage.getItem('teksboy-guide-replay') || '';
    } catch {}
    if (!feature || (completed.includes(feature) && replay !== feature)) return;
    // Wait for real content, never start a tour over a skeleton or another dialog.
    const timer = window.setInterval(() => {
      if (document.querySelector('.content-skeleton')) return;
      const openDialog = document.querySelector(
        '[data-slot="dialog-content"][data-open]',
      );
      if (
        openDialog &&
        !(
          (feature === 'archives' &&
            openDialog.matches('.navigation-drawer')) ||
          (feature === 'checklist' && openDialog.matches('.checklist-modal'))
        )
      )
        return;
      if (start(feature)) {
        clearInterval(timer);
        try {
          sessionStorage.removeItem('teksboy-guide-replay');
        } catch {}
      }
    }, 700);
    return () => clearInterval(timer);
  }, [
    loaded,
    welcome,
    active,
    picker,
    completed,
    view,
    archivesOpen,
    checklistOpen,
    start,
  ]);
  useEffect(() => {
    if (!active) return;
    const step = steps[index],
      el = visible(step.selector);
    if (!el) {
      const timer = window.setTimeout(() => {
        setRect(null);
        setActive(null);
      }, 0);
      return () => clearTimeout(timer);
    }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        vh: window.innerHeight,
        vw: window.innerWidth,
      });
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, index, steps]);
  const tooltipVisible = !!rect;
  useEffect(() => {
    if (tooltipVisible) tooltip.current?.focus();
  }, [active, index, tooltipVisible]);
  function finish() {
    if (active) void persist([active]);
    setActive(null);
    setRect(null);
    previousFocus.current?.focus();
  }
  const closeWelcome = () => {
    setWelcome(false);
    void persist(['welcome']);
  };
  const targetPortal =
    typeof document === 'undefined'
      ? null
      : document.querySelector(
          '.navigation-drawer[data-open], .checklist-modal[data-open]',
        ) || document.body;
  const hostRect =
    targetPortal && targetPortal !== document.body
      ? targetPortal.getBoundingClientRect()
      : null;
  const offsetX = hostRect?.left || 0,
    offsetY = hostRect?.top || 0;
  const availableWidth = Math.min(rect?.vw || 360, hostRect?.width || Infinity);
  return (
    <>
      <button
        className="site-guide-launch"
        aria-label="Tutorials and site guide"
        title="Tutorials / Site Guide"
        onClick={() => setPicker(true)}
      >
        <CircleHelp size={19} />
      </button>
      <Dialog
        open={welcome}
        onOpenChange={(o) => {
          if (!o) closeWelcome();
        }}
      >
        <DialogContent className="welcome-modal">
          <Layers size={34} className="home-card-icon" />
          <DialogTitle>Welcome sa Teksboy! 👋</DialogTitle>
          <DialogDescription>
            Mas swabe na ngayon ang pangongolekta ng Teks.
          </DialogDescription>
          <p>
            Silipin ang iba’t ibang sets, gumawa ng sarili mong checklist, at
            i-share ang collection mo sa community.
          </p>
          <button className="button primary" onClick={closeWelcome}>
            Tara, Game!
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent>
          <DialogTitle>Tutorials / Site Guide</DialogTitle>
          <DialogDescription>
            Short guides, whenever you need them.
          </DialogDescription>
          <div className="guide-picker">
            {(Object.keys(guides) as Feature[]).map((f) => (
              <button
                className="button"
                key={f}
                onClick={() => {
                  if (start(f)) return;
                  setPicker(false);
                  try {
                    sessionStorage.setItem('teksboy-guide-replay', f);
                  } catch {}
                  if (f === 'collectors' || f === 'community') {
                    window.location.assign('/' + f);
                  } else {
                    window.dispatchEvent(
                      new CustomEvent('teksboy-guide-open', { detail: f }),
                    );
                  }
                }}
              >
                {guides[f].title} <span>↗</span>
              </button>
            ))}
          </div>
          <small>Checklist help is available after opening a checklist.</small>
        </DialogContent>
      </Dialog>
      {active &&
        rect &&
        targetPortal &&
        createPortal(
          <div className="guide-layer">
            <div
              className="guide-spotlight"
              style={{
                top: Math.max(0, rect.top) - 4 - offsetY,
                left: Math.max(0, rect.left) - 4 - offsetX,
                width: Math.min(rect.width + 8, rect.vw),
                height: Math.min(rect.height + 8, rect.vh),
              }}
            />
            <dialog
              open
              ref={tooltip}
              tabIndex={-1}
              aria-modal="true"
              aria-label={guides[active].title}
              className="guide-tooltip"
              style={{
                left: Math.max(
                  12,
                  Math.min(rect.left - offsetX, availableWidth - 332),
                ),
                top:
                  Math.max(
                    12,
                    Math.min(rect.top + rect.height + 12, rect.vh - 210),
                  ) - offsetY,
                width: Math.min(320, availableWidth - 24),
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  finish();
                }
                if (e.key === 'Tab') {
                  const buttons = tooltip.current?.querySelectorAll('button');
                  if (buttons?.length) {
                    if (e.shiftKey && document.activeElement === buttons[0]) {
                      e.preventDefault();
                      buttons[buttons.length - 1].focus();
                    } else if (
                      !e.shiftKey &&
                      document.activeElement === buttons[buttons.length - 1]
                    ) {
                      e.preventDefault();
                      buttons[0].focus();
                    }
                  }
                }
              }}
            >
              <small>
                {guides[active].title} · {index + 1} of {steps.length}
              </small>
              <p>{steps[index].text}</p>
              <div className="guide-actions">
                <button onClick={finish}>Skip</button>
                {index > 0 && (
                  <button onClick={() => setIndex(index - 1)}>Back</button>
                )}
                <button
                  className="button primary"
                  onClick={() =>
                    index === steps.length - 1 ? finish() : setIndex(index + 1)
                  }
                >
                  {index === steps.length - 1 ? 'Got it' : 'Next'}
                </button>
              </div>
            </dialog>
          </div>,
          targetPortal,
        )}
    </>
  );
}
