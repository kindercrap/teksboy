import { createClient, type SupabaseClient } from '@supabase/supabase-js';
export type Card = {
  id: string;
  number: number;
  image: string;
  set_id?: string;
};
export type TeksSet = {
  id: string;
  name: string;
  category_id: string;
  market_price_min?: number | null;
  market_price_max?: number | null;
  cover: string;
  status: string;
  cards: Card[];
};
export type Category = {
  logo?: string;
  id: string;
  name: string;
  position: number;
  status?: string;
};
export type Track = {
  id: string;
  category_id: string;
  title: string;
  url: string;
  position: number;
};
export let googleEnabled = false;
let client: SupabaseClient | null = null;
export async function getClient() {
  if (client) return client;
  const response = await fetch('/api/config');
  if (!response.ok)
    throw Error('Cannot load connection settings. Please retry.');
  const config = (await response.json()) as {
    url: string;
    key: string;
    googleEnabled?: boolean;
  };
  googleEnabled = !!config.googleEnabled;
  if (!config.url || !config.key) return null;
  client = createClient(config.url, config.key, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
  });
  return client;
}
export function errorText(e: unknown) {
  return e instanceof Error
    ? e.message
    : typeof e === 'object' && e && 'message' in e
      ? String(e.message)
      : 'Something went wrong. Please retry.';
}
export const defaultTracks: Track[] = [
  {
    id: 'bye',
    category_id: 'ghost-fighter',
    title: 'Byebye',
    url: '/bgm/Byebye.mp3',
    position: 0,
  },
  {
    id: 'tatakai',
    category_id: 'ghost-fighter',
    title: 'Tatakai no Hate',
    url: '/bgm/Tatakai no Hate.mp3',
    position: 1,
  },
  {
    id: 'taiyou',
    category_id: 'ghost-fighter',
    title: '太陽がまた輝くとき',
    url: '/bgm/太陽がまた輝くとき.mp3',
    position: 2,
  },
];
