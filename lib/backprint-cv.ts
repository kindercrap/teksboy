import type * as OpenCV from '@techstark/opencv-js';
import {
  bytes,
  encodeBytes,
  correlation,
  shortlist,
  classifyCandidates,
  type FeatureData,
  type BackprintIndex,
  type CandidateScore,
} from './backprint-matcher.ts';
export type Cv = typeof OpenCV;
export type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
// Every scope owns its Mats/vectors/algorithms, including exception paths.
class CvScope {
  private objects: { delete(): void }[] = [];
  own<T extends { delete(): void }>(object: T): T {
    this.objects.push(object);
    return object;
  }
  close() {
    for (const item of this.objects.reverse()) item.delete();
    this.objects = [];
  }
}
function normalized(cv: Cv, source: OpenCV.Mat, scope: CvScope) {
  const gray = scope.own(new cv.Mat());
  if (source.channels() === 1) source.copyTo(gray);
  else cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
  const resized = scope.own(new cv.Mat());
  const scale = 560 / Math.max(gray.cols, gray.rows);
  cv.resize(
    gray,
    resized,
    new cv.Size(Math.round(gray.cols * scale), Math.round(gray.rows * scale)),
    0,
    0,
    cv.INTER_AREA,
  );
  const out = scope.own(new cv.Mat()),
    clahe = scope.own(new cv.CLAHE(2, new cv.Size(8, 8)));
  clahe.apply(resized, out);
  return out;
}
function thumbnail(
  cv: Cv,
  gray: OpenCV.Mat,
  width: number,
  height: number,
  scope: CvScope,
) {
  const small = scope.own(new cv.Mat());
  cv.resize(gray, small, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
  return new Uint8Array(small.data);
}
function extract(cv: Cv, gray: OpenCV.Mat, scope: CvScope) {
  const orb = scope.own(
    new cv.ORB(800, 1.2, 8, 15, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12),
  );
  const keypoints = scope.own(new cv.KeyPointVector()),
    descriptors = scope.own(new cv.Mat()),
    mask = scope.own(new cv.Mat());
  orb.detectAndCompute(gray, mask, keypoints, descriptors);
  const points: number[] = [];
  for (let i = 0; i < keypoints.size(); i++) {
    const p = keypoints.get(i).pt;
    points.push(p.x, p.y);
  }
  return { points, descriptors };
}
export function referenceFeatures(
  cv: Cv,
  rgba: Uint8Array,
  width: number,
  height: number,
) {
  const scope = new CvScope();
  try {
    const source = scope.own(cv.matFromArray(height, width, cv.CV_8UC4, rgba));
    const gray = normalized(cv, source, scope),
      f = extract(cv, gray, scope);
    // Spatially distributed landmarks are more useful than one dense artwork patch.
    const chosen: number[] = [];
    for (let gy = 0; gy < 6; gy++)
      for (let gx = 0; gx < 4; gx++) {
        let winner = -1,
          best = Infinity;
        for (let i = 0; i < f.points.length / 2; i++) {
          if (chosen.includes(i)) continue;
          const x = f.points[2 * i] / gray.cols,
            y = f.points[2 * i + 1] / gray.rows;
          const distance =
            (x - (gx + 0.5) / 4) ** 2 + (y - (gy + 0.5) / 6) ** 2;
          if (distance < best) {
            best = distance;
            winner = i;
          }
        }
        if (winner >= 0) chosen.push(winner);
      }
    const sketch = new Uint8Array(chosen.length * 32);
    chosen.forEach((row, i) =>
      sketch.set(f.descriptors.data.subarray(row * 32, row * 32 + 32), i * 32),
    );
    const features: FeatureData = {
      points: f.points.map((v) => Math.round(v * 100) / 100),
      descriptors: encodeBytes(f.descriptors.data),
      rows: f.descriptors.rows,
      width: gray.cols,
      height: gray.rows,
      gray: encodeBytes(thumbnail(cv, gray, 64, 96, scope)),
    };
    return {
      signature: encodeBytes(thumbnail(cv, gray, 32, 32, scope)),
      sketch: encodeBytes(sketch),
      features,
    };
  } finally {
    scope.close();
  }
}
function ordered(points: Point[]): Point[] {
  const center = {
    x: points.reduce((a, p) => a + p.x, 0) / 4,
    y: points.reduce((a, p) => a + p.y, 0) / 4,
  };
  const cycle = [...points].sort(
    (a, b) =>
      Math.atan2(a.y - center.y, a.x - center.x) -
      Math.atan2(b.y - center.y, b.x - center.x),
  );
  const start = cycle.reduce(
    (best, p, i) => (p.x + p.y < cycle[best].x + cycle[best].y ? i : best),
    0,
  );
  return [...cycle.slice(start), ...cycle.slice(0, start)];
}
function findCard(cv: Cv, gray: OpenCV.Mat, region: Rect, scope: CvScope) {
  const blurred = scope.own(new cv.Mat()),
    edges = scope.own(new cv.Mat()),
    contours = scope.own(new cv.MatVector()),
    hierarchy = scope.own(new cv.Mat());
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edges, 35, 110);
  const kernel = scope.own(cv.Mat.ones(3, 3, cv.CV_8U));
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
  cv.findContours(
    edges,
    contours,
    hierarchy,
    cv.RETR_LIST,
    cv.CHAIN_APPROX_SIMPLE,
  );
  let best: Point[] | null = null,
    bestArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i),
      poly = new cv.Mat();
    try {
      const area = cv.contourArea(contour),
        fraction = area / (region.width * region.height);
      if (fraction < 0.42 || fraction > 1.5 || area <= bestArea) continue;
      cv.approxPolyDP(contour, poly, 0.025 * cv.arcLength(contour, true), true);
      if (poly.rows !== 4 || !cv.isContourConvex(poly)) continue;
      const points = ordered(
        Array.from({ length: 4 }, (_, j) => ({
          x: poly.data32S[j * 2],
          y: poly.data32S[j * 2 + 1],
        })),
      );
      const cx = points.reduce((a, p) => a + p.x, 0) / 4,
        cy = points.reduce((a, p) => a + p.y, 0) / 4;
      if (
        Math.abs(cx - region.x - region.width / 2) > region.width * 0.18 ||
        Math.abs(cy - region.y - region.height / 2) > region.height * 0.18
      )
        continue;
      const lengths = points.map((p, j) =>
        Math.hypot(p.x - points[(j + 1) % 4].x, p.y - points[(j + 1) % 4].y),
      );
      const ratio =
        Math.min(lengths[0] + lengths[2], lengths[1] + lengths[3]) /
        Math.max(lengths[0] + lengths[2], lengths[1] + lengths[3]);
      if (ratio < 0.45 || ratio > 0.85 || Math.min(...lengths) < 60) continue;
      best = points;
      bestArea = area;
    } finally {
      poly.delete();
      contour.delete();
    }
  }
  return best;
}
function preprocess(
  cv: Cv,
  rgba: Uint8Array,
  width: number,
  height: number,
  region: Rect,
  scope: CvScope,
) {
  const source = scope.own(cv.matFromArray(height, width, cv.CV_8UC4, rgba)),
    gray = scope.own(new cv.Mat());
  cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
  const crop = scope.own(
    gray.roi(new cv.Rect(region.x, region.y, region.width, region.height)),
  );
  const fallback = normalized(cv, crop, scope);
  const corners = findCard(cv, gray, region, scope);
  let corrected: OpenCV.Mat | null = null;
  if (corners) {
    const from = scope.own(
      cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        corners.flatMap((p) => [p.x, p.y]),
      ),
    );
    const to = scope.own(
      cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 319, 0, 319, 479, 0, 479]),
    );
    const transform = scope.own(cv.getPerspectiveTransform(from, to)),
      flat = scope.own(new cv.Mat());
    cv.warpPerspective(
      gray,
      flat,
      transform,
      new cv.Size(320, 480),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
    );
    corrected = normalized(cv, flat, scope);
  }
  const lap = scope.own(new cv.Mat()),
    mean = scope.own(new cv.Mat()),
    std = scope.own(new cv.Mat());
  cv.Laplacian(crop, lap, cv.CV_64F);
  cv.meanStdDev(lap, mean, std);
  return { fallback, corrected, corners, sharpness: std.doubleAt(0, 0) ** 2 };
}
function verify(
  cv: Cv,
  query: OpenCV.Mat,
  q: ReturnType<typeof extract>,
  reference: FeatureData,
  scope: CvScope,
) {
  const descriptors = scope.own(
    cv.matFromArray(reference.rows, 32, cv.CV_8U, bytes(reference.descriptors)),
  );
  const matcher = scope.own(new cv.BFMatcher(cv.NORM_HAMMING, false)),
    matches = scope.own(new cv.DMatchVectorVector());
  const source: number[] = [],
    target: number[] = [],
    distances: number[] = [],
    unique = new Set<number>();
  if (q.descriptors.rows < 2 || descriptors.rows < 2) return null;
  matcher.knnMatch(q.descriptors, descriptors, matches, 2);
  for (let i = 0; i < matches.size(); i++) {
    const pair = matches.get(i);
    try {
      if (pair.size() < 2) continue;
      const a = pair.get(0),
        b = pair.get(1);
      if (
        a.distance >= 68 ||
        a.distance >= 0.78 * b.distance ||
        unique.has(a.trainIdx)
      )
        continue;
      unique.add(a.trainIdx);
      source.push(q.points[a.queryIdx * 2], q.points[a.queryIdx * 2 + 1]);
      target.push(
        reference.points[a.trainIdx * 2],
        reference.points[a.trainIdx * 2 + 1],
      );
      distances.push(a.distance);
    } finally {
      pair.delete();
    }
  }
  const good = distances.length;
  if (good < 6) return null;
  const from = scope.own(cv.matFromArray(good, 1, cv.CV_32FC2, source)),
    to = scope.own(cv.matFromArray(good, 1, cv.CV_32FC2, target)),
    mask = scope.own(new cv.Mat());
  const homography = scope.own(
    cv.findHomography(from, to, cv.RANSAC, 4, mask, 1500, 0.995),
  );
  if (homography.empty()) return null;
  const inlierPoints: Point[] = [];
  let inliers = 0;
  for (let i = 0; i < good; i++)
    if (mask.data[i]) {
      inliers++;
      inlierPoints.push({ x: target[2 * i], y: target[2 * i + 1] });
    }
  const hullInput = scope.own(
      cv.matFromArray(
        inliers,
        1,
        cv.CV_32FC2,
        inlierPoints.flatMap((p) => [p.x, p.y]),
      ),
    ),
    hull = scope.own(new cv.Mat());
  if (inliers < 4) return null;
  cv.convexHull(hullInput, hull);
  const coverage =
    Math.abs(cv.contourArea(hull)) / (reference.width * reference.height);
  // Homography must map the reference to one plausible convex card, not a tiny
  // coincidental patch, folded polygon or enormous off-screen projection.
  const inverse = scope.own(homography.inv(cv.DECOMP_LU)),
    refCorners = scope.own(
      cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        reference.width,
        0,
        reference.width,
        reference.height,
        0,
        reference.height,
      ]),
    ),
    projected = scope.own(new cv.Mat());
  cv.perspectiveTransform(refCorners, projected, inverse);
  const polygon = Array.from(projected.data32F),
    area = Math.abs(cv.contourArea(projected)),
    relative = area / (query.cols * query.rows);
  const geometry =
    cv.isContourConvex(projected) &&
    polygon.every(Number.isFinite) &&
    relative > 0.15 &&
    relative < 2.5 &&
    polygon.every(
      (p, i) =>
        p > -(i % 2 ? query.rows : query.cols) * 0.4 &&
        p < (i % 2 ? query.rows : query.cols) * 1.4,
    );
  const aligned = scope.own(new cv.Mat());
  cv.warpPerspective(
    query,
    aligned,
    homography,
    new cv.Size(reference.width, reference.height),
  );
  const similarity = correlation(
    thumbnail(cv, aligned, 64, 96, scope),
    bytes(reference.gray),
  );
  return {
    good,
    inliers,
    inlierRatio: inliers / good,
    coverage,
    aligned: similarity,
    geometry,
  };
}
export async function recognizeBackprint(
  cv: Cv,
  rgba: Uint8Array,
  width: number,
  height: number,
  region: Rect,
  index: BackprintIndex,
  load: (path: string) => Promise<FeatureData>,
) {
  const scope = new CvScope(),
    started = performance.now();
  try {
    const prep = preprocess(cv, rgba, width, height, region, scope);
    const images = prep.corrected
      ? [prep.corrected, prep.fallback]
      : [prep.fallback];
    const queries = images.map((gray) => ({
      gray,
      ...extract(cv, gray, scope),
    }));
    const candidates = shortlist(
      index,
      images.map((gray) => thumbnail(cv, gray, 32, 32, scope)),
      queries[queries.length - 1].descriptors.data,
    );
    const scores: CandidateScore[] = [];
    const refs = await Promise.all(
      candidates.map((row) => load(row.entry.feature_path)),
    );
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      let best: Omit<CandidateScore, 'entry' | 'appearance'> | null = null;
      for (const query of queries) {
        const verificationScope = new CvScope();
        try {
          const v = verify(cv, query.gray, query, refs[i], verificationScope);
          if (!v) continue;
          const score =
            0.35 * Math.min(1, v.inliers / 45) +
            0.2 * v.inlierRatio +
            0.15 * Math.min(1, v.coverage / 0.45) +
            0.25 * Math.max(0, v.aligned) +
            0.05 * Math.max(0, candidate.appearance);
          if (!best || score > best.score) best = { ...v, score };
        } finally {
          verificationScope.close();
        }
      }
      if (best)
        for (const entry of candidate.entries)
          scores.push({ entry, appearance: candidate.appearance, ...best });
    }
    const result = classifyCandidates(scores);
    return {
      result,
      diagnostics: {
        contourDetected: !!prep.corners,
        corners: prep.corners,
        perspectiveCorrected: !!prep.corrected,
        frameFallback: !prep.corrected,
        sharpness: prep.sharpness,
        dimensions: images.map((m) => [m.cols, m.rows]),
        candidates: candidates.map((c) => ({
          name: c.entry.set_title,
          appearance: c.appearance,
          sketch: c.sketch,
        })),
        scores: scores.map(({ entry, ...score }) => ({
          name: entry.set_title,
          set_id: entry.set_id,
          ...score,
        })),
        classification: result.matches[0]?.high
          ? 'strong'
          : result.matches.length
            ? 'possible'
            : 'none',
        milliseconds: Math.round(performance.now() - started),
      },
    };
  } finally {
    scope.close();
  }
}
