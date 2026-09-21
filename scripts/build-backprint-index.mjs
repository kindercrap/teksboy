import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import cvModule from '@techstark/opencv-js';
import { referenceFeatures } from '../lib/backprint-cv.ts';
import { resolveOpenCv } from '../lib/opencv-runtime.ts';
const { cv } = await resolveOpenCv(cvModule);
const root = process.cwd(),
  read = async (name) =>
    JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const base = await read('lib/catalog.json'),
  exported = await read('supabase/import/public-catalog.json');
const sets = new Map(base.map((s) => [s.id, s]));
for (const s of exported.collections) sets.set(s.id, s);
const groups = new Map(
  (await read('lib/categories.json')).map((g) => [g.id, g]),
);
for (const g of exported.groups) groups.set(g.id, g);
const featureDirectory = path.join(root, 'public/backprint-features');
await fs.mkdir(featureDirectory, { recursive: true });
const runtimeDirectory = path.join(root, 'public/scanner-runtime');
await fs.mkdir(runtimeDirectory, { recursive: true });
const require = createRequire(import.meta.url),
  runtime = require.resolve('@techstark/opencv-js');
const runtimeSource = await fs.readFile(runtime, 'utf8');
const wrapper = '}(this, function () {';
if (!runtimeSource.includes(wrapper))
  throw Error('Unexpected OpenCV wrapper; update the ESM adapter.');
await fs.writeFile(
  path.join(runtimeDirectory, 'opencv-4.12.0.mjs'),
  runtimeSource.replace(wrapper, '}(globalThis, function () {') +
    '\nexport default globalThis.cv;\n',
);
await fs.rm(path.join(runtimeDirectory, 'opencv-4.12.0.js'), { force: true });
await fs.copyFile(
  path.join(path.dirname(runtime), '../LICENSE'),
  path.join(runtimeDirectory, 'LICENSE-opencv-js.txt'),
);
const entries = [],
  cache = new Map();
for (const set of sets.values()) {
  const group = groups.get(set.category_id);
  if (
    set.status !== 'published' ||
    !group ||
    (group.status && group.status !== 'published')
  )
    continue;
  const paths = new Set([
    set.cover,
    ...(set.backprints || []).map((b) => b.image_path),
  ]);
  if (set.cover?.startsWith('/images/teks/')) {
    const directory = path.posix.dirname(set.cover);
    for (const file of await fs.readdir(path.join(root, 'public', directory)))
      if (/^backprint(?:[-_.].*)?\.(webp|png|jpe?g|avif)$/i.test(file))
        paths.add(directory + '/' + file);
  }
  for (const image_path of paths) {
    if (!image_path) continue;
    if (!image_path.startsWith('/images/'))
      throw Error(`Export scanner asset to /images/ first: ${image_path}`);
    const absolute = path.resolve(root, 'public', '.' + image_path);
    if (!absolute.startsWith(path.resolve(root, 'public/images') + path.sep))
      throw Error('Invalid backprint path');
    const input = await fs.readFile(absolute),
      hash = createHash('sha256')
        .update('opencv-4.12-orb800-clahe2-v2')
        .update(input)
        .digest('hex')
        .slice(0, 24);
    let generated = cache.get(hash);
    if (!generated) {
      const { data, info } = await sharp(input)
        .rotate()
        .resize({ width: 560, height: 560, fit: 'inside' })
        .flatten({ background: '#fff' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      generated = referenceFeatures(
        cv,
        new Uint8Array(data),
        info.width,
        info.height,
      );
      cache.set(hash, generated);
      await fs.writeFile(
        path.join(featureDirectory, hash + '.json'),
        JSON.stringify(generated.features),
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
      signature: generated.signature,
      sketch: generated.sketch,
      feature_path: '/backprint-features/' + hash + '.json',
    });
  }
}
await fs.writeFile(
  'public/backprint-index.json',
  JSON.stringify({ version: 2, size: 32, entries }),
);
console.log(
  `Indexed ${entries.length} backprints, ${cache.size} feature files, ${new Set(entries.map((e) => e.set_id)).size} sets (OpenCV ORB).`,
);
