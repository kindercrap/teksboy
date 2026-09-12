import { randomUUID } from 'node:crypto';
import { socialService } from './social.mjs';
import { verificationService } from './verification.mjs';
import { removeAction } from './remove-action.mjs';
export async function dispatch(store, req, data, actor, media) {
  const endpoint = new URL(req.url).pathname.replace('/api/app/', '/__local/'),
    admin = actor,
    granted = store.permissions(admin),
    allowed = granted.length > 0;
  let response;
  const res = {
    headers: new Headers(),
    setHeader(k, v) {
      this.headers.set(k, String(v));
    },
    end(bytes) {
      response = new Response(bytes, { headers: this.headers });
    },
  };
  const send = (status, data) => {
    response = Response.json(data, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });
    return response;
  };
  const social = socialService(store, actor),
    verification = verificationService(store, media, social.notify);
  if (endpoint === '/__local/social/accounts' || endpoint === '/__local/login')
    return send(403, {
      error: 'Local test sign-in is unavailable on the live site.',
    });
  if (endpoint === '/__local/logout' || endpoint === '/__local/social/logout')
    return send(200, { ok: true });
  if (await removeAction(store, media, req, res, endpoint, data, actor, send))
    return response;
  if (await verification.handle(req, res, endpoint, data, actor, admin, send))
    return response;
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
    return response;
  if (endpoint === '/__local/activity') {
    if (admin?.role !== 'Super Admin')
      return send(403, { error: 'Super Admin access required.' });
    return send(200, {
      items: store
        .list('activity')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 500),
    });
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
    const all = new URL(req.url).searchParams.get('manage') === '1';
    if (all) store.requirePermission(admin?.id || '', 'avatars');
    return send(200, {
      avatars: store.list('avatars').filter((a) => all || a.enabled),
    });
  }
  if (endpoint === '/__local/community-types' && req.method === 'GET')
    return send(200, { types: store.list('community-types') });
  if (endpoint === '/__local/community' && req.method === 'GET') {
    const management = new URL(req.url).searchParams.get('manage') === '1';
    if (management) store.requirePermission(admin?.id || '', 'community');
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
    const visibleGroups = categories.filter((g) => g.status === 'published');
    const savedSets = new Set(
      store
        .list('checklists')
        .filter((l) => l.user_id === (social.currentUser(req)?.id || ''))
        .map((l) => l.set_id),
    );
    return send(200, {
      categories: categories.filter(
        (g) =>
          visibleGroups.includes(g) ||
          store
            .list('collections')
            .some((s) => savedSets.has(s.id) && s.category_id === g.id),
      ),
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
        .filter((t) => visibleGroups.some((g) => g.id === t.category_id)),
    });
  }
  if (endpoint === '/__local/leaderboard' && req.method === 'GET')
    return send(200, {
      rows: store.leaderboard(
        new URL(req.url).searchParams.get('group') || 'all',
        new URL(req.url).searchParams.get('verified') === '1',
        new URL(req.url).searchParams.get('verifiedCollections') === '1',
      ),
      groups: store.list('groups').map((g) => ({ id: g.id, name: g.name })),
    });
  // Resolve writes from the local session; never trust a posted user id.
  if (endpoint === '/__local/collector') {
    const user = social.currentUser(req);
    if (!user) return send(401, { error: 'Sign in to continue.' });
    if (user.status !== 'active')
      return send(403, {
        error: 'Your account is suspended.',
      });
    if (req.method === 'POST') {
      if (data.pin) {
        const { setId, text } = data.pin;
        if (
          typeof setId !== 'string' ||
          typeof text !== 'string' ||
          text.length > 100
        )
          throw Error('Keep the pinned message at or below 100 characters.');
        const checklist = store.get('checklists', user.id + ':' + setId);
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
          if (typeof p.facebookUrl !== 'string' || p.facebookUrl.length > 500)
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
          name: p.displayName || 'Collector',
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
    const lists = store.list('checklists').filter((l) => l.user_id === user.id);
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
  if (!allowed) return send(401, { error: 'Administrator access required.' });
  if (endpoint.startsWith('/__local/proof/') && req.method === 'GET') {
    store.requirePermission(admin.id, 'collectors');
    const name = endpoint.split('/').at(-1);
    if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(name))
      throw Error('Invalid proof');
    return media.response('evidence', 'proofs/' + name);
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
        ['groups', 'collections', 'users', 'tracks', 'checklists'].map((k) => [
          k,
          granted.includes(k) ||
          granted.includes('dashboard') ||
          (granted.includes('collectors') &&
            ['users', 'collections', 'groups', 'checklists'].includes(k)) ||
          (['groups', 'collections'].includes(k) &&
            granted.some((p) =>
              ['groups', 'collections', 'tracks'].includes(p),
            ))
            ? store.list(k)
            : [],
        ]),
      ),
      permissions: granted,
      roles: store.list('roles'),
    });
  if (endpoint === '/__local/role' && req.method === 'POST')
    return send(200, store.saveRole(data.row, admin.id));
  if (endpoint === '/__local/save' && req.method === 'POST') {
    const before = data.row.id ? store.get(data.kind, data.row.id) : null;
    if (data.kind === 'users' && !store.get('users', data.row.id))
      throw Error('New collectors must sign in with Google first.');
    const result = store.save(data.kind, data.row, admin.id);
    if (
      data.kind === 'collections' &&
      before &&
      result.cards.some((c) => !before.cards.some((old) => old.id === c.id))
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
    const ext = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
    }[data.type];
    if (
      !ext ||
      typeof data.base64 !== 'string' ||
      data.base64.length > 17 * 1024 * 1024
    )
      throw Error('Unsupported upload.');
    const bytes = Buffer.from(data.base64, 'base64');
    if (!bytes.length || bytes.length > 12 * 1024 * 1024)
      throw Error('Files must be under 12 MB.');
    if (data.purpose === 'proof' && !['jpg', 'png', 'webp'].includes(ext))
      throw Error('Choose a proof image.');
    const name = randomUUID() + '.' + ext,
      key = (data.purpose === 'proof' ? 'proofs/' : 'catalog/') + name,
      bucket = data.purpose === 'proof' ? 'evidence' : 'media';
    await media.put(bucket, key, bytes, data.type);
    return send(200, {
      url:
        bucket === 'evidence' ? '/api/app/proof/' + name : media.publicUrl(key),
    });
  }
  return send(404, { error: 'Not found' });
}
