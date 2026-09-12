'use client';
import { appFetch } from '@/lib/app-fetch';
/* eslint-disable next/no-img-element, next/no-html-link-for-pages -- Local scans and full-page links. */
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  LayoutDashboard,
  Layers,
  Library,
  Users,
  ContactRound,
  Music,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Pencil,
  Upload,
  LogOut,
  Menu,
} from 'lucide-react';
import { localDemoEnabled } from '@/lib/local-demo';
import './local-cms.css';
import Collectors from './cms-collectors';
import SocialManagement from './social-management';
import { socialApi } from '@/lib/social-api';
import UserName from './user-name';
import CmsActivity from './cms-activity';
import CmsVerifications from './cms-verifications';
import CmsAvatars from './cms-avatars';
import CommunityTypes from './community-types';
import Community from './community';
import CmsRoles from './cms-roles';
import { useRoles } from './role-provider';

type Card = { id: string; number: number; image: string };
export type CmsRow = {
  logo?: string;
  id: string;
  name?: string;
  title?: string;
  category_id?: string;
  status?: string;
  position?: number;
  market_price_min?: number | null;
  market_price_max?: number | null;
  cover?: string;
  url?: string;
  email?: string;
  role?: string;
  user_verified?: boolean;
  public_profile?: boolean;
  comments_enabled?: boolean;
  comment_restricted?: boolean;
  created_at?: string;
  cards?: Card[];
  user_id?: string;
  set_id?: string;
  owned?: string[];
  verified?: boolean;
  public?: boolean;
  verified_at?: string;
  verified_by?: string;
  proof?: string;
  notes?: string;
};
type Row = CmsRow;
export type CmsData = Record<Kind | 'checklists', Row[]>;
type Kind = 'groups' | 'collections' | 'users' | 'tracks';
type Data = Record<Kind | 'checklists', Row[]>;
const sections = [
  { id: 'activity', name: 'Activity Timeline', icon: Users },
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
  { id: 'groups', name: 'Collection Groups', icon: Layers },
  { id: 'collections', name: 'Collection Sets', icon: Library },
  { id: 'tracks', name: 'BGM Playlists', icon: Music },
  { id: 'users', name: 'Users', icon: Users },
  { id: 'community-types', name: 'Community Link Types', icon: Users },
  { id: 'community', name: 'Community Links', icon: Users },
  { id: 'verifications', name: 'Verification Requests', icon: ContactRound },
  { id: 'avatars', name: 'Avatar Selections', icon: Users },
  { id: 'roles', name: 'Roles', icon: Users },
  { id: 'social', name: 'Comments', icon: Users },
  { id: 'collectors', name: 'Collectors', icon: ContactRound },
];
const empty: Data = {
  groups: [],
  collections: [],
  users: [],
  tracks: [],
  checklists: [],
};
async function api<T = Record<string, unknown>>(path: string, body?: unknown) {
  const response = await appFetch(
    '/__local/' + path,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw Error(data.error || 'Request failed.');
  return data;
}
async function upload(file: File, purpose?: string) {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(
        (typeof reader.result === 'string' ? reader.result : '').split(',')[1],
      );
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return (
    await api<{ url: string }>('upload', { type: file.type, base64, purpose })
  ).url as string;
}
export default function LocalCms() {
  const { roles } = useRoles();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [socialCounts, setSocialCounts] = useState({
    visits: 0,
    comments: 0,
    offers: 0,
  });
  const [data, setData] = useState<Data>(empty),
    [section, setSection] = useState('dashboard'),
    [query, setQuery] = useState(''),
    [group, setGroup] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'),
    [roleFilter, setRoleFilter] = useState('all'),
    [verificationFilter, setVerificationFilter] = useState('all'),
    [sort, setSort] = useState('position');
  const [attention, setAttention] = useState('all'),
    [collectorScope, setCollectorScope] = useState('all'),
    [targetCollector, setTargetCollector] = useState<string | null>(null);
  const [ready, setReady] = useState(false),
    [authorized, setAuthorized] = useState(false),
    [local, setLocal] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [mobile, setMobile] = useState(false);
  const [editing, setEditing] = useState<{ kind: Kind; row: Row } | null>(null),
    [deleting, setDeleting] = useState<{ kind: Kind; row: Row } | null>(null),
    [cardPage, setCardPage] = useState(0);
  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get('section');
    const timer = setTimeout(() => {
      if (section) setSection(section);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  async function refresh() {
    const result = await api<Data & { permissions: string[] }>('cms');
    const visiblePermissions = [
      ...result.permissions,
      ...(result.permissions.includes('roles') ? ['activity'] : []),
      ...(result.permissions.includes('community') ? ['community-types'] : []),
      ...(result.permissions.includes('collectors') ? ['verifications'] : []),
    ];
    setPermissions(visiblePermissions);
    setSection((current) =>
      visiblePermissions.includes(current) ? current : result.permissions[0],
    );
    setData(result);
    if (
      result.permissions.includes('dashboard') ||
      result.permissions.includes('social')
    ) {
      const social = await socialApi<{
        visits: unknown[];
        comments: { deleted?: boolean; offer?: boolean }[];
        reports: { resolved?: boolean }[];
      }>('moderation');
      setSocialCounts({
        visits: social.visits.length,
        comments: social.comments.filter(
          (c: { deleted?: boolean }) => !c.deleted,
        ).length,
        offers: social.comments.filter(
          (c: { deleted?: boolean; offer?: boolean }) => !c.deleted && c.offer,
        ).length,
      });
    }
    setAuthorized(true);
  }
  useEffect(() => {
    void (async () => {
      setLocal(localDemoEnabled());
      try {
        await refresh();
      } catch {
      } finally {
        setReady(true);
      }
    })();
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  function edit(kind: Kind, row?: Row) {
    setMessage('');
    setCardPage(0);
    setEditing({
      kind,
      row: row
        ? structuredClone(row)
        : {
            id: '',
            name: '',
            title: '',
            status: kind === 'users' ? 'active' : 'draft',
            position: data[kind].length,
            category_id: data.groups[0]?.id || '',
            role: 'Normal',
            email: '',
            cards: [],
          },
    });
  }
  function update(key: string, value: unknown) {
    setEditing((p) => (p ? { ...p, row: { ...p.row, [key]: value } } : p));
  }
  async function move(kind: Kind, row: Row, delta: number) {
    const rows = data[kind];
    const index = rows.findIndex((r) => r.id === row.id),
      target = rows[index + delta];
    if (!target) return;
    await action(async () => {
      await api('save', { kind, row: { ...row, position: target.position } });
      await api('save', { kind, row: { ...target, position: row.position } });
      await refresh();
    });
  }
  function isComplete(l: Row) {
    const s = data.collections.find((s) => s.id === l.set_id);
    return !!s?.cards?.length && s.cards.every((c) => l.owned?.includes(c.id));
  }
  function openCollectionAttention(value: string) {
    setQuery('');
    setGroup('all');
    setRoleFilter('all');
    setVerificationFilter('all');
    setSort('position');
    setStatusFilter(value === 'draft' ? 'draft' : 'all');
    setAttention(value === 'draft' ? 'all' : value);
    setSection('collections');
  }
  const kind = section as Kind;
  const rows = (data[kind] || [])
    .filter(
      (row) =>
        `${row.name || row.title || ''} ${row.email || ''}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (group === 'all' || row.category_id === group) &&
        (attention === 'all' ||
          (attention === 'backprint' ? !row.cover : !row.cards?.length)) &&
        (statusFilter === 'all' || row.status === statusFilter) &&
        (roleFilter === 'all' || row.role === roleFilter) &&
        (verificationFilter === 'all' ||
          !!row.user_verified === (verificationFilter === 'verified')),
    )
    .sort((a, b) => {
      if (sort === 'name' || sort === 'name-desc')
        return (
          (sort === 'name' ? 1 : -1) *
          (a.name || a.title || '').localeCompare(
            b.name || b.title || '',
            undefined,
            { numeric: true },
          )
        );
      if (sort === 'cards')
        return (b.cards?.length || 0) - (a.cards?.length || 0);
      if (sort === 'newest')
        return (b.created_at || '').localeCompare(a.created_at || '');
      if (sort === 'role') return (a.role || '').localeCompare(b.role || '');
      return (a.position || 0) - (b.position || 0);
    });
  const groupName = (id?: string) =>
    data.groups.find((g) => g.id === id)?.name || '—';
  const collectionStats = data.collections
    .map((s) => {
      const lists = data.checklists.filter((l) => l.set_id === s.id);
      return {
        set: s,
        collectors: lists.length,
        completed: lists.filter(
          (l) =>
            (s.cards?.length || 0) > 0 &&
            (l.owned?.length || 0) === (s.cards?.length || 0),
        ).length,
      };
    })
    .sort((a, b) => b.collectors - a.collectors);
  const missing = data.collections
    .flatMap((s) =>
      (s.cards || []).map((c) => ({
        set: s.name,
        card: c,
        missing: data.checklists.filter(
          (l) => l.set_id === s.id && !l.owned?.includes(c.id),
        ).length,
      })),
    )
    .filter((c) => c.missing > 0)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 10);
  if (!ready) return <main className="cms-login">Loading CMS…</main>;
  if (!authorized)
    return (
      <main className="cms-login">
        <div>
          <Layers size={32} />
          <h1>Teksboy CMS</h1>
          <p>
            {local
              ? 'Local development · SQLite'
              : 'Administrator sign-in required'}
          </p>
          <p>
            {local
              ? 'Use a local administrator to manage test data.'
              : 'Sign in with Google using an account with management permissions.'}
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                if (!local) {
                  window.location.href = '/';
                  return;
                }
                await api('login', {});
                await refresh();
              })
            }
          >
            {local ? 'Enter local CMS' : 'Go to sign in'}
          </button>
          {message && <p role="alert">{message}</p>}
          <a href="/">Back to Archives</a>
        </div>
      </main>
    );
  return (
    <div className="cms-shell">
      <aside className={'cms-sidebar ' + (mobile ? 'open' : '')}>
        <a className="cms-brand" href="/">
          <img src="/images/general/logo.svg" alt="Teksboy" />
        </a>
        <small>{local ? 'LOCAL MANAGEMENT' : 'MANAGEMENT'}</small>
        <nav>
          {[
            { name: '', ids: ['dashboard', 'activity'] },
            { name: 'Collections', ids: ['groups', 'collections', 'tracks'] },
            {
              name: 'Profiles',
              ids: ['users', 'collectors', 'verifications', 'roles', 'avatars'],
            },
            { name: 'Community Links', ids: ['community', 'community-types'] },
            { name: '', ids: ['social'] },
          ].map((group, i) => {
            const items = group.ids
              .map((id) => sections.find((s) => s.id === id)!)
              .filter((s) => s && permissions.includes(s.id));
            if (!items.length) return null;
            return (
              <div className="cms-nav-group" key={i}>
                {group.name && (
                  <div className="cms-nav-heading">{group.name}</div>
                )}
                {items.map((s) => (
                  <button
                    key={s.id}
                    className={section === s.id ? 'active' : ''}
                    onClick={() => {
                      setSection(s.id);
                      setAttention('all');
                      setCollectorScope('all');
                      setTargetCollector(null);
                      setQuery('');
                      setGroup('all');
                      setStatusFilter('all');
                      setRoleFilter('all');
                      setVerificationFilter('all');
                      setSort('position');
                      setMobile(false);
                    }}
                  >
                    <s.icon size={17} />
                    {s.id === 'community' ? 'Manage' : s.name}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="cms-sidebar-bottom">
          <span>
            {local
              ? 'SQLite · stored on this computer'
              : 'Supabase · synced online'}
          </span>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await api('logout', {});
                setAuthorized(false);
              })
            }
          >
            <LogOut size={15} /> Exit CMS
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="cms-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <main className="cms-main">
        <header className="cms-header">
          <button
            className="button cms-mobile-menu"
            aria-label="CMS navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={18} />
          </button>
          <div>
            <h1>{sections.find((s) => s.id === section)?.name}</h1>
            <p>
              {section === 'dashboard'
                ? 'Users, checklists and collection activity.'
                : 'Changes are saved to your database.'}
            </p>
          </div>
          {section !== 'dashboard' &&
            section !== 'collectors' &&
            section !== 'social' &&
            section !== 'roles' &&
            section !== 'community' &&
            section !== 'community-types' &&
            section !== 'avatars' &&
            section !== 'verifications' &&
            section !== 'activity' &&
            (section !== 'users' || local) && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => edit(kind)}
              >
                <Plus size={15} /> Add{' '}
                {section === 'groups'
                  ? 'group'
                  : section === 'collections'
                    ? 'collection'
                    : section === 'users'
                      ? 'test user'
                      : 'track'}
              </button>
            )}
        </header>
        {message && (
          <output className="cms-message">
            {message}
            <button aria-label="Dismiss" onClick={() => setMessage('')}>
              ×
            </button>
          </output>
        )}
        {section === 'activity' ? (
          <CmsActivity />
        ) : section === 'verifications' ? (
          <CmsVerifications />
        ) : section === 'avatars' ? (
          <CmsAvatars />
        ) : section === 'community-types' ? (
          <CommunityTypes />
        ) : section === 'community' ? (
          <Community management />
        ) : section === 'roles' ? (
          <CmsRoles />
        ) : section === 'social' ? (
          <SocialManagement />
        ) : section === 'collectors' ? (
          <Collectors
            data={data}
            refresh={refresh}
            initialCollector={targetCollector}
            initialScope={collectorScope}
          />
        ) : section === 'dashboard' ? (
          <>
            <div className="cms-stats">
              {Object.entries(socialCounts).map(([label, count]) => (
                <button key={label} onClick={() => setSection('social')}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>
            <div className="cms-stats">
              {[
                {
                  label: 'Total collectors',
                  count: data.users.length,
                  scope: 'all',
                },
                {
                  label: 'Active collectors with checklists',
                  count: data.users.filter(
                    (u) =>
                      u.status === 'active' &&
                      data.checklists.some((l) => l.user_id === u.id),
                  ).length,
                  scope: 'active',
                },
                {
                  label: 'Completed collections',
                  count: data.checklists.filter(isComplete).length,
                  scope: 'complete',
                },
                {
                  label: 'Verified completed collections',
                  count: data.checklists.filter(
                    (l) => l.verified && isComplete(l),
                  ).length,
                  scope: 'verified',
                },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setCollectorScope(item.scope);
                    setTargetCollector(null);
                    setSection('collectors');
                  }}
                >
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </button>
              ))}
            </div>
            <section className="cms-panel">
              <h2>Needs attention</h2>
              <div className="cms-attention">
                <button
                  className="button"
                  onClick={() =>
                    document
                      .getElementById('cms-verification-queue')
                      ?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  Unverified completed collections ·{' '}
                  {
                    data.checklists.filter((l) => !l.verified && isComplete(l))
                      .length
                  }
                </button>
                <button
                  className="button"
                  onClick={() => openCollectionAttention('draft')}
                >
                  Draft collections ·{' '}
                  {data.collections.filter((s) => s.status === 'draft').length}
                </button>
                <button
                  className="button"
                  onClick={() => openCollectionAttention('backprint')}
                >
                  Missing backprints ·{' '}
                  {data.collections.filter((s) => !s.cover).length}
                </button>
                <button
                  className="button"
                  onClick={() => openCollectionAttention('cards')}
                >
                  No teks images ·{' '}
                  {data.collections.filter((s) => !s.cards?.length).length}
                </button>
              </div>
              <div id="cms-verification-queue" className="cms-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Collector</th>
                      <th>Completed collection awaiting verification</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.checklists
                      .filter((l) => !l.verified && isComplete(l))
                      .map((l) => (
                        <tr key={l.id}>
                          <td>
                            {data.users.find((u) => u.id === l.user_id)?.name}
                          </td>
                          <td>
                            {
                              data.collections.find((s) => s.id === l.set_id)
                                ?.name
                            }
                          </td>
                          <td>
                            <button
                              className="button"
                              onClick={() => {
                                setTargetCollector(l.user_id || null);
                                setCollectorScope('all');
                                setSection('collectors');
                              }}
                            >
                              Review collector
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!data.checklists.some((l) => !l.verified && isComplete(l)) && (
                  <p className="cms-empty">
                    No completed collections awaiting verification.
                  </p>
                )}
              </div>
            </section>
            <section className="cms-panel">
              <h2>Most-collected sets</h2>
              <p>
                {local
                  ? 'Based on saved local checklists. Test accounts are included.'
                  : 'Based on collectors’ saved checklists.'}
              </p>
              <div className="cms-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Collection</th>
                      <th>Collectors</th>
                      <th>Complete</th>
                      <th>Completion rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectionStats
                      .filter((s) => s.collectors)
                      .slice(0, 10)
                      .map((s) => (
                        <tr key={s.set.id}>
                          <td>{s.set.name}</td>
                          <td>{s.collectors}</td>
                          <td>{s.completed}</td>
                          <td>
                            {Math.round((s.completed / s.collectors) * 100)}%
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!data.checklists.length && (
                  <p className="cms-empty">
                    Save a checklist in the local app to see activity here.
                  </p>
                )}
              </div>
            </section>
            <section className="cms-panel">
              <h2>Most-missing cards</h2>
              <div className="cms-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Card</th>
                      <th>Collection</th>
                      <th>Collectors missing it</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missing.map((m) => (
                      <tr key={m.card.id}>
                        <td>
                          <img
                            className="cms-thumb"
                            src={m.card.image}
                            alt={'Card ' + m.card.number}
                          />
                        </td>
                        <td>
                          {m.set} · {m.card.number}
                        </td>
                        <td>{m.missing}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!missing.length && (
                  <p className="cms-empty">No missing-card data yet.</p>
                )}
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="cms-toolbar">
              <input
                className="field"
                aria-label="Search management records"
                placeholder={
                  kind === 'users' ? 'Search name or email…' : 'Search by name…'
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {['collections', 'tracks'].includes(section) && (
                <select
                  className="field"
                  aria-label="Filter by group"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                >
                  <option value="all">All groups</option>
                  {data.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
              {kind !== 'tracks' && (
                <select
                  className="field"
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  {(kind === 'users'
                    ? ['active', 'suspended']
                    : ['draft', 'published', 'archived']
                  ).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              )}
              {kind === 'users' && (
                <>
                  <select
                    className="field"
                    aria-label="Filter by role"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                  >
                    <option value="all">All roles</option>
                    {roles
                      .map((r) => r.name)
                      .map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                  </select>
                  <select
                    className="field"
                    aria-label="Filter user verification"
                    value={verificationFilter}
                    onChange={(e) => setVerificationFilter(e.target.value)}
                  >
                    <option value="all">All users</option>
                    <option value="verified">Verified users</option>
                    <option value="unverified">Unverified users</option>
                  </select>
                </>
              )}
              <select
                className="field"
                aria-label="Sort records"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="position">Saved order</option>
                <option value="name">Name A–Z</option>
                <option value="name-desc">Name Z–A</option>
                {kind === 'collections' && (
                  <option value="cards">Most cards</option>
                )}
                {kind === 'users' && (
                  <>
                    <option value="newest">Newest users</option>
                    <option value="role">Role A–Z</option>
                  </>
                )}
              </select>
              <button
                className="button"
                onClick={() => {
                  setQuery('');
                  setGroup('all');
                  setStatusFilter('all');
                  setRoleFilter('all');
                  setVerificationFilter('all');
                  setSort('position');
                  setAttention('all');
                }}
              >
                Reset
              </button>
              {attention !== 'all' && (
                <button className="button" onClick={() => setAttention('all')}>
                  {attention === 'backprint'
                    ? 'Missing backprints'
                    : 'No teks images'}{' '}
                  ×
                </button>
              )}
              <span>{rows.length} records</span>
              <button
                className="button"
                disabled={busy}
                onClick={() => void action(refresh)}
              >
                Refresh
              </button>
            </div>
            <div className="cms-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{kind === 'tracks' ? 'Track' : 'Name'}</th>
                    {['collections', 'tracks'].includes(kind) && <th>Group</th>}
                    <th>
                      {kind === 'users'
                        ? 'Role'
                        : kind === 'collections'
                          ? 'Cards'
                          : 'Order'}
                    </th>
                    {kind !== 'tracks' && <th>Status</th>}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="cms-record-name">
                          {row.cover && (
                            <img className="cms-thumb" src={row.cover} alt="" />
                          )}
                          <div>
                            {kind === 'users' ? (
                              <UserName
                                name={row.name}
                                verified={row.user_verified}
                                role={row.role}
                              />
                            ) : (
                              <strong>{row.name || row.title}</strong>
                            )}
                            {kind === 'users' && <small>{row.email}</small>}
                            {kind === 'tracks' && (
                              // eslint-disable-next-line jsx-a11y/media-has-caption -- Background music preview.
                              <audio controls preload="none" src={row.url} />
                            )}
                          </div>
                        </div>
                      </td>
                      {['collections', 'tracks'].includes(kind) && (
                        <td>{groupName(row.category_id)}</td>
                      )}
                      <td>
                        {kind === 'users'
                          ? row.role
                          : kind === 'collections'
                            ? row.cards?.length
                            : (row.position || 0) + 1}
                      </td>
                      {kind !== 'tracks' && (
                        <td>
                          <span className={'cms-status ' + row.status}>
                            {row.status}
                          </span>
                        </td>
                      )}
                      <td>
                        <div className="cms-row-actions">
                          <button
                            className="button"
                            aria-label={'Edit ' + (row.name || row.title)}
                            disabled={busy}
                            onClick={() => edit(kind, row)}
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          {kind !== 'users' && (
                            <>
                              <button
                                className="button"
                                aria-label={
                                  'Move up ' + (row.name || row.title)
                                }
                                disabled={
                                  busy ||
                                  sort !== 'position' ||
                                  !!query ||
                                  group !== 'all' ||
                                  statusFilter !== 'all' ||
                                  data[kind][0]?.id === row.id
                                }
                                onClick={() => void move(kind, row, -1)}
                              >
                                <ArrowUp size={13} />
                              </button>
                              <button
                                className="button"
                                aria-label={
                                  'Move down ' + (row.name || row.title)
                                }
                                disabled={
                                  busy ||
                                  sort !== 'position' ||
                                  !!query ||
                                  group !== 'all' ||
                                  statusFilter !== 'all' ||
                                  data[kind].at(-1)?.id === row.id
                                }
                                onClick={() => void move(kind, row, 1)}
                              >
                                <ArrowDown size={13} />
                              </button>
                              <button
                                className="button"
                                aria-label={'Delete ' + (row.name || row.title)}
                                disabled={busy}
                                onClick={() => setDeleting({ kind, row })}
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <p className="cms-empty">No records found.</p>}
            </div>
          </>
        )}
      </main>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent className="modal cms-edit-modal">
          <DialogTitle>
            {editing?.row.id ? 'Edit' : 'Add'}{' '}
            {editing?.kind === 'collections'
              ? 'collection'
              : editing?.kind === 'groups'
                ? 'group'
                : editing?.kind === 'users'
                  ? 'test user'
                  : 'track'}
          </DialogTitle>
          <DialogDescription>
            Local changes are saved when you click Save.
          </DialogDescription>
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await api('save', { kind: editing.kind, row: editing.row });
                  await refresh();
                  setEditing(null);
                  setMessage(
                    'Saved. Refresh the Archives page to see catalog changes.',
                  );
                });
              }}
            >
              <label className="form-label">
                {editing.kind === 'tracks' ? 'Title' : 'Name'}
                <input
                  className="field"
                  required
                  maxLength={150}
                  value={
                    editing.kind === 'tracks'
                      ? editing.row.title || ''
                      : editing.row.name || ''
                  }
                  onChange={(e) =>
                    update(
                      editing.kind === 'tracks' ? 'title' : 'name',
                      e.target.value,
                    )
                  }
                />
              </label>
              {editing.kind === 'groups' && (
                <>
                  <label className="form-label">
                    Logo URL
                    <input
                      className="field"
                      value={editing.row.logo || ''}
                      onChange={(e) => update('logo', e.target.value)}
                    />
                  </label>
                  <label className="button cms-upload">
                    <Upload size={14} /> Upload logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f)
                          void action(async () =>
                            update('logo', await upload(f, 'group-logo')),
                          );
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {editing.row.logo && (
                    <img
                      className="cms-group-logo"
                      src={editing.row.logo}
                      alt="Group logo preview"
                    />
                  )}
                </>
              )}
              {editing.kind === 'collections' && (
                <fieldset className="cms-price-fields">
                  <legend>Estimated market price (PHP)</legend>
                  <p>
                    Optional price guide for the whole set. Leave both fields
                    blank to hide it.
                  </p>
                  <div>
                    {(['market_price_min', 'market_price_max'] as const).map(
                      (key, i) => (
                        <label className="form-label" key={key}>
                          {i === 0 ? 'Minimum (₱)' : 'Maximum (₱)'}
                          <input
                            className="field"
                            type="number"
                            min="0"
                            step="0.01"
                            value={editing.row[key] ?? ''}
                            onChange={(e) =>
                              update(
                                key,
                                e.target.value === ''
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                          />
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>
              )}
              {['collections', 'tracks'].includes(editing.kind) && (
                <label className="form-label">
                  Collection group
                  <select
                    className="field"
                    required
                    value={editing.row.category_id || ''}
                    onChange={(e) => update('category_id', e.target.value)}
                  >
                    <option value="">Choose group</option>
                    {data.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {editing.kind !== 'tracks' && (
                <label className="form-label">
                  Status
                  <select
                    className="field"
                    value={editing.row.status}
                    onChange={(e) => update('status', e.target.value)}
                  >
                    {(editing.kind === 'users'
                      ? ['active', 'suspended']
                      : ['draft', 'published', 'archived']
                    ).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              )}
              {editing.kind === 'users' && (
                <>
                  <label className="form-label">
                    Email
                    <input
                      className="field"
                      type="email"
                      required
                      value={editing.row.email || ''}
                      onChange={(e) => update('email', e.target.value)}
                    />
                  </label>
                  <label className="form-label">
                    Role
                    <select
                      className="field"
                      value={editing.row.role}
                      disabled={!permissions.includes('roles')}
                      onChange={(e) => update('role', e.target.value)}
                    >
                      {roles
                        .map((r) => r.name)
                        .map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                    </select>
                  </label>
                  <label className="verification-toggle">
                    <input
                      type="checkbox"
                      checked={!!editing.row.user_verified}
                      onChange={(e) =>
                        update('user_verified', e.target.checked)
                      }
                    />
                    Verified user
                  </label>
                  <p className="profile-note">
                    Verified by Teksboy. Separate from collection verification;
                    does not affect leaderboard rank.
                  </p>
                  <label className="verification-toggle">
                    <input
                      type="checkbox"
                      checked={!!editing.row.comment_restricted}
                      onChange={(e) =>
                        update('comment_restricted', e.target.checked)
                      }
                    />
                    Restrict commenting
                  </label>
                  <p className="profile-note">
                    {local ? 'Local test accounts only. ' : ''}VIP is a role
                    label; premium features are not enabled yet.
                  </p>
                </>
              )}
              {['collections', 'tracks'].includes(editing.kind) && (
                <>
                  <label className="form-label">
                    {editing.kind === 'tracks' ? 'Audio URL' : 'Backprint URL'}
                    <input
                      className="field"
                      value={
                        (editing.kind === 'tracks'
                          ? editing.row.url
                          : editing.row.cover) || ''
                      }
                      onChange={(e) =>
                        update(
                          editing.kind === 'tracks' ? 'url' : 'cover',
                          e.target.value,
                        )
                      }
                    />
                  </label>
                  <label className="button cms-upload">
                    <Upload size={14} /> Upload{' '}
                    {editing.kind === 'tracks' ? 'audio' : 'backprint'}
                    <input
                      type="file"
                      disabled={busy}
                      accept={
                        editing.kind === 'tracks'
                          ? 'audio/mpeg,audio/ogg,audio/wav'
                          : 'image/jpeg,image/png,image/webp'
                      }
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void action(async () =>
                            update(
                              editing.kind === 'tracks' ? 'url' : 'cover',
                              await upload(file),
                            ),
                          );
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {editing.row.cover && editing.kind === 'collections' && (
                    <img
                      className="cms-cover-preview"
                      src={editing.row.cover}
                      alt="Backprint preview"
                    />
                  )}
                </>
              )}
              {editing.kind === 'collections' && (
                <section className="cms-card-editor">
                  <header>
                    <h3>Teks images ({editing.row.cards?.length || 0})</h3>
                    <label className="button cms-upload">
                      <Plus size={14} /> Add images
                      <input
                        type="file"
                        multiple
                        disabled={busy}
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []).sort(
                            (a, b) =>
                              a.name.localeCompare(b.name, undefined, {
                                numeric: true,
                              }),
                          );
                          void action(async () => {
                            const cards = [...(editing.row.cards || [])];
                            for (const file of files)
                              cards.push({
                                id: crypto.randomUUID(),
                                number: cards.length + 1,
                                image: await upload(file),
                              });
                            update('cards', cards);
                          });
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </header>
                  <p className="profile-note">
                    Uploads follow filename order. Use arrows to reorder; Save
                    applies the changes.
                  </p>
                  <div className="cms-card-grid">
                    {(editing.row.cards || [])
                      .slice(cardPage * 30, (cardPage + 1) * 30)
                      .map((c, j) => {
                        const i = cardPage * 30 + j;
                        return (
                          <div key={c.id}>
                            <img
                              src={c.image}
                              alt={'Card ' + (i + 1)}
                              loading="lazy"
                            />
                            <span>{i + 1}</span>
                            <div>
                              {[-1, 1].map((direction) => (
                                <button
                                  type="button"
                                  key={direction}
                                  disabled={
                                    busy ||
                                    i + direction < 0 ||
                                    i + direction >=
                                      (editing.row.cards?.length || 0)
                                  }
                                  aria-label={`Move card ${i + 1} ${direction < 0 ? 'earlier' : 'later'}`}
                                  onClick={() => {
                                    const cards = [
                                      ...(editing.row.cards || []),
                                    ];
                                    [cards[i], cards[i + direction]] = [
                                      cards[i + direction],
                                      cards[i],
                                    ];
                                    update('cards', cards);
                                  }}
                                >
                                  {direction < 0 ? '←' : '→'}
                                </button>
                              ))}
                              <button
                                type="button"
                                disabled={busy}
                                aria-label={'Remove card ' + (i + 1)}
                                onClick={() =>
                                  update(
                                    'cards',
                                    editing.row.cards?.filter(
                                      (x) => x.id !== c.id,
                                    ),
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  <div className="cms-pagination">
                    <button
                      type="button"
                      className="button"
                      disabled={!cardPage}
                      onClick={() => setCardPage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {cardPage + 1} /{' '}
                      {Math.max(
                        1,
                        Math.ceil((editing.row.cards?.length || 0) / 30),
                      )}
                    </span>
                    <button
                      type="button"
                      className="button"
                      disabled={
                        (cardPage + 1) * 30 >= (editing.row.cards?.length || 0)
                      }
                      onClick={() => setCardPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </section>
              )}
              {message && (
                <p className="cms-form-error" role="alert">
                  {message}
                </p>
              )}
              <div className="profile-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? 'Working…' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent className="modal">
          <DialogTitle>
            Delete {deleting?.row.name || deleting?.row.title}?
          </DialogTitle>
          <DialogDescription>
            This permanently removes this record. Collections with checklists
            and groups with collections cannot be deleted; archive them instead.
          </DialogDescription>
          {message && <p role="alert">{message}</p>}
          <div className="profile-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api('delete', {
                    kind: deleting?.kind,
                    id: deleting?.row.id,
                  });
                  await refresh();
                  setDeleting(null);
                })
              }
            >
              Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
