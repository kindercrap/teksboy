import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../server/model.mjs';
import { dispatch } from '../server/dispatch.mjs';
const users = [
  { id: 'owner', name: 'Owner', role: 'Super Admin', status: 'active' },
  { id: 'admin', name: 'Admin', role: 'Admin', status: 'active' },
  { id: 'a', name: 'A', role: 'Normal', status: 'active' },
  { id: 'b', name: 'B', role: 'Normal', status: 'active' },
];
const fixture = () =>
  createModel(users.map((data) => ({ kind: 'users', id: data.id, data })));
const call = async (store, path, body, user) => {
  const response = await dispatch(
    store,
    new Request('https://teksboy.com/api/app/' + path, {
      method: body ? 'POST' : 'GET',
    }),
    body || {},
    user ? store.get('users', user) : null,
    {},
  );
  return { status: response.status, data: await response.json() };
};
test('homepage management persists order, state and deletion; guests cannot modify it', async () => {
  const store = fixture();
  let r = await call(store, 'homepage');
  assert.equal(r.data.rows.length, 3);
  assert.equal(
    (await call(store, 'homepage', { action: 'delete', id: 'collectors' }, 'a'))
      .status,
    403,
  );
  const card = {
    ...r.data.rows[0],
    title: 'Discover collectors',
    enabled: false,
  };
  assert.equal(
    (await call(store, 'homepage', { action: 'save', row: card }, 'admin'))
      .status,
    200,
  );
  assert.equal((await call(store, 'homepage')).data.rows.length, 2);
  assert.equal(
    (await call(store, 'homepage?manage=1', null, 'owner')).data.rows.find(
      (r) => r.id === 'collectors',
    ).title,
    'Discover collectors',
  );
  await call(
    store,
    'homepage',
    { action: 'move', id: 'account', other: 'community' },
    'owner',
  );
  assert.equal((await call(store, 'homepage')).data.rows[0].id, 'account');
  for (const id of ['account', 'community', 'collectors'])
    await call(store, 'homepage', { action: 'delete', id }, 'owner');
  assert.deepEqual((await call(store, 'homepage')).data.rows, []);
});
test('homepage rejects unsafe destinations and invalid input', async () => {
  const store = fixture(),
    card = (await call(store, 'homepage')).data.rows[0];
  for (const url of ['javascript:alert(1)', '//evil.test', '/\\evil.test'])
    await assert.rejects(
      call(
        store,
        'homepage',
        { action: 'save', row: { ...card, url } },
        'owner',
      ),
    );
  await assert.rejects(
    call(
      store,
      'homepage',
      { action: 'save', row: { ...card, title: 'x'.repeat(61) } },
      'owner',
    ),
  );
});
test('guide completion merges without overwriting and stays private to each account', async () => {
  const store = fixture();
  assert.equal((await call(store, 'guide-progress')).status, 401);
  await call(store, 'guide-progress', { completed: ['welcome'] }, 'a');
  await call(store, 'guide-progress', { completed: ['archives'] }, 'a');
  assert.deepEqual(
    (await call(store, 'guide-progress', null, 'a')).data.completed,
    ['welcome', 'archives'],
  );
  assert.deepEqual(
    (await call(store, 'guide-progress', null, 'b')).data.completed,
    [],
  );
  await assert.rejects(
    call(store, 'guide-progress', { completed: ['bad-key'] }, 'a'),
  );
});
