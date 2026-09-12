import { readFile } from 'node:fs/promises';
import { database, snapshot } from '../server/backend.mjs';
import { createModel } from '../server/model.mjs';
const db = database(),
  snap = await snapshot(db);
const source = JSON.parse(
  await readFile(
    new URL('../supabase/import/public-catalog.json', import.meta.url),
    'utf8',
  ),
);
const allowed = [
  'groups',
  'collections',
  'tracks',
  'community',
  'community-types',
  'avatars',
];
const store = createModel(snap.records);
let imported = 0;
for (const kind of allowed)
  for (const row of source[kind] || [])
    if (!store.get(kind, row.id)) {
      store.put(kind, row);
      imported++;
    }
const { error } = await db.rpc('teks_commit', {
  expected_revision: snap.revision,
  changes: store.changes(),
});
if (error) throw Error(error.message);
const live = await snapshot(db);
console.log(
  JSON.stringify({
    imported,
    counts: Object.fromEntries(
      [...allowed, 'users', 'checklists'].map((kind) => [
        kind,
        live.records.filter((r) => r.kind === kind).length,
      ]),
    ),
  }),
);
