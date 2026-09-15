export const guestDataKey = 'teksboy_guest_checklist';
export const guestModeKey = 'teksboy_guest_mode';
export type GuestData = {
  version: 1;
  updatedAt: string;
  sets: Record<string, string[]>;
};
export type BrowserStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const empty = (): GuestData => ({ version: 1, updatedAt: '', sets: {} });
export function readGuest(storage: BrowserStore) {
  try {
    const raw = storage.getItem(guestDataKey);
    if (!raw) return { data: empty(), issue: '' };
    const value = JSON.parse(raw);
    if (
      value?.version !== 1 ||
      !value.sets ||
      typeof value.sets !== 'object' ||
      Array.isArray(value.sets)
    )
      throw Error();
    const entries = Object.entries(value.sets);
    if (
      entries.length > 1000 ||
      entries.some(
        ([id, cards]) =>
          !id ||
          !Array.isArray(cards) ||
          cards.length > 10000 ||
          cards.some((c) => typeof c !== 'string'),
      )
    )
      throw Error();
    return {
      data: {
        version: 1,
        updatedAt: String(value.updatedAt || ''),
        sets: Object.fromEntries(
          entries.map(([id, cards]) => [id, [...new Set(cards as string[])]]),
        ),
      } as GuestData,
      issue: '',
    };
  } catch {
    return {
      data: empty(),
      issue:
        'Your guest checklist could not be read. The original data has been kept.',
    };
  }
}
export function guestIsActive(storage: BrowserStore) {
  try {
    return storage.getItem(guestModeKey) === '1';
  } catch {
    return false;
  }
}
export function startGuest(storage: BrowserStore) {
  const state = readGuest(storage);
  try {
    if (state.issue) {
      const original = storage.getItem(guestDataKey);
      if (original) storage.setItem(guestDataKey + '_recovery', original);
    }
    storage.setItem(guestDataKey, JSON.stringify(state.data));
    storage.setItem(guestModeKey, '1');
    return state;
  } catch {
    throw Error(
      'This browser cannot save a guest checklist. Allow site storage or sign in with Google.',
    );
  }
}
export function pauseGuest(storage: BrowserStore) {
  try {
    storage.removeItem(guestModeKey);
  } catch {
    /* Preserve checklist data. */
  }
}
export function writeGuest(
  storage: BrowserStore,
  updates: Record<string, string[]>,
  remove?: string,
) {
  const state = readGuest(storage);
  if (state.issue) throw Error(state.issue);
  const sets = { ...state.data.sets, ...updates };
  if (remove) delete sets[remove];
  const data: GuestData = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sets,
  };
  try {
    storage.setItem(guestDataKey, JSON.stringify(data));
  } catch {
    throw Error(
      'Your change could not be saved on this device. Free some browser storage or sign in to sync.',
    );
  }
  return data;
}
export function guestChecklist(data: GuestData) {
  return {
    lists: Object.fromEntries(Object.keys(data.sets).map((id) => [id, id])),
    owned: data.sets,
  };
}
// The database performs the union atomically. Never clear a newer edit from another tab.
export async function migrateGuest<T>(
  storage: BrowserStore,
  save: (data: GuestData) => Promise<T>,
) {
  const state = readGuest(storage);
  if (state.issue) throw Error(state.issue);
  if (!Object.keys(state.data.sets).length) {
    pauseGuest(storage);
    return undefined;
  }
  const before = storage.getItem(guestDataKey);
  const result = await save(state.data);
  if (storage.getItem(guestDataKey) === before) {
    storage.removeItem(guestDataKey);
    pauseGuest(storage);
  }
  return result;
}
