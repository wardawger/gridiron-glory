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
// Returns the Supabase user object, or null if the token is missing,
// malformed, expired, or otherwise rejected. Callers decide what to do
// with null (both currently answer 401); this never throws.

export async function verifyUser(req, supabaseUrl, apiKey) {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  try {
    // Supabase validates the JWT (signature and expiry) for us here —
    // doing it locally would mean shipping the JWT secret into this
    // function and reimplementing verification, which is easy to get
    // subtly wrong.
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: apiKey },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}
