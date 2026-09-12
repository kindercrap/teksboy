import { database, handle } from '../server/backend.mjs';
const db = database();
const { data, error } = await db.auth.admin.listUsers();
if (error) throw error;
console.log(
  JSON.stringify({
    authUsers: data.users.map((u) => ({
      id: u.id,
      owner: u.email === process.env.TEKSBOY_OWNER_EMAIL,
      confirmed: !!u.email_confirmed_at,
      identities: u.identities?.map((i) => ({
        provider: i.provider,
        verified: i.identity_data?.email_verified,
      })),
    })),
  }),
);
for (const endpoint of [
  'catalog',
  'community',
  'social/directory',
  'leaderboard',
  'cms',
  'social/accounts',
]) {
  const r = await handle(
    new Request(
      'https://teksboy-collection.directorremj.chatgpt.site/api/app/' +
        endpoint,
    ),
  );
  const d = await r.json();
  console.log(endpoint, r.status, d.error || 'ok');
}
