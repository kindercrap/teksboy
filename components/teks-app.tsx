'use client';
import { appFetch } from '@/lib/app-fetch';
import { useRoles } from './role-provider';
import { Backprint, Segments, SetCompleted } from './collection-visuals';
import NotificationBell from './notification-bell';
/* eslint-disable next/no-img-element, next/no-html-link-for-pages -- Scans must keep their original pixels; full-page links avoid unreliable client routing on the deployed Worker. */
import { useEffect, useState, useRef, useEffectEvent } from 'react';
import type { User, SupabaseClient } from '@supabase/supabase-js';
import {
  Layers,
  Menu,
  SlidersHorizontal,
  ChevronDown,
  Share2,
  Plus,
  Library,
  Check,
  CheckCheck,
  LayoutGrid,
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
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';
import catalog from '@/lib/catalog.json';
import catalogCategories from '@/lib/categories.json';
import UserName from './user-name';
import Leaderboard from './leaderboard';
import ChecklistShare, { ShareActions } from './checklist-share';
import RemoveAction from './remove-action';
import VerificationRequest from './verification-request';
import CollectionCollectors from './collection-collectors';
import ChecklistPin from './checklist-pin';
import GroupOverview from './group-overview';
import Community from './community';
import SocialCollectors from './social-collectors';
import MyProfile, {
  Avatar,
  emptyProfile,
  profileKey,
  type ProfileInfo,
} from './my-profile';
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
import {
  demoUser,
  localDemoEnabled,
  demoStorageKey,
  demoSessionKey,
} from '@/lib/local-demo';
type ChecklistMeta = Record<
  string,
  { verified?: boolean; updated_at?: string }
>;
type LocalCollector = {
  metadata?: ChecklistMeta;
  lists: Record<string, string>;
  owned: Record<string, string[]>;
  profile: {
    id: string;
    email?: string;
    name?: string;
    display_name?: string;
    bio?: string;
    facebook_url?: string;
    photo?: string;
    profile_saved?: boolean;
    role?: string;
    user_verified?: boolean;
    leaderboard_visible?: boolean;
  };
};
const initial = catalog as TeksSet[];
export default function TeksApp({
  view,
}: {
  view:
    | 'database'
    | 'checklist'
    | 'admin'
    | 'leaderboard'
    | 'collectors'
    | 'community';
}) {
  const { permissions: cmsPermissions } = useRoles();
  const [sets, setSets] = useState<TeksSet[]>(initial),
    [categories, setCategories] = useState<Category[]>(catalogCategories),
    [tracks, setTracks] = useState<Track[]>(defaultTracks);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const close = (e: Event) => {
      document
        .querySelectorAll<HTMLDetailsElement>('.account-dropdown')
        .forEach((menu) => {
          if (
            e instanceof KeyboardEvent
              ? e.key === 'Escape'
              : !menu.contains(e.target as Node)
          )
            menu.open = false;
        });
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
    };
  }, []);
  const [localAccounts, setLocalAccounts] = useState<
      { id: string; name: string; role: string }[]
    >([]),
    [localAccount, setLocalAccount] = useState('local-demo');
  const [socialRevision, setSocialRevision] = useState(0);
  const [checklistMeta, setChecklistMeta] = useState<ChecklistMeta>({});
  const [checklistSort, setChecklistSort] = useState('name'),
    [checklistSearch, setChecklistSearch] = useState('');
  const [userRole, setUserRole] = useState('Normal');
  const [userVerified, setUserVerified] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo>(emptyProfile);
  const [checklistGroup, setChecklistGroup] = useState('all');
  const [groupFilterOpen, setGroupFilterOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareTitle, setShareTitle] = useState('Teksboy collection');
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [checkAllConfirm, setCheckAllConfirm] = useState(false);
  const [overviewGroup, setOverviewGroup] = useState<string | null>(null);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveGroup, setArchiveGroup] = useState('all');
  const [archiveSort, setArchiveSort] = useState('default');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    'ghost-fighter',
  );
  const [selectedId, select] = useState(initial[0].id);
  const [localMode, setLocalMode] = useState(false);
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
  function groupName(set: TeksSet) {
    return (
      categories.find((c) => c.id === set.category_id)?.name || set.category_id
    );
  }
  function chooseSet(id: string) {
    setOverviewGroup(null);
    select(id);
    const set = sets.find((s) => s.id === id);
    if (set) setExpandedCategory(set.category_id);
    const url = new URL(window.location.href);
    url.searchParams.delete('group');
    url.searchParams.set('set', id);
    window.history.pushState(null, '', url);
    setArchivesOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const restoreSetFromUrl = useEffectEvent(() => {
    const params = new URL(window.location.href).searchParams;
    const group = params.get('group');
    setOverviewGroup(group);
    if (group) {
      setExpandedCategory(group);
      return;
    }
    const id = params.get('set');
    const set = id ? sets.find((s) => s.id === id) : sets[0];
    if (set) {
      select(set.id);
      setExpandedCategory(set.category_id);
    }
  });
  useEffect(() => {
    if (view !== 'database') return;
    const timer = window.setTimeout(restoreSetFromUrl, 0);
    const restore = () => restoreSetFromUrl();
    window.addEventListener('popstate', restore);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', restore);
    };
  }, [sets, view]);
  const editSet = sets.find((s) => s.id === editing);
  const currentOwned = preview ? demo : owned[editing || ''] || [];
  const playlist = tracks.filter((t) => t.category_id === editSet?.category_id);
  const track = playlist[trackIndex % Math.max(playlist.length, 1)];
  async function refresh(_db: SupabaseClient, u: User | null) {
    const response = await appFetch('/__local/catalog');
    if (!response.ok) throw Error('Could not load the catalog. Please retry.');
    const catalog = (await response.json()) as {
      sets: TeksSet[];
      categories: Category[];
      tracks: Track[];
    };
    setSets(catalog.sets);
    setCategories(catalog.categories);
    setTracks(catalog.tracks);
    if (u) {
      const response = await appFetch('/__local/collector');
      const collector = (await response.json()) as LocalCollector & {
        error?: string;
      };
      if (!response.ok)
        throw Error(collector.error || 'Could not load your profile.');
      setUserRole(collector.profile.role || 'Normal');
      setUserVerified(!!collector.profile.user_verified);
      setLists(collector.lists);
      setOwned(collector.owned);
      setChecklistMeta(collector.metadata || {});
      setProfileInfo({
        displayName:
          collector.profile.display_name || collector.profile.name || '',
        photo: collector.profile.photo || '',
        bio: collector.profile.bio || '',
        facebookUrl: collector.profile.facebook_url || '',
      });
      const roles = (await appFetch('/__local/roles').then((r) =>
        r.json(),
      )) as { permissions: string[] };
      setAdmin(roles.permissions?.length > 0);
    } else {
      setLists({});
      setOwned({});
      setAdmin(false);
      setProfileInfo(emptyProfile);
      setUserRole('Normal');
      setUserVerified(false);
    }
    setSocialRevision((v) => v + 1);
  }
  useEffect(() => {
    let stopped = false;
    let unsubscribe = () => {};
    void (async () => {
      try {
        if (localDemoEnabled()) {
          setLocalMode(true);
          const localResponse = await appFetch('/__local/catalog');
          if (!localResponse.ok)
            throw Error(
              'Local database is unavailable. Restart the development server.',
            );
          const localCatalog = (await localResponse.json()) as {
            sets: TeksSet[];
            categories: Category[];
            tracks: Track[];
          };
          setSets(localCatalog.sets);
          setCategories(localCatalog.categories);
          setTracks(localCatalog.tracks);
          const accounts = (await appFetch('/__local/social/accounts').then(
            (r) => r.json(),
          )) as { users: { id: string; name: string; role: string }[] };
          setLocalAccounts(accounts.users);
          const session = (await appFetch('/__local/social/session').then((r) =>
            r.json(),
          )) as { user: { id: string } | null };
          if (!session.user) {
            setUser(null);
            return;
          }
          const collectorResponse = await appFetch('/__local/collector');
          if (!collectorResponse.ok) {
            setUser(null);
            return;
          }
          const collector = (await collectorResponse.json()) as LocalCollector;
          setUser({
            ...demoUser,
            id: collector.profile.id,
            email: collector.profile.email,
          });
          setLocalAccount(collector.profile.id);
          setUserRole(collector.profile.role || 'Normal');
          setUserVerified(!!collector.profile.user_verified);
          setLists(collector.lists);
          setOwned(collector.owned);
          setChecklistMeta(collector.metadata || {});
          setProfileInfo({
            displayName:
              collector.profile.display_name || collector.profile.name || '',
            photo: collector.profile.photo || '',
            bio: collector.profile.bio || '',
            facebookUrl: collector.profile.facebook_url || '',
          });
          setSocialRevision((v) => v + 1);
          return;
        }
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
    if (localMode && ready) {
      try {
        localStorage.setItem(
          demoStorageKey + ':' + (user?.id || 'guest'),
          JSON.stringify({ lists, owned }),
        );
      } catch {
        window.setTimeout(
          () =>
            setMessage(
              'Browser storage is unavailable; demo changes may not survive a refresh.',
            ),
          0,
        );
      }
    }
  }, [localMode, ready, lists, owned, user?.id]);
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
  const applyAudioPreference = useEffectEvent((player: HTMLAudioElement) => {
    player.volume = volume;
    player.muted = muted;
  });
  const trackUrl = track?.url;
  useEffect(() => {
    const player = audio.current;
    if (editing && trackUrl && player) {
      // The player mounts with the modal, after the preference effect has run.
      applyAudioPreference(player);
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
    if (localMode && localDemoEnabled()) {
      const response = await appFetch('/__local/social/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: localAccount }),
      });
      if (!response.ok) {
        setMessage('This account is unavailable.');
        return;
      }
      localStorage.setItem(demoSessionKey, 'active');
      window.location.reload();
      return;
    }
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
    setCheckAllConfirm(false);
    setCelebrate(false);
    setTrackIndex(0);
    setEditing(id);
  }
  async function saveLocal(
    l: Record<string, string>,
    o: Record<string, string[]>,
  ) {
    const response = await appFetch('/__local/collector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lists: l, owned: o }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw Error(data.error || 'Could not save your checklist.');
    }
    const saved = (await response.json()) as LocalCollector;
    setChecklistMeta(saved.metadata || {});
    setSocialRevision((v) => v + 1);
  }
  async function addSet(s: TeksSet) {
    if (user) {
      try {
        await saveLocal(
          { [s.id]: user.id + ':' + s.id },
          { [s.id]: owned[s.id] || [] },
        );
      } catch (e) {
        setMessage(errorText(e));
        return;
      }
      setLists((p) => ({ ...p, [s.id]: user.id + ':' + s.id }));
      setOwned((p) => ({ ...p, [s.id]: p[s.id] || [] }));
      openChecklist(s.id, false);
      return;
    }
    sessionStorage.setItem('teksboy-pending-set', s.id);
    setLogin(true);
  }
  const resumePending = useEffectEvent(() => {
    if (!ready || !user || (!client && !localMode)) return;
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
  async function checkAll() {
    if (!editSet || pendingRef.current.size) return;
    const sid = editSet.id;
    const missing = editSet.cards.filter(
      (card) => !currentOwned.includes(card.id),
    );
    if (!missing.length) return;
    const all = editSet.cards.map((card) => card.id);
    if (preview) {
      setDemo(all);
      setUndo(null);
      setCelebrate(true);
      return;
    }
    if (!user || (!localMode && (!client || !lists[sid]))) return;
    pendingRef.current.add('check-all');
    setPending([...pendingRef.current]);
    try {
      await saveLocal({ [sid]: lists[sid] }, { [sid]: all });
      setOwned((previous) => ({ ...previous, [sid]: all }));
      setUndo(null);
      setCelebrate(true);
    } catch (e) {
      setMessage('Changes were not saved: ' + errorText(e));
    } finally {
      pendingRef.current.delete('check-all');
      setPending([...pendingRef.current]);
    }
  }
  async function toggle(card: Card, value?: boolean) {
    if (
      !editSet ||
      pendingRef.current.has('check-all') ||
      pendingRef.current.has(card.id) ||
      pendingRef.current.size
    )
      return;
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
    if (user) {
      pendingRef.current.add(card.id);
      setPending([...pendingRef.current]);
      try {
        await saveLocal(
          { [sid]: lists[sid] },
          { [sid]: apply(owned[sid] || []) },
        );
      } catch (e) {
        setMessage(errorText(e));
        return;
      } finally {
        pendingRef.current.delete(card.id);
        setPending([...pendingRef.current]);
      }
      setOwned((p) => ({ ...p, [sid]: apply(p[sid] || []) }));
      setUndo({ card, value: old, setId: sid });
      if (next) setFlash(card.id);
      if (next && apply(currentOwned).length === editSet.cards.length)
        setCelebrate(true);
      return;
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
          groupName(editSet),
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
  const checklistGroups = categories.filter((category) =>
    sets.some(
      (set) =>
        set.category_id === category.id &&
        (set.status === 'published' || !!lists[set.id]),
    ),
  );
  const visibleChecklists = (listFilter === 'progress' ? inProgress : completed)
    .filter(
      (set) =>
        (checklistGroup === 'all' || set.category_id === checklistGroup) &&
        set.name.toLowerCase().includes(checklistSearch.toLowerCase()),
    )
    .sort((a, b) => {
      if (checklistSort === 'recent')
        return (
          (checklistMeta[b.id]?.updated_at || '').localeCompare(
            checklistMeta[a.id]?.updated_at || '',
          ) || a.name.localeCompare(b.name)
        );
      if (checklistSort === 'closest')
        return (
          completion(b.cards.length, owned[b.id]?.length || 0) -
            completion(a.cards.length, owned[a.id]?.length || 0) ||
          a.name.localeCompare(b.name)
        );
      if (checklistSort === 'missing')
        return (
          b.cards.length -
            (owned[b.id]?.length || 0) -
            (a.cards.length - (owned[a.id]?.length || 0)) ||
          a.name.localeCompare(b.name)
        );
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  function mainNavigation() {
    return (
      <>
        <nav className="main-menu-links">
          <a
            className={view === 'database' ? 'active' : ''}
            href="/"
            onClick={(event) => {
              event.preventDefault();
              window.location.assign('/');
            }}
          >
            Archives
          </a>
          <a
            href="/collectors"
            className={view === 'collectors' ? 'active' : ''}
          >
            Collectors
          </a>
          <a href="/community" className={view === 'community' ? 'active' : ''}>
            Community Links
          </a>
          {user && (localMode ? cmsPermissions.length > 0 : admin) && (
            <a
              className={view === 'admin' ? 'active' : ''}
              href="/cms"
              onClick={(event) => {
                event.preventDefault();
                window.location.assign('/cms');
              }}
            >
              <Shield /> CMS
            </a>
          )}
        </nav>
        {user ? (
          <div className="account-controls">
            <NotificationBell />
            <details className="account-dropdown">
              <summary className="profile-account-button">
                <Avatar photo={profileInfo.photo} />
                <UserName
                  name={profileInfo.displayName || 'My Profile'}
                  verified={userVerified}
                  role={userRole}
                />
                <span aria-hidden="true">▾</span>
              </summary>
              <div className="account-dropdown-panel">
                <a href={'/collectors?user=' + encodeURIComponent(user.id)}>
                  My Profile
                </a>
                <a
                  href={
                    '/collectors?user=' +
                    encodeURIComponent(user.id) +
                    '#checklists'
                  }
                >
                  My Checklist
                </a>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setProfileOpen(true);
                  }}
                >
                  Edit Profile
                </button>
                {localMode && (
                  <button onClick={() => setLogin(true)}>
                    Switch local account
                  </button>
                )}
                <button
                  className="account-block"
                  onClick={async () => {
                    setMenuOpen(false);
                    await appFetch('/__local/social/logout', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: '{}',
                    });
                    if (localMode) {
                      localStorage.removeItem(demoSessionKey);
                      setUser(null);
                      setSocialRevision((v) => v + 1);
                      return;
                    }
                    await client?.auth.signOut();
                    setUser(null);
                    setLists({});
                    setOwned({});
                    setAdmin(false);
                  }}
                >
                  <strong>Logout</strong>
                </button>
              </div>
            </details>
          </div>
        ) : (
          <button
            className="account-block"
            onClick={() => {
              setMenuOpen(false);
              setLogin(true);
            }}
          >
            <strong>Login</strong>
            <span>
              {localMode ? 'Local demo · SQLite' : 'Save your checklist'}
            </span>
          </button>
        )}
      </>
    );
  }
  function archiveNavigation() {
    const matches = sets.filter(
      (s) =>
        s.status === 'published' &&
        (archiveGroup === 'all' || s.category_id === archiveGroup) &&
        s.name.toLowerCase().includes(archiveSearch.trim().toLowerCase()),
    );
    const sorted = [...matches].sort((a, b) => a.name.localeCompare(b.name));
    const sortedGroups = [...categories].sort((a, b) =>
      archiveSort === 'az'
        ? a.name.localeCompare(b.name)
        : archiveSort === 'za'
          ? b.name.localeCompare(a.name)
          : 0,
    );
    return (
      <nav className="category-list" aria-label="Archive collections">
        <div className="archive-tools">
          <input
            className="field"
            type="search"
            aria-label="Search collections"
            placeholder="Find a collection…"
            value={archiveSearch}
            onChange={(e) => {
              setArchiveSearch(e.target.value);
              const first = sets.find(
                (s) =>
                  s.status === 'published' &&
                  (archiveGroup === 'all' || s.category_id === archiveGroup) &&
                  s.name
                    .toLowerCase()
                    .includes(e.target.value.trim().toLowerCase()),
              );
              if (first) setExpandedCategory(first.category_id);
            }}
          />
          <div>
            <select
              className="field"
              aria-label="Filter collection group"
              value={archiveGroup}
              onChange={(e) => {
                setArchiveGroup(e.target.value);
                if (e.target.value !== 'all')
                  setExpandedCategory(e.target.value);
              }}
            >
              <option value="all">All groups</option>
              {categories
                .filter((c) => !c.status || c.status === 'published')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <select
              className="field"
              aria-label="Sort collection groups"
              value={archiveSort}
              onChange={(e) => setArchiveSort(e.target.value)}
            >
              <option value="default">Group order</option>
              <option value="az">Groups A–Z</option>
              <option value="za">Groups Z–A</option>
            </select>
          </div>
        </div>
        {!matches.length && (
          <p className="category-empty">No collections found.</p>
        )}
        {sortedGroups
          .filter(
            (cat) =>
              (!cat.status || cat.status === 'published') &&
              (archiveGroup === 'all' || cat.id === archiveGroup) &&
              (!archiveSearch.trim() ||
                matches.some((s) => s.category_id === cat.id)),
          )
          .map((cat) => (
            <section key={cat.id}>
              <button
                className="category"
                aria-expanded={expandedCategory === cat.id}
                onClick={() =>
                  setExpandedCategory(
                    expandedCategory === cat.id ? null : cat.id,
                  )
                }
              >
                <span>{cat.name}</span>
                <small>
                  {
                    matches.filter(
                      (s) =>
                        s.status === 'published' && s.category_id === cat.id,
                    ).length
                  }
                </small>
                <ChevronDown size={13} />
              </button>
              {expandedCategory === cat.id && (
                <div className="set-links">
                  <a
                    className="group-overview-link"
                    href={'/?group=' + encodeURIComponent(cat.id)}
                  >
                    <LayoutGrid size={13} />
                    Collections Overview
                  </a>
                  {sorted
                    .filter(
                      (s) =>
                        s.status === 'published' && s.category_id === cat.id,
                    )
                    .map((s) => (
                      <button
                        className={
                          !overviewGroup && s.id === selected?.id
                            ? 'selected'
                            : ''
                        }
                        aria-current={
                          !overviewGroup && s.id === selected?.id
                            ? 'page'
                            : undefined
                        }
                        key={s.id}
                        onClick={() => chooseSet(s.id)}
                        title={s.name}
                      >
                        {s.name.replace(/^Yuyu Hakusho |^Dragon Ball /, '')}
                      </button>
                    ))}
                  {!matches.some(
                    (s) => s.category_id === cat.id && s.status === 'published',
                  ) && <p className="category-empty">No collections yet</p>}
                </div>
              )}
            </section>
          ))}
      </nav>
    );
  }
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
        <div className="desktop-navigation">{mainNavigation()}</div>
        <button
          className="icon-button menu-toggle"
          aria-label="Open main menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={23} />
        </button>
      </header>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="navigation-drawer right-drawer">
          <DialogTitle>TEKSBOY</DialogTitle>
          <DialogDescription className="sr-only">
            Main navigation and account
          </DialogDescription>
          {mainNavigation()}
        </DialogContent>
      </Dialog>
      {view === 'database' && (
        <>
          <button
            className="icon-button archives-toggle"
            aria-label="Open archives menu"
            aria-expanded={archivesOpen}
            onClick={() => setArchivesOpen(true)}
          >
            <Menu size={18} />
            <span>Archives</span>
          </button>
          <aside className="sidebar">
            <div className="sidebar-title">Archives</div>
            {archiveNavigation()}
          </aside>
          <Dialog open={archivesOpen} onOpenChange={setArchivesOpen}>
            <DialogContent className="navigation-drawer left-drawer">
              <DialogTitle>Archives</DialogTitle>
              <DialogDescription className="sr-only">
                Choose a collection group and set
              </DialogDescription>
              {archiveNavigation()}
            </DialogContent>
          </Dialog>
        </>
      )}
      <main className={'workspace ' + (view !== 'database' ? 'wide' : '')}>
        {view === 'community' && <Community />}
        {view === 'database' && overviewGroup && (
          <GroupOverview
            group={categories.find(
              (c) =>
                c.id === overviewGroup &&
                (!c.status || c.status === 'published'),
            )}
            sets={sets.filter(
              (s) =>
                s.category_id === overviewGroup && s.status === 'published',
            )}
            lists={lists}
            busy={busy || !ready}
            onSelect={chooseSet}
            onAdd={addSet}
            onShare={(url) => {
              const target = new URL(url, window.location.origin);
              setShareTitle(
                sets.find((s) => s.id === target.searchParams.get('set'))
                  ?.name ||
                  categories.find(
                    (g) => g.id === target.searchParams.get('group'),
                  )?.name ||
                  'Teksboy collection',
              );
              setShareUrl(target.toString());
              setShareOpen(true);
            }}
          />
        )}
        {view === 'database' && !overviewGroup && selected && (
          <>
            <section className="set-hero">
              <Backprint src={selected.cover} />
              <div className="hero-info">
                <span className="collection-group-label">
                  {groupName(selected)}
                </span>
                <a
                  className="collection-back-link"
                  href={'/?group=' + encodeURIComponent(selected.category_id)}
                >
                  ← Collections overview
                </a>
                <h2>{selected.name}</h2>
                {selected.market_price_min != null &&
                  selected.market_price_max != null && (
                    <div className="market-price">
                      <p>
                        Estimated Market Price:{' '}
                        <strong>
                          ₱{selected.market_price_min.toLocaleString('en-PH')}–₱
                          {selected.market_price_max.toLocaleString('en-PH')}
                        </strong>
                      </p>
                      <small>
                        *Based on current listings, card condition, and recent
                        sales.
                      </small>
                      <small>
                        *For price guidance only; actual value may vary.
                      </small>
                    </div>
                  )}
                <p className="total-label">Total teks:</p>
                <strong className="total-count">{selected.cards.length}</strong>
              </div>
              <div className="hero-action">
                <CollectionCollectors key={selected.id} setId={selected.id} />
                <button
                  className="button share-collection"
                  onClick={() => {
                    const url = new URL('/', window.location.origin);
                    url.searchParams.set('set', selected.id);
                    setShareTitle(selected.name);
                    setShareUrl(url.toString());
                    setShareOpen(true);
                  }}
                >
                  <Share2 size={15} /> Share
                </button>
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
                  <span className="teks-reference">
                    #{String(c.number).padStart(3, '0')}
                  </span>
                </div>
              ))}
            </div>
            {!selected.cards.length && (
              <div className="empty">No cards have been added to this set.</div>
            )}
          </>
        )}
        {view === 'database' && !overviewGroup && !selected && (
          <div className="empty">
            <Library />
            <h2>The archive is waiting.</h2>
            <p>Publish your first set in the CMS.</p>
          </div>
        )}
        {view === 'leaderboard' && <Leaderboard />}
        {view === 'collectors' && (
          <SocialCollectors
            revision={socialRevision}
            onEditProfile={() => setProfileOpen(true)}
            onOpenChecklist={(id) => openChecklist(id, false)}
            onLogin={() => setLogin(true)}
          />
        )}
        {view === 'checklist' && (
          <>
            <div className="page-title">
              <h1>MY CHECKLIST</h1>
            </div>
            <div className="stats">
              <div>
                <span>Completed sets</span>
                <b>{user ? completed.length : 0}</b>
              </div>
              <div>
                <span>Sets in progress</span>
                <b>{user ? inProgress.length : 0}</b>
              </div>
            </div>
            <div className="checklist-filters">
              <Tabs
                className="checklist-status-tabs"
                value={listFilter}
                onValueChange={(v) => setListFilter(String(v))}
              >
                <TabsList aria-label="Collection status">
                  <TabsTrigger value="progress">
                    In progress{' '}
                    <span className="filter-count">
                      {user ? inProgress.length : 0}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="complete">
                    Completed{' '}
                    <span className="filter-count">
                      {user ? completed.length : 0}
                    </span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Popover open={groupFilterOpen} onOpenChange={setGroupFilterOpen}>
                <PopoverTrigger
                  className={
                    'group-filter-button ' +
                    (checklistGroup !== 'all' ? 'is-filtered' : '')
                  }
                  aria-label={
                    'Filter collection group: ' +
                    (checklistGroups.find((g) => g.id === checklistGroup)
                      ?.name || 'All')
                  }
                  title={
                    checklistGroups.find((g) => g.id === checklistGroup)
                      ?.name || 'Filter collection group'
                  }
                >
                  <SlidersHorizontal size={17} />
                  <span className="group-filter-caption">
                    {checklistGroups.find((g) => g.id === checklistGroup)
                      ?.name || 'Filter'}
                  </span>
                  {checklistGroup !== 'all' && <i className="filter-dot" />}
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={8}
                  className="group-filter-dropdown"
                >
                  <PopoverTitle>Collection group</PopoverTitle>
                  <fieldset>
                    <legend className="sr-only">Collection group</legend>
                    {[
                      { id: 'all', name: 'All collections' },
                      ...checklistGroups,
                    ].map((group) => (
                      <label
                        key={group.id}
                        className={checklistGroup === group.id ? 'chosen' : ''}
                      >
                        <input
                          type="radio"
                          name="checklist-group"
                          value={group.id}
                          checked={checklistGroup === group.id}
                          onChange={() => {
                            setChecklistGroup(group.id);
                            setGroupFilterOpen(false);
                          }}
                        />
                        <span>{group.name}</span>
                      </label>
                    ))}
                  </fieldset>
                </PopoverContent>
              </Popover>
            </div>
            <div className="checklist-tools">
              <input
                className="field"
                aria-label="Search my collections"
                placeholder="Find a collection…"
                value={checklistSearch}
                onChange={(e) => setChecklistSearch(e.target.value)}
              />
              <select
                className="field"
                aria-label="Sort my collections"
                value={checklistSort}
                onChange={(e) => setChecklistSort(e.target.value)}
              >
                <option value="name">Name A–Z</option>
                <option value="recent">Recently updated</option>
                <option value="closest">Closest to completion</option>
                <option value="missing">Most missing</option>
              </select>
            </div>
            {!ready ? (
              <div className="empty">Loading your collection…</div>
            ) : !user ? (
              <div className="empty">
                <Layers />
                <h2>Your collection starts here.</h2>
                <p>
                  {localMode
                    ? 'Try local collections. Progress is saved in the local database.'
                    : 'Sign in with Google to save your checklist across devices.'}
                </p>
                <button
                  className="button primary"
                  onClick={() => setLogin(true)}
                >
                  {localMode ? 'Enter local demo' : 'Sign in with Google'}
                </button>
              </div>
            ) : (
              <div className="collection-grid">
                {visibleChecklists.map((s) => (
                  <button
                    className="collection-card"
                    key={s.id}
                    onClick={() => openChecklist(s.id, false)}
                  >
                    <Backprint src={s.cover} />
                    <div>
                      <span className="collection-group-label">
                        {groupName(s)}
                      </span>
                      <h2>{s.name}</h2>
                      {checklistMeta[s.id]?.verified && (
                        <span className="collection-verified">
                          ✓ Verified collection
                        </span>
                      )}
                      <p>
                        <b>{owned[s.id]?.length || 0}</b> / {s.cards.length}{' '}
                        collected
                      </p>
                      <Segments
                        value={completion(
                          s.cards.length,
                          owned[s.id]?.length || 0,
                        )}
                      />
                    </div>
                  </button>
                ))}
                {!visibleChecklists.length && (
                  <div className="empty">
                    <h2>
                      {checklistGroup !== 'all'
                        ? `No ${listFilter === 'complete' ? 'completed' : 'in-progress'} sets in this group.`
                        : listFilter === 'complete'
                          ? 'Your first complete set is ahead.'
                          : 'A new collection is calling.'}
                    </h2>
                    <p>Explore the archives to find your next set.</p>
                    <a
                      className="button primary"
                      href="/"
                      onClick={(event) => {
                        event.preventDefault();
                        window.location.assign('/');
                      }}
                    >
                      Explore archives
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
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="modal share-modal">
          <DialogTitle>Share collection</DialogTitle>
          <DialogDescription>{shareTitle}</DialogDescription>
          <ShareActions url={shareUrl} title={shareTitle} />
        </DialogContent>
      </Dialog>
      {profileOpen && user && (
        <MyProfile
          profile={profileInfo}
          email={user.email || ''}
          role={userRole}
          onClose={() => setProfileOpen(false)}
          onSave={async (value) => {
            const response = await appFetch('/__local/collector', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profile: value }),
            });
            if (!response.ok) {
              const result = (await response.json()) as { error?: string };
              throw Error(result.error || 'Could not save profile.');
            }
            localStorage.setItem(profileKey(user.id), JSON.stringify(value));
            setProfileInfo(value);
            setSocialRevision((v) => v + 1);
            setProfileOpen(false);
            setMessage('Profile saved.');
          }}
        />
      )}
      <Dialog open={login} onOpenChange={setLogin}>
        <DialogContent className="modal login-modal">
          <Layers className="login-icon" />
          <DialogTitle>Keep your collection close.</DialogTitle>
          <DialogDescription>
            {localMode
              ? 'Explore local checklists and save progress on this computer.'
              : 'Sign in to save your progress and pick up where you left off, on any device.'}
          </DialogDescription>
          {localMode && (
            <label className="form-label">
              Test account
              <select
                className="field"
                aria-label="Local test account"
                value={localAccount}
                onChange={(e) => setLocalAccount(e.target.value)}
              >
                {localAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.role}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="button google-button"
            onClick={signIn}
            disabled={(!localMode && (!client || !providerReady)) || busy}
          >
            {!localMode && <span className="google-g">G</span>}
            {localMode
              ? 'Enter local demo'
              : busy
                ? 'Connecting…'
                : 'Continue with Google'}
          </button>
          {localMode && (
            <p className="notice">
              Local development. Profiles and checklist changes are saved to
              SQLite on this computer. The CMS uses a separate local
              administrator session.
            </p>
          )}
          {ready && !localMode && (!client || !providerReady) && (
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
                <Backprint src={editSet.cover} />
                <div>
                  {preview && (
                    <span className="eyebrow">Preview · not saved</span>
                  )}
                  <span className="collection-group-label">
                    {groupName(editSet)}
                  </span>
                  <DialogTitle>{editSet.name}</DialogTitle>
                  <DialogDescription>
                    {!preview && checklistMeta[editSet.id]?.verified && (
                      <span className="collection-verified">
                        ✓ Verified collection ·{' '}
                      </span>
                    )}
                    <b>{currentOwned.length}</b> / {editSet.cards.length}{' '}
                    Collected
                  </DialogDescription>
                  <SetCompleted
                    total={editSet.cards.length}
                    owned={currentOwned.length}
                  />
                  <Segments
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
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="missing">Missing only</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="checklist-bulk-actions">
                  <button
                    className="button check-all-button"
                    aria-label="Check all teks"
                    title="Check all teks"
                    disabled={
                      pending.length > 0 ||
                      !editSet.cards.length ||
                      currentOwned.length === editSet.cards.length
                    }
                    onClick={() => setCheckAllConfirm(true)}
                  >
                    <CheckCheck size={17} />
                  </button>
                </div>
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
                {!preview && user && (
                  <div className="checklist-share-row">
                    <ChecklistShare
                      userId={user.id}
                      setId={editSet.id}
                      title={editSet.name}
                    />
                  </div>
                )}
                {!preview &&
                  user &&
                  editSet.cards.length > 0 &&
                  editSet.cards.every((card) =>
                    currentOwned.includes(card.id),
                  ) && (
                    <VerificationRequest
                      key={editSet.id}
                      setId={editSet.id}
                      name={editSet.name}
                    />
                  )}
                {!preview && user && (
                  <ChecklistPin
                    key={editSet.id}
                    setId={editSet.id}
                    onSaved={() => setSocialRevision((v) => v + 1)}
                  />
                )}

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
                          disabled={
                            pending.includes(c.id) || pending.length > 0
                          }
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
                              <span>
                                #{String(c.number).padStart(3, '0')} ·{' '}
                              </span>
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
                <div className="checklist-bottom-actions">
                  {' '}
                  {!preview && user && (
                    <RemoveAction
                      kind="checklist"
                      id={editSet.id}
                      disabled={pending.length > 0}
                    />
                  )}
                </div>
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
                        void toggle(undo.card, undo.value).then(() =>
                          setUndo(null),
                        );
                      }}
                    >
                      <Undo2 size={16} /> Undo
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
      <Dialog
        open={checkAllConfirm && !!editSet}
        onOpenChange={setCheckAllConfirm}
      >
        <DialogContent className="modal check-all-confirm">
          <DialogTitle>Check all teks?</DialogTitle>
          <DialogDescription>
            Mark every teks in {editSet?.name} as collected? This will save your
            checklist as complete.
          </DialogDescription>
          <div className="check-all-confirm-actions">
            <button
              className="button"
              onClick={() => setCheckAllConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={pending.length > 0}
              onClick={() => {
                setCheckAllConfirm(false);
                void checkAll();
              }}
            >
              Yes, check all
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="modal export-modal">
          <DialogTitle>Download missing</DialogTitle>
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
              <button
                className="button primary"
                onClick={() => {
                  exports.forEach((url, i) => {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${editing}-missing-${i + 1}.png`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  });
                }}
              >
                <Download size={16} />
                {exports.length > 1
                  ? `Download all ${exports.length} pages`
                  : 'Download image'}
              </button>
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
