import { randomUUID } from 'node:crypto';

export const defaultHomeCards = [
  {
    id: 'collectors',
    icon: 'users',
    title: 'COLLECTORS',
    description:
      'Discover fellow collectors and explore their collections and checklists.',
    cta: 'View Collectors',
    url: '/collectors',
  },
  {
    id: 'community',
    icon: 'community',
    title: 'COMMUNITY',
    description:
      'Find groups, trusted collectors, and places to share your passion for Teks.',
    cta: 'Visit Community',
    url: '/community',
  },
  {
    id: 'account',
    icon: 'user',
    title: 'LOGIN',
    description:
      'Sign in to create your checklist and start collecting with the community.',
    cta: 'Continue with Google',
    url: '/collectors?mine=1',
    dynamic: true,
    memberTitle: 'MY PROFILE',
    memberDescription:
      'View and manage your profile, checklist, and Teks collection.',
    memberCta: 'View My Profile',
    memberUrl: '/collectors?mine=1',
  },
].map((r, position) => ({
  enabled: true,
  visibility: 'everyone',
  dynamic: false,
  position,
  ...r,
}));
export const guideKeys = [
  'welcome',
  'archives',
  'checklist',
  'collectors',
  'community',
];
const canManage = (store, actor) =>
  actor?.status === 'active' && store.permissions(actor).includes('homepage');
export function siteContent(store, endpoint, method, data, actor, query, send) {
  if (endpoint === '/__local/guide-progress') {
    if (!actor) {
      send(401, { error: 'Sign in first.' });
      return true;
    }
    const current = store.get('guide-progress', actor.id) || {
      id: actor.id,
      completed: [],
    };
    if (method === 'POST') {
      if (
        !Array.isArray(data.completed) ||
        data.completed.some((k) => !guideKeys.includes(k))
      )
        throw Error('Invalid guide progress.');
      current.completed = [
        ...new Set([...current.completed, ...data.completed]),
      ];
      store.put('guide-progress', current);
    }
    send(200, current);
    return true;
  }
  if (endpoint !== '/__local/homepage') return false;
  const saved = store.get('site-content', 'homepage');
  let rows = saved?.rows || defaultHomeCards;
  if (method === 'POST' || query.get('manage') === '1') {
    if (!canManage(store, actor)) {
      send(403, { error: 'Homepage management access required.' });
      return true;
    }
  }
  if (method === 'POST') {
    if (data.action === 'delete') {
      rows = rows.filter((r) => r.id !== data.id);
    } else if (data.action === 'move') {
      rows = [...rows].sort((a, b) => a.position - b.position);
      const from = rows.findIndex((r) => r.id === data.id),
        to = rows.findIndex((r) => r.id === data.other);
      if (from < 0 || to < 0)
        throw Error('Card unavailable. Refresh and try again.');
      [rows[from], rows[to]] = [rows[to], rows[from]];
      rows = rows.map((r, position) => ({ ...r, position }));
    } else if (data.action === 'save') {
      const input = data.row || {},
        row = { id: input.id || randomUUID() };
      for (const [key, max] of Object.entries({
        title: 60,
        description: 220,
        cta: 40,
        url: 500,
        memberTitle: 60,
        memberDescription: 220,
        memberCta: 40,
        memberUrl: 500,
      })) {
        row[key] = String(input[key] || '').trim();
        if (row[key].length > max) throw Error(`${key} is too long.`);
      }
      if (!row.title || !row.cta)
        throw Error('Title and button label are required.');
      const validUrl = (value) =>
        /^\/(?!\/|\\)/.test(value) || value.startsWith('https://');
      if (!validUrl(row.url) || (input.dynamic && !validUrl(row.memberUrl)))
        throw Error('Use an internal path or an HTTPS destination.');
      if (
        ![
          'users',
          'community',
          'user',
          'cards',
          'trophy',
          'heart',
          'globe',
          'star',
        ].includes(input.icon)
      )
        throw Error('Choose an available icon.');
      if (!['everyone', 'member', 'guest'].includes(input.visibility))
        throw Error('Choose a visibility option.');
      Object.assign(row, {
        icon: input.icon,
        visibility: input.visibility,
        enabled: !!input.enabled,
        dynamic: !!input.dynamic,
        position: rows.find((r) => r.id === row.id)?.position ?? rows.length,
      });
      rows = [...rows.filter((r) => r.id !== row.id), row];
    } else throw Error('Invalid homepage action.');
    store.put('site-content', { id: 'homepage', rows });
    store.put('activity', {
      id: randomUUID(),
      actor: actor.display_name || actor.name,
      action: 'Updated homepage cards',
      category: 'homepage',
      target: data.row?.title || data.id || '',
      created_at: new Date().toISOString(),
    });
  }
  send(200, {
    rows: rows
      .filter(
        (r) => method === 'POST' || query.get('manage') === '1' || r.enabled,
      )
      .sort((a, b) => a.position - b.position),
  });
  return true;
}
