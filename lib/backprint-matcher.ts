export type BackprintEntry = {
  set_id: string;
  set_slug: string;
  set_title: string;
  image_path: string;
  print_variant: string;
  signature: string;
};
export type BackprintIndex = {
  version: number;
  size: number;
  entries: BackprintEntry[];
};
export type BackprintMatch = BackprintEntry & { score: number; high: boolean };
export type ScanResult = { matches: BackprintMatch[]; issue?: string };
const N = 32;
function normalized(values: ArrayLike<number>) {
  const mean = Array.from(values).reduce((a, b) => a + b, 0) / values.length;
  const out = Float32Array.from(values, (v) => v - mean);
  const norm = Math.sqrt(out.reduce((a, b) => a + b * b, 0));
  return out.map((v) => (norm > 0 ? v / norm : 0));
}
function descriptor(pixels: ArrayLike<number>) {
  const edges = [];
  // Central differences verify spatial details as well as overall tonal layout.
  for (let y = 1; y < N - 1; y++)
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      edges.push(pixels[i + 1] - pixels[i - 1], pixels[i + N] - pixels[i - N]);
    }
  return { tone: normalized(pixels), edges: normalized(edges) };
}
function dot(a: Float32Array, b: Float32Array) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
function sample(
  pixels: Uint8Array,
  side: number,
  angle: number,
  scale: number,
  perspective: number,
) {
  const out = new Float32Array(N * N),
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = ((y + 0.5) / N - 0.5) * scale,
        u = ((x + 0.5) / N - 0.5) * scale * (1 + perspective * v * 2);
      const sx = Math.max(
        0,
        Math.min(side - 1, (u * cos - v * sin + 0.5) * side - 0.5),
      );
      const sy = Math.max(
        0,
        Math.min(side - 1, (u * sin + v * cos + 0.5) * side - 0.5),
      );
      const ix = Math.floor(sx),
        iy = Math.floor(sy),
        fx = sx - ix,
        fy = sy - iy;
      const right = Math.min(ix + 1, side - 1),
        bottom = Math.min(iy + 1, side - 1);
      out[y * N + x] =
        (pixels[iy * side + ix] * (1 - fx) + pixels[iy * side + right] * fx) *
          (1 - fy) +
        (pixels[bottom * side + ix] * (1 - fx) +
          pixels[bottom * side + right] * fx) *
          fy;
    }
  return out;
}
export function matchBackprint(
  pixels: Uint8Array,
  side: number,
  index: BackprintIndex,
): ScanResult {
  if (index.version !== 1 || index.size !== N || !index.entries.length)
    throw Error('The backprint index is unavailable. Please try again later.');
  if (pixels.length !== side * side || side < N)
    throw Error('Invalid scan image.');
  const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  const deviation = Math.sqrt(
    pixels.reduce((a, b) => a + (b - mean) ** 2, 0) / pixels.length,
  );
  if (mean < 25)
    return {
      matches: [],
      issue: 'This photo is too dark. Try brighter, even lighting.',
    };
  if (mean > 242 || deviation < 12)
    return {
      matches: [],
      issue: 'Too little detail is visible. Check focus, lighting, and glare.',
    };
  const refs = index.entries.map((entry) => {
    const decoded = Uint8Array.from(atob(entry.signature), (c) =>
      c.charCodeAt(0),
    );
    if (decoded.length !== N * N)
      throw Error('The backprint index needs rebuilding.');
    return { entry, ...descriptor(decoded) };
  });
  const best = new Map<string, BackprintMatch>();
  for (let turn = 0; turn < 4; turn++)
    for (const degrees of [-8, -4, 0, 4, 8])
      for (const scale of [1, 0.94, 0.86])
        for (const perspective of [0, -0.1, 0.1]) {
          const query = descriptor(
            sample(
              pixels,
              side,
              (turn * Math.PI) / 2 + (degrees * Math.PI) / 180,
              scale,
              perspective,
            ),
          );
          for (const ref of refs) {
            const tone = dot(query.tone, ref.tone);
            if (tone < 0.72) continue;
            const edge = dot(query.edges, ref.edges),
              score = 0.75 * tone + 0.25 * edge;
            if (edge < 0.35 || score < 0.67) continue;
            if (score > (best.get(ref.entry.set_id)?.score ?? 0))
              best.set(ref.entry.set_id, { ...ref.entry, score, high: false });
          }
        }
  const matches = [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (matches[0])
    matches[0].high =
      matches[0].score >= 0.86 &&
      matches[0].score - (matches[1]?.score ?? 0) >= 0.07;
  return { matches };
}
