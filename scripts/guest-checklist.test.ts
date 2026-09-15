import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guestDataKey,
  guestModeKey,
  readGuest,
  startGuest,
  pauseGuest,
  writeGuest,
  guestChecklist,
  guestIsActive,
  migrateGuest,
} from '../lib/guest-checklist.ts';
import { createModel } from '../server/model.mjs';
import { dispatch } from '../server/dispatch.mjs';
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
test('guest session and sets persist across fresh reads without creating an account', () => {
  const storage = memory();
  startGuest(storage);
  writeGuest(storage, { a: ['1', '2'], b: [] });
  assert.equal(guestIsActive(storage), true);
  assert.deepEqual(readGuest(storage).data.sets, { a: ['1', '2'], b: [] });
  writeGuest(storage, { a: ['2'] });
  assert.deepEqual(guestChecklist(readGuest(storage).data), {
    lists: { a: 'a', b: 'b' },
    owned: { a: ['2'], b: [] },
  });
  writeGuest(storage, {}, 'a');
  assert.deepEqual(readGuest(storage).data.sets, { b: [] });
  pauseGuest(storage);
  assert.equal(guestIsActive(storage), false);
  assert.deepEqual(readGuest(storage).data.sets, { b: [] });
  startGuest(storage);
  assert.deepEqual(readGuest(storage).data.sets, { b: [] });
});
test('corrupt/old data is recoverable and unavailable/quota-limited storage never overwrites progress', () => {
  for (const raw of [
    'invalid',
    '{"version":9,"sets":{}}',
    '{"version":1,"sets":{"a":[7]}}',
  ]) {
    const storage = memory();
    storage.setItem(guestDataKey, raw);
    assert.ok(readGuest(storage).issue);
    startGuest(storage);
    assert.equal(storage.getItem(guestDataKey + '_recovery'), raw);
    assert.deepEqual(readGuest(storage).data.sets, {});
  }
  const storage = memory();
  startGuest(storage);
  writeGuest(storage, { a: ['1'] });
  const before = storage.getItem(guestDataKey);
  const quota = {
    ...storage,
    setItem() {
      throw Error('quota');
    },
  };
  assert.throws(() => writeGuest(quota, { a: ['2'] }));
  assert.equal(storage.getItem(guestDataKey), before);
  const unavailable = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
    removeItem() {
      throw Error();
    },
  };
  assert.equal(guestIsActive(unavailable), false);
  assert.ok(readGuest(unavailable).issue);
  assert.throws(() => startGuest(unavailable));
});
test('successful migration clears only saved data; failures and newer cross-tab edits stay local', async () => {
  const storage = memory();
  startGuest(storage);
  writeGuest(storage, { a: ['1'] });
  await assert.rejects(
    migrateGuest(storage, async () => {
      throw Error('offline');
    }),
  );
  assert.deepEqual(readGuest(storage).data.sets, { a: ['1'] });
  await migrateGuest(storage, async () => {
    writeGuest(storage, { a: ['1', '2'] });
    return true;
  });
  assert.deepEqual(readGuest(storage).data.sets, { a: ['1', '2'] });
  await migrateGuest(storage, async () => true);
  assert.equal(storage.getItem(guestDataKey), null);
  assert.equal(storage.getItem(guestModeKey), null);
  let calls = 0;
  await migrateGuest(storage, async () => {
    calls++;
  });
  assert.equal(calls, 0);
});
test('database import unions current account cards, is idempotent, and rejects guests/invalid batches', async () => {
  const records = [
    {
      kind: 'users',
      id: 'u',
      data: { id: 'u', name: 'Collector', status: 'active', role: 'Normal' },
    },
    {
      kind: 'collections',
      id: 'a',
      data: {
        id: 'a',
        name: 'A',
        status: 'published',
        cards: ['1', '2', '3', '4', '5'].map((id) => ({ id })),
      },
    },
    {
      kind: 'checklists',
      id: 'u:a',
      data: { id: 'u:a', user_id: 'u', set_id: 'a', owned: ['1', '2', '3'] },
    },
  ];
  const store = createModel(records),
    user = store.get('users', 'u');
  const call = (sets: Record<string, string[]>, actor = user) =>
    dispatch(
      store,
      new Request('https://teksboy.com/api/app/collector', { method: 'POST' }),
      { guestImport: { version: 1, sets } },
      actor,
      {},
    );
  assert.equal((await call({ a: ['2', '4', '5'] }, null)).status, 401);
  await call({ a: ['2', '4', '5'] });
  await call({ a: ['2', '4', '5'] });
  assert.deepEqual(store.get('checklists', 'u:a').owned, [
    '1',
    '2',
    '3',
    '4',
    '5',
  ]);
  await assert.rejects(call({ a: [], unknown: ['x'] }));
  assert.deepEqual(store.get('checklists', 'u:a').owned, [
    '1',
    '2',
    '3',
    '4',
    '5',
  ]);
  assert.equal(store.list('users').length, 1);
});
