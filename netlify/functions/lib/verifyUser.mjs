// netlify/functions/lib/verifyUser.mjs
//
// Verifies the Supabase access token on an incoming Function request.
//
// Both of this app's HTTP-triggered Functions hold privileged credentials
// (the CFBD API key, the Resend API key, the Supabase service-role key)
// and neither originally checked who was calling them — cfbd-proxy was an
// open proxy onto a metered third-party API key, and send-invite-email
// would send mail from the app's verified domain to any address a stranger
// POSTed. This is the shared gate for both.
//
// Returns { id: <user id> }, or null if the token is missing, malformed,
// expired, or otherwise rejected. Callers decide what to do with null (both
// currently answer 401); this never throws.

import { createHmac, timingSafeEqual } from 'node:crypto';

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

// Supabase signs session access tokens with HS256 using the project's JWT
// Secret (Settings → API in the Supabase dashboard) — this only handles
// that case, not a project switched to asymmetric (RS256/ES256) signing
// keys, which would need a different verification path entirely.
function verifyJwtHS256(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header;
  try { header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')); } catch { return null; }
  if (header.alg !== 'HS256') return null;

  let actualSig;
  try { actualSig = base64UrlDecode(sigB64); } catch { return null; }
  const expectedSig = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) return null;

  let payload;
  try { payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')); } catch { return null; }

  const nowSeconds = Date.now() / 1000;
  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds) return null;
  if (payload.aud !== 'authenticated') return null;
  if (!payload.sub) return null;

  return { id: payload.sub };
}

async function verifyViaNetwork(token, supabaseUrl, apiKey) {
  try {
    // Supabase validates the JWT (signature and expiry) for us here.
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: apiKey },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? { id: user.id } : null;
  } catch {
    return null;
  }
}

export async function verifyUser(req, supabaseUrl, apiKey) {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  // Local verification (no network round-trip) once SUPABASE_JWT_SECRET is
  // configured. A page refresh fires roughly a dozen of these Functions in
  // parallel (one per CFBD endpoint) — each one previously paid a full
  // network round-trip to Supabase's /auth/v1/user just to check who was
  // calling, on top of the cache lookup and possible CFBD call it also
  // needs. Verifying the signature locally removes that round-trip
  // entirely.
  //
  // A local rejection always falls back to the network check rather than
  // failing closed — a wrong/legacy-vs-current secret, or a project that's
  // moved to Supabase's newer asymmetric (RS256/ES256) signing keys instead
  // of the shared HS256 secret this only handles, would otherwise reject
  // every real, valid session and take the whole app down. The network
  // check is the authoritative source of truth either way; local
  // verification is purely a fast path when it agrees with that source, not
  // a stricter gate that can override it.
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (jwtSecret) {
    const local = verifyJwtHS256(token, jwtSecret);
    if (local) {
      console.log('[verifyUser] verified locally');
      return local;
    }
    console.log('[verifyUser] local verification did not match — falling back to network check');
  } else {
    console.log('[verifyUser] SUPABASE_JWT_SECRET not set — falling back to network check');
  }

  return verifyViaNetwork(token, supabaseUrl, apiKey);
}
