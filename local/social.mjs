import { randomUUID, createHash } from 'node:crypto';
export function socialService(store) {
  const sessions = new Map();
  const list = store.list,
    get = store.get,
    put = store.put;
  const identity = (u) => ({
    id: u.id,
    name: (u.display_name || u.name || 'Collector').includes('@')
      ? 'Collector'
      : u.display_name || u.name || 'Collector',
    facebook_url: u.facebook_url || '',
    bio: u.bio || '',
    photo: u.photo || '',
    role: u.role,
    user_verified: !!u.user_verified,
  });
  const url = (owner, set = '') =>
    '/collectors?user=' +
    encodeURIComponent(owner) +
    (set ? '&set=' + encodeURIComponent(set) : '');
  function notify(user, type, text, link) {
    if (!user) return;
    const previous =
      type === 'account'
        ? null
        : list('notifications').find(
            (n) =>
              n.user_id === user &&
              n.type === type &&
              !n.read &&
              n.link.split('#')[0] === link.split('#')[0] &&
              Date.now() - Date.parse(n.created_at) < 3600000,
          );
    const count = (previous?.count || 0) + 1;
    put('notifications', {
      id: previous?.id || randomUUID(),
      count,
      user_id: user,
      type,
      text: count > 1 ? `${count} new ${type} on this page` : text,
      link,
      created_at: new Date().toISOString(),
      read: false,
    });
  }
  function target(owner, set, _viewer) {
    const u = get('users', owner);
    if (!u || u.status !== 'active')
      throw Error('This profile is private or unavailable.');
    if (set) {
      const l = list('checklists').find(
        (l) => l.user_id === owner && l.set_id === set,
      );
      if (!l) throw Error('This checklist is private or unavailable.');
    }
    return u;
  }
  function currentUser(req) {
    const cookie = (req.headers.cookie || '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('teksboy_social='))
      ?.split('=')[1];
    const session = sessions.get(cookie);
    const me =
      session && session.expires > Date.now() ? get('users', session.id) : null;
    return me?.status === 'active' ? me : null;
  }
  async function handle(req, res, endpoint, data, admin, send) {
    if (!endpoint.startsWith('/__local/social/')) return false;
    const q = new URL(req.url, 'http://localhost').searchParams;
    const actor = currentUser(req);
    const requireUser = () => {
      if (!actor) throw Error('Sign in to continue.');
      return actor;
    };
    const op = endpoint.split('/').at(-1);
    if (op === 'set-collectors' && req.method === 'GET') {
      const setId = q.get('set'),
        set = setId ? get('collections', setId) : null;
      if (!set || set.status !== 'published')
        throw Error('Collection unavailable.');
      const ids = new Set(
        list('checklists')
          .filter((l) => l.set_id === setId)
          .map((l) => l.user_id),
      );
      send(200, {
        collectors: list('users')
          .filter((u) => u.status === 'active' && ids.has(u.id))
          .map(identity)
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
      return true;
    }
    if (op === 'login' && req.method === 'POST') {
      const u = get('users', data.id || 'local-demo');
      if (u?.status !== 'active') throw Error('Account suspended.');
      const token = randomUUID();
      sessions.set(token, { id: u.id, expires: Date.now() + 8 * 3600000 });
      res.setHeader(
        'Set-Cookie',
        `teksboy_social=${token}; HttpOnly; SameSite=Strict; Path=/__local; Max-Age=28800`,
      );
      send(200, { user: identity(u) });
      return true;
    }
    if (op === 'logout' && req.method === 'POST') {
      const token = (req.headers.cookie || '')
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith('teksboy_social='))
        ?.split('=')[1];
      sessions.delete(token);
      res.setHeader(
        'Set-Cookie',
        'teksboy_social=; HttpOnly; SameSite=Strict; Path=/__local; Max-Age=0',
      );
      send(200, { ok: true });
      return true;
    }
    if (op === 'session') {
      send(200, { user: actor ? identity(actor) : null });
      return true;
    }
    if (op === 'accounts' && req.method === 'GET') {
      send(200, {
        users: list('users')
          .filter((u) => u.status === 'active')
          .map(identity),
      });
      return true;
    }
    if (op === 'directory' && req.method === 'GET') {
      send(200, {
        users: list('users')
          .filter((u) => u.status === 'active')
          .map((u) => {
            const checklists = list('checklists').filter(
              (l) => l.user_id === u.id,
            );
            return {
              ...identity(u),
              collections: checklists.length,
              completed: checklists.filter((l) => {
                const s = get('collections', l.set_id);
                return (
                  s?.cards.length > 0 &&
                  s.cards.every((c) => l.owned.includes(c.id))
                );
              }).length,
              collected: checklists.reduce((n, l) => n + l.owned.length, 0),
              groups: [
                ...new Set(
                  checklists
                    .map((l) => get('collections', l.set_id)?.category_id)
                    .filter(Boolean),
                ),
              ],
            };
          }),
        groups: list('groups').map((g) => ({ id: g.id, name: g.name })),
      });
      return true;
    }
    if (op === 'profile' && req.method === 'GET') {
      const owner = q.get('user'),
        set = q.get('set') || '';
      const u = target(owner, set, actor?.id);
      const checklists = list('checklists')
        .filter((l) => l.user_id === owner)
        .map((l) => {
          const s = get('collections', l.set_id);
          return s
            ? {
                id: l.id,
                set_id: s.id,
                name: s.name,
                group: s.category_id ? get('groups', s.category_id)?.name : '',
                cover: s.cover,
                verified: !!l.verified,
                public: true,
                owned: l.owned,
                updated_at: l.updated_at,
                pinned_message: l.pinned_message || '',
                total: s.cards.length,
                cards: set === s.id ? s.cards : undefined,
              }
            : null;
        })
        .filter(Boolean);
      const comments = list('comments')
        .filter((c) => c.owner === owner && c.set === set && !c.deleted)
        .map((c) => ({
          ...c,
          author: identity(
            get('users', c.author_id) || {
              id: 'deleted',
              name: 'Former collector',
            },
          ),
          canEdit: actor?.id === c.author_id,
        }));
      send(200, {
        user: identity(u),
        mine: actor?.id === owner,
        commentsEnabled: !u.comment_restricted,
        checklists,
        comments,
        visits: list('visits').filter((v) => v.owner === owner && v.set === set)
          .length,
      });
      return true;
    }
    if (op === 'visit' && req.method === 'POST') {
      target(data.owner, data.set || '', actor?.id);
      if (actor?.id !== data.owner) {
        const day = new Date().toISOString().slice(0, 10);
        const id = createHash('sha256')
          .update(
            `${data.owner}|${data.set || ''}|${day}|${actor?.id || req.headers['user-agent'] || 'local'}`,
          )
          .digest('hex');
        put('visits', { id, owner: data.owner, set: data.set || '', day });
      }
      send(200, { ok: true });
      return true;
    }
    if (op === 'comment' && req.method === 'POST') {
      const u = requireUser(),
        owner = target(data.owner, data.set || '', u.id);
      if (owner.comment_restricted || u.comment_restricted)
        throw Error('Commenting is disabled.');
      const text = String(data.text || '').trim();
      if (!text || text.length > 500)
        throw Error('Enter a comment of 1–500 characters.');
      const recent = list('comments').filter(
        (c) =>
          c.author_id === u.id && Date.now() - Date.parse(c.created_at) < 60000,
      );
      if (recent.length >= 5)
        throw Error('Please wait a minute before posting again.');
      const parent = data.parent ? get('comments', data.parent) : null;
      if (
        data.parent &&
        (!parent ||
          parent.deleted ||
          parent.owner !== data.owner ||
          parent.set !== (data.set || ''))
      )
        throw Error('Reply target unavailable.');
      const cards = Array.isArray(data.cards) ? [...new Set(data.cards)] : [];
      const s = data.set ? get('collections', data.set) : null;
      if (cards.some((id) => !s?.cards.some((c) => c.id === id)))
        throw Error('Invalid card reference.');
      const id = randomUUID();
      put('comments', {
        id,
        owner: data.owner,
        set: data.set || '',
        author_id: u.id,
        text,
        parent: parent?.id || null,
        cards,
        offer: !!data.offer && cards.length > 0,
        created_at: new Date().toISOString(),
      });
      const link = url(data.owner, data.set) + '#comment-' + id;
      if (data.owner !== u.id)
        notify(
          data.owner,
          data.offer ? 'offers' : 'comments',
          `${identity(u).name} ${data.offer ? 'made an offer' : 'commented on your page'}`,
          link,
        );
      if (
        parent &&
        parent.author_id !== u.id &&
        parent.author_id !== data.owner
      )
        notify(
          parent.author_id,
          'replies',
          `${identity(u).name} replied to your comment`,
          link,
        );
      send(200, { ok: true });
      return true;
    }
    if (op === 'edit-comment' && req.method === 'POST') {
      const u = requireUser(),
        c = get('comments', data.id);
      if (!c || c.deleted || c.author_id !== u.id)
        throw Error('Only the author can edit this comment.');
      const owner = target(c.owner, c.set, u.id);
      if (u.comment_restricted || owner.comment_restricted)
        throw Error('Commenting is disabled.');
      const text = String(data.text || '').trim();
      if (!text || text.length > 500)
        throw Error('Enter a comment of 1–500 characters.');
      put('comments', { ...c, text, edited_at: new Date().toISOString() });
      send(200, { ok: true });
      return true;
    }
    if (op === 'notifications') {
      const u = requireUser();
      if (req.method === 'POST') {
        for (const n of list('notifications').filter(
          (n) => n.user_id === u.id && (!data.id || n.id === data.id),
        ))
          put('notifications', { ...n, read: true });
      }
      send(200, {
        items: list('notifications')
          .filter((n) => n.user_id === u.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      });
      return true;
    }
    if (op === 'moderation') {
      if (
        !admin ||
        !(
          store.permissions(admin).includes('social') ||
          (req.method === 'GET' &&
            store.permissions(admin).includes('dashboard'))
        )
      )
        throw Error('Administrator access required.');
      if (req.method === 'POST') {
        if (data.action === 'delete') {
          const c = get('comments', data.id);
          if (!c) throw Error('Comment unavailable.');
          put('comments', { ...c, deleted: true, text: '', cards: [] });
        } else throw Error('Unknown action.');
      }
      send(200, {
        comments: list('comments'),
        notifications: list('notifications'),
        visits: list('visits'),
        users: list('users').map(identity),
        collections: list('collections').map((s) => ({
          id: s.id,
          name: s.name,
          visits: list('visits').filter((v) => v.set === s.id).length,
          comments: list('comments').filter((c) => c.set === s.id && !c.deleted)
            .length,
          offers: list('comments').filter(
            (c) => c.set === s.id && c.offer && !c.deleted,
          ).length,
        })),
      });
      return true;
    }
    throw Error('Unknown social action.');
  }
  return { handle, notify, currentUser };
}
