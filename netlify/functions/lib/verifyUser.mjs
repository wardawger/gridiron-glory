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

import { createHmac, createPublicKey, verify as verifySignature, timingSafeEqual } from 'node:crypto';

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

// This project's tokens are signed ES256 (confirmed via its public JWKS —
// see below), but HS256 (a shared secret rather than a public/private key
// pair) is Supabase's older default and still valid on other projects, so
// both are supported and dispatched on the token's own `alg` header.
//
// Returns { ok: true, id } on success, or { ok: false, reason } — reason is
// a diagnostic label only (never the token or secret) so a deploy's function
// logs can say *why* a mismatch happened without leaking anything sensitive.
function verifyJwtHS256(headerB64, payloadB64, sigB64, secret) {
  let actualSig;
  try { actualSig = base64UrlDecode(sigB64); } catch { return { ok: false, reason: 'bad signature encoding' }; }
  const expectedSig = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    return { ok: false, reason: 'signature mismatch (wrong secret)' };
  }
  return { ok: true };
}

// Supabase's ES256 signing keys are public (that's the point of an
// asymmetric scheme) and served unauthenticated from /auth/v1/.well-known/
// jwks.json — no secret to configure at all. Cached in module scope so a
// warm function instance reuses it across invocations instead of re-fetching
// on every single request; refetched wholesale (not per-kid) so a rotated
// key naturally replaces the old set rather than accumulating stale entries.
let jwksCache = null; // { keys: Map<kid, KeyObject>, fetchedAt: number }
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour — signing keys rotate rarely

async function getJwks(supabaseUrl) {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const { keys: jwks } = await res.json();
  const keys = new Map();
  for (const jwk of jwks ?? []) {
    if (jwk.kid) keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
  }
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

async function verifyJwtES256(headerB64, payloadB64, sigB64, kid, supabaseUrl) {
  if (!kid) return { ok: false, reason: 'no kid in header' };

  let keys;
  try { keys = await getJwks(supabaseUrl); } catch (e) { return { ok: false, reason: `jwks fetch failed: ${e.message}` }; }
  let publicKey = keys.get(kid);
  if (!publicKey) {
    // Key rotated since our last fetch — force one refresh before giving up.
    jwksCache = null;
    try { keys = await getJwks(supabaseUrl); } catch (e) { return { ok: false, reason: `jwks refetch failed: ${e.message}` }; }
    publicKey = keys.get(kid);
  }
  if (!publicKey) return { ok: false, reason: `unknown kid ${kid}` };

  let sig;
  try { sig = base64UrlDecode(sigB64); } catch { return { ok: false, reason: 'bad signature encoding' }; }

  let sigOk;
  try {
    // JWT/JOSE ES256 signatures are the raw concatenated R||S values, not
    // the DER encoding Node's crypto.verify() expects by default for EC
    // keys — dsaEncoding: 'ieee-p1363' selects the raw form instead.
    sigOk = verifySignature('sha256', Buffer.from(`${headerB64}.${payloadB64}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig);
  } catch (e) {
    return { ok: false, reason: `verify threw: ${e.message}` };
  }
  return sigOk ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

async function verifyJwtLocally(token, supabaseUrl, hs256Secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed (not 3 parts)' };
  const [headerB64, payloadB64, sigB64] = parts;

  let header;
  try { header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')); } catch { return { ok: false, reason: 'bad header JSON' }; }

  let sigResult;
  if (header.alg === 'ES256') {
    sigResult = await verifyJwtES256(headerB64, payloadB64, sigB64, header.kid, supabaseUrl);
  } else if (header.alg === 'HS256' && hs256Secret) {
    sigResult = verifyJwtHS256(headerB64, payloadB64, sigB64, hs256Secret);
  } else {
    return { ok: false, reason: `unsupported alg ${header.alg}` };
  }
  if (!sigResult.ok) return sigResult;

  let payload;
  try { payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')); } catch { return { ok: false, reason: 'bad payload JSON' }; }

  const nowSeconds = Date.now() / 1000;
  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds) return { ok: false, reason: 'expired' };
  if (payload.aud !== 'authenticated') return { ok: false, reason: `aud is "${payload.aud}", not "authenticated"` };
  if (!payload.sub) return { ok: false, reason: 'no sub claim' };

  return { ok: true, id: payload.sub };
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

  // Local verification (no network round-trip). A page refresh fires
  // roughly a dozen of these Functions in parallel (one per CFBD endpoint)
  // — each one previously paid a full network round-trip to Supabase's
  // /auth/v1/user just to check who was calling, on top of the cache
  // lookup and possible CFBD call it also needs. Verifying the signature
  // locally removes that round-trip entirely, whether the project signs
  // with the newer asymmetric ES256 keys (verified against the public
  // JWKS — no secret needed) or the older shared HS256 secret (only used
  // if SUPABASE_JWT_SECRET is configured).
  //
  // A local rejection always falls back to the network check rather than
  // failing closed — this was learned the hard way in production: an
  // earlier version only fell back when the secret was entirely unset, so
  // once the wrong signing scheme was in play, every real, valid session
  // got rejected and took the whole app down. The network check is the
  // authoritative source of truth either way; local verification is purely
  // a fast path when it agrees with that source, never a stricter gate
  // that can override it.
  const local = await verifyJwtLocally(token, supabaseUrl, process.env.SUPABASE_JWT_SECRET);
  if (local.ok) {
    console.log('[verifyUser] verified locally');
    return { id: local.id };
  }
  console.log(`[verifyUser] local verification failed (${local.reason}) — falling back to network check`);

  return verifyViaNetwork(token, supabaseUrl, apiKey);
}
