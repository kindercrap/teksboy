export type BackprintEntry = {
  set_id: string;
  set_slug: string;
  set_title: string;
  image_path: string;
  print_variant: string;
  signature: string;
  sketch: string;
  feature_path: string;
};
export type BackprintIndex = {
  version: 2;
  size: 32;
  entries: BackprintEntry[];
};
export type BackprintMatch = {
  set_id: string;
  set_title: string;
  image_path: string;
  print_variant: string;
  high: boolean;
};
export type ScanResult = { matches: BackprintMatch[]; issue?: string };
export type FeatureData = {
  points: number[];
  descriptors: string;
  rows: number;
  width: number;
  height: number;
  gray: string;
};
export type CandidateScore = {
  entry: BackprintEntry;
  appearance: number;
  good: number;
  inliers: number;
  inlierRatio: number;
  coverage: number;
  aligned: number;
  score: number;
  geometry: boolean;
};
export const bytes = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export function encodeBytes(value: Uint8Array) {
  let text = '';
  for (const byte of value) text += String.fromCharCode(byte);
  return btoa(text);
}
export function correlation(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length || !a.length) return 0;
  let ax = 0,
    bx = 0,
    aa = 0,
    bb = 0,
    ab = 0;
  for (let i = 0; i < a.length; i++) {
    ax += a[i];
    bx += b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
    ab += a[i] * b[i];
  }
  const denominator = Math.sqrt(
    Math.max(0, (aa - (ax * ax) / a.length) * (bb - (bx * bx) / a.length)),
  );
  return denominator > 1e-6 ? (ab - (ax * bx) / a.length) / denominator : 0;
}
const bitCount = Uint8Array.from({ length: 256 }, (_, x) => {
  let count = 0;
  for (; x; x &= x - 1) count++;
  return count;
});
// A tiny descriptor sketch rescues candidates whose layout is distorted by
// perspective/background. Full feature matching is reserved for the shortlist.
export function sketchSimilarity(query: Uint8Array, reference: Uint8Array) {
  let hits = 0,
    quality = 0;
  for (let r = 0; r < reference.length; r += 32) {
    let first = 257,
      second = 257;
    for (let q = 0; q < query.length; q += 32) {
      let distance = 0;
      for (let k = 0; k < 32; k++)
        distance += bitCount[reference[r + k] ^ query[q + k]];
      if (distance < first) {
        second = first;
        first = distance;
      } else if (distance < second) second = distance;
    }
    if (first < 70 && first < second * 0.84) {
      hits++;
      quality += 1 - first / 100;
    }
  }
  return { hits, quality };
}
function rotated(pixels: Uint8Array, turns: number) {
  let result = pixels;
  for (let t = 0; t < turns; t++) {
    const next = new Uint8Array(1024);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) next[y * 32 + x] = result[(31 - x) * 32 + y];
    result = next;
  }
  return result;
}
export function shortlist(
  index: BackprintIndex,
  signatures: Uint8Array[],
  queryDescriptors: Uint8Array,
) {
  if (index.version !== 2 || index.size !== 32 || !index.entries.length)
    throw Error(
      'No compatible backprints are available. Please try again later.',
    );
  const views = signatures.flatMap((s) =>
    [0, 1, 2, 3].map((t) => rotated(s, t)),
  );
  const candidates = index.entries.map((entry) => {
    const reference = bytes(entry.signature);
    const appearance = Math.max(...views.map((s) => correlation(s, reference)));
    const sketch = sketchSimilarity(queryDescriptors, bytes(entry.sketch));
    return { entry, appearance, sketch: sketch.quality };
  });
  // Union rather than an appearance gate: a low pixel score cannot veto local features.
  const selected = new Map<string, (typeof candidates)[number]>();
  const unique = [
    ...new Map(candidates.map((c) => [c.entry.feature_path, c])).values(),
  ];
  for (const row of [...unique].sort((a, b) => b.sketch - a.sketch).slice(0, 8))
    selected.set(row.entry.feature_path, row);
  for (const row of [...unique]
    .sort((a, b) => b.appearance - a.appearance)
    .slice(0, 4))
    selected.set(row.entry.feature_path, row);
  return [...selected.values()].map((row) => ({
    ...row,
    entries: candidates
      .filter((c) => c.entry.feature_path === row.entry.feature_path)
      .map((c) => c.entry),
  }));
}
export function classifyCandidates(candidates: CandidateScore[]): ScanResult {
  const best = new Map<string, CandidateScore>();
  for (const c of candidates) {
    // Require a coherent planar match over a meaningful area, never just rank 1.
    if (
      !c.geometry ||
      c.inliers < 9 ||
      c.inlierRatio < 0.36 ||
      c.coverage < 0.09 ||
      c.aligned < 0.3
    )
      continue;
    if (c.score > (best.get(c.entry.set_id)?.score ?? -1))
      best.set(c.entry.set_id, c);
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top) return { matches: [] };
  // Compare against all geometrically plausible competitors, including those
  // narrowly below the display threshold, before claiming a strong result.
  const runner = Math.max(
    0,
    ...candidates
      .filter(
        (c) =>
          c.entry.set_id !== top.entry.set_id && c.geometry && c.inliers >= 6,
      )
      .map((c) => c.score),
  );
  const strong =
    top.inliers >= 18 &&
    top.inlierRatio >= 0.5 &&
    top.coverage >= 0.18 &&
    top.aligned >= 0.52 &&
    top.score - runner >= 0.12;
  return {
    matches: ranked
      .filter((c) => c.score >= top.score - 0.22)
      .slice(0, 3)
      .map((c, i) => ({
        set_id: c.entry.set_id,
        set_title: c.entry.set_title,
        image_path: c.entry.image_path,
        print_variant: c.entry.print_variant,
        high: i === 0 && strong,
      })),
  };
}
