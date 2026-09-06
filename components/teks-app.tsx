'use client';
/* eslint-disable next/no-img-element, next/no-html-link-for-pages -- Scans must keep their original pixels; full-page links avoid unreliable client routing on the deployed Worker. */
import { useEffect, useState, useRef, useEffectEvent } from 'react';
import type { User, SupabaseClient } from '@supabase/supabase-js';
import {
  Layers,
  ChevronRight,
  Plus,
  Library,
  CheckCheck,
  Check,
  Minus,
  Download,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  Shield,
  Trophy,
  Undo2,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import catalog from '@/lib/catalog.json';
import {
  getClient,
  googleEnabled,
  errorText,
  defaultTracks,
  type TeksSet,
  type Card,
  type Category,
  type Track,
} from '@/lib/data';
import { completion, missingCards, paginate, exportPage } from '@/lib/export';
import Admin from './teks-admin';
const initial = catalog as TeksSet[];
export default function TeksApp({
  view,
}: {
  view: 'database' | 'checklist' | 'admin';
}) {
  const [sets, setSets] = useState<TeksSet[]>(initial),
    [categories, setCategories] = useState<Category[]>([
      { id: 'ghost-fighter', name: 'Ghost Fighter', position: 0 },
    ]),
    [tracks, setTracks] = useState<Track[]>(defaultTracks);
  const [selectedId, select] = useState(initial[0].id);
  const [client, setClient] = useState<SupabaseClient | null>(null),
    [user, setUser] = useState<User | null>(null),
    [providerReady, setProviderReady] = useState(false),
    [ready, setReady] = useState(false),
    [admin, setAdmin] = useState(false),
    [login, setLogin] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [lists, setLists] = useState<Record<string, string>>({}),
    [owned, setOwned] = useState<Record<string, string[]>>({}),
    [editing, setEditing] = useState<string | null>(null),
    [preview, setPreview] = useState(false),
    [demo, setDemo] = useState<string[]>([]),
    [filter, setFilter] = useState('all'),
    [listFilter, setListFilter] = useState('progress');
  const [pending, setPending] = useState<string[]>([]),
    [flash, setFlash] = useState(''),
    [undo, setUndo] = useState<{
      card: Card;
      value: boolean;
      setId: string;
    } | null>(null),
    [celebrate, setCelebrate] = useState(false);
  const [exportOpen, setExportOpen] = useState(false),
    [exports, setExports] = useState<string[]>([]),
    [exporting, setExporting] = useState(false),
    [exportIndex, setExportIndex] = useState(0),
    [exportError, setExportError] = useState('');
  const [volume, setVolume] = useState(0.12),
    [muted, setMuted] = useState(false),
    [playing, setPlaying] = useState(false),
    [trackIndex, setTrackIndex] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const pendingRef = useRef(new Set<string>());
  const selected = sets.find((s) => s.id === selectedId) || sets[0];
  const editSet = sets.find((s) => s.id === editing);
  const currentOwned = preview ? demo : owned[editing || ''] || [];
  const playlist = tracks.filter((t) => t.category_id === editSet?.category_id);
  const track = playlist[trackIndex % Math.max(playlist.length, 1)];
  async function refresh(db: SupabaseClient, u: User | null) {
    const [sr, cr, tr, ar] = await Promise.all([
      db.from('sets').select('*,cards(*)').order('position'),
      db.from('categories').select('*').order('position'),
      db.from('tracks').select('*').order('position'),
      u ? db.rpc('is_admin') : Promise.resolve({ data: false, error: null }),
    ]);
    if (sr.error || cr.error || tr.error)
      throw sr.error || cr.error || tr.error;
    setSets(
      (sr.data || []).map((s) => ({
        ...s,
        cards: s.cards.sort((a: Card, b: Card) => a.number - b.number),
      })),
    );
    setCategories(cr.data || []);
    setTracks(tr.data || []);
    setAdmin(!!ar.data);
    if (u) {
      const lr = await db
        .from('checklists')
        .select('id,set_id,checklist_cards(card_id)')
        .eq('user_id', u.id);
      if (lr.error) throw lr.error;
      setLists(Object.fromEntries(lr.data.map((l) => [l.set_id, l.id])));
      setOwned(
        Object.fromEntries(
          lr.data.map((l) => [
            l.set_id,
            l.checklist_cards.map((c: { card_id: string }) => c.card_id),
          ]),
        ),
      );
    } else {
      setLists({});
      setOwned({});
    }
  }
  useEffect(() => {
    let stopped = false;
    let unsubscribe = () => {};
    void (async () => {
      try {
        const db = await getClient();
        if (stopped) return;
        setClient(db);
        setProviderReady(googleEnabled);
        if (db) {
          const { data, error } = await db.auth.getSession();
          if (error) throw error;
          setUser(data.session?.user || null);
          await refresh(db, data.session?.user || null);
          const result = db.auth.onAuthStateChange((_event, session) => {
            if (stopped) return;
            setUser(session?.user || null);
            setTimeout(
              () =>
                void refresh(db, session?.user || null).catch((e) =>
                  setMessage(errorText(e)),
                ),
              0,
            );
          });
          unsubscribe = () => result.data.subscription.unsubscribe();
        }
      } catch (e) {
        setMessage(errorText(e));
      } finally {
        if (!stopped) setReady(true);
      }
    })();
    void Promise.resolve().then(() => {
      try {
        const p = JSON.parse(localStorage.getItem('teksboy-audio') || '{}');
        if (typeof p.volume === 'number')
          setVolume(Math.max(0, Math.min(1, p.volume)));
        setMuted(!!p.muted);
      } catch {}
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 7000);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    if (audio.current) {
      audio.current.volume = volume;
      audio.current.muted = muted;
    }
    if (ready)
      localStorage.setItem('teksboy-audio', JSON.stringify({ volume, muted }));
  }, [volume, muted, ready]);
  const trackUrl = track?.url;
  useEffect(() => {
    const player = audio.current;
    if (editing && trackUrl && player) {
      player
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    }
    return () => {
      player?.pause();
      setPlaying(false);
    };
  }, [editing, trackUrl]);
  useEffect(
    () => () => exports.forEach((url) => URL.revokeObjectURL(url)),
    [exports],
  );
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const life = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: 'open_teks_set',
          description: 'Open a catalog set in the database browser.',
          inputSchema: {
            type: 'object',
            properties: { setId: { type: 'string' } },
            required: ['setId'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute: (input: unknown) => {
            const id = (input as { setId?: unknown })?.setId;
            if (typeof id !== 'string' || !sets.some((s) => s.id === id))
              throw Error('Unknown set');
            select(id);
            return { setId: id };
          },
        },
        { signal: life.signal },
      ),
    ).catch(() => {});
    return () => life.abort();
  }, [sets]);
  async function signIn() {
    if (!client) return;
    setBusy(true);
    try {
      const result = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + '/' },
      });
      if (result.error) throw result.error;
    } catch (e) {
      setMessage(errorText(e));
      setBusy(false);
    }
  }
  function openChecklist(id: string, isPreview: boolean) {
    setPreview(isPreview);
    setDemo([]);
    setFilter('all');
    setUndo(null);
    setCelebrate(false);
    setTrackIndex(0);
    setEditing(id);
  }
  async function addSet(s: TeksSet) {
    if (!user || !client) {
      sessionStorage.setItem('teksboy-pending-set', s.id);
      setLogin(true);
      return;
    }
    if (lists[s.id]) {
      openChecklist(s.id, false);
      return;
    }
    setBusy(true);
    try {
      const result = await client
        .from('checklists')
        .upsert(
          { user_id: user.id, set_id: s.id },
          { onConflict: 'user_id,set_id' },
        )
        .select()
        .single();
      if (result.error) throw result.error;
      setLists((p) => ({ ...p, [s.id]: result.data.id }));
      setOwned((p) => ({ ...p, [s.id]: [] }));
      openChecklist(s.id, false);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const resumePending = useEffectEvent(() => {
    if (!ready || !user || !client) return;
    const id = sessionStorage.getItem('teksboy-pending-set');
    if (!id) return;
    const s = sets.find((set) => set.id === id);
    if (!s) return;
    sessionStorage.removeItem('teksboy-pending-set');
    void addSet(s);
  });
  useEffect(() => {
    const timer = window.setTimeout(resumePending, 0);
    return () => window.clearTimeout(timer);
  }, [ready, user?.id]);
  async function toggle(card: Card, value?: boolean) {
    if (!editSet || pendingRef.current.has(card.id)) return;
    const sid = editSet.id;
    const old = currentOwned.includes(card.id);
    const next = value ?? !old;
    if (next === old) return;
    const apply = (arr: string[]) =>
      next
        ? [...new Set([...arr, card.id])]
        : arr.filter((id) => id !== card.id);
    if (preview) {
      setDemo(apply);
      setUndo({ card, value: old, setId: sid });
      if (next) setFlash(card.id);
      return;
    }
    if (!client || !user || !lists[sid]) return;
    pendingRef.current.add(card.id);
    setPending([...pendingRef.current]);
    setOwned((p) => ({ ...p, [sid]: apply(p[sid] || []) }));
    if (next) setFlash(card.id);
    try {
      const result = next
        ? await client
            .from('checklist_cards')
            .insert({ checklist_id: lists[sid], card_id: card.id })
        : await client
            .from('checklist_cards')
            .delete()
            .eq('checklist_id', lists[sid])
            .eq('card_id', card.id);
      if (result.error) throw result.error;
      setUndo({ card, value: old, setId: sid });
      if (next && apply(currentOwned).length === editSet.cards.length)
        setCelebrate(true);
    } catch (e) {
      setOwned((p) => ({
        ...p,
        [sid]: old
          ? [...new Set([...(p[sid] || []), card.id])]
          : (p[sid] || []).filter((id) => id !== card.id),
      }));
      setMessage('Change was not saved: ' + errorText(e));
    } finally {
      pendingRef.current.delete(card.id);
      setPending([...pendingRef.current]);
    }
  }
  async function prepareExport() {
    if (!editSet) return;
    setExportOpen(true);
    setExporting(true);
    setExportError('');
    setExports([]);
    setExportIndex(0);
    const missing = missingCards(editSet, currentOwned);
    const pages = paginate(missing);
    try {
      const urls = [];
      for (let i = 0; i < pages.length; i++) {
        const blob = await exportPage(
          editSet,
          pages[i],
          i,
          pages.length,
          missing.length,
        );
        urls.push(URL.createObjectURL(blob));
      }
      setExports(urls);
    } catch (e) {
      setExportError(errorText(e));
    } finally {
      setExporting(false);
    }
  }
  function closeEditor() {
    if (pending.length) {
      setMessage('Please wait for your changes to finish saving.');
      return;
    }
    setEditing(null);
  }
  const completed = sets.filter(
    (s) =>
      lists[s.id] &&
      s.cards.length > 0 &&
      (owned[s.id]?.length || 0) === s.cards.length,
  );
  const inProgress = sets.filter((s) => lists[s.id] && !completed.includes(s));
  return (
    <>
      <header className="topbar">
        <a
          className="brand"
          href="/"
          aria-label="Teksboy home"
          onClick={(event) => {
            event.preventDefault();
            window.location.assign('/');
          }}
        >
          <img src="/images/general/logo.svg" alt="Teksboy" />
        </a>
        <nav>
          <a
            className={view === 'database' ? 'active' : ''}
            href="/"
            onClick={(event) => {
              event.preventDefault();
              window.location.assign('/');
            }}
          >
            Database
          </a>
          <a
            className={view === 'checklist' ? 'active' : ''}
            href="/checklist"
            onClick={(event) => {
              event.preventDefault();
              window.location.assign('/checklist');
            }}
          >
            My checklist
          </a>
          {admin && (
            <a
              className={view === 'admin' ? 'active' : ''}
              href="/admin"
              onClick={(event) => {
                event.preventDefault();
                window.location.assign('/admin');
              }}
            >
              <Shield /> CMS
            </a>
          )}
        </nav>
        {user ? (
          <button
            className="account-block"
            onClick={async () => {
              await client?.auth.signOut();
              setUser(null);
              setLists({});
              setOwned({});
              setAdmin(false);
            }}
          >
            <strong>Logout</strong>
            <span>{user.email}</span>
          </button>
        ) : (
          <button className="account-block" onClick={() => setLogin(true)}>
            <strong>Login</strong>
            <span>Save your checklist</span>
          </button>
        )}
      </header>
      {view === 'database' && (
        <aside className="sidebar">
          <div className="sidebar-title">Database</div>
          <div className="category-list">
            {categories.map((cat) => (
              <section key={cat.id}>
                <div className="category">{cat.name}</div>
                <div className="set-links">
                  {sets
                    .filter(
                      (s) =>
                        s.status === 'published' && s.category_id === cat.id,
                    )
                    .map((s) => (
                      <button
                        className={s.id === selected?.id ? 'selected' : ''}
                        key={s.id}
                        onClick={() => select(s.id)}
                      >
                        {s.name.replace('Yuyu Hakusho ', '')}
                      </button>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </aside>
      )}
      <main className={'workspace ' + (view !== 'database' ? 'wide' : '')}>
        {view === 'database' && selected && (
          <>
            <section className="set-hero">
              <div className="cover-stack">
                <img src={selected.cover} alt="Set back print" />
              </div>
              <div className="hero-info">
                <h2>{selected.name}</h2>
                <p className="total-label">Total teks:</p>
                <strong className="total-count">{selected.cards.length}</strong>
              </div>
              <div className="hero-action">
                <button
                  className="button outline-primary"
                  disabled={busy || !ready}
                  onClick={() => addSet(selected)}
                >
                  {lists[selected.id] ? (
                    <Check size={18} />
                  ) : (
                    <Plus size={18} />
                  )}{' '}
                  {lists[selected.id]
                    ? 'Open my checklist'
                    : 'Add to your checklist'}
                </button>
              </div>
            </section>
            <div className="card-grid database-cards">
              {selected.cards.map((c) => (
                <div className="teks-card" key={c.id}>
                  <div className="card-image">
                    <img
                      src={c.image}
                      alt={'Card ' + c.number}
                      loading="lazy"
                    />
                  </div>
                </div>
              ))}
            </div>
            {!selected.cards.length && (
              <div className="empty">No cards have been added to this set.</div>
            )}
          </>
        )}
        {view === 'database' && !selected && (
          <div className="empty">
            <Library />
            <h2>The archive is waiting.</h2>
            <p>Publish your first set in the CMS.</p>
          </div>
        )}
        {view === 'checklist' && (
          <>
            <div className="page-title">
              <div className="eyebrow">YOUR PERSONAL ARCHIVE</div>
              <h1>One card closer.</h1>
              <p>Little by little, the whole set comes together.</p>
            </div>
            <div className="stats">
              <div>
                <Trophy />
                <b>{completed.length}</b>
                <span>Completed sets</span>
              </div>
              <div>
                <Layers />
                <b>{inProgress.length}</b>
                <span>In progress</span>
              </div>
              <div>
                <CheckCheck />
                <b>{Object.values(owned).reduce((n, a) => n + a.length, 0)}</b>
                <span>Cards collected</span>
              </div>
            </div>
            <Tabs
              value={listFilter}
              onValueChange={(v) => setListFilter(String(v))}
            >
              <TabsList>
                <TabsTrigger value="progress">In progress</TabsTrigger>
                <TabsTrigger value="complete">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
            {!ready ? (
              <div className="empty">Loading your collection…</div>
            ) : !user ? (
              <div className="empty">
                <Layers />
                <h2>Your collection starts here.</h2>
                <p>
                  Sign in with Google to save your checklist across devices.
                </p>
                <button
                  className="button primary"
                  onClick={() => setLogin(true)}
                >
                  Sign in with Google
                </button>
              </div>
            ) : (
              <div className="collection-grid">
                {(listFilter === 'progress' ? inProgress : completed).map(
                  (s) => (
                    <button
                      className="collection-card"
                      key={s.id}
                      onClick={() => openChecklist(s.id, false)}
                    >
                      <img src={s.cover} alt="" />
                      <div>
                        <span className="eyebrow">
                          {categories.find((c) => c.id === s.category_id)?.name}
                        </span>
                        <h2>{s.name}</h2>
                        <p>
                          <b>{owned[s.id]?.length || 0}</b> / {s.cards.length}{' '}
                          collected
                        </p>
                        <Progress
                          value={completion(
                            s.cards.length,
                            owned[s.id]?.length || 0,
                          )}
                        />
                        <small>
                          {completion(s.cards.length, owned[s.id]?.length || 0)}
                          % complete
                        </small>
                      </div>
                      <ChevronRight />
                    </button>
                  ),
                )}
                {!(listFilter === 'progress' ? inProgress : completed)
                  .length && (
                  <div className="empty">
                    <h2>
                      {listFilter === 'complete'
                        ? 'Your first complete set is ahead.'
                        : 'A new collection is calling.'}
                    </h2>
                    <p>Explore the database to find your next set.</p>
                    <a
                      className="button primary"
                      href="/"
                      onClick={(event) => {
                        event.preventDefault();
                        window.location.assign('/');
                      }}
                    >
                      Explore database
                    </a>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {view === 'admin' && (
          <Admin
            client={client}
            user={user}
            allowed={admin}
            ready={ready}
            onLogin={() => setLogin(true)}
            notify={setMessage}
            onUpdate={() => client && refresh(client, user)}
          />
        )}
      </main>
      <Dialog open={login} onOpenChange={setLogin}>
        <DialogContent className="modal login-modal">
          <Layers className="login-icon" />
          <DialogTitle>Keep your collection close.</DialogTitle>
          <DialogDescription>
            Sign in to save your progress and pick up where you left off, on any
            device.
          </DialogDescription>
          <button
            className="button google-button"
            onClick={signIn}
            disabled={!client || !providerReady || busy}
          >
            <span className="google-g">G</span>
            {busy ? 'Connecting…' : 'Continue with Google'}
          </button>
          {ready && (!client || !providerReady) && (
            <p className="notice">
              Account setup is in progress. You can browse every card and try a
              checklist preview now.
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent
          className="modal checklist-modal"
          showCloseButton={false}
        >
          {editSet && (
            <>
              <header className="checklist-heading">
                <img src={editSet.cover} alt="" />
                <div>
                  <span className="eyebrow">
                    {preview
                      ? 'INTERACTIVE PREVIEW · NOT SAVED'
                      : 'MY CHECKLIST'}
                  </span>
                  <DialogTitle>{editSet.name}</DialogTitle>
                  <DialogDescription>
                    {currentOwned.length} / {editSet.cards.length} collected ·{' '}
                    {completion(editSet.cards.length, currentOwned.length)}%
                  </DialogDescription>
                  <Progress
                    value={completion(
                      editSet.cards.length,
                      currentOwned.length,
                    )}
                  />
                </div>
                <button
                  className="icon-button"
                  onClick={closeEditor}
                  aria-label="Close checklist"
                >
                  <X size={18} />
                </button>
              </header>
              <div className="checklist-tools">
                <Tabs
                  value={filter}
                  onValueChange={(v) => setFilter(String(v))}
                >
                  <TabsList>
                    <TabsTrigger value="all">All cards</TabsTrigger>
                    <TabsTrigger value="missing">
                      Missing ({editSet.cards.length - currentOwned.length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <button
                  className="button"
                  disabled={
                    currentOwned.length === editSet.cards.length ||
                    pending.length > 0
                  }
                  onClick={prepareExport}
                >
                  <Download size={16} /> Download missing
                </button>
              </div>
              <div className="checklist-scroll">
                <div className="card-grid">
                  {editSet.cards
                    .filter(
                      (c) => filter === 'all' || !currentOwned.includes(c.id),
                    )
                    .map((c) => (
                      <div
                        className={
                          'teks-card collectible ' +
                          (currentOwned.includes(c.id) ? 'collected ' : '') +
                          (flash === c.id ? 'just-collected' : '')
                        }
                        key={c.id}
                        onAnimationEnd={() => {
                          if (flash === c.id) setFlash('');
                        }}
                      >
                        <button
                          className="collect-toggle"
                          aria-label={`${currentOwned.includes(c.id) ? 'Mark missing' : 'Mark collected'}: card ${c.number}`}
                          aria-pressed={currentOwned.includes(c.id)}
                          disabled={pending.includes(c.id)}
                          onClick={() => toggle(c)}
                        >
                          <div className="card-image">
                            <img
                              src={c.image}
                              alt={'Card ' + c.number}
                              loading="lazy"
                            />
                            {currentOwned.includes(c.id) && (
                              <span className="check-stamp">
                                <Check />
                              </span>
                            )}
                          </div>
                          <div className="card-label">
                            <span className="status">
                              {currentOwned.includes(c.id) ? (
                                <Check size={14} />
                              ) : (
                                <Minus size={14} />
                              )}{' '}
                              {currentOwned.includes(c.id)
                                ? 'Collected'
                                : 'Missing'}
                            </span>
                          </div>
                        </button>
                      </div>
                    ))}
                </div>
                {filter === 'missing' &&
                  currentOwned.length === editSet.cards.length && (
                    <div className="empty">
                      <Trophy />
                      <h2>Every last one. You did it!</h2>
                    </div>
                  )}
              </div>
              <div className="checklist-footer">
                {track ? (
                  <div className="music">
                    {/* Background music has no instructional speech. */}
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio
                      ref={audio}
                      src={track.url}
                      onEnded={() =>
                        setTrackIndex((i) => (i + 1) % playlist.length)
                      }
                      onError={() => {
                        setPlaying(false);
                        setMessage('This music track could not be played.');
                      }}
                    />
                    <button
                      className="icon-button"
                      aria-label={playing ? 'Pause music' : 'Play music'}
                      onClick={() => {
                        if (playing) {
                          audio.current?.pause();
                          setPlaying(false);
                        } else {
                          audio.current
                            ?.play()
                            .then(() => setPlaying(true))
                            .catch(() =>
                              setMessage('Tap play to enable music.'),
                            );
                        }
                      }}
                    >
                      {playing ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <div>
                      <small>{playing ? 'NOW PLAYING' : 'PLAYLIST'}</small>
                      <span>{track.title}</span>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Next track"
                      onClick={() =>
                        setTrackIndex((i) => (i + 1) % playlist.length)
                      }
                    >
                      <SkipForward size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={muted ? 'Unmute music' : 'Mute music'}
                      onClick={() => setMuted(!muted)}
                    >
                      {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>
                    <input
                      type="range"
                      aria-label="Music volume"
                      min="0"
                      max="0.5"
                      step="0.01"
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                    />
                  </div>
                ) : (
                  <span className="save-status">
                    No playlist for this category
                  </span>
                )}
                <div className="footer-actions">
                  <span className="save-status" aria-live="polite">
                    {preview
                      ? 'Preview only'
                      : pending.length
                        ? 'Saving…'
                        : 'All changes saved'}
                  </span>
                  {undo && (
                    <button
                      className="icon-button"
                      aria-label="Undo last change"
                      disabled={pending.length > 0}
                      onClick={() => {
                        void toggle(undo.card, undo.value);
                        setUndo(null);
                      }}
                    >
                      <Undo2 size={16} />
                    </button>
                  )}
                  <button
                    className="button primary"
                    disabled={pending.length > 0}
                    onClick={closeEditor}
                  >
                    Done
                  </button>
                </div>
              </div>
              {celebrate && (
                <div className="celebration">
                  <Trophy />
                  <h2>Set complete!</h2>
                  <p>Every card. Every memory. Yours.</p>
                  <button
                    className="button primary"
                    onClick={() => setCelebrate(false)}
                  >
                    Keep collecting
                  </button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="modal export-modal">
          <DialogTitle>Your missing cards, ready to share.</DialogTitle>
          <DialogDescription>
            Download a PNG and attach it to your Facebook group post. Up to 20
            cards per image.
          </DialogDescription>
          {exporting ? (
            <div className="empty">Preparing your images…</div>
          ) : exportError ? (
            <div className="empty">
              <p>{exportError}</p>
              <button className="button" onClick={prepareExport}>
                Retry
              </button>
            </div>
          ) : exports.length ? (
            <>
              <img
                className="export-image"
                src={exports[exportIndex]}
                alt={'Missing cards page ' + (exportIndex + 1)}
              />
              <div className="export-actions">
                <button
                  className="button"
                  disabled={exportIndex === 0}
                  onClick={() => setExportIndex((i) => i - 1)}
                >
                  Previous
                </button>
                <span>
                  {exportIndex + 1} / {exports.length}
                </span>
                <button
                  className="button"
                  disabled={exportIndex === exports.length - 1}
                  onClick={() => setExportIndex((i) => i + 1)}
                >
                  Next
                </button>
              </div>
              <a
                className="button primary"
                href={exports[exportIndex]}
                download={`${editing}-missing-${exportIndex + 1}.png`}
              >
                <Download size={16} />
                Download page {exportIndex + 1}
              </a>
            </>
          ) : (
            <p>No missing cards to export.</p>
          )}
        </DialogContent>
      </Dialog>
      {message && (
        <output className="toast">
          {message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage('')}
          >
            <X size={16} />
          </button>
        </output>
      )}
    </>
  );
}
