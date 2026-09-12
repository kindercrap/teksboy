import type { Metadata } from 'next';
import { headers } from 'next/headers';
import catalog from './catalog.json';
import groups from './categories.json';
type Params = Record<string, string | string[] | undefined>;
export async function shareMetadata(
  search: Promise<Params> | Params,
  checklist = false,
): Promise<Metadata> {
  const params = await search;
  const setId = typeof params.set === 'string' ? params.set : '',
    userId = typeof params.user === 'string' ? params.user : '',
    groupId = typeof params.group === 'string' ? params.group : '';
  const h = await headers(),
    host = h.get('host') || 'localhost:3100';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || `${local ? 'http' : 'https'}://${host}`;
  let set: { name: string; cover?: string; cards?: unknown[] } | undefined =
      catalog.find((s) => s.id === setId),
    owner = '',
    progress = '';
  if (local && setId && userId && checklist) {
    try {
      const r = await fetch(
        `${origin}/__local/social/profile?user=${encodeURIComponent(userId)}&set=${encodeURIComponent(setId)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(3000) },
      );
      if (r.ok) {
        const d = (await r.json()) as {
          user: { name: string };
          checklists: {
            set_id: string;
            name: string;
            cover: string;
            owned: unknown[];
            total: number;
          }[];
        };
        const c = d.checklists.find((c) => c.set_id === setId);
        if (c) {
          set = { name: c.name, cover: c.cover };
          owner = d.user.name;
          progress = `${c.owned.length} of ${c.total} teks collected. `;
        }
      }
    } catch {
      /* A basic collection preview remains available if the local store is offline. */
    }
  }
  const group = groups.find((g) => g.id === groupId);
  const title = set
    ? `${set.name}${checklist ? ' — ' + (owner ? owner + '’s ' : '') + 'Checklist' : ''} | Teksboy`
    : group
      ? `${group.name} Collections | Teksboy`
      : checklist ? 'Collectors | Teksboy' : 'Archives | Teksboy';
  const description = set
    ? `${progress}View ${owner ? owner + '’s ' : ''}${set.name} ${checklist ? 'checklist and missing teks' : 'collection'}. #teksboy`
    : 'Explore the Teksboy collecting community. #teksboy';
  const query = new URLSearchParams();
  if (setId) query.set('set', setId);
  if (checklist && userId) query.set('user', userId);
  if (groupId) query.set('group', groupId);
  const url = new URL(
    (checklist ? '/collectors' : '/') +
      (query.size ? '?' + query.toString() : ''),
    origin,
  ).href;
  const image = new URL(set?.cover || '/images/general/favicon.png', origin)
    .href;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: 'Teksboy',
      title,
      description,
      url,
      images: [{ url: image, alt: set?.name || 'Teksboy' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}
