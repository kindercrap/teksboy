import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Reuse the archive catalogs; never crawl unrelated uploads or private records.
const root = process.cwd();
const read = async (name) =>
  JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const base = await read('lib/catalog.json');
const exported = await read('supabase/import/public-catalog.json');
const sets = new Map(base.map((s) => [s.id, s]));
for (const s of exported.collections) sets.set(s.id, s);
const groups = new Map(
  (await read('lib/categories.json')).map((g) => [g.id, g]),
);
for (const g of exported.groups) groups.set(g.id, g);
const entries = [];
for (const set of sets.values()) {
  if (
    set.status !== 'published' ||
    groups.get(set.category_id)?.status === 'draft' ||
    groups.get(set.category_id)?.status === 'archived'
  )
    continue;
  const paths = new Set([
    set.cover,
    ...(set.backprints || []).map((b) => b.image_path),
  ]);
  // Only discover siblings in a set-specific folder, never a shared upload folder.
  if (set.cover?.startsWith('/images/teks/')) {
    const directory = path.posix.dirname(set.cover);
    for (const file of await fs.readdir(path.join(root, 'public', directory))) {
      if (/^backprint(?:[-_.].*)?\.(webp|png|jpe?g|avif)$/i.test(file))
        paths.add(directory + '/' + file);
    }
  }
  for (const image_path of paths) {
    if (!image_path) continue;
    if (!image_path.startsWith('/images/'))
      throw Error(`Export scanner asset to /images/ first: ${image_path}`);
    const absolute = path.resolve(root, 'public', '.' + image_path);
    if (!absolute.startsWith(path.resolve(root, 'public', 'images') + path.sep))
      throw Error('Invalid backprint path');
    const pixels = await sharp(absolute)
      .rotate()
      .flatten({ background: '#fff' })
      .resize(32, 32, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const gray = Buffer.alloc(1024);
    for (let i = 0; i < 1024; i++) {
      const j = i * pixels.info.channels;
      gray[i] = Math.round(
        0.299 * pixels.data[j] +
          0.587 * pixels.data[j + 1] +
          0.114 * pixels.data[j + 2],
      );
    }
    entries.push({
      set_id: set.id,
      set_slug: set.id,
      set_title: set.name,
      image_path,
      print_variant:
        set.backprints?.find((b) => b.image_path === image_path)
          ?.print_variant ||
        path.posix.basename(image_path).replace(/\.[^.]+$/, ''),
      signature: gray.toString('base64'),
    });
  }
}
await fs.writeFile(
  path.join(root, 'public/backprint-index.json'),
  JSON.stringify({ version: 1, size: 32, entries }),
);
console.log(
  `Indexed ${entries.length} backprint variants across ${new Set(entries.map((e) => e.set_id)).size} sets.`,
);
