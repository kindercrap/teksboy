'use client';
/* eslint-disable next/no-html-link-for-pages, next/no-img-element -- Local scans and full-page navigation follow the app routing. */
import ChecklistShare from './checklist-share';
import RemoveAction from './remove-action';
import { useEffect, useState, useRef } from 'react';
import FacebookLink from './facebook-link';
import UserName from './user-name';
import { Avatar } from './my-profile';
import './social.css';
import { socialApi } from '@/lib/social-api';
import { Crown } from 'lucide-react';
import { Backprint, Segments, SetCompleted } from './collection-visuals';
import Leaderboard from './leaderboard';
type Person = {
  id: string;
  name: string;
  bio?: string;
  facebook_url?: string;
  photo: string;
  role: string;
  user_verified: boolean;
  collections?: number;
  completed?: number;
  collected?: number;
  groups?: string[];
};
type Card = { id: string; number: number; image: string };
type Checklist = {
  id: string;
  set_id: string;
  name: string;
  group: string;
  cover: string;
  verified: boolean;
  public: boolean;
  owned: string[];
  total: number;
  updated_at?: string;
  pinned_message?: string;
  cards?: Card[];
};
type Comment = {
  id: string;
  text: string;
  parent: string | null;
  author: Person;
  canEdit: boolean;
  edited_at?: string;
  cards: string[];
  offer: boolean;
  created_at: string;
};
type Profile = {
  user: Person;
  mine: boolean;
  commentsEnabled: boolean;
  checklists: Checklist[];
  comments: Comment[];
  visits: number;
};
export default function SocialCollectors({
  onEditProfile,
  onOpenChecklist,
  onLogin,
  revision = 0,
}: {
  onEditProfile: () => void;
  onOpenChecklist: (id: string) => void;
  onLogin: () => void;
  revision?: number;
}) {
  const [tab, setTab] = useState('all'),
    [search, setSearch] = useState(''),
    [group, setGroup] = useState('all'),
    [sort, setSort] = useState('name'),
    [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [listStatus, setListStatus] = useState('all'),
    [listSearch, setListSearch] = useState(''),
    [listSort, setListSort] = useState('name'),
    [listGroup, setListGroup] = useState('all');
  const [editComment, setEditComment] = useState(''),
    [editText, setEditText] = useState('');
  const [directory, setDirectory] = useState<Person[]>([]),
    [me, setMe] = useState<Person | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState('all'),
    [text, setText] = useState(''),
    [reply, setReply] = useState<string | null>(null),
    [cards, setCards] = useState<string[]>([]),
    [offer, setOffer] = useState(false),
    [location, setLocation] = useState({ owner: '', set: '' });
  const refreshVersion = useRef(0);
  async function refresh(
    owner = new URLSearchParams(window.location.search).get('user') || '',
    set = new URLSearchParams(window.location.search).get('set') || '',
  ) {
    const version = ++refreshVersion.current;
    const session = await socialApi<{ user: Person | null }>('session');
    if (new URLSearchParams(window.location.search).has('mine') && session.user)
      owner = session.user.id;
    const directory = await socialApi<{
      users: Person[];
      groups: { id: string; name: string }[];
    }>('directory');
    let result: Profile | null = null;
    let problem = '';
    try {
      if (owner)
        result = await socialApi<Profile>(
          'profile?user=' +
            encodeURIComponent(owner) +
            '&set=' +
            encodeURIComponent(set),
        );
    } catch (e) {
      problem = e instanceof Error ? e.message : 'Profile unavailable';
    }
    if (version !== refreshVersion.current) return;
    setMe(session.user);
    setDirectory(directory.users);
    setProfile(result);
    setGroups(directory.groups);
    setLocation({ owner, set });
    setError(problem);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = new URLSearchParams(window.location.search),
        owner = q.get('user') || '',
        set = q.get('set') || '';
      setTab(q.get('tab') === 'leaderboard' ? 'leaderboard' : 'all');
      setLocation({ owner, set });
      refresh(owner, set)
        .then(() => {
          if (owner) void socialApi('visit', { owner, set }).catch(() => {});
        })
        .catch((e) => setError(e.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [revision]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'center' });
    }, 50);
    return () => clearTimeout(timer);
  }, [profile, filter]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }
  const orderedComments: (Comment & { depth: number })[] = [];
  const seen = new Set<string>();
  const appendThread = (c: Comment, depth: number) => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    orderedComments.push({ ...c, depth });
    (profile?.comments || [])
      .filter((r) => r.parent === c.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach((r) => appendThread(r, depth + 1));
  };
  const comments = profile?.comments || [];
  comments
    .filter((c) => !c.parent || !comments.some((p) => p.id === c.parent))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((c) => appendThread(c, 0));
  comments.filter((c) => !seen.has(c.id)).forEach((c) => appendThread(c, 0));
  const selected = profile?.checklists.find((l) => l.set_id === location.set);
  const href = (owner: string, set = '') =>
    '/collectors?user=' +
    encodeURIComponent(owner) +
    (set ? '&set=' + encodeURIComponent(set) : '');
  return (
    <section className="social-page">
      <header className="social-heading">
        <h1>
          {profile
            ? profile.mine
              ? 'My Profile'
              : 'Collector profile'
            : 'Collectors'}
        </h1>
        {profile && (
          <a className="button" href="/collectors">
            All collectors
          </a>
        )}
        {profile?.mine && (
          <button className="button" onClick={onEditProfile}>
            Edit profile
          </button>
        )}
      </header>
      {!location.owner && (
        <nav className="collector-tabs" aria-label="Collectors sections">
          {['all', 'leaderboard'].map((t) => (
            <a
              key={t}
              className={tab === t ? 'active' : ''}
              href={t === 'all' ? '/collectors' : '/collectors?tab=leaderboard'}
            >
              {t === 'leaderboard' && <Crown size={14} />}{' '}
              {t === 'all' ? 'All' : 'Leaderboard'}
            </a>
          ))}
        </nav>
      )}
      {error && <p role="alert">{error}</p>}
      {!location.owner &&
        (tab === 'leaderboard' ? (
          <Leaderboard />
        ) : (
          <>
            <div className="cms-toolbar collector-tools">
              <input
                className="field"
                aria-label="Search collectors"
                placeholder="Search collectors…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="field"
                aria-label="Filter collectors by group"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option value="all">All groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <select
                className="field"
                aria-label="Sort collectors"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="name">Name A–Z</option>
                <option value="completed">Most completed</option>
                <option value="collections">Most collections</option>
                <option value="collected">Most collected teks</option>
              </select>
            </div>
            <div className="social-directory">
              {directory
                .filter(
                  (u) =>
                    u.name.toLowerCase().includes(search.toLowerCase()) &&
                    (group === 'all' || u.groups?.includes(group)),
                )
                .sort((a, b) =>
                  sort === 'name'
                    ? a.name.localeCompare(b.name)
                    : (b[sort as 'completed'] || 0) -
                        (a[sort as 'completed'] || 0) ||
                      a.name.localeCompare(b.name),
                )
                .map((u) => (
                  <div className="collector-summary" key={u.id}>
                    <a
                      className="social-person collector-profile-link"
                      href={href(u.id)}
                    >
                      <Avatar photo={u.photo} />
                      <UserName
                        name={u.name}
                        verified={u.user_verified}
                        role={u.role}
                      />
                    </a>
                    <FacebookLink url={u.facebook_url} />
                    {u.bio && (
                      <p className="collector-bio bio-clamped">{u.bio}</p>
                    )}
                    <div className="collector-card-stats">
                      <div>
                        <strong>{u.collections || 0}</strong>
                        <span>Collections</span>
                      </div>
                      <div>
                        <strong>{u.completed || 0}</strong>
                        <span>Completed</span>
                      </div>
                      <div>
                        <strong>{u.collected || 0}</strong>
                        <span>Teks collected</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            {!directory.length && <p>No collectors yet.</p>}
          </>
        ))}
      {profile && (
        <>
          <div className="social-person collector-profile-header">
            <Avatar photo={profile.user.photo} />
            <div className="profile-name-bio">
              <UserName
                name={profile.user.name}
                verified={profile.user.user_verified}
                role={profile.user.role}
              />
              <FacebookLink url={profile.user.facebook_url} />
              {profile.user.bio && (
                <p className="collector-bio">{profile.user.bio}</p>
              )}
            </div>
            <small>{profile.visits} visits</small>
            <button
              className="button"
              onClick={() =>
                void act(async () => {
                  await navigator.clipboard.writeText(window.location.href);
                  setError('Link copied.');
                })
              }
            >
              Copy link
            </button>
          </div>
          <div className="collector-overview profile-statistics">
            <div>
              <strong>{profile.checklists.length}</strong>
              <span>Collections</span>
            </div>
            <div>
              <strong>
                {
                  profile.checklists.filter(
                    (l) => l.total > 0 && l.owned.length === l.total,
                  ).length
                }
              </strong>
              <span>Completed</span>
            </div>
            <div>
              <strong>
                {profile.checklists.reduce((n, l) => n + l.owned.length, 0)}
              </strong>
              <span>Teks collected</span>
            </div>
          </div>
          {!selected ? (
            <div id="checklists">
              <div className="collector-tools">
                <input
                  className="field"
                  aria-label="Search checklists"
                  placeholder="Find a collection…"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                />
                <select
                  className="field"
                  aria-label="Filter checklist status"
                  value={listStatus}
                  onChange={(e) => setListStatus(e.target.value)}
                >
                  <option value="all">All collections</option>
                  <option value="progress">In progress</option>
                  <option value="complete">Completed</option>
                </select>
                <select
                  className="field"
                  aria-label="Filter checklist group"
                  value={listGroup}
                  onChange={(e) => setListGroup(e.target.value)}
                >
                  <option value="all">All groups</option>
                  {[
                    ...new Set(
                      profile.checklists.map((l) => l.group).filter(Boolean),
                    ),
                  ].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
                <select
                  className="field"
                  aria-label="Sort checklists"
                  value={listSort}
                  onChange={(e) => setListSort(e.target.value)}
                >
                  <option value="name">Name A–Z</option>
                  <option value="recent">Recently updated</option>
                  <option value="closest">Closest to completion</option>
                  <option value="missing">Most missing</option>
                </select>
              </div>
              <div className="social-directory">
                {profile.checklists
                  .filter(
                    (l) =>
                      l.name.toLowerCase().includes(listSearch.toLowerCase()) &&
                      (listGroup === 'all' || l.group === listGroup) &&
                      (listStatus === 'all' ||
                        (l.total > 0 && l.owned.length === l.total) ===
                          (listStatus === 'complete')),
                  )
                  .sort((a, b) =>
                    listSort === 'recent'
                      ? (b.updated_at || '').localeCompare(a.updated_at || '')
                      : listSort === 'closest'
                        ? b.owned.length / (b.total || 1) -
                          a.owned.length / (a.total || 1)
                        : listSort === 'missing'
                          ? b.total -
                            b.owned.length -
                            (a.total - a.owned.length)
                          : a.name.localeCompare(b.name),
                  )
                  .map((l) => (
                    <article key={l.id}>
                      <a href={href(profile.user.id, l.set_id)}>
                        <Backprint src={l.cover} />
                        <small>{l.group}</small>
                        <h2>{l.name}</h2>
                        <p>
                          <b>{l.owned.length}</b> / {l.total} collected
                        </p>
                        <Segments
                          value={
                            l.total
                              ? Math.round((l.owned.length / l.total) * 100)
                              : 0
                          }
                        />
                        <div className="set-labels">
                          <SetCompleted
                            total={l.total}
                            owned={l.owned.length}
                          />
                          {l.verified && (
                            <span className="collection-verified">
                              ✓ Verified collection
                            </span>
                          )}
                        </div>
                      </a>
                      {profile.mine && (
                        <button
                          className="button"
                          onClick={() => onOpenChecklist(l.set_id)}
                        >
                          Manage checklist
                        </button>
                      )}
                    </article>
                  ))}
              </div>
            </div>
          ) : (
            <>
              <a className="checklist-back" href={href(profile.user.id)}>
                ← All collections
              </a>
              <header className="public-checklist-header">
                <Backprint src={selected.cover} />
                <div>
                  <span className="collection-group-label">
                    {selected.group}
                  </span>
                  <h2>{selected.name}</h2>
                  <p>
                    <b>{selected.owned.length}</b> / {selected.total} collected
                  </p>
                  <Segments
                    value={
                      selected.total
                        ? Math.round(
                            (selected.owned.length / selected.total) * 100,
                          )
                        : 0
                    }
                  />
                  <div className="set-labels">
                    <SetCompleted
                      total={selected.total}
                      owned={selected.owned.length}
                    />
                    {selected.verified && (
                      <span className="collection-verified">
                        ✓ Verified collection
                      </span>
                    )}
                  </div>
                  {profile.mine && (
                    <button
                      className="button primary"
                      onClick={() => onOpenChecklist(selected.set_id)}
                    >
                      Manage checklist
                    </button>
                  )}
                </div>
                <ChecklistShare
                  userId={profile.user.id}
                  setId={selected.set_id}
                  title={selected.name}
                />
              </header>
              {selected.pinned_message && (
                <aside className="checklist-pin">
                  <strong>Pinned message</strong>
                  <p>{selected.pinned_message}</p>
                </aside>
              )}
              <select
                className="field"
                aria-label="Filter cards"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="missing">Missing</option>
                <option value="collected">Collected</option>
              </select>
              <div className="social-cards">
                {selected.cards
                  ?.filter(
                    (c) =>
                      filter === 'all' ||
                      selected.owned.includes(c.id) ===
                        (filter === 'collected'),
                  )
                  .map((c) => (
                    <article
                      className={
                        selected.owned.includes(c.id)
                          ? 'is-collected'
                          : 'is-missing'
                      }
                      id={'card-' + c.id}
                      key={c.id}
                    >
                      <img
                        src={c.image}
                        alt={'Teks #' + c.number}
                        loading="lazy"
                      />
                      <strong>#{String(c.number).padStart(3, '0')}</strong>
                      <span>
                        {selected.owned.includes(c.id)
                          ? '✓ Collected'
                          : '− Missing'}
                      </span>
                    </article>
                  ))}
              </div>
              {profile.mine && (
                <div className="checklist-bottom-actions">
                  <RemoveAction kind="checklist" id={selected.set_id} />
                </div>
              )}
            </>
          )}
          <section className="social-comments">
            <h2>{selected ? 'Checklist comments' : 'Profile comments'}</h2>
            {orderedComments.map((c) => (
              <article
                className={'comment-thread-item ' + (c.depth ? 'is-reply' : '')}
                style={{ marginLeft: Math.min(c.depth, 2) * 26 }}
                id={'comment-' + c.id}
                key={c.id}
              >
                {c.parent && (
                  <a className="reply-context" href={'#comment-' + c.parent}>
                    ↳ Replying to{' '}
                    {comments.find((p) => p.id === c.parent)?.author.name ||
                      'earlier comment'}
                  </a>
                )}
                <div className="social-person">
                  <Avatar photo={c.author.photo} />
                  <UserName
                    name={c.author.name}
                    verified={c.author.user_verified}
                    role={c.author.role}
                  />
                  <small>{new Date(c.created_at).toLocaleString()}</small>
                </div>
                {c.offer && <strong>Card offer</strong>}
                <p>{c.text}</p>
                {c.edited_at && <small>Edited</small>}
                {c.cards.map((id) => (
                  <a
                    key={id}
                    className="button"
                    href={'#card-' + id}
                    onClick={() => setFilter('all')}
                  >
                    #
                    {String(
                      selected?.cards?.find((c) => c.id === id)?.number || '?',
                    ).padStart(3, '0')}
                  </a>
                ))}
                {me && (
                  <div className="social-actions">
                    <button
                      className="button"
                      onClick={() => {
                        setReply(c.id);
                        document
                          .getElementById('comment-composer')
                          ?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center',
                          });
                      }}
                    >
                      Reply
                    </button>
                    {c.canEdit && (
                      <RemoveAction
                        kind="comment"
                        id={c.id}
                        onRemoved={refresh}
                      />
                    )}
                    {c.canEdit && (
                      <button
                        className="button"
                        onClick={() => {
                          setEditComment(c.id);
                          setEditText(c.text);
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
            {!profile.comments.length && <p>No comments yet.</p>}
            {editComment && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    await socialApi('edit-comment', {
                      id: editComment,
                      text: editText,
                    });
                    setEditComment('');
                    await refresh();
                  });
                }}
              >
                <label>
                  Edit comment
                  <textarea
                    className="field"
                    required
                    maxLength={500}
                    aria-label="Edit comment"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                </label>
                <small className="character-count">
                  {editText.length}/500 characters
                </small>
                <div className="comment-form-actions">
                  <button
                    className="button"
                    disabled={busy || editText.length > 500}
                  >
                    Save edit
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => setEditComment('')}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {me && profile.commentsEnabled ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    await socialApi('comment', {
                      owner: profile.user.id,
                      set: location.set,
                      text,
                      parent: reply,
                      cards,
                      offer,
                    });
                    setText('');
                    setReply(null);
                    setCards([]);
                    setOffer(false);
                    await refresh();
                  });
                }}
              >
                {reply && (
                  <p>
                    Replying to{' '}
                    {comments.find((c) => c.id === reply)?.author.name ||
                      'comment'}{' '}
                    <button type="button" onClick={() => setReply(null)}>
                      Cancel reply
                    </button>
                  </p>
                )}
                <label id="comment-composer">
                  {reply
                    ? 'Reply to ' +
                      (comments.find((c) => c.id === reply)?.author.name ||
                        'comment')
                    : 'Leave a comment'}
                  <textarea
                    className="field"
                    required
                    maxLength={500}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <small className="character-count">
                  {text.length}/500 characters
                </small>
                {selected && (
                  <details>
                    <summary>Reference teks / make an offer</summary>
                    <div className="social-card-options">
                      {selected.cards?.map((c) => (
                        <label key={c.id}>
                          <input
                            type="checkbox"
                            checked={cards.includes(c.id)}
                            onChange={(e) =>
                              setCards(
                                e.target.checked
                                  ? [...cards, c.id]
                                  : cards.filter((id) => id !== c.id),
                              )
                            }
                          />
                          #{String(c.number).padStart(3, '0')}
                        </label>
                      ))}
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={offer}
                        onChange={(e) => setOffer(e.target.checked)}
                      />
                      These cards are an offer
                    </label>
                  </details>
                )}
                <button className="button primary" disabled={busy}>
                  Post comment
                </button>
              </form>
            ) : (
              <p>
                {!me && (
                  <button className="button" onClick={onLogin}>
                    Login
                  </button>
                )}
                {me
                  ? 'Commenting is disabled.'
                  : 'Sign in to comment or make an offer.'}
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
