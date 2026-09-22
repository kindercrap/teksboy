import test from 'node:test';
import assert from 'node:assert/strict';
import { BackprintSession } from '../lib/backprint-session.ts';
const good = {
  brightness: 120,
  contrast: 45,
  sharpness: 120,
  usable: true,
  stable: false,
};
const empty = { ...good, contrast: 0, sharpness: 0, usable: false };
const pixels = (n: number) => new Uint8Array(96 * 144).fill(n);
function see(
  s: BackprintSession<string>,
  time: number,
  n = 50,
  motion = 3,
  quality = good,
  frame = 'frame',
) {
  s.observe(time, quality, pixels(n), motion, () => frame);
}
test('positioning does not spend active time; rolling checks tolerate movement and retain the sharpest recent frame', () => {
  const s = new BackprintSession<string>();
  see(s, 0, 0, 0, empty);
  see(s, 30000, 0, 0, empty);
  assert.equal(s.started, false);
  assert.equal(s.progress, 0);
  see(s, 30125);
  see(s, 30250, 50, 3, { ...good, sharpness: 500 }, 'sharp');
  see(s, 30375, 50, 50);
  see(s, 30500);
  assert.equal(s.take(30500), 'sharp');
  assert.equal(s.take(30501), null, 'one in-flight job');
  assert.ok(s.buffered <= 3);
});
test('pause/resume retains progress and does not count time while content is absent', () => {
  const s = new BackprintSession<string>();
  see(s, 0);
  see(s, 125);
  for (let t = 250; t <= 2000; t += 125) see(s, t);
  for (let t = 2125; t <= 4000; t += 125) see(s, t, 0, 0, empty);
  assert.equal(s.paused, true);
  const elapsed = s.elapsed;
  for (let t = 4125; t <= 6000; t += 125) see(s, t, 0, 0, empty);
  assert.equal(s.elapsed, elapsed);
  see(s, 6125);
  assert.equal(s.paused, false);
  assert.ok(s.elapsed <= elapsed + 125);
});
test('retries are novel, bounded, non-overlapping and adaptive to processing speed', () => {
  const s = new BackprintSession<string>();
  see(s, 0);
  see(s, 125);
  assert.ok(s.take(125));
  s.complete(325);
  see(s, 500);
  see(s, 1000);
  assert.equal(s.take(1000), null, 'same failed image is not repeated');
  see(s, 1125, 80);
  assert.ok(s.take(1125));
  s.complete(2125);
  assert.equal(s.interval, 200);
  see(s, 2200, 100);
  assert.equal(s.take(2200), null, 'slow device cooldown');
  see(s, 2500, 100);
  assert.ok(s.take(2500));
  s.complete(2600);
  s.stop();
  assert.equal(s.buffered, 0);
  assert.equal(s.take(3000), null);
});
test('ten active seconds prevent new jobs but allow a final running job to finish', () => {
  const s = new BackprintSession<string>();
  see(s, 0);
  see(s, 125);
  for (let t = 250; t <= 9875; t += 125) see(s, t);
  assert.ok(s.take(9875));
  see(s, 10125);
  assert.equal(s.progress, 1);
  assert.equal(s.expired, true);
  assert.equal(s.running, true);
  assert.equal(s.take(10250), null);
  s.complete(11000);
  assert.equal(s.running, false);
});
test('fast devices can make 8–12 distinct attempts without a full matcher on every frame', () => {
  const s = new BackprintSession<string>();
  let count = 0;
  for (let t = 0; t <= 10250; t += 125) {
    see(s, t, Math.floor(t / 800) * 10);
    if (s.take(t)) {
      count++;
      s.complete(t + 150);
    }
  }
  assert.ok(count >= 8 && count <= 12, String(count));
  assert.equal(s.progress, 1);
});
