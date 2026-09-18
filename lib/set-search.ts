import type { TeksSet, Category } from './data';

// Display names remain untouched. Add future naming variations here.
export const searchAliases = [
  ['ghost fighter', 'yu yu hakusho', 'yuyu hakusho', 'yyh'],
  ['dragon ball', 'dragon ball z', 'dragonball', 'dragonball z', 'dbz'],
  ['blackjack', 'black jack'],
];
export const searchSuggestions = [
  'Ghost Fighter',
  'Dragon Ball',
  'DBest',
  'Poker',
];
export const recentSearchKey = 'teksboy_recent_set_searches_v1';
export function normalizeSearch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
const compact = (s: string) => normalizeSearch(s).replaceAll(' ', '');
function canonical(value: string) {
  let text = ' ' + normalizeSearch(value) + ' ';
  searchAliases.forEach((aliases, i) => {
    for (const alias of [...aliases].sort((a, b) => b.length - a.length)) {
      text = text.replaceAll(' ' + alias + ' ', ' seriesalias' + i + ' ');
    }
  });
  return text.trim();
}
function closeWord(a: string, b: string) {
  if (a === b) return true;
  const limit = a.length >= 8 ? 2 : a.length >= 4 ? 1 : 0;
  if (!limit || Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = row;
  }
  return previous[b.length] <= limit;
}
type SearchableSet = TeksSet & {
  tags?: string[];
  keywords?: string[];
  aliases?: string[];
  print_type?: string;
};
export function buildSearchIndex(
  sets: SearchableSet[],
  categories: Category[],
) {
  return sets
    .filter((s) => s.status === 'published')
    .map((set) => {
      const category = categories.find((c) => c.id === set.category_id);
      const series = category?.name || 'Other series';
      const metadata = [
        set.name,
        series,
        set.print_type,
        ...(set.tags || []),
        ...(set.keywords || []),
        ...(set.aliases || []),
      ]
        .filter(Boolean)
        .join(' ');
      const related = searchAliases
        .filter((aliases) =>
          aliases.some((a) => compact(metadata).includes(compact(a))),
        )
        .flat();
      const text = metadata + ' ' + related.join(' ');
      return {
        set,
        series,
        title: compact(set.name),
        franchise: compact(series),
        canonical: canonical(metadata).replaceAll(' ', ''),
        text: compact(text),
        words: normalizeSearch(text).split(' '),
      };
    });
}
export function searchSets(
  index: ReturnType<typeof buildSearchIndex>,
  query: string,
) {
  const q = compact(query),
    normalized = normalizeSearch(query);
  if (!q) return [];
  const tokens = canonical(query).split(' ').map(compact);
  return index
    .map((entry) => {
      const score =
        entry.title === q
          ? 600
          : entry.title.startsWith(q)
            ? 500
            : entry.title.includes(q)
              ? 400
              : entry.franchise.includes(q)
                ? 300
                : tokens.every(
                      (t) =>
                        entry.canonical.includes(t) || entry.text.includes(t),
                    )
                  ? 200
                  : normalized
                        .split(' ')
                        .every((t) => entry.words.some((w) => closeWord(t, w)))
                    ? 100
                    : 0;
      return { ...entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.set.name.localeCompare(b.set.name));
}
export function readRecentSearches(storage: Pick<Storage, 'getItem'>) {
  try {
    const value: unknown = JSON.parse(storage.getItem(recentSearchKey) || '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (s): s is string => typeof s === 'string' && !!normalizeSearch(s),
          )
          .map((s) => s.slice(0, 120))
          .slice(0, 5)
      : [];
  } catch {
    return [];
  }
}
export function addRecentSearch(recents: string[], query: string) {
  const text = query.trim().slice(0, 120);
  return normalizeSearch(text)
    ? [text, ...recents.filter((s) => compact(s) !== compact(text))].slice(0, 5)
    : recents;
}
