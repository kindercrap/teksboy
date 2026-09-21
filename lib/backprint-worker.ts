import { matchBackprint, type BackprintIndex } from './backprint-matcher';
self.onmessage = (
  event: MessageEvent<{
    pixels: Uint8Array;
    side: number;
    index: BackprintIndex;
  }>,
) => {
  try {
    self.postMessage({
      result: matchBackprint(
        event.data.pixels,
        event.data.side,
        event.data.index,
      ),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : 'Scanning failed. Please try again.',
    });
  }
};
