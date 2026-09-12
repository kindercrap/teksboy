import { database, snapshot, resolveActor } from '../server/backend.mjs';
import { createModel } from '../server/model.mjs';
const db = database();
const auth = await db.auth.admin.listUsers();
if (auth.error) throw auth.error;
const snap = await snapshot(db),
  store = createModel(snap.records);
for (const row of auth.data.users) {
  const { data, error } = await db.auth.admin.getUserById(row.id);
  if (error) throw error;
  resolveActor(store, data.user, process.env.TEKSBOY_OWNER_EMAIL);
}
const old = await db
  .from('checklists')
  .select('id,user_id,set_id,checklist_cards(card_id)');
if (old.error) throw old.error;
let migrated = 0,
  retained = 0;
for (const l of old.data) {
  let set = store.get('collections', l.set_id);
  if (!set) {
    const legacy = await db
      .from('sets')
      .select('*,cards(*)')
      .eq('id', l.set_id)
      .single();
    if (legacy.error) throw legacy.error;
    set = { ...legacy.data, status: 'archived' };
    store.put('collections', set);
    retained++;
  }
  if (!store.get('checklists', l.user_id + ':' + l.set_id)) {
    store.saveChecklist(
      {
        id: l.user_id + ':' + l.set_id,
        user_id: l.user_id,
        set_id: l.set_id,
        owned: l.checklist_cards
          .map((c) => c.card_id)
          .filter((id) => set.cards.some((c) => c.id === id)),
      },
      null,
    );
    migrated++;
  }
}
const { error } = await db.rpc('teks_commit', {
  expected_revision: snap.revision,
  changes: store.changes(),
});
if (error) throw error;
console.log(
  JSON.stringify({
    realAccounts: auth.data.users.length,
    migratedChecklists: migrated,
    unmatchedPreservedInOriginalTables: retained,
    ownerRole: store
      .list('users')
      .find((u) => u.email === process.env.TEKSBOY_OWNER_EMAIL)?.role,
  }),
);
