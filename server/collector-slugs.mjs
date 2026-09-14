// Reserved mappings survive account deletion so shared links never identify a different person.
export function ensureCollectorSlugs(store) {
  const reserved = new Map(store.list('collector-slugs').map(r => [r.id, r.user_id]));
  const users = store.list('users').sort((a,b) => (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id));
  for (const user of users) {
    let slug = user.slug || [...reserved].find(([, id]) => id === user.id)?.[0];
    if (!slug || (reserved.has(slug) && reserved.get(slug) !== user.id)) {
      const name = user.display_name || user.name || '';
      const base = (name.includes('@') ? '' : name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,60).replace(/-$/,'') || 'collector';
      slug = base;
      let n = 2;
      while (reserved.has(slug) && reserved.get(slug) !== user.id) slug = base + '-' + n++;
    }
    if (user.slug !== slug) store.put('users', {...user, slug});
    if (!reserved.has(slug)) store.put('collector-slugs', {id:slug, user_id:user.id});
    reserved.set(slug,user.id);
  }
}
export function collectorPath(store, userId, set = '') {
  const slug = store.get('users', userId)?.slug;
  return slug ? '/collectors/' + encodeURIComponent(slug) + (set ? '/' + encodeURIComponent(set) : '') : '/collectors';
}
