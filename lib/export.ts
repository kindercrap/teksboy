import type { Card, TeksSet } from './data';
export const CARDS_PER_PAGE = 20;
export function missingCards(set: TeksSet, owned: string[]) {
  const ids = new Set(owned);
  return set.cards.filter((c) => !ids.has(c.id));
}
export function completion(total: number, owned: number) {
  return total ? Math.round((100 * owned) / total) : 0;
}
export function paginate<T>(items: T[], size = CARDS_PER_PAGE) {
  if (size < 1) throw Error('Invalid page size');
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    const timeout = setTimeout(
      () => reject(Error('An image took too long to load. Please retry.')),
      15000,
    );
    im.onload = () => {
      clearTimeout(timeout);
      resolve(im);
    };
    im.onerror = () => {
      clearTimeout(timeout);
      reject(Error('A card image could not load. Please retry.'));
    };
    im.src = src;
  });
}
export async function exportPage(
  set: TeksSet,
  cards: Card[],
  page: number,
  pages: number,
  totalMissing: number,
) {
  const images = await Promise.all(cards.map((c) => loadImage(c.image)));
  const w = 1200,
    cols = 5,
    pad = 36,
    gap = 16,
    cw = (w - pad * 2 - gap * 4) / 5,
    ch = 306,
    rows = Math.ceil(cards.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = 186 + rows * (ch + gap) + 56;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Image export is unavailable in this browser.');
  ctx.fillStyle = '#141b20';
  ctx.fillRect(0, 0, w, canvas.height);
  ctx.fillStyle = '#213331';
  ctx.fillRect(0, 0, w, 150);
  ctx.fillStyle = '#3de4d5';
  ctx.font = 'bold 17px Arial';
  ctx.fillText('TEKSBOY / LOOKING FOR', pad, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  let title = set.name;
  while (ctx.measureText(title).width > w - pad * 2) {
    title = title.slice(0, -2);
  }
  ctx.fillText(title, pad, 88);
  ctx.fillStyle = '#aec0c1';
  ctx.font = '18px Arial';
  ctx.fillText(
    `${totalMissing} missing cards · Page ${page + 1} of ${pages}`,
    pad,
    121,
  );
  images.forEach((im, i) => {
    const x = pad + (i % cols) * (cw + gap),
      y = 174 + Math.floor(i / cols) * (ch + gap);
    ctx.fillStyle = '#253037';
    ctx.fillRect(x, y, cw, ch);
    const ih = ch - 40,
      iw = cw - 12,
      scale = Math.min(iw / im.width, ih / im.height);
    ctx.drawImage(
      im,
      x + (cw - im.width * scale) / 2,
      y + 6 + (ih - im.height * scale) / 2,
      im.width * scale,
      im.height * scale,
    );
    ctx.fillStyle = '#ff8893';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(
      `MISSING · #${String(cards[i].number).padStart(3, '0')}`,
      x + 12,
      y + ch - 13,
    );
  });
  ctx.fillStyle = '#99adad';
  ctx.font = '15px Arial';
  ctx.fillText(
    'Generated with Teksboy · Made for the joy of collecting.',
    pad,
    canvas.height - 23,
  );
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error('Could not generate image.'))),
      'image/png',
    ),
  );
}
