// netlify/functions/cfbd-proxy.mjs
//
// Server-side proxy for CFBD API requests. Solves two problems:
//   1. CORS — browser can't call CFBD directly from Netlify domain
//   2. Quota — caches responses in Supabase for 24h to conserve monthly calls
//
// Required Netlify env vars (Site Settings → Environment Variables):
//   CFBD_KEY             — your CFBD API bearer token
//   SUPABASE_URL         — your Supabase project URL  (already set for your app)
//   SUPABASE_SERVICE_KEY — your Supabase service role key (NOT the anon key)
//
// Supabase table required — run this once in the Supabase SQL editor:
//   CREATE TABLE IF NOT EXISTS cfbd_cache (
//     cache_key   TEXT PRIMARY KEY,
//     data        JSONB NOT NULL,
//     fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
//   );

const CFBD_BASE   = 'https://api.collegefootballdata.com';
const CACHE_TTL_H = 24; // hours before cache entry is considered stale

// ── Supabase helpers (plain REST, no SDK needed) ─────────────────────────────

async function cacheGet(supabaseUrl, serviceKey, cacheKey) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/cfbd_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=data,fetched_at`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows.length) return null;
    const ageHours = (Date.now() - new Date(rows[0].fetched_at).getTime()) / 36e5;
    if (ageHours > CACHE_TTL_H) return null;
    return rows[0].data;
  } catch { return null; }
}

async function cacheSet(supabaseUrl, serviceKey, cacheKey, data) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/cfbd_cache`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        data,
        fetched_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn('[cfbd-proxy] cache write failed:', e);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async (req) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url       = new URL(req.url);
  const cfbdPath  = url.searchParams.get('path');

  if (!cfbdPath) {
    return new Response(JSON.stringify({ error: 'Missing path param' }), {
      status: 400, headers: corsHeaders,
    });
  }

  const apiKey      = process.env.CFBD_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'CFBD_KEY env var not set' }), {
      status: 500, headers: corsHeaders,
    });
  }

  // Build forwarded query params (everything except our internal 'path' key)
  const forwardParams = new URLSearchParams();
  for (const [key, val] of url.searchParams.entries()) {
    if (key !== 'path') forwardParams.set(key, val);
  }

  const cfbdUrl  = `${CFBD_BASE}${cfbdPath}?${forwardParams.toString()}`;
  const cacheKey = `${cfbdPath}?${forwardParams.toString()}`;

  // ── 1. Try Supabase cache ────────────────────────────────────────────────
  if (supabaseUrl && serviceKey) {
    const cached = await cacheGet(supabaseUrl, serviceKey, cacheKey);
    if (cached !== null) {
      console.log('[cfbd-proxy] CACHE HIT:', cacheKey);
      return new Response(JSON.stringify(cached), { status: 200, headers: corsHeaders });
    }
    console.log('[cfbd-proxy] cache miss:', cacheKey);
  } else {
    console.warn('[cfbd-proxy] No Supabase env vars — caching disabled');
  }

  // ── 2. Fetch live from CFBD ──────────────────────────────────────────────
  try {
    console.log('[cfbd-proxy] → CFBD:', cfbdUrl);
    const cfbdRes = await fetch(cfbdUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const body = await cfbdRes.text();

    if (!cfbdRes.ok) {
      console.error('[cfbd-proxy] CFBD returned', cfbdRes.status, body);
      return new Response(body, { status: cfbdRes.status, headers: corsHeaders });
    }

    // Write to cache async (don't block the response)
    if (supabaseUrl && serviceKey) {
      try {
        const parsed = JSON.parse(body);
        cacheSet(supabaseUrl, serviceKey, cacheKey, parsed);
      } catch { /* non-JSON, skip */ }
    }

    return new Response(body, { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: corsHeaders,
    });
  }
};

export const config = {
  path: '/.netlify/functions/cfbd-proxy',
};
