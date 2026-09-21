import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import cvModule from '@techstark/opencv-js';
import { resolveOpenCv } from '../lib/opencv-runtime.ts';
import { recognizeBackprint } from '../lib/backprint-cv.ts';
import { classifyCandidates } from '../lib/backprint-matcher.ts';
import { cameraReadiness, coverCrop } from '../lib/backprint-camera.ts';
const { cv } = await resolveOpenCv(cvModule);
const index = JSON.parse(
  await fs.readFile('public/backprint-index.json', 'utf8'),
);
const load = async (path) =>
  JSON.parse(await fs.readFile('public' + path, 'utf8'));
const width = 576,
  height = 720,
  region = { x: 115, y: 65, width: 346, height: 519 };
async function fixture(
  entry,
  { angle = true, lighting = false, blur = false } = {},
) {
  let image = sharp('public' + entry.image_path)
    .resize(320, 480, { fit: 'fill' })
    .flatten({ background: '#fff' })
    .ensureAlpha();
  if (lighting) image = image.modulate({ brightness: 0.65, saturation: 0.55 });
  if (blur) image = image.blur(0.8);
  const data = await image.raw().toBuffer();
  const src = cv.matFromArray(480, 320, cv.CV_8UC4, data),
    out = new cv.Mat();
  const a = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    [0, 0, 319, 0, 319, 479, 0, 479],
  );
  const b = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    angle
      ? [137, 97, 427, 75, 451, 575, 107, 558]
      : [122, 78, 449, 78, 449, 571, 122, 571],
  );
  const transform = cv.getPerspectiveTransform(a, b);
  try {
    cv.warpPerspective(
      src,
      out,
      transform,
      new cv.Size(width, height),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(68, 51, 39, 255),
    );
    const pixels = new Uint8Array(out.data);
    // Spatial lighting variation, not just a global brightness offset.
    if (lighting)
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          for (let c = 0; c < 3; c++)
            pixels[(y * width + x) * 4 + c] *= 0.65 + (0.35 * x) / width;
    return pixels;
  } finally {
    src.delete();
    out.delete();
    a.delete();
    b.delete();
    transform.delete();
  }
}
void test('index maps full paths, variants, and content-addressed feature files', async () => {
  assert.equal(index.version, 2);
  assert.equal(
    new Set(index.entries.map((e) => e.set_id + '|' + e.image_path)).size,
    index.entries.length,
  );
  assert.ok(
    index.entries.filter((e) => e.image_path.endsWith('/backprint.webp'))
      .length > 10,
  );
  for (const entry of index.entries) {
    const ref = await load(entry.feature_path);
    assert.equal(Buffer.from(ref.descriptors, 'base64').length, ref.rows * 32);
  }
});
void test('synthetic perspective/background/lighting stress cases shortlist and identify known sets (not real-photo validation)', async () => {
  const ids = [
    'yuyuhakusho-dbest40',
    'yuyuhakusho-yellow-border-first-print',
    'yuyuhakusho-deluxe-first-print',
  ];
  for (const id of ids) {
    const entry = index.entries.find((e) => e.set_id === id);
    assert.ok(entry, id);
    const response = await recognizeBackprint(
      cv,
      await fixture(entry, { lighting: true, blur: true }),
      width,
      height,
      region,
      index,
      load,
    );
    console.log(
      JSON.stringify({
        fixture: 'synthetic',
        expected: id,
        classification: response.diagnostics.classification,
        contour: response.diagnostics.contourDetected,
        scores: response.diagnostics.scores
          .sort((a, b) => b.score - a.score)
          .slice(0, 3),
      }),
    );
    assert.ok(
      response.result.matches.some((m) => m.set_id === id),
      JSON.stringify(response.diagnostics),
    );
    if (id === 'yuyuhakusho-deluxe-first-print') {
      assert.equal(response.result.matches[0].high, false);
      assert.deepEqual(new Set(response.result.matches.map(m => m.set_id)), new Set([
        'yuyuhakusho-deluxe-first-print', 'yuyuhakusho-deluxe-2nd-print', 'yuyuhakusho-deluxe-reprint',
      ]));
    }
  }
});
void test('frame crop still runs recognition when no card contour can be found', async () => {
  const entry = index.entries.find((e) => e.set_id === 'yuyuhakusho-dbest40');
  const raw = await sharp('public' + entry.image_path)
    .resize(346, 519, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const response = await recognizeBackprint(
    cv,
    new Uint8Array(raw),
    346,
    519,
    { x: 0, y: 0, width: 346, height: 519 },
    index,
    load,
  );
  assert.equal(response.diagnostics.frameFallback, true);
  assert.ok(response.result.matches.some((m) => m.set_id === entry.set_id));
});
void test('blank, dark and unrelated images never force a candidate', async () => {
  for (const source of [
    { create: { width: 576, height: 720, channels: 4, background: '#111' } },
    'public/images/collection-group/zenki.png',
    'public/images/collection-group/ultraman.png',
  ]) {
    const raw = await sharp(source)
      .resize(width, height, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const response = await recognizeBackprint(
      cv,
      new Uint8Array(raw),
      width,
      height,
      region,
      index,
      load,
    );
    assert.equal(response.result.matches.length, 0);
  }
});
void test('identical print artwork stays ambiguous across sets, but variants deduplicate within a set', () => {
  const entry = index.entries[0];
  const score = {
    entry,
    appearance: 0.7,
    good: 42,
    inliers: 35,
    inlierRatio: 0.83,
    coverage: 0.4,
    aligned: 0.8,
    score: 0.88,
    geometry: true,
  };
  const result = classifyCandidates([
    score,
    { ...score, entry: { ...entry, image_path: '/variant.webp' } },
    { ...score, entry: { ...entry, set_id: 'other' } },
  ]);
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[0].high, false);
  assert.equal(
    classifyCandidates([{ ...score, inliers: 5 }]).matches.length,
    0,
  );
});
void test('capture readiness is separate from recognition and video cover mapping is centered', () => {
  const blank = new Uint8Array(96 * 144).fill(10);
  assert.equal(cameraReadiness(blank, 96, 144, blank).usable, false);
  const detail = Uint8Array.from(
    { length: 96 * 144 },
    (_, i) => 30 + ((i * 47) % 180),
  );
  assert.equal(cameraReadiness(detail, 96, 144).stable, false);
  assert.equal(cameraReadiness(detail, 96, 144, detail).stable, true);
  const crop = coverCrop(1920, 1080, 320, 400);
  assert.equal(crop.height, 1080);
  assert.equal(crop.width, 864);
  assert.equal(crop.x, 528);
});
