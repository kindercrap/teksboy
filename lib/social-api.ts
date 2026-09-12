export async function socialApi<T = { ok: boolean }>(
  op: string,
  body?: unknown,
) {
  const r = await fetch(
    '/__local/social/' + op,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(data.error || 'Request failed');
  return data;
}
