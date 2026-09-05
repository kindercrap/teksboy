export async function GET() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  let googleEnabled = false;
  if (url && key) {
    try {
      const result = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(8000),
      });
      if (result.ok) {
        const settings = (await result.json()) as {
          external?: { google?: boolean };
        };
        googleEnabled = !!settings.external?.google;
      }
    } catch {}
  }
  return Response.json(
    { url, key, googleEnabled },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
