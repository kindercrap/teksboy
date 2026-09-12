import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../server/model.mjs';
import { dispatch } from '../server/dispatch.mjs';
import { resolveActor, handle } from '../server/backend.mjs';
const users = [
  {
    id: 'owner',
    name: 'Owner',
    email: 'owner@example.test',
    role: 'Super Admin',
    status: 'active',
  },
  {
    id: 'contributor',
    name: 'Contributor',
    email: 'a@example.test',
    role: 'Admin',
    status: 'active',
  },
  {
    id: 'one',
    name: 'One',
    email: 'one@example.test',
    role: 'Normal',
    status: 'active',
  },
  {
    id: 'two',
    name: 'Two',
    email: 'two@example.test',
    role: 'Normal',
    status: 'active',
  },
];
function fixture() {
  return createModel([
    ...users.map((data) => ({ kind: 'users', id: data.id, data })),
    {
      kind: 'groups',
      id: 'g',
      data: { id: 'g', name: 'Group', status: 'published' },
    },
    {
      kind: 'collections',
      id: 's',
      data: {
        id: 's',
        category_id: 'g',
        name: 'Set',
        status: 'published',
        cards: [{ id: 'c', number: 1, image: '/images/c.jpg' }],
      },
    },
  ]);
}
const media = {
  put: async () => {},
  response: async () => new Response('photo'),
  removeAfterCommit() {},
};
const call = async (store, path, actor = null, data = {}, method = 'GET') =>
  dispatch(
    store,
    { url: 'https://example.test/api/app/' + path, method, headers: {} },
    data,
    actor ? store.get('users', actor) : null,
    media,
  );
test('production rejects missing sessions, fake local logins, and cross-origin writes', async () => {
  assert.equal(
    (
      await handle(
        new Request('https://example.test/api/app/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handle(
        new Request('https://example.test/api/app/save', {
          method: 'POST',
          headers: {
            Origin: 'https://other.test',
            'Content-Type': 'application/json',
          },
          body: '{}',
        }),
      )
    ).status,
    403,
  );
  const store = fixture();
  assert.equal((await call(store, 'social/accounts')).status, 403);
  assert.equal((await call(store, 'cms')).status, 401);
});
test('archive contributors cannot manage users, roles, private evidence, or comments', async () => {
  const store = fixture();
  for (const [path, data] of [
    ['save', { kind: 'users', row: users[2] }],
    ['role', { row: { name: 'Admin' } }],
    ['social/moderation', { action: 'delete', id: 'c' }],
  ])
    await assert.rejects(() => call(store, path, 'contributor', data, 'POST'));
  await assert.rejects(() => call(store, 'proof/1234.jpg', 'contributor'));
  const cms = await (await call(store, 'cms', 'contributor')).json();
  assert.deepEqual(cms.users, []);
  assert.deepEqual(cms.checklists, []);
});
test('profile, pin, checklist and public DTOs isolate ownership and private fields', async () => {
  const store = fixture();
  await call(
    store,
    'collector',
    'one',
    { user_id: 'two', lists: { s: 'fake' }, owned: { s: ['c'] } },
    'POST',
  );
  assert.equal(store.get('checklists', 'two:s'), null);
  assert.deepEqual(store.get('checklists', 'one:s').owned, ['c']);
  await call(
    store,
    'collector',
    'one',
    { pin: { setId: 's', text: 'For sale' } },
    'POST',
  );
  assert.equal(store.get('checklists', 'one:s').pinned_message, 'For sale');
  await assert.rejects(() =>
    call(
      store,
      'collector',
      'two',
      { pin: { setId: 's', text: 'Hijack' } },
      'POST',
    ),
  );
  const profile = await (
    await call(store, 'social/profile?user=one&set=s')
  ).json();
  assert.equal(profile.user.email, undefined);
  assert.equal(profile.checklists[0].notes, undefined);
  const notes = 'x'.repeat(91);
  await assert.rejects(() =>
    call(
      store,
      'collector',
      'one',
      { profile: { displayName: 'A', photo: '', bio: notes } },
      'POST',
    ),
  );
});
test('verification requires completion, keeps evidence private and notifies collector', async () => {
  const store = fixture();
  const data = {
    setId: 's',
    type: 'image/png',
    base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString(
      'base64',
    ),
    note: 'Proof',
  };
  await assert.rejects(() => call(store, 'verification', 'one', data, 'POST'));
  await call(
    store,
    'collector',
    'one',
    { lists: { s: 's' }, owned: { s: ['c'] } },
    'POST',
  );
  await call(store, 'verification', 'one', data, 'POST');
  const request = store.list('verification-requests')[0];
  assert.equal(
    (await call(store, 'verification-image/' + request.id, 'two')).status,
    403,
  );
  await call(
    store,
    'verification-review',
    'owner',
    { id: request.id, decision: 'approved' },
    'POST',
  );
  assert.equal(store.get('checklists', 'one:s').verified, true);
  assert.ok(store.list('notifications').some((n) => n.user_id === 'one'));
  await call(
    store,
    'collector',
    'one',
    { lists: { s: 's' }, owned: { s: [] } },
    'POST',
  );
  assert.equal(store.get('checklists', 'one:s').verified, false);
});
test('only authenticated Google identity can bootstrap the owner; metadata role ignored', () => {
  const store = fixture();
  const auth = {
    id: 'real',
    email: 'real@example.test',
    email_confirmed_at: 'now',
    identities: [
      {
        provider: 'google',
        identity_data: { email: 'real@example.test', email_verified: true },
      },
    ],
    user_metadata: { role: 'Super Admin' },
  };
  assert.equal(
    resolveActor(store, auth, 'someone@example.test').role,
    'Normal',
  );
  assert.throws(() =>
    resolveActor(store, { ...auth, id: 'spoof', identities: [] }, auth.email),
  );
  assert.equal(
    resolveActor(store, { ...auth, id: 'actual-owner' }, auth.email).role,
    'Super Admin',
  );
});
