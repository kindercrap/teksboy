import { randomUUID } from 'node:crypto';
// Per-request working copy. PostgreSQL owns persistence and atomic revision checks.
export function createModel(records) {
  let rows = new Map(
    records.map((r) => [r.kind + '\0' + r.id, JSON.stringify(r.data)]),
  );
  let transaction;
  const list = (kind) =>
    [...rows.entries()]
      .filter(([k]) => k.startsWith(kind + '\0'))
      .map(([, v]) => JSON.parse(v))
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  const get = (kind, id) => {
    const v = rows.get(kind + '\0' + id);
    return v ? JSON.parse(v) : null;
  };
  const put = (kind, row) => {
    if (!row || typeof row.id !== 'string') throw Error('Invalid record');
    rows.set(kind + '\0' + row.id, JSON.stringify(row));
  };
  const remove = (kind, id) => rows.delete(kind + '\0' + id);
  const db = {
    exec(sql) {
      if (sql === 'BEGIN') transaction = new Map(rows);
      else if (sql === 'ROLLBACK' && transaction) {
        rows = transaction;
        transaction = null;
      } else if (sql === 'COMMIT') transaction = null;
      else throw Error('Unsupported transaction');
    },
    prepare(sql) {
      if (sql !== 'DELETE FROM records WHERE kind=? AND id=?')
        throw Error('Unsupported query');
      return { run: remove };
    },
  };
  const changes = () => {
    const original = new Map(
      records.map((r) => [r.kind + '\0' + r.id, JSON.stringify(r.data)]),
    );
    const out = [];
    for (const [key, value] of rows)
      if (original.get(key) !== value) {
        const [kind, id] = key.split('\0');
        out.push({ kind, id, data: JSON.parse(value) });
      }
    for (const key of original.keys())
      if (!rows.has(key)) {
        const [kind, id] = key.split('\0');
        out.push({ kind, id, deleted: true });
      }
    return out;
  };
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
  function save(kind, row, actor = '') {
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
        old?.role === 'Super Admin' &&
        (row.role !== 'Super Admin' || row.status !== 'active')
      )
        throw Error('Super Admin accounts must remain active.');
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
  function del(kind, id, actor = '') {
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
    if (
      proof &&
      !/^\/(?:__local|api\/app)\/proof\/[a-f0-9-]+\.(jpg|png|webp)$/.test(proof)
    )
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
    changes,
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
