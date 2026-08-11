// netlify/functions/send-invite-email.mjs
//
// Sends the actual invite email for a league invite that was already
// created client-side (an `invites` row must already exist). Called
// best-effort from sendInvite() in src/hooks/league/useLeagueCore.ts right
// after that insert succeeds — a failure here never invalidates the invite
// itself, since the shareable /join/:token link still works regardless.
//
// Required Netlify env vars (Site Settings → Environment Variables):
//   SUPABASE_URL         — your Supabase project URL (already set for cfbd-proxy)
//   SUPABASE_SERVICE_KEY — your Supabase service role key (already set for cfbd-proxy)
//   RESEND_API_KEY       — your Resend API key (https://resend.com)
//
// The request body only carries { inviteId, inviterName } — everything
// else (league name, invited email, join token) is re-fetched here via the
// service-role key so the email's actual content can't be spoofed by
// tampering with the client request.
//
// Sends from a verified gridironglory.app domain in Resend, so delivery
// works to any invitee — not just the Resend account's own inbox.

import { buildInviteEmailHtml } from './lib/inviteEmailTemplate.mjs';

const SUPABASE_URL   = process.env.SUPABASE_URL;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS    = 'Gridiron Glory <invites@gridironglory.app>';

async function sbGet(pathWithQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathWithQuery}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${pathWithQuery} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export default async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), { status: 500, headers });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY env var not set' }), { status: 500, headers });
  }

  let inviteId, inviterName;
  try {
    ({ inviteId, inviterName } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
  }
  if (!inviteId) {
    return new Response(JSON.stringify({ error: 'Missing inviteId' }), { status: 400, headers });
  }

  let invite;
  try {
    const rows = await sbGet(
      `invites?id=eq.${encodeURIComponent(inviteId)}&select=invited_email,token,leagues(name)`
    );
    invite = rows[0];
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers });
  }
  if (!invite) {
    return new Response(JSON.stringify({ error: 'Invite not found' }), { status: 404, headers });
  }

  const origin  = req.headers.get('origin') || process.env.SITE_URL || '';
  const joinUrl = `${origin}/join/${invite.token}`;
  const html = buildInviteEmailHtml({
    leagueName: invite.leagues?.name ?? 'a Gridiron Glory league',
    inviterName: inviterName?.trim() || 'Someone',
    joinUrl,
  });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: invite.invited_email,
        subject: `${inviterName?.trim() || 'Someone'} invited you to join ${invite.leagues?.name ?? 'their league'} on Gridiron Glory`,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[send-invite-email] Resend error:', res.status, body);
      return new Response(JSON.stringify({ error: `Resend API error: ${res.status}` }), { status: 502, headers });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers });
  }
};

export const config = {
  path: '/.netlify/functions/send-invite-email',
};
