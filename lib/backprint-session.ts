import type { Readiness } from './backprint-camera';

type Candidate<T> = { frame: T; gray: Uint8Array; score: number; time: number };
export function frameDifference(a: Uint8Array, b?: Uint8Array) {
  if (!b || a.length !== b.length) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

// Session policy only: recognition, confidence and camera configuration remain
// unchanged. At most three 720px frames and twelve tiny signatures are retained.
export class BackprintSession<T> {
  elapsed = 0;
  started = false;
  paused = false;
  running = false;
  attempts = 0;
  interval = 125;
  private lastTime?: number;
  private lastPresent = 0;
  private recent: boolean[] = [];
  private candidates: Candidate<T>[] = [];
  private tried: { gray: Uint8Array; score: number }[] = [];
  private nextAttempt = 0;
  private jobStarted = 0;
  private stopped = false;
  get progress() {
    return Math.min(1, this.elapsed / 10000);
  }
  get expired() {
    return this.elapsed >= 10000;
  }
  get buffered() {
    return this.candidates.length;
  }
  observe(
    now: number,
    quality: Readiness,
    gray: Uint8Array,
    motion: number,
    capture: () => T | null,
  ) {
    if (this.stopped) return;
    const present =
      quality.brightness > 20 &&
      quality.brightness < 245 &&
      quality.contrast > 14 &&
      quality.sharpness > 25;
    if (present) this.lastPresent = now;
    // A brief hand movement must not pause/reset the session.
    if (this.started && this.lastTime !== undefined) {
      const activeUntil = Math.min(now, this.lastPresent + 700);
      this.elapsed += Math.max(0, activeUntil - this.lastTime);
    }
    this.lastTime = now;
    const usable = present && motion < 22;
    this.recent.push(usable);
    if (this.recent.length > 5) this.recent.shift();
    const rolling = this.recent.filter(Boolean).length >= 2;
    if (!this.started && rolling) this.started = true;
    this.paused = this.started && now - this.lastPresent >= 700;
    this.candidates = this.candidates.filter((c) => now - c.time <= 900);
    if (!this.started || this.paused || this.expired || !usable || !rolling)
      return;
    const score =
      Math.log1p(quality.sharpness) + quality.contrast / 40 - motion / 15;
    if (!this.novel(gray, score)) return;
    const frame = capture();
    if (frame === null) return;
    this.candidates.push({ frame, gray, score, time: now });
    this.candidates.sort((a, b) => b.score - a.score);
    this.candidates.length = Math.min(3, this.candidates.length);
  }
  private novel(gray: Uint8Array, score: number) {
    return this.tried.every(
      (p) => frameDifference(gray, p.gray) >= 4 || score > p.score * 1.2,
    );
  }
  take(now: number) {
    if (
      this.stopped ||
      !this.started ||
      this.paused ||
      this.expired ||
      this.running ||
      this.attempts >= 12 ||
      now < this.nextAttempt
    )
      return null;
    const best = this.candidates.find(
      (c) => now - c.time <= 900 && this.novel(c.gray, c.score),
    );
    if (!best) return null;
    this.candidates = [];
    this.tried.push({ gray: best.gray, score: best.score });
    this.running = true;
    this.attempts++;
    this.jobStarted = now;
    return best.frame;
  }
  complete(now: number) {
    const duration = now - this.jobStarted;
    this.running = false;
    this.nextAttempt = now + Math.max(100, 800 - duration, duration * 0.3);
    this.interval = duration >= 800 ? 200 : 125;
  }
  stop() {
    this.stopped = true;
    this.candidates = [];
    this.tried = [];
    this.recent = [];
  }
}
