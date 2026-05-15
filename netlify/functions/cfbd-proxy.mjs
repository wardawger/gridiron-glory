// netlify/functions/cfbd-proxy.mjs
// Proxies requests to the CFBD API server-side to avoid CORS restrictions.
// Deploy this file to netlify/functions/ in your repo root.
// Set CFBD_KEY as a Netlify environment variable (Site Settings → Env Vars).

export default async (req) => {
  const url = new URL(req.url);

  // Extract the CFBD path and query string from our proxy URL
  // e.g. /.netlify/functions/cfbd-proxy?path=/games&year=2026&seasonType=regular
  const cfbdPath = url.searchParams.get('path');
  if (!cfbdPath) {
    return new Response(JSON.stringify({ error: 'Missing path param' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Forward all query params except 'path' to CFBD
  const forwardParams = new URLSearchParams();
  for (const [key, val] of url.searchParams.entries()) {
    if (key !== 'path') forwardParams.set(key, val);
  }

  const cfbdUrl = `https://api.collegefootballdata.com${cfbdPath}?${forwardParams.toString()}`;

  const apiKey = process.env.CFBD_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'CFBD_KEY env var not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const cfbdRes = await fetch(cfbdUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const body = await cfbdRes.text();

    return new Response(body, {
      status: cfbdRes.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/.netlify/functions/cfbd-proxy',
};
