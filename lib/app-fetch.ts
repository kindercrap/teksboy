import { getClient } from './data';
import { localDemoEnabled } from './local-demo';
/** Same feature API locally and live; production writes use verified Google sessions. */
export async function appFetch(input: string, init: RequestInit = {}) {
  if (!input.startsWith('/__local/') || localDemoEnabled())
    return fetch(input, init);
  const url = input.replace(/^\/__local\//, '/api/app/');
  const headers = new Headers(init.headers);
  const db = await getClient();
  const { data } = db
    ? await db.auth.getSession()
    : { data: { session: null } };
  if (data.session)
    headers.set('Authorization', 'Bearer ' + data.session.access_token);
  return fetch(url, { ...init, headers, credentials: 'same-origin' });
}
