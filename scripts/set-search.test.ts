import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchIndex,
  searchSets,
  addRecentSearch,
  readRecentSearches,
} from '../lib/set-search.ts';
const sets = [
  {
    id: 'first',
    name: 'Yuyu Hakusho Blackjack First Print',
    category_id: 'yyh',
  },
  { id: 'reprint', name: 'Yuyu Hakusho Blackjack Reprint', category_id: 'yyh' },
  { id: 'db', name: 'Dragon Ball Grey Poker', category_id: 'db' },
  { id: 'poker', name: 'Poker', category_id: 'other' },
  { id: 'typo', name: 'Pokr', category_id: 'other' },
].map((s) => ({ ...s, status: 'published', cards: [], cover: '' }));
const index = buildSearchIndex(sets, [
  { id: 'yyh', name: 'Ghost Fighter', position: 0 },
  { id: 'db', name: 'Dragon Ball', position: 1 },
]);
const ids = (q: string) => searchSets(index, q).map((r) => r.set.id);
test('global set search handles punctuation, aliases, multi-field queries and light typos', () => {
  for (const q of [
    'Black Jack',
    'Blackjack',
    'black-jack',
    'Ghost Fighter Black Jack',
    'YYH blackjack',
    '  Yu Yu Hakusho  blackjack ',
  ])
    assert.deepEqual(ids(q), ['first', 'reprint'], q);
  for (const q of [
    'Ghost Fighter',
    'Yu Yu Hakusho',
    'Yuyu Hakusho',
    'YYH',
    'Ghst Fighter',
  ])
    assert.deepEqual(ids(q), ['first', 'reprint'], q);
  for (const q of ['Dragon Ball', 'Dragonball', 'Dragon Ball Z', 'DBZ'])
    assert.deepEqual(ids(q), ['db'], q);
  assert.deepEqual(ids('nonexistent universe'), []);
  assert.deepEqual(ids('   '), []);
});
test('literal matches outrank fuzzy results and unpublished sets are excluded', () => {
  assert.deepEqual(ids('Poker'), ['poker', 'db', 'typo']);
  assert.equal(ids(sets[0].name)[0], 'first');
  assert.equal(
    buildSearchIndex([{ ...sets[0], status: 'draft' }], []).length,
    0,
  );
});
test('recents are bounded, deduplicated, newest first and resilient to invalid storage', () => {
  assert.deepEqual(addRecentSearch(['Black Jack', 'Poker'], 'black-jack'), [
    'black-jack',
    'Poker',
  ]);
  assert.deepEqual(addRecentSearch(['Poker'], ' '), ['Poker']);
  assert.equal(addRecentSearch(['a', 'b', 'c', 'd', 'e'], 'f').length, 5);
  assert.deepEqual(readRecentSearches({ getItem: () => '{broken' }), []);
  assert.deepEqual(
    readRecentSearches({
      getItem: () => {
        throw Error('blocked');
      },
    }),
    [],
  );
});
