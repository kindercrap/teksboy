import { removeAction } from './remove-action.mjs';
import { verificationService } from './verification.mjs';
import communitySeed from './community-seed.mjs';
import { socialService } from './social.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';

export function openStore(root) {
  fs.mkdirSync(path.join(root, '.local'), { recursive: true });
  const db = new DatabaseSync(path.join(root, '.local/teksboy.sqlite'));
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));',
  );
  const list = (kind) =>
    db
      .prepare('SELECT data FROM records WHERE kind=?')
      .all(kind)
      .map((r) => JSON.parse(r.data))
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  const get = (kind, id) => {
    const r = db
      .prepare('SELECT data FROM records WHERE kind=? AND id=?')
      .get(kind, id);
    return r ? JSON.parse(r.data) : null;
  };
  const put = (kind, row) =>
    db
      .prepare(
        'INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data',
      )
      .run(kind, row.id, JSON.stringify(row));
  const remove = (kind, id) =>
    db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
  if (!get('meta', 'initialized')) {
    db.exec('BEGIN');
    try {
      const read = (file) =>
        JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      read('lib/categories.json').forEach((g, i) =>
        put('groups', { ...g, position: i, status: 'published' }),
      );
      read('lib/catalog.json').forEach((s, i) =>
        put('collections', { ...s, position: i }),
      );
      put('users', {
        id: 'local-admin',
        name: 'Local Administrator',
        email: 'admin@local.test',
        role: 'Super Admin',
        status: 'active',
        created_at: new Date().toISOString(),
      });
      put('users', {
        id: 'local-demo',
        name: 'Demo collector',
        email: 'collector@local.demo',
        role: 'Normal',
        status: 'active',
        created_at: new Date().toISOString(),
      });
      ['Byebye', 'Tatakai no Hate', '太陽がまた輝くとき'].forEach((title, i) =>
        put('tracks', {
          id: 'track-' + i,
          title,
          category_id: 'ghost-fighter',
          url: '/bgm/' + title + '.mp3',
          position: i,
        }),
      );
      put('meta', { id: 'initialized' });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  // Upgrade the protected local account without replacing existing collector data.
  const owner = get('users', 'local-admin');
  if (owner && owner.role !== 'Super Admin')
    put('users', { ...owner, role: 'Super Admin' });
  if (!get('meta', 'always-public')) {
    for (const u of list('users'))
      put('users', {
        ...u,
        public_profile: true,
        leaderboard_visible: true,
        notification_preferences: {},
      });
    for (const l of list('checklists'))
      put('checklists', { ...l, public: true });
    put('meta', { id: 'always-public' });
  }
  if (!get('meta', 'community-seeded')) {
    for (const row of communitySeed) put('community', row);
    put('meta', { id: 'community-seeded' });
  }
  if (!get('meta', 'community-types-seeded')) {
    for (const [id, name, layout] of [
      ['group', 'Facebook groups', 'cover'],
      ['page', 'Facebook pages', 'cover'],
      ['profile', 'Sellers & collectors', 'profile'],
      ['website', 'Websites', 'cover'],
    ])
      put('community-types', { id, name, layout });
    put('meta', { id: 'community-types-seeded' });
  }
  for (const type of list('community-types'))
    if (!type.color) put('community-types', { ...type, color: '#00cddd' });
  for (const link of list('community'))
    if ('vip' in link) {
      const { vip: _vip, ...clean } = link;
      put('community', clean);
    }
  if (!get('meta', 'group-logos-seeded')) {
    for (const group of list('groups')) {
      const file =
        {
          'ghost-fighter': 'ghost-fighter.png',
          dragonball: 'dragon-ball.png',
          'dragon-ball': 'dragon-ball.png',
          zenki: 'zenki.png',
        }[group.id] ||
        {
          'Ghost Fighter': 'ghost-fighter.png',
          'Dragon Ball': 'dragon-ball.png',
          Zenki: 'zenki.png',
        }[group.name];
      if (
        file &&
        !group.logo &&
        fs.existsSync(path.join(root, 'public/images/collection-group', file))
      )
        put('groups', { ...group, logo: '/images/collection-group/' + file });
    }
    put('meta', { id: 'group-logos-seeded' });
  }
  if (!get('meta', 'avatar-library-v1')) {
    const folder = path.join(root, 'public/images/avatars');
    if (fs.existsSync(folder))
      for (const [position, file] of fs
        .readdirSync(folder)
        .filter((f) => f.endsWith('.png'))
        .sort()
        .entries())
        put('avatars', {
          id: file,
          name: file.replace('.png', '').replaceAll('-', ' '),
          image: '/images/avatars/' + file,
          enabled: true,
          position,
        });
    put('meta', { id: 'avatar-library-v1' });
  }
  const permissionKeys = [
    'dashboard',
    'groups',
    'collections',
    'tracks',
    'users',
    'collectors',
    'social',
    'community',
    'avatars',
  ];
  for (const [name, color, perms] of [
    ['Super Admin', '#e879f9', permissionKeys],
    ['Admin', '#ef4444', ['groups', 'collections', 'tracks']],
    ['VIP', '#eab308', []],
    ['Normal', '#94a3b8', []],
  ])
    if (!get('roles', name))
      put('roles', {
        id: name,
        name,
        color,
        permissions: perms,
        builtin: true,
      });
  function permissions(user) {
    if (!user || user.status !== 'active') return [];
    return user.role === 'Super Admin'
      ? [...permissionKeys, 'roles']
      : list('roles').find((r) => r.name === user.role)?.permissions || [];
  }
  function requirePermission(actor, key) {
    if (!permissions(get('users', actor)).includes(key))
      throw Error('You do not have permission to manage this section.');
  }
  function saveRole(row, actor) {
    requirePermission(actor, 'roles');
    const old = row.id ? get('roles', row.id) : null;
    const name = String(row.name || '').trim();
    if (!name || name.length > 40 || !/^#[0-9a-f]{6}$/i.test(row.color || ''))
      throw Error('Enter a role name and valid badge color.');
    if (old?.builtin && name !== old.name)
      throw Error('Built-in roles cannot be renamed.');
    if (
      list('roles').some(
        (r) => r.name.toLowerCase() === name.toLowerCase() && r.id !== old?.id,
      )
    )
      throw Error('That role name already exists.');
    if (
      !Array.isArray(row.permissions) ||
      row.permissions.some((p) => !permissionKeys.includes(p))
    )
      throw Error('Invalid permissions.');
    const result = {
      id: old?.id || randomUUID(),
      name,
      color: row.color,
      permissions:
        old?.name === 'Super Admin'
          ? permissionKeys
          : [...new Set(row.permissions)],
      builtin: !!old?.builtin,
    };
    db.exec('BEGIN');
    try {
      put('roles', result);
      if (old && old.name !== name)
        for (const u of list('users').filter((u) => u.role === old.name))
          put('users', { ...u, role: name });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return result;
  }
  function save(kind, row, actor = 'local-admin') {
    requirePermission(actor, kind === 'community-types' ? 'community' : kind);
    if (kind === 'avatars') {
      if (!get('avatars', row.id))
        throw Error('Choose an existing avatar slot.');
      if (
        typeof row.name !== 'string' ||
        !row.name.trim() ||
        row.name.length > 60 ||
        typeof row.image !== 'string' ||
        !(
          row.image.startsWith('/images/avatars/') ||
          row.image.startsWith('/local-media/') ||
          /^https:\/\//i.test(row.image)
        )
      )
        throw Error('Enter an avatar name and valid image URL.');
      const result = {
        id: row.id,
        name: row.name.trim(),
        image: row.image,
        enabled: !!row.enabled,
        position: Number(row.position) || 0,
      };
      put(kind, result);
      return result;
    }
    if (kind === 'community-types') {
      const name = String(row.name || '').trim();
      if (
        !name ||
        name.length > 60 ||
        !['cover', 'profile'].includes(row.layout)
      )
        throw Error('Enter a type name and photo layout.');
      if (
        list(kind).some(
          (r) => r.id !== row.id && r.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw Error('That type already exists.');
      const color = row.color || '#00cddd';
      if (!/^#[0-9a-f]{6}$/i.test(color))
        throw Error('Choose a valid badge color.');
      const result = {
        id: row.id || randomUUID(),
        name,
        layout: row.layout,
        color,
      };
      put(kind, result);
      return result;
    }
    if (kind === 'community') {
      const name = String(row.name || '').trim(),
        description = String(row.description || '').trim();
      if (!name || name.length > 150 || description.length > 1000)
        throw Error(
          'Enter a title up to 150 characters and description up to 1000 characters.',
        );
      let url;
      try {
        url = new URL(row.url);
      } catch {
        throw Error('Enter a valid website URL.');
      }
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error('Use an HTTP or HTTPS link.');
      if (
        !list('community-types').some((t) => t.id === row.type) ||
        !['published', 'draft', 'archived'].includes(row.status)
      )
        throw Error('Invalid entry type or status.');
      const image = String(row.image || '');
      if (
        image &&
        !image.startsWith('/local-media/') &&
        !/^https:\/\//i.test(image)
      )
        throw Error('Use an uploaded image or HTTPS image URL.');
      const result = {
        id: row.id || randomUUID(),
        name,
        description,
        url: url.href,
        type: row.type,
        status: row.status,
        image,

        position: Number.isFinite(Number(row.position))
          ? Number(row.position)
          : list('community').length,
      };
      put('community', result);
      return result;
    }
    if (
      kind === 'users' &&
      get('users', actor)?.role !== 'Super Admin' &&
      row.role !== (row.id ? get('users', row.id)?.role : 'Normal')
    )
      throw Error('Only Super Admin can assign roles.');
    if (!['groups', 'collections', 'users', 'tracks'].includes(kind))
      throw Error('Unknown section.');
    if (
      kind === 'groups' &&
      row.logo &&
      (typeof row.logo !== 'string' ||
        !(
          row.logo.startsWith('/images/') ||
          row.logo.startsWith('/local-media/') ||
          /^https:\/\//i.test(row.logo)
        ))
    )
      throw Error('Use an uploaded logo or HTTPS image URL.');
    const id = row.id || randomUUID();
    const old = get(kind, id);
    row = { ...row, id };
    const name = kind === 'tracks' ? row.title : row.name;
    if (typeof name !== 'string' || !name.trim() || name.length > 150)
      throw Error('Enter a name (up to 150 characters).');
    if (kind === 'tracks') row.title = name.trim();
    else row.name = name.trim();
    row.position = Number.isFinite(Number(row.position))
      ? Number(row.position)
      : list(kind).length;
    if (
      ['groups', 'collections'].includes(kind) &&
      !['draft', 'published', 'archived'].includes(row.status)
    )
      throw Error('Invalid publication status.');
    if (
      ['collections', 'tracks'].includes(kind) &&
      !get('groups', row.category_id)
    )
      throw Error('Choose a collection group.');
    if (kind === 'collections') {
      const min = row.market_price_min,
        max = row.market_price_max;
      if (min == null && max == null) {
        row.market_price_min = null;
        row.market_price_max = null;
      } else if (
        typeof min !== 'number' ||
        typeof max !== 'number' ||
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        min < 0 ||
        max < min
      )
        throw Error(
          'Enter a valid minimum and maximum price, with maximum at least minimum.',
        );
      row.cards = Array.isArray(row.cards) ? row.cards : [];
      if (new Set(row.cards.map((c) => c.id)).size !== row.cards.length)
        throw Error('Duplicate card IDs.');
      let nextNumber = Math.max(
        old?.last_card_number || 0,
        ...(old?.cards || []).map((c) => c.number || 0),
      );
      row.cards = row.cards.map((c) => ({
        id: c.id || randomUUID(),
        number:
          old?.cards?.find((previous) => previous.id === c.id)?.number ||
          ++nextNumber,
        image: c.image,
      }));
      row.last_card_number = nextNumber;
      const commentReferences = list('comments')
        .filter((c) => c.set === id && !c.deleted)
        .flatMap((c) => c.cards || []);
      if (
        commentReferences.some((card) => !row.cards.some((c) => c.id === card))
      )
        throw Error(
          'A card is referenced in comments. Keep it to preserve those references.',
        );
      const referenced = list('checklists')
        .filter((l) => l.set_id === id)
        .flatMap((l) => l.owned || []);
      if (referenced.some((card) => !row.cards.some((c) => c.id === card)))
        throw Error(
          'A removed card is collected by a user. Keep it to preserve their checklist.',
        );
    }
    if (kind === 'users') {
      row.public_profile = true;
      row.leaderboard_visible = true;
      row.notification_preferences = {};
      if (
        get('users', actor)?.role !== 'Super Admin' &&
        (['Admin', 'Super Admin'].includes(old?.role) ||
          ['Admin', 'Super Admin'].includes(row.role))
      )
        throw Error('Only a Super Admin can manage administrator accounts.');
      if (
        id === 'local-admin' &&
        (row.role !== 'Super Admin' || row.status !== 'active')
      )
        throw Error('The built-in local administrator must remain active.');
      if (
        !list('roles').some((r) => r.name === row.role) ||
        !['active', 'suspended'].includes(row.status)
      )
        throw Error('Invalid role or account status.');
      if (typeof row.email !== 'string' || !/^\S+@\S+\.\S+$/.test(row.email))
        throw Error('Enter a valid email.');
      if (
        old?.role === 'Admin' &&
        old.status === 'active' &&
        (row.role !== 'Admin' || row.status !== 'active') &&
        list('users').filter(
          (u) =>
            ['Admin', 'Super Admin'].includes(u.role) && u.status === 'active',
        ).length <= 1
      )
        throw Error('Keep at least one active administrator.');
      row.user_verified = row.user_verified === true;
      row.created_at = old?.created_at || new Date().toISOString();
    }
    for (const field of ['cover', 'url'])
      if (
        row[field] &&
        (typeof row[field] !== 'string' ||
          !/^\/[^/]|^https:\/\//.test(row[field]))
      )
        throw Error('Use a local path or HTTPS media URL.');
    if (
      kind === 'collections' &&
      row.cards.some(
        (c) =>
          typeof c.image !== 'string' || !/^\/[^/]|^https:\/\//.test(c.image),
      )
    )
      throw Error('Invalid card image URL.');
    if (
      kind === 'collections' &&
      old &&
      JSON.stringify(
        old.cards
          .map((c) => [c.id, c.image])
          .sort((a, b) => String(a).localeCompare(String(b))),
      ) !==
        JSON.stringify(
          row.cards
            .map((c) => [c.id, c.image])
            .sort((a, b) => String(a).localeCompare(String(b))),
        )
    ) {
      for (const l of list('checklists').filter((l) => l.set_id === id))
        put('checklists', {
          ...l,
          verified: false,
          verified_at: null,
          verified_by: null,
        });
    }
    put(kind, row);
    return row;
  }
  function del(kind, id, actor = 'local-admin') {
    if (kind === 'users' && get('users', id)?.role === 'Super Admin')
      throw Error('Super Admin accounts cannot be deleted.');
    requirePermission(actor, kind === 'community-types' ? 'community' : kind);
    if (kind === 'community-types') {
      if (list('community').some((r) => r.type === id))
        throw Error(
          'Move all links to another type before deleting this type.',
        );
      remove(kind, id);
      return;
    }
    if (kind === 'community') {
      remove(kind, id);
      return;
    }
    if (kind === 'roles') {
      const role = get('roles', id);
      if (!role || role.builtin)
        throw Error('Built-in roles cannot be deleted.');
      if (list('users').some((u) => u.role === role.name))
        throw Error('Reassign users before deleting this role.');
      remove(kind, id);
      return;
    }
    if (!['groups', 'collections', 'users', 'tracks'].includes(kind))
      throw Error('Unknown section.');
    if (
      kind === 'groups' &&
      [...list('collections'), ...list('tracks')].some(
        (s) => s.category_id === id,
      )
    )
      throw Error(
        'Move collections and playlist tracks first, or archive this group.',
      );
    if (
      kind === 'collections' &&
      list('checklists').some((l) => l.set_id === id)
    )
      throw Error('This collection has checklists. Archive it instead.');
    if (kind === 'users')
      throw Error('Suspend users instead of deleting their history.');
    remove(kind, id);
  }
  function saveChecklist(row, actor) {
    const user = get('users', row.user_id),
      set = get('collections', row.set_id);
    if (!user || !set) throw Error('Choose a valid collector and collection.');
    if (actor) requirePermission(actor, 'collectors');
    const id = row.user_id + ':' + row.set_id;
    const old = get('checklists', id);
    const owned = [...new Set(row.owned || [])];
    if (owned.some((card) => !set.cards.some((c) => c.id === card)))
      throw Error('The checklist contains an unknown card.');
    const changed =
      old &&
      JSON.stringify(
        [...(old.owned || [])].sort((a, b) =>
          String(a).localeCompare(String(b)),
        ),
      ) !==
        JSON.stringify(
          [...owned].sort((a, b) => String(a).localeCompare(String(b))),
        );
    const proof = actor ? row.proof || '' : old?.proof || '';
    if (proof && !/^\/__local\/proof\/[a-f0-9-]+\.(jpg|png|webp)$/.test(proof))
      throw Error('Upload a valid proof image.');
    const notes = actor ? String(row.notes || '') : old?.notes || '';
    if (notes.length > 2000)
      throw Error('Keep private notes under 2,000 characters.');
    const evidenceChanged = old && proof !== (old.proof || '');
    const verified =
      changed || evidenceChanged
        ? false
        : actor
          ? !!row.verified
          : !!old?.verified;
    const result = {
      ...old,
      id,
      user_id: user.id,
      set_id: set.id,
      owned,
      updated_at: !old || changed ? new Date().toISOString() : old.updated_at,
      proof,
      notes,
      verified,
      public: true,
      verified_at: verified
        ? old?.verified_at || new Date().toISOString()
        : null,
      verified_by: verified ? old?.verified_by || actor : null,
    };
    put('checklists', result);
    return result;
  }
  function leaderboard(
    group = 'all',
    verifiedOnly = false,
    verifiedCollections = false,
  ) {
    const collections = list('collections').filter(
      (s) => group === 'all' || s.category_id === group,
    );
    const rows = list('users')
      .filter(
        (u) =>
          u.status === 'active' && (!verifiedOnly || u.user_verified === true),
      )
      .map((u) => {
        const checklists = list('checklists').filter((l) => l.user_id === u.id);
        const completed = checklists.filter((l) => {
          const s = collections.find((s) => s.id === l.set_id);
          return (
            (!verifiedCollections || l.verified) &&
            s?.cards.length > 0 &&
            s.cards.every((c) => l.owned.includes(c.id))
          );
        });
        const candidate = u.display_name || u.name || 'Collector';
        return {
          id: u.id,
          name: candidate.includes('@') ? 'Collector' : candidate,
          photo: u.photo || '',
          role: u.role,
          user_verified: u.user_verified === true,
          completed: completed.length,
          verified: completed.filter((l) => l.verified).length,
        };
      })
      .filter((u) => u.completed > 0)
      .sort(
        (a, b) => b.completed - a.completed || a.name.localeCompare(b.name),
      );
    let rank = 0,
      last = -1;
    return rows.slice(0, 10).map((r, i) => {
      if (r.completed !== last) {
        rank = i + 1;
        last = r.completed;
      }
      return { ...r, rank };
    });
  }
  return {
    db,
    list,
    get,
    put,
    save,
    del,
    saveChecklist,
    leaderboard,
    permissions,
    requirePermission,
    saveRole,
  };
}

export default function localCms() {
  return {
    name: 'teksboy-local-cms',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root,
        store = openStore(root),
        social = socialService(store),
        verification = verificationService(store, root, social.notify),
        sessions = new Map();
      server.httpServer?.once('close', () => store.db.close());
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__local/')) return next();
        let audit = null;
        const send = (code, data) => {
          if (code >= 200 && code < 300 && audit) {
            store.put('activity', {
              id: randomUUID(),
              created_at: new Date().toISOString(),
              ...audit,
            });
            audit = null;
          }
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(data));
        };
        const host = req.headers.host || '';
        if (
          !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
          !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
            req.socket.remoteAddress,
          )
        )
          return send(403, { error: 'Local access only.' });
        if (req.headers.origin && req.headers.origin !== `http://${host}`)
          return send(403, { error: 'Origin mismatch.' });
        if (
          req.method !== 'GET' &&
          !req.headers['content-type']?.startsWith('application/json')
        )
          return send(415, { error: 'JSON required.' });
        const endpoint = new URL(req.url, `http://${host}`).pathname;
        try {
          let data = {};
          if (req.method !== 'GET') {
            let body = '';
            for await (const chunk of req) {
              body += chunk;
              if (body.length > 16 * 1024 * 1024)
                throw Error('Upload exceeds 12 MB.');
            }
            data = JSON.parse(body || '{}');
          }
          const token = (req.headers.cookie || '')
            .split(';')
            .map((s) => s.trim())
            .find((s) => s.startsWith('teksboy_cms='))
            ?.split('=')[1];
          const session = sessions.get(token);
          const admin =
            social.currentUser(req) ||
            (session &&
              session.expires > Date.now() &&
              store.get('users', session.id));
          const granted = store.permissions(admin);
          const allowed = granted.length > 0;
          if (req.method === 'POST') {
            const tracked = {
              '/__local/save': 'Saved',
              '/__local/delete': 'Deleted',
              '/__local/role': 'Saved role',
              '/__local/community-move': 'Reordered community link',
              '/__local/checklist': 'Updated collector checklist',
              '/__local/upload': 'Uploaded file',
              '/__local/verification': 'Submitted verification',
              '/__local/verification-review': 'Reviewed verification',
              '/__local/remove-account': 'Deleted account',
              '/__local/remove-checklist': 'Removed checklist',
              '/__local/remove-comment': 'Removed comment',
              '/__local/social/moderation': 'Moderated comments',
            };
            if (tracked[endpoint]) {
              const registration =
                endpoint === '/__local/save' &&
                data.kind === 'users' &&
                !store.get('users', String(data.row?.id || ''));
              audit = {
                actor: admin?.display_name || admin?.name || 'Collector',
                action: registration ? 'Registered user' : tracked[endpoint],
                category: data.kind || endpoint.split('/').at(-1),
                target:
                  data.row?.name ||
                  data.row?.title ||
                  data.row?.id ||
                  data.id ||
                  data.setId ||
                  '',
                detail: data.decision || '',
              };
            }
          }
          if (endpoint === '/__local/activity') {
            if (req.method !== 'GET' || admin?.role !== 'Super Admin')
              throw Error('Super Admin access required.');
            return send(200, {
              items: store
                .list('activity')
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, 500),
            });
          }
          if (
            await removeAction(
              store,
              root,
              req,
              res,
              endpoint,
              data,
              social.currentUser(req),
              send,
            )
          )
            return;

          if (
            await verification.handle(
              req,
              res,
              endpoint,
              data,
              social.currentUser(req),
              admin,
              send,
            )
          )
            return;
          if (
            await social.handle(
              req,
              res,
              endpoint,
              data,
              granted.includes('social') || granted.includes('dashboard')
                ? admin
                : null,
              send,
            )
          )
            return;
          if (endpoint === '/__local/login' && req.method === 'POST') {
            const user =
              social.currentUser(req) ||
              store.get('users', data.id || 'local-admin');
            if (!store.permissions(user).length)
              return send(403, {
                error: 'Choose an active local administrator.',
              });
            const key = randomBytes(32).toString('hex');
            sessions.set(key, {
              id: user.id,
              expires: Date.now() + 8 * 3600 * 1000,
            });
            res.setHeader(
              'Set-Cookie',
              `teksboy_cms=${key}; HttpOnly; SameSite=Strict; Path=/__local; Max-Age=28800`,
            );
            return send(200, { ok: true });
          }
          if (endpoint === '/__local/logout' && req.method === 'POST') {
            sessions.delete(token);
            res.setHeader(
              'Set-Cookie',
              'teksboy_cms=; HttpOnly; SameSite=Strict; Path=/__local; Max-Age=0',
            );
            return send(200, { ok: true });
          }
          if (endpoint === '/__local/community-move' && req.method === 'POST') {
            store.requirePermission(admin?.id || '', 'community');
            const rows = store.list('community'),
              from = rows.findIndex((r) => r.id === data.id),
              to = rows.findIndex((r) => r.id === data.other);
            if (from < 0 || to < 0)
              throw Error('Link unavailable. Refresh and try again.');
            [rows[from], rows[to]] = [rows[to], rows[from]];
            store.db.exec('BEGIN');
            try {
              rows.forEach((row, position) =>
                store.put('community', { ...row, position }),
              );
              store.db.exec('COMMIT');
            } catch (e) {
              store.db.exec('ROLLBACK');
              throw e;
            }
            return send(200, { ok: true });
          }
          if (endpoint === '/__local/avatars' && req.method === 'GET') {
            const all =
              new URL(req.url, `http://${host}`).searchParams.get('manage') ===
              '1';
            if (all) store.requirePermission(admin?.id || '', 'avatars');
            return send(200, {
              avatars: store.list('avatars').filter((a) => all || a.enabled),
            });
          }
          if (endpoint === '/__local/community-types' && req.method === 'GET')
            return send(200, { types: store.list('community-types') });
          if (endpoint === '/__local/community' && req.method === 'GET') {
            const management =
              new URL(req.url, `http://${host}`).searchParams.get('manage') ===
              '1';
            if (management)
              store.requirePermission(admin?.id || '', 'community');
            return send(200, {
              types: store.list('community-types'),
              rows: store
                .list('community')
                .filter((r) => management || r.status === 'published'),
            });
          }
          if (endpoint === '/__local/roles' && req.method === 'GET')
            return send(200, {
              roles: store.list('roles'),
              permissions: granted,
            });
          if (endpoint === '/__local/catalog' && req.method === 'GET') {
            const categories = store.list('groups');
            const visibleGroups = categories.filter(
              (g) => g.status === 'published',
            );
            const savedSets = new Set(
              store
                .list('checklists')
                .filter(
                  (l) =>
                    l.user_id === (social.currentUser(req)?.id || 'local-demo'),
                )
                .map((l) => l.set_id),
            );
            return send(200, {
              categories,
              sets: store
                .list('collections')
                .filter(
                  (s) =>
                    (s.status === 'published' &&
                      visibleGroups.some((g) => g.id === s.category_id)) ||
                    savedSets.has(s.id),
                ),
              tracks: store
                .list('tracks')
                .filter((t) =>
                  visibleGroups.some((g) => g.id === t.category_id),
                ),
            });
          }
          if (endpoint === '/__local/leaderboard' && req.method === 'GET')
            return send(200, {
              rows: store.leaderboard(
                new URL(req.url, `http://${host}`).searchParams.get('group') ||
                  'all',
                new URL(req.url, `http://${host}`).searchParams.get(
                  'verified',
                ) === '1',
                new URL(req.url, `http://${host}`).searchParams.get(
                  'verifiedCollections',
                ) === '1',
              ),
              groups: store
                .list('groups')
                .map((g) => ({ id: g.id, name: g.name })),
            });
          // Resolve writes from the local session; never trust a posted user id.
          if (endpoint === '/__local/collector') {
            const user = social.currentUser(req);
            if (!user)
              return send(401, { error: 'Choose a local account to sign in.' });
            if (user.status !== 'active')
              return send(403, {
                error: 'The demo collector account is suspended.',
              });
            if (req.method === 'POST') {
              if (data.pin) {
                const { setId, text } = data.pin;
                if (
                  typeof setId !== 'string' ||
                  typeof text !== 'string' ||
                  text.length > 100
                )
                  throw Error(
                    'Keep the pinned message at or below 100 characters.',
                  );
                const checklist = store.get(
                  'checklists',
                  user.id + ':' + setId,
                );
                if (!checklist) throw Error('Checklist not found.');
                store.put('checklists', {
                  ...checklist,
                  pinned_message: text.trim(),
                });
              }
              if (data.profile) {
                const p = data.profile;
                if (
                  typeof p.displayName !== 'string' ||
                  p.displayName.length > 40 ||
                  typeof p.photo !== 'string' ||
                  p.photo.length > 250000 ||
                  (p.bio !== undefined &&
                    (typeof p.bio !== 'string' || p.bio.length > 90))
                )
                  throw Error('Invalid profile.');
                let facebookUrl = '';
                if (p.facebookUrl) {
                  if (
                    typeof p.facebookUrl !== 'string' ||
                    p.facebookUrl.length > 500
                  )
                    throw Error('Enter a valid Facebook profile link.');
                  let url;
                  try {
                    url = new URL(p.facebookUrl);
                  } catch {
                    throw Error('Enter a valid Facebook profile link.');
                  }
                  if (
                    url.protocol !== 'https:' ||
                    ![
                      'facebook.com',
                      'www.facebook.com',
                      'm.facebook.com',
                      'mbasic.facebook.com',
                    ].includes(url.hostname) ||
                    url.username ||
                    url.password
                  )
                    throw Error('Use an HTTPS facebook.com profile link.');
                  facebookUrl = url.href;
                }
                store.put('users', {
                  ...user,
                  name: p.displayName || 'Demo collector',
                  display_name: p.displayName,
                  photo: p.photo,
                  facebook_url: facebookUrl,
                  bio: (p.bio || '').trim(),
                  profile_saved: true,
                  leaderboard_visible: true,
                });
              }
              if (data.lists) {
                for (const setId of Object.keys(data.lists)) {
                  const set = store.get('collections', setId);
                  if (!set) continue;
                  const owned = [
                    ...new Set(
                      (data.owned?.[setId] || []).filter((id) =>
                        set.cards.some((c) => c.id === id),
                      ),
                    ),
                  ];
                  store.saveChecklist(
                    {
                      id: user.id + ':' + setId,
                      user_id: user.id,
                      set_id: setId,
                      owned,
                    },
                    null,
                  );
                }
              }
            }
            const lists = store
              .list('checklists')
              .filter((l) => l.user_id === user.id);
            return send(200, {
              profile: store.get('users', user.id),
              lists: Object.fromEntries(lists.map((l) => [l.set_id, l.id])),
              owned: Object.fromEntries(lists.map((l) => [l.set_id, l.owned])),
              metadata: Object.fromEntries(
                lists.map((l) => [
                  l.set_id,
                  {
                    verified: !!l.verified,
                    updated_at: l.updated_at,
                    pinned_message: l.pinned_message || '',
                  },
                ]),
              ),
            });
          }
          if (!allowed)
            return send(401, { error: 'Enter the local CMS first.' });
          if (endpoint.startsWith('/__local/proof/') && req.method === 'GET') {
            store.requirePermission(admin.id, 'collectors');
            const filename = endpoint.slice('/__local/proof/'.length);
            if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(filename))
              return send(404, { error: 'Not found.' });
            const file = path.join(root, '.local/proofs', filename);
            if (!fs.existsSync(file)) return send(404, { error: 'Not found.' });
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader(
              'Content-Type',
              filename.endsWith('.jpg')
                ? 'image/jpeg'
                : filename.endsWith('.png')
                  ? 'image/png'
                  : 'image/webp',
            );
            res.end(fs.readFileSync(file));
            return;
          }
          if (endpoint === '/__local/checklist' && req.method === 'POST') {
            const before = store.get(
              'checklists',
              data.row.user_id + ':' + data.row.set_id,
            );
            const result = store.saveChecklist(data.row, admin.id);
            if (!!before?.verified !== result.verified)
              social.notify(
                result.user_id,
                'account',
                result.verified
                  ? 'Your collection was verified'
                  : 'Your collection verification was cleared after review or changes',
                '/collectors?user=' + result.user_id + '&set=' + result.set_id,
              );
            return send(200, result);
          }
          if (endpoint === '/__local/cms' && req.method === 'GET')
            return send(200, {
              ...Object.fromEntries(
                ['groups', 'collections', 'users', 'tracks', 'checklists'].map(
                  (k) => [
                    k,
                    granted.includes(k) ||
                    granted.includes('dashboard') ||
                    (granted.includes('collectors') &&
                      ['users', 'collections', 'groups', 'checklists'].includes(
                        k,
                      )) ||
                    (['groups', 'collections'].includes(k) &&
                      granted.some((p) =>
                        ['groups', 'collections', 'tracks'].includes(p),
                      ))
                      ? store.list(k)
                      : [],
                  ],
                ),
              ),
              permissions: granted,
              roles: store.list('roles'),
            });
          if (endpoint === '/__local/role' && req.method === 'POST')
            return send(200, store.saveRole(data.row, admin.id));
          if (endpoint === '/__local/save' && req.method === 'POST') {
            const before = data.row.id
              ? store.get(data.kind, data.row.id)
              : null;
            const result = store.save(data.kind, data.row, admin.id);
            if (
              data.kind === 'collections' &&
              before &&
              result.cards.some(
                (c) => !before.cards.some((old) => old.id === c.id),
              )
            ) {
              for (const l of store
                .list('checklists')
                .filter((l) => l.set_id === result.id))
                social.notify(
                  l.user_id,
                  'account',
                  'New teks added to ' + result.name,
                  '/collectors?user=' + l.user_id + '&set=' + result.id,
                );
            }
            if (data.kind === 'users' && before) {
              if (before.role !== result.role)
                social.notify(
                  result.id,
                  'account',
                  'Your role is now ' + result.role,
                  '/collectors?user=' + result.id,
                );
              if (!!before.user_verified !== !!result.user_verified)
                social.notify(
                  result.id,
                  'account',
                  result.user_verified
                    ? 'Your user account is verified'
                    : 'Your user verification was removed',
                  '/collectors?user=' + result.id,
                );
            }
            return send(200, result);
          }
          if (endpoint === '/__local/delete' && req.method === 'POST') {
            store.del(data.kind, data.id, admin.id);
            return send(200, { ok: true });
          }
          if (endpoint === '/__local/upload' && req.method === 'POST') {
            store.requirePermission(
              admin.id,
              data.purpose === 'avatar'
                ? 'avatars'
                : data.purpose === 'group-logo'
                  ? 'groups'
                  : data.purpose === 'community'
                    ? 'community'
                    : data.purpose === 'proof'
                      ? 'collectors'
                      : String(data.type).startsWith('audio/')
                        ? 'tracks'
                        : 'collections',
            );
            const extensions = {
              'image/jpeg': 'jpg',
              'image/png': 'png',
              'image/webp': 'webp',
              'audio/mpeg': 'mp3',
              'audio/ogg': 'ogg',
              'audio/wav': 'wav',
            };
            const ext = extensions[data.type];
            if (!ext || typeof data.base64 !== 'string')
              throw Error('Use JPG, PNG, WebP, MP3, OGG or WAV.');
            const bytes = Buffer.from(data.base64, 'base64');
            if (!bytes.length || bytes.length > 12 * 1024 * 1024)
              throw Error('Files must be under 12 MB.');
            if (
              data.purpose === 'proof' &&
              !['jpg', 'png', 'webp'].includes(ext)
            )
              throw Error('Proof must be an image.');
            const folder = path.join(
              root,
              data.purpose === 'proof' ? '.local/proofs' : 'public/local-media',
            );
            fs.mkdirSync(folder, { recursive: true });
            const name = randomUUID() + '.' + ext;
            fs.writeFileSync(path.join(folder, name), bytes);
            return send(200, {
              url:
                (data.purpose === 'proof'
                  ? '/__local/proof/'
                  : '/local-media/') + name,
            });
          }
          return send(404, { error: 'Not found.' });
        } catch (e) {
          return send(400, { error: e.message || 'Request failed.' });
        }
      });
    },
  };
}
