// netlify/functions/send-test-push.mjs
//
// Authenticated endpoint behind the Account page's "Send test" button:
// pushes a sample notification to the caller's own registered devices.

import { verifyUser } from './lib/verifyUser.mjs';
import { ensureVapid, sbGet, sendToSubscriptions } from './lib/push.mjs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return json({ error: 'Missing Supabase env vars' }, 500);
  if (!ensureVapid()) return json({ error: 'Push is not configured yet (missing VAPID keys)' }, 503);

  const user = await verifyUser(req, process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const subs = await sbGet(`push_subscriptions?user_id=eq.${user.id}&select=endpoint,p256dh,auth`);
  if (subs.length === 0) return json({ error: 'No devices registered' }, 404);

  const delivered = await sendToSubscriptions(subs, {
    title: 'Gridiron Glory',
    body: 'Notifications are working on this device.',
    url: '/',
    tag: 'test',
  });
  return json({ delivered });
};
