import type { Cv } from './backprint-cv';
// Some OpenCV distributions are self-resolving thenables. Returning {cv}
// avoids Promise assimilation repeatedly awaiting the same runtime object.
export function resolveOpenCv(module: unknown): Promise<{ cv: Cv }> {
  return new Promise((resolve, reject) => {
    const candidate = module as {
      Mat?: unknown;
      then?: (callback: (cv: unknown) => void) => void;
      onRuntimeInitialized?: () => void;
      onAbort?: (reason: string) => void;
    };
    if (!candidate) {
      reject(Error('OpenCV did not load.'));
      return;
    }
    if (candidate.Mat) {
      resolve({ cv: candidate as unknown as Cv });
      return;
    }
    if (candidate.then) {
      candidate.then((cv) => resolve({ cv: cv as Cv }));
      return;
    }
    candidate.onRuntimeInitialized = () =>
      resolve({ cv: candidate as unknown as Cv });
    candidate.onAbort = (reason) =>
      reject(Error('OpenCV initialization failed: ' + reason));
  });
}
