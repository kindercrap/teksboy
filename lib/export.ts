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
  _totalMissing: number,
  groupName: string = set.category_id,
) {
  await document.fonts.ready;
  const font = getComputedStyle(document.body).fontFamily;
  const cover = await loadImage(set.cover);
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
  canvas.height = 174 + rows * (ch + gap) + 20;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Image export is unavailable in this browser.');
  ctx.fillStyle = '#1a232b';
  ctx.fillRect(0, 0, w, canvas.height);
  ctx.fillStyle = '#14191d';
  ctx.fillRect(0, 0, w, 150);
  const coverSize = 150;
  ctx.font = `900 32px ${font}`;
  let titleSize = 32;
  while (ctx.measureText(set.name).width > 840 && titleSize > 18) {
    ctx.font = `900 ${--titleSize}px ${font}`;
  }
  const headerX = Math.max(
    pad,
    (w - coverSize - 28 - ctx.measureText(set.name).width) / 2,
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(headerX, 0, coverSize, coverSize);
  ctx.clip();
  ctx.filter = 'blur(10px) brightness(0.3)';
  const bgScale = Math.max(coverSize / cover.width, coverSize / cover.height);
  ctx.drawImage(
    cover,
    headerX + (coverSize - cover.width * bgScale) / 2,
    (coverSize - cover.height * bgScale) / 2,
    cover.width * bgScale,
    cover.height * bgScale,
  );
  ctx.filter = 'none';
  const coverScale = Math.min(
    coverSize / cover.width,
    coverSize / cover.height,
  );
  ctx.drawImage(
    cover,
    headerX + (coverSize - cover.width * coverScale) / 2,
    (coverSize - cover.height * coverScale) / 2,
    cover.width * coverScale,
    cover.height * coverScale,
  );
  ctx.restore();
  ctx.save();
  ctx.fillStyle = '#00eaff';
  ctx.font = `800 16px ${font}`;
  ctx.fillText(groupName.toUpperCase(), headerX + coverSize + 28, 34);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(set.name, headerX + coverSize + 28, 72);
  ctx.fillStyle = '#c5c5c5';
  ctx.font = `700 19px ${font}`;
  ctx.fillText('generated using ', headerX + coverSize + 28, 104);
  const creditWidth = ctx.measureText('generated using ').width;
  ctx.fillStyle = '#00eaff';
  ctx.fillText('teksboy.com', headerX + coverSize + 28 + creditWidth, 104);
  if (pages > 1) {
    ctx.fillStyle = '#93999e';
    ctx.font = `14px ${font}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${page + 1} / ${pages}`, w - pad, 139);
    ctx.textAlign = 'left';
  }
  images.forEach((im, i) => {
    const x = pad + (i % cols) * (cw + gap),
      y = 174 + Math.floor(i / cols) * (ch + gap);
    ctx.fillStyle = '#20262b';
    ctx.fillRect(x, y, cw, ch);
    ctx.strokeStyle = '#454a4e';
    ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
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
    ctx.fillStyle = '#ff2846';
    ctx.font = `900 14px ${font}`;
    const labelWidth = ctx.measureText(
      '#' + String(cards[i].number).padStart(3, '0') + ' MISSING',
    ).width;
    const labelX = x + (cw - labelWidth - 26) / 2;
    ctx.fillRect(labelX, y + ch - 27, 19, 19);
    ctx.fillText(
      '#' + String(cards[i].number).padStart(3, '0') + ' MISSING',
      labelX + 26,
      y + ch - 12,
    );
    ctx.fillStyle = '#20262b';
    ctx.fillRect(labelX + 4, y + ch - 19, 11, 3);
  });
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error('Could not generate image.'))),
      'image/png',
    ),
  );
}
