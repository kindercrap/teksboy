import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createModel } from './model.mjs';
import { dispatch } from './dispatch.mjs';
import { socialService } from './social.mjs';

export function database() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Error('Production database is not configured.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function snapshot(db = database()) {
  const { data, error } = await db
    .rpc('teks_snapshot')
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw Error('Database unavailable. Please retry.');
  return data;
}
function mediaFor(db) {
  const uploaded = [],
    removed = [];
  const bucket = (name) => 'teksboy-' + name;
  return {
    async put(name, key, bytes, type) {
      const { error } = await db.storage
        .from(bucket(name))
        .upload(key, bytes, { contentType: type, upsert: false });
      if (error) throw Error('Upload failed. Please retry.');
      uploaded.push([name, key]);
    },
    publicUrl(key) {
      return db.storage.from(bucket('media')).getPublicUrl(key).data.publicUrl;
    },
    async response(name, key) {
      const { data, error } = await db.storage.from(bucket(name)).download(key);
      if (error) throw Error('Evidence unavailable.');
      return new Response(data, {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Type': data.type,
        },
      });
    },
    removeAfterCommit(name, key) {
      removed.push([name, key]);
    },
    async cleanup(committed) {
      for (const [name, key] of committed ? removed : uploaded)
        await db.storage.from(bucket(name)).remove([key]);
    },
  };
}
export function resolveActor(store, authUser, ownerEmail) {
  if (!authUser) return null;
  let actor = store.get('users', authUser.id);
  if (actor && actor.status !== 'active')
    throw Error('Your account is inactive.');
  if (!actor) {
    const google = authUser.identities?.some(
      (i) =>
        i.provider === 'google' &&
        i.identity_data?.email_verified === true &&
        String(i.identity_data?.email || '').toLowerCase() ===
          String(authUser.email || '').toLowerCase(),
    );
    if (!google || !authUser.email_confirmed_at)
      throw Error('Sign in with a verified Google account.');
    const owner =
      !!ownerEmail &&
      authUser.email?.toLowerCase() === ownerEmail.toLowerCase();
    actor = {
      id: authUser.id,
      email: authUser.email,
      name: String(authUser.user_metadata?.full_name || 'Collector').slice(
        0,
        40,
      ),
      display_name: String(
        authUser.user_metadata?.full_name || 'Collector',
      ).slice(0, 40),
      photo: '',
      bio: '',
      facebook_url: '',
      role: owner ? 'Super Admin' : 'Normal',
      status: 'active',
      user_verified: false,
      leaderboard_visible: true,
      created_at: authUser.created_at || new Date().toISOString(),
    };
    store.put('users', actor);
    store.put('activity', {
      id: randomUUID(),
      actor: actor.name,
      action: 'Registered user',
      category: 'users',
      target: actor.name,
      created_at: new Date().toISOString(),
    });
    const social = socialService(store, actor);
    for (const u of store.list('users'))
      if (u.role === 'Super Admin' && u.status === 'active')
        social.notify(
          u.id,
          'account',
          'A new collector joined Teksboy.',
          '/cms?section=users',
        );
  }
  return actor;
}
export async function handle(request) {
  const url = new URL(request.url),
    method = request.method;
  if (!['GET', 'POST'].includes(method))
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  // Mutations require bearer authentication; cookies only serve private images.
  if (
    method === 'POST' &&
    request.headers.get('origin') &&
    request.headers.get('origin') !== url.origin
  )
    return Response.json({ error: 'Origin mismatch' }, { status: 403 });
  if (
    method === 'POST' &&
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return Response.json({ error: 'JSON required' }, { status: 415 });
  const bearer = request.headers
    .get('authorization')
    ?.match(/^Bearer (.+)$/)?.[1];
  const cookie =
    method === 'GET'
      ? request.headers
          .get('cookie')
          ?.match(/(?:^|;\s*)teksboy_access=([^;]+)/)?.[1]
      : null;
  if (method === 'POST' && !bearer)
    return Response.json({ error: 'Sign in to continue.' }, { status: 401 });
  const token = bearer || cookie;
  try {
    const db = database();
    let authUser = null;
    if (token) {
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user)
        return Response.json(
          { error: 'Your session expired. Sign in again.' },
          { status: 401 },
        );
      authUser = data.user;
    }
    let data = {};
    if (method === 'POST') {
      const reader = request.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader)
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 18 * 1024 * 1024) {
            await reader.cancel();
            return Response.json(
              { error: 'Upload too large' },
              { status: 413 },
            );
          }
          chunks.push(part.value);
        }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw Error('Invalid request.');
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const snap = await snapshot(db),
        store = createModel(snap.records),
        media = mediaFor(db);
      let committed = false;
      try {
        const actor = resolveActor(
          store,
          authUser,
          process.env.TEKSBOY_OWNER_EMAIL,
        );
        const req = {
          url: request.url,
          method,
          headers: Object.fromEntries(request.headers),
          socket: { remoteAddress: '' },
        };
        const result = await dispatch(store, req, data, actor, media);
        if (result.status >= 400) return result;
        if (
          method === 'POST' &&
          actor &&
          /\/(save|delete|role|community-move|checklist|upload|verification|verification-review|remove-account|remove-checklist|remove-comment|moderation)$/.test(
            url.pathname,
          )
        )
          store.put('activity', {
            id: randomUUID(),
            actor: actor.display_name || actor.name,
            action: url.pathname.split('/').at(-1).replaceAll('-', ' '),
            category: data.kind || url.pathname.split('/').at(-1),
            target:
              data.row?.name ||
              data.row?.title ||
              data.row?.id ||
              data.id ||
              data.setId ||
              '',
            created_at: new Date().toISOString(),
          });
        const changes = store.changes();
        if (changes.length) {
          const { error } = await db
            .rpc('teks_commit', { expected_revision: snap.revision, changes })
            .abortSignal(AbortSignal.timeout(15000));
          if (error?.code === 'PT409') continue;
          if (error) throw Error('Changes could not be saved. Please retry.');
        }
        committed = true;
        if (url.pathname.endsWith('/remove-account')) {
          const deleted = await db.auth.admin.deleteUser(authUser.id);
          if (deleted.error)
            console.error(
              'Auth cleanup required for deleted account',
              authUser.id,
            );
        }
        result.headers.set('Cache-Control', 'private, no-store');
        if (bearer)
          result.headers.set(
            'Set-Cookie',
            `teksboy_access=${encodeURIComponent(bearer)}; HttpOnly; Secure; SameSite=Lax; Path=/api/app; Max-Age=3600`,
          );
        if (
          url.pathname.endsWith('/logout') ||
          url.pathname.endsWith('/remove-account')
        )
          result.headers.set(
            'Set-Cookie',
            'teksboy_access=; HttpOnly; Secure; SameSite=Lax; Path=/api/app; Max-Age=0',
          );
        return result;
      } finally {
        await media.cleanup(committed);
      }
    }
    return Response.json(
      { error: 'Another update is in progress. Please retry.' },
      { status: 409 },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Request failed.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
