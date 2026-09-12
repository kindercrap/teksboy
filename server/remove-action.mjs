export async function removeAction(
  store,
  media,
  req,
  res,
  endpoint,
  data,
  user,
  send,
) {
  if (
    ![
      '/__local/remove-account',
      '/__local/remove-checklist',
      '/__local/remove-comment',
    ].includes(endpoint)
  )
    return false;
  if (req.method !== 'POST' || !user || data.confirm !== true)
    throw Error('Sign in and confirm this action.');
  const kind = endpoint.split('-').at(-1),
    id = String(data.id || ''),
    files = [];
  const erase = (kind, id) =>
    store.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
  if (kind === 'account' && user.role === 'Super Admin')
    throw Error('Super Admin accounts cannot be deleted.');
  if (kind === 'checklist' && !store.get('checklists', user.id + ':' + id))
    throw Error('Checklist unavailable.');
  if (kind === 'comment') {
    const c = store.get('comments', id);
    if (!c || c.author_id !== user.id || c.deleted)
      throw Error('Only the author can remove this comment.');
  }
  store.db.exec('BEGIN');
  try {
    if (kind === 'comment') {
      store.put('comments', {
        ...store.get('comments', id),
        deleted: true,
        text: '',
        cards: [],
      });
    } else {
      for (const c of store.list('checklists'))
        if (c.user_id === user.id && (kind === 'account' || c.set_id === id))
          erase('checklists', c.id);
      for (const c of store.list('comments'))
        if (
          (c.owner === user.id && (kind === 'account' || c.set === id)) ||
          (kind === 'account' && c.author_id === user.id)
        )
          store.put('comments', { ...c, deleted: true, text: '', cards: [] });
      for (const r of store.list('verification-requests'))
        if (r.user_id === user.id && (kind === 'account' || r.set_id === id)) {
          files.push('verification/' + r.file);
          erase('verification-requests', r.id);
        }
      if (kind === 'account') {
        for (const n of store.list('notifications'))
          if (n.user_id === user.id) erase('notifications', n.id);
        store.put('users', {
          id: user.id,
          name: 'Deleted collector',
          status: 'deleted',
          role: 'Normal',
        });
      }
    }
    store.db.exec('COMMIT');
  } catch (e) {
    store.db.exec('ROLLBACK');
    throw e;
  }
  for (const file of files) media.removeAfterCommit('evidence', file);
  send(200, { ok: true });
  return true;
}
