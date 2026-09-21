import { resolveOpenCv } from './opencv-runtime';
import type { Cv, Rect } from './backprint-cv';
import { recognizeBackprint } from './backprint-cv';
import type { BackprintIndex, FeatureData } from './backprint-matcher';
let initialization: Promise<{ cv: Cv }> | undefined;
const features = new Map<string, FeatureData>();
async function loadCv() {
  return (initialization ??= (async () => {
    // The generated ESM wrapper works in Vite's development module workers
    // and the production worker without eval or an external CDN.
    const runtimeUrl = '/scanner-runtime/opencv-4.12.0.mjs';
    const runtimeModule = await import(/* @vite-ignore */ runtimeUrl);
    const { cv } = await resolveOpenCv(runtimeModule.default);
    if (!cv?.Mat || !cv.ORB || !cv.findHomography)
      throw Error('OpenCV could not initialize. Please try again.');
    return { cv };
  })().catch((error) => {
    initialization = undefined;
    throw error;
  }));
}
async function loadFeatures(path: string) {
  if (!/^\/backprint-features\/[a-f0-9]{24}\.json$/.test(path))
    throw Error('Invalid scanner reference.');
  const cached = features.get(path);
  if (cached) return cached;
  const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
  if (!response.ok)
    throw Error(
      'Could not load scanner references. Check your connection and try again.',
    );
  const data = (await response.json()) as FeatureData;
  if (features.size >= 24) features.delete(features.keys().next().value!);
  features.set(path, data);
  return data;
}
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    kind: 'init' | 'scan';
    rgba?: Uint8Array;
    width?: number;
    height?: number;
    region?: Rect;
    index?: BackprintIndex;
  }>,
) => {
  const { id, kind } = event.data;
  try {
    const { cv } = await loadCv();
    if (kind === 'init') {
      self.postMessage({ id, ready: true });
      return;
    }
    const { rgba, width, height, region, index } = event.data;
    if (!rgba || !width || !height || !region || !index)
      throw Error('Invalid camera frame.');
    const { result, diagnostics } = await recognizeBackprint(
      cv,
      rgba,
      width,
      height,
      region,
      index,
      loadFeatures,
    );
    self.postMessage({
      id,
      result,
      ...(import.meta.env.DEV ? { diagnostics } : {}),
    });
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof Error
          ? error.message
          : 'The scanner could not finish. Please try again.',
    });
  }
};
