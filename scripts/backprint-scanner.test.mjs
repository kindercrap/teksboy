import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { matchBackprint } from '../lib/backprint-matcher.ts';
const index = JSON.parse(
  await fs.readFile('public/backprint-index.json', 'utf8'),
);
async function scan(image, target = index) {
  const { data, info } = await image
    .flatten({ background: '#fff' })
    .resize(192, 192, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const gray = new Uint8Array(192 * 192);
  for (let i = 0; i < gray.length; i++)
    gray[i] = Math.round(
      0.299 * data[i * info.channels] +
        0.587 * data[i * info.channels + 1] +
        0.114 * data[i * info.channels + 2],
    );
  return matchBackprint(gray, 192, target);
}
const example =
  index.entries.find((e) => e.set_id === 'yuyuhakusho-dbest40') ||
  index.entries[0];
const source = 'public' + example.image_path;
void test('full-path indexing includes variants without duplicate identities', () => {
  assert.equal(
    new Set(index.entries.map((e) => e.set_id + '|' + e.image_path)).size,
    index.entries.length,
  );
  assert.ok(
    index.entries.filter((e) => e.image_path.endsWith('/backprint.webp'))
      .length > 10,
  );
  assert.ok(
    index.entries.some((e) => e.image_path.includes('backprint-reprint')),
  );
});
void test('known backprint survives compression, resize, rotation, lighting and mild blur', async () => {
  const inputs = [
    sharp(source),
    sharp(source).rotate(90),
    sharp(source).rotate(180),
    sharp(source).modulate({ brightness: 0.65 }),
    sharp(await sharp(source).resize(280).jpeg({ quality: 40 }).toBuffer()),
    sharp(source).blur(1),
  ];
  for (const image of inputs) {
    const result = await scan(image);
    assert.equal(
      result.matches[0]?.set_id,
      example.set_id,
      JSON.stringify(result),
    );
  }
});
void test('small rotation with a surrounding margin remains a possible match', async () => {
  const image = await sharp(source)
    .resize(350, 450, { fit: 'fill' })
    .rotate(4, { background: '#bbb' })
    .toBuffer();
  const result = await scan(sharp(image));
  assert.equal(result.matches[0]?.set_id, example.set_id);
});
void test('dark, blank, and unrelated pictures do not force a match', async () => {
  for (const value of [5, 128, 255])
    assert.equal(
      matchBackprint(new Uint8Array(192 * 192).fill(value), 192, index).matches
        .length,
      0,
    );
  const noise = new Uint8Array(192 * 192);
  let seed = 7;
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    noise[i] = seed >>> 24;
  }
  assert.equal(matchBackprint(noise, 192, index).matches.length, 0);
  for (const file of [
    'public/images/collection-group/zenki.png',
    'public/images/collection-group/ultraman.png',
  ]) {
    assert.equal((await scan(sharp(file))).matches.length, 0, file);
  }
});
void test('identical references on different sets remain ambiguous; variants deduplicate by set', async () => {
  const duplicate = { ...example, set_id: 'other-set' };
  const results = await scan(sharp(source), {
    ...index,
    entries: [example, { ...example, image_path: '/variant.webp' }, duplicate],
  });
  assert.equal(results.matches.length, 2);
  assert.equal(results.matches[0].high, false);
});
void test('invalid index and malformed image report errors', () => {
  assert.throws(() =>
    matchBackprint(new Uint8Array(1024), 32, { ...index, version: 99 }),
  );
  assert.throws(() => matchBackprint(new Uint8Array(3), 192, index));
});
