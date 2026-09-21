// The generated Vite constructor is used only from the lazy mobile component.
// oxlint-disable-next-line import/default
import BackprintWorker from './backprint-worker?worker';
import type { BackprintIndex, ScanResult } from './backprint-matcher';
import type { Rect } from './backprint-cv';
let worker: Worker | null = null,
  cvReady: Promise<void> | undefined,
  indexPromise: Promise<BackprintIndex> | undefined,
  serial = 0;
const pending = new Map<
  number,
  {
    resolve: (value: Reply) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
type Reply = {
  id: number;
  ready?: boolean;
  result?: ScanResult;
  error?: string;
  diagnostics?: unknown;
};
function discard(message: string) {
  worker?.terminate();
  worker = null;
  cvReady = undefined;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(Error(message));
  }
  pending.clear();
}
function request(
  payload: object,
  transfer: Transferable[] = [],
  timeout = 30000,
): Promise<Reply> {
  if (!worker) {
    worker = new BackprintWorker();
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      clearTimeout(job.timer);
      if (event.data.error) job.reject(Error(event.data.error));
      else job.resolve(event.data);
    };
    worker.onerror = () =>
      discard('The scanner stopped unexpectedly. Please try again.');
  }
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        discard(
          'Scanner preparation or processing timed out. Check your connection and try again.',
        ),
      timeout,
    );
    pending.set(id, { resolve, reject, timer });
    try {
      worker!.postMessage({ id, ...payload }, transfer);
    } catch {
      discard('Your browser could not start the scanner. Please try again.');
    }
  });
}
export async function prepareScanner() {
  const ready = (cvReady ??= request({ kind: 'init' }, [], 45000)
    .then(() => {})
    .catch((error) => {
      // Failed dynamic imports are cached by the worker's module registry.
      // A fresh worker is needed for a real network retry.
      discard('Scanner preparation failed. Please try again.');
      throw error;
    }));
  const index = (indexPromise ??= fetch('/backprint-index.json', {
    cache: 'no-cache',
    signal: AbortSignal.timeout(20000),
  })
    .then(async (response) => {
      if (!response.ok)
        throw Error(
          'Cannot load the backprint library. Check your connection and try again.',
        );
      const data = (await response.json()) as BackprintIndex;
      if (data.version !== 2 || !Array.isArray(data.entries))
        throw Error(
          'The backprint library needs updating. Please try again later.',
        );
      return data;
    })
    .catch((error) => {
      indexPromise = undefined;
      throw error;
    }));
  const [, data] = await Promise.all([ready, index]);
  return data;
}
export async function scanCameraFrame(
  rgba: Uint8Array,
  width: number,
  height: number,
  region: Rect,
  index: BackprintIndex,
) {
  const reply = await request(
    { kind: 'scan', rgba, width, height, region, index },
    [rgba.buffer],
  );
  if (import.meta.env.DEV && reply.diagnostics)
    console.debug('[Backprint scanner]', reply.diagnostics);
  if (!reply.result)
    throw Error('The scanner returned no result. Please try again.');
  return reply.result;
}
// Keep initialized OpenCV between normal retries; terminate interrupted work so
// captured pixels and temporary WASM objects cannot linger after navigation.
export function cancelScannerWork() {
  if (pending.size) discard('Scan cancelled.');
}
