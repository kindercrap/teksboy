export function importGuestChecklist(store, userId, data) {
  if (
    !store.get('users', userId) ||
    data?.version !== 1 ||
    !data.sets ||
    typeof data.sets !== 'object' ||
    Array.isArray(data.sets)
  )
    throw Error('Invalid guest checklist. Your local data has been kept.');
  const entries = Object.entries(data.sets);
  if (entries.length > 1000) throw Error('Too many guest collections.');
  // Validate the entire import before making any writes.
  const rows = entries.map(([setId, cards]) => {
    const set = store.get('collections', setId);
    if (
      !set ||
      !Array.isArray(cards) ||
      cards.length > 10000 ||
      cards.some(
        (id) => typeof id !== 'string' || !set.cards.some((c) => c.id === id),
      )
    )
      throw Error(
        'A guest collection or card is no longer available. Your guest checklist is still saved on this device.',
      );
    const old = store.get('checklists', userId + ':' + setId);
    return {
      id: userId + ':' + setId,
      user_id: userId,
      set_id: setId,
      owned: [...new Set([...(old?.owned || []), ...cards])],
    };
  });
  store.db.exec('BEGIN');
  try {
    for (const row of rows) store.saveChecklist(row, null);
    store.db.exec('COMMIT');
  } catch (e) {
    store.db.exec('ROLLBACK');
    throw e;
  }
}
