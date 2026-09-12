// netlify/functions/cfbd-proxy.mjs
//
// Server-side proxy for CFBD API requests. Solves two problems:
//   1. CORS — browser can't call CFBD directly from Netlify domain
//   2. Quota — caches responses in Supabase to conserve monthly calls
//
// Required Netlify env vars (Site Settings → Environment Variables):
//   CFBD_KEY             — your CFBD API bearer token
//   SUPABASE_URL         — your Supabase project URL  (already set for your app)
//   SUPABASE_SERVICE_KEY — your Supabase service role key (NOT the anon key)
//
// Optional but recommended:
//   SUPABASE_JWT_SECRET  — Settings → API → JWT Secret in the Supabase
//                          dashboard. Lets verifyUser() check the caller's
//                          token locally instead of a network round-trip to
//                          Supabase on every single one of the ~12 parallel
//                          requests a page refresh fires. Falls back to the
//                          network check if this isn't set.
//
// Supabase table required — run this once in the Supabase SQL editor:
//   CREATE TABLE IF NOT EXISTS cfbd_cache (
//     cache_key   TEXT PRIMARY KEY,
//     data        JSONB NOT NULL,
//     fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
//   );

import { verifyUser } from './lib/verifyUser.mjs';

const CFBD_BASE   = 'https://api.collegefootballdata.com';
// 2 hours. useCfbData.ts's client-side refresh interval is still 30 minutes,
// so most of those refreshes now land as a cache HIT (a single cheap indexed
// Supabase read, no CFBD call, no cache write) instead of a miss — the
// project's free-tier Postgres compute has been getting overwhelmed and
// restarting under concurrent load (see the incident notes around
// 2026-09-07/08), and the writes into cfbd_cache were directly implicated:
// every cache miss across every one of this app's signed-in users pays a
// write, and those were the queries actually timing out. A 30-minute TTL
// meant a fresh write on nearly every refresh cycle for every endpoint;
// stretching it to 2 hours cuts that write volume (and the CFBD call volume
// behind it) by roughly 4x without meaningfully staling the data users see
// — CFBD's own upstream sources (AP polls, season stats) don't change on a
// sub-2-hour cadence outside of live game windows anyway, and /scoreboard
// (below) already has its own much shorter TTL for exactly the data that
// does. This is a load-reduction measure, not a guarantee — it lowers how
// often the shared free-tier compute gets pushed into the restart threshold,
// it doesn't remove the ceiling itself.
const CACHE_TTL_H = 2; // hours before cache entry is considered stale

// /scoreboard is CFBD's live in-game endpoint (period/clock/possession) —
// sitting behind the same 30-minute window as everything else would make
// "live" data effectively static for half an hour at a time. 20 seconds
// keeps it close to real-time without hammering CFBD on every render;
// actual request volume is bounded by how long users keep the Scoreboard
// page open during an actual live window, not by this app's normal
// 30-minute background refresh cycle.
const LIVE_TTL_H  = 20 / 3600;

function ttlForPath(cfbdPath) {
  return cfbdPath === '/scoreboard' ? LIVE_TTL_H : CACHE_TTL_H;
}

// ── Supabase helpers (plain REST, no SDK needed) ─────────────────────────────

async function cacheGet(supabaseUrl, serviceKey, cacheKey, ttlHours) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/cfbd_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=data,fetched_at`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows.length) return null;
    const ageHours = (Date.now() - new Date(rows[0].fetched_at).getTime()) / 36e5;
    if (ageHours > ttlHours) return null;
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
    'Access-Control-Allow-Headers': 'authorization, content-type',
    // Netlify's own edge/CDN cache sits in front of this function and, by
    // default, keys purely on URL (its `Vary` behavior doesn't account for
    // the Authorization header) — so without an explicit directive here, a
    // response cached at one edge node for one user's request can get
    // served back to every other request hitting that same URL, completely
    // bypassing the per-path TTL this proxy already enforces via Supabase
    // (see ttlForPath). That silently pinned stale /scoreboard responses at
    // some edge nodes far longer than its intended 20-second freshness
    // window. Our own cache is the only one that should ever apply here.
    'Cache-Control': 'no-store',
    'Netlify-CDN-Cache-Control': 'no-store',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const apiKey      = process.env.CFBD_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  // This forwards to a metered third-party API using a key that never
  // leaves the server. Without a caller check it was an open proxy —
  // anyone could burn the whole CFBD quota. Any signed-in user is
  // sufficient here: the data is public college-football stats, so the
  // gate is about quota abuse, not about who may see what.
  const user = await verifyUser(req, supabaseUrl, serviceKey);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: corsHeaders,
    });
  }

  const url       = new URL(req.url);
  const cfbdPath  = url.searchParams.get('path');

  if (!cfbdPath) {
    return new Response(JSON.stringify({ error: 'Missing path param' }), {
      status: 400, headers: corsHeaders,
    });
  }

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
  const ttlHours = ttlForPath(cfbdPath);

  // ── 1. Try Supabase cache ────────────────────────────────────────────────
  if (supabaseUrl && serviceKey) {
    const cached = await cacheGet(supabaseUrl, serviceKey, cacheKey, ttlHours);
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
