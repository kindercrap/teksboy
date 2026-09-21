export type Readiness = {
  usable: boolean;
  stable: boolean;
  brightness: number;
  sharpness: number;
  contrast: number;
};
export function cameraReadiness(
  pixels: Uint8Array,
  width: number,
  height: number,
  previous?: Uint8Array,
): Readiness {
  let sum = 0,
    squares = 0,
    lapSum = 0,
    lapSquares = 0,
    movement = 0,
    count = 0;
  for (let i = 0; i < pixels.length; i++) {
    sum += pixels[i];
    squares += pixels[i] ** 2;
    if (previous) movement += Math.abs(pixels[i] - previous[i]);
  }
  const brightness = sum / pixels.length,
    contrast = Math.sqrt(
      Math.max(0, squares / pixels.length - brightness ** 2),
    );
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        lap =
          4 * pixels[i] -
          pixels[i - 1] -
          pixels[i + 1] -
          pixels[i - width] -
          pixels[i + width];
      lapSum += lap;
      lapSquares += lap * lap;
      count++;
    }
  const sharpness = lapSquares / count - (lapSum / count) ** 2;
  const usable =
    brightness > 28 && brightness < 238 && contrast > 17 && sharpness > 55;
  return {
    usable,
    stable:
      usable &&
      !!previous &&
      previous.length === pixels.length &&
      movement / pixels.length < 7,
    brightness,
    sharpness,
    contrast,
  };
}
export function coverCrop(
  videoWidth: number,
  videoHeight: number,
  viewWidth: number,
  viewHeight: number,
) {
  const scale = Math.max(viewWidth / videoWidth, viewHeight / videoHeight);
  const width = viewWidth / scale,
    height = viewHeight / scale;
  return {
    x: (videoWidth - width) / 2,
    y: (videoHeight - height) / 2,
    width,
    height,
  };
}
export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
export function cameraError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return {
      title: 'Camera Access Required',
      message:
        'TEKSBOY needs camera access to scan a Teks backprint. Allow camera access in your browser settings, then try again.',
    };
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return {
      title: 'Camera unavailable',
      message:
        'No usable camera was found. Open TEKSBOY on a phone with a rear camera.',
    };
  if (name === 'NotReadableError')
    return {
      title: 'Camera could not start',
      message:
        'The camera may be in use by another app. Close it and try again.',
    };
  return {
    title: 'Scanner unavailable',
    message:
      error instanceof Error
        ? error.message
        : 'The scanner could not start. Please try again.',
  };
}
