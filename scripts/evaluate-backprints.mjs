import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import cvModule from '@techstark/opencv-js';
import { resolveOpenCv } from '../lib/opencv-runtime.ts';
import { recognizeBackprint } from '../lib/backprint-cv.ts';
// Local-only evaluation. Nothing is uploaded or copied into public/.
const manifestPath = process.argv[2];
if (!manifestPath)
  throw Error(
    'Usage: node --experimental-strip-types scripts/evaluate-backprints.mjs photos.json [report.json]',
  );
const cases = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const { cv } = await resolveOpenCv(cvModule),
  index = JSON.parse(await fs.readFile('public/backprint-index.json', 'utf8'));
const reports = [];
for (const sample of cases) {
  const file = path.resolve(path.dirname(manifestPath), sample.file);
  const { data, info } = await sharp(file)
    .rotate()
    .resize({ width: 720, height: 720, fit: 'inside' })
    .flatten({ background: '#fff' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Region values are fractions of the EXIF-oriented image dimensions.
  const box = sample.region || { x: 0, y: 0, width: 1, height: 1 };
  const region = {
    x: Math.round(box.x * info.width),
    y: Math.round(box.y * info.height),
    width: Math.round(box.width * info.width),
    height: Math.round(box.height * info.height),
  };
  const response = await recognizeBackprint(
    cv,
    new Uint8Array(data),
    info.width,
    info.height,
    region,
    index,
    async (asset) => JSON.parse(await fs.readFile('public' + asset, 'utf8')),
  );
  const expected = Array.isArray(sample.expected)
    ? sample.expected
    : [sample.expected];
  const pass =
    sample.expected === null
      ? !response.result.matches.length
      : response.result.matches.some((m) => expected.includes(m.set_id));
  reports.push({
    file: sample.file,
    expected: sample.expected,
    pass,
    predicted: response.result.matches,
    ...response.diagnostics,
  });
}
const output = JSON.stringify(
  {
    total: reports.length,
    passed: reports.filter((r) => r.pass).length,
    photos: reports,
  },
  null,
  2,
);
if (process.argv[3]) await fs.writeFile(process.argv[3], output + '\n');
else console.log(output);
if (reports.some((r) => !r.pass)) process.exitCode = 1;
