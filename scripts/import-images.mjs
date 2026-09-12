import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(app, '../images/teks');
const destination = path.join(app, 'public/images/teks');
const groups = [
  { id: 'ghost-fighter', name: 'Ghost Fighter', position: 0 },
  { id: 'dragonball', name: 'Dragon Ball', position: 1 },
];
const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const title = (slug) =>
  slug
    .split('-')
    .map(
      (word) =>
        ({
          yuyuhakusho: 'Yuyu Hakusho',
          dragonball: 'Dragon Ball',
          dbest: 'DBest',
          dbest40: 'DBest40',
          ghostfighter84: 'Ghost Fighter 84',
          thereturn: 'The Return',
          jackenpoy: 'Jack N Poy',
          ex: 'EX',
          '1st': '1st',
          '2nd': '2nd',
        })[word] || word[0].toUpperCase() + word.slice(1),
    )
    .join(' ');
const catalog = [];
for (const group of groups) {
  const groupPath = path.join(source, group.id);
  for (const folder of fs
    .readdirSync(groupPath, { withFileTypes: true })
    .filter((f) => f.isDirectory())
    .sort((a, b) => natural(a.name, b.name))) {
    const directory = path.join(groupPath, folder.name);
    const files = fs
      .readdirSync(directory)
      .filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
      .sort(natural);
    const covers = files.filter((f) => /^backprint/i.test(f));
    if (!covers.length) throw Error(`Missing backprint: ${folder.name}`);
    const cover =
      (folder.name.includes('reprint') &&
        covers.find((f) => /^backprint-reprint\./i.test(f))) ||
      covers.find((f) => /^backprint\./i.test(f)) ||
      covers[0];
    const fronts = files.filter((f) => !covers.includes(f));
    const numeric = fronts.filter((f) => /^\d+\./.test(f));
    const extra = fronts.filter((f) => !numeric.includes(f));
    const max = Math.max(0, ...numeric.map((f) => parseInt(f, 10)));
    const url = (f) => `/images/teks/${group.id}/${folder.name}/${f}`;
    const cards = [...numeric, ...extra].map((file, i) => ({
      id: `${folder.name}-${/^\d+\./.test(file) ? parseInt(file, 10) : path.parse(file).name}`,
      number:
        i < numeric.length ? parseInt(file, 10) : max + i - numeric.length + 1,
      image: url(file),
    }));
    if (new Set(cards.map((c) => c.id)).size !== cards.length)
      throw Error(`Duplicate card number: ${folder.name}`);
    catalog.push({
      id: folder.name,
      name: title(folder.name),
      category_id: group.id,
      cover: url(cover),
      status: 'published',
      cards,
    });
    const target = path.join(destination, group.id, folder.name);
    fs.mkdirSync(target, { recursive: true });
    for (const file of files)
      fs.copyFileSync(path.join(directory, file), path.join(target, file));
  }
}
fs.writeFileSync(
  path.join(app, 'lib/catalog.json'),
  JSON.stringify(catalog, null, 2) + '\n',
);
fs.writeFileSync(
  path.join(app, 'lib/categories.json'),
  JSON.stringify(groups, null, 2) + '\n',
);
for (const group of groups) {
  const sets = catalog.filter((s) => s.category_id === group.id);
  console.log(
    `${group.name}: ${sets.length} sets, ${sets.reduce((n, s) => n + s.cards.length, 0)} cards`,
  );
}
