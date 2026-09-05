import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { TeksSet } from '../lib/data.ts';
import { completion, missingCards, paginate } from '../lib/export.ts';
const sets: TeksSet[] = JSON.parse(
  fs.readFileSync(new URL('../lib/catalog.json', import.meta.url), 'utf8'),
);
test('catalog has unique stable IDs, natural numbers and real images', () => {
  const ids = new Set();
  let count = 0;
  for (const s of sets) {
    assert.ok(fs.existsSync(new URL('../public' + s.cover, import.meta.url)));
    let last = 0;
    for (const c of s.cards) {
      assert.ok(!ids.has(c.id));
      ids.add(c.id);
      assert.ok(c.number > last);
      last = c.number;
      assert.ok(fs.existsSync(new URL('../public' + c.image, import.meta.url)));
      count++;
    }
  }
  assert.equal(count, 541);
});
test('missing exports omit owned cards and preserve order without duplicates', () => {
  const s = sets[0],
    owned = [s.cards[0].id, s.cards[5].id];
  const missing = missingCards(s, owned);
  assert.equal(missing.length, s.cards.length - 2);
  assert.ok(missing.every((c) => !owned.includes(c.id)));
  assert.deepEqual(paginate(missing).flat(), missing);
  assert.ok(paginate(missing).every((p) => p.length <= 20));
});
test('completed and empty sets export no pages; progress is accurate', () => {
  assert.equal(completion(56, 13), 23);
  assert.equal(completion(0, 0), 0);
  assert.deepEqual(paginate([]), []);
  assert.deepEqual(
    missingCards(
      sets[0],
      sets[0].cards.map((c) => c.id),
    ),
    [],
  );
});
