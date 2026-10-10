// netlify/functions/send-notifications.mjs
//
// Scheduled every 10 minutes. For each league, works out which push alerts
// are due (final scores, captain/bets/lineup reminders — see
// src/services/notifications.ts), de-duplicates against notification_log, and
// delivers to each user's registered devices if their per-type preference
// allows it.
//
// Required Netlify env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, CFBD_KEY,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

import { computeDueNotifications } from '../../src/services/notifications';
import { ensureVapid, sbGet, claimLogKey, sendToSubscriptions } from './lib/push.mjs';

const CFBD_KEY  = process.env.CFBD_KEY;
const CFBD_BASE = 'https://api.collegefootballdata.com';

function getCurrentSeasonYear() {
  const now = new Date();
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

async function cfbdGames(params) {
  const res = await fetch(`${CFBD_BASE}/games?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${CFBD_KEY}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// GameData limited to the given team ids and one week — just what the
// notification logic reads (result, scores, completion, kickoff).
function buildGameData(teamIds, rawGames) {
  const gameData = {};
  teamIds.forEach(id => { gameData[id] = {}; });
  for (const g of rawGames) {
    const homeId = String(g.home_id ?? g.homeId ?? '');
    const awayId = String(g.away_id ?? g.awayId ?? '');
    const homePoints = g.home_points ?? g.homePoints ?? null;
    const awayPoints = g.away_points ?? g.awayPoints ?? null;
    const startDate  = g.start_date ?? g.startDate ?? '';
    let week = g.week ?? 1;
    if (week === 1 && startDate && new Date(startDate).getMonth() === 7) week = 0;
    const completed = !!(g.completed || (homePoints != null && awayPoints != null));
    const base = { week, home_score: homePoints, away_score: awayPoints, completed, start_date: startDate };
    if (teamIds.has(homeId)) {
      gameData[homeId][week] = { ...base, opponent: g.away_team ?? g.awayTeam ?? '', is_home: true,
        result: completed ? (homePoints > awayPoints ? 'W' : 'L') : null };
    }
    if (teamIds.has(awayId)) {
      gameData[awayId][week] = { ...base, opponent: g.home_team ?? g.homeTeam ?? '', is_home: false,
        result: completed ? (awayPoints > homePoints ? 'W' : 'L') : null };
    }
  }
  return gameData;
}

const PREF_COLUMN = { scores: 'scores', captain: 'captain', bets: 'bets', lineup: 'lineup' };

export default async () => {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !CFBD_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500 });
  }
  if (!ensureVapid()) {
    return new Response(JSON.stringify({ skipped: 'VAPID keys not configured' }), { status: 200 });
  }

  const subs = await sbGet('push_subscriptions?select=user_id,endpoint,p256dh,auth');
  if (subs.length === 0) return new Response(JSON.stringify({ skipped: 'no subscriptions' }), { status: 200 });
  const subsByUser = new Map();
  subs.forEach(s => {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id).push(s);
  });
  const prefRows = await sbGet('notification_prefs?select=*');
  const prefs = new Map(prefRows.map(p => [p.user_id, p]));

  const leagues = await sbGet('leagues?select=*');
  const year = getCurrentSeasonYear();
  const gamesByWeek = new Map(); // CFBD week -> raw games, one fetch per distinct week
  const stats = { sent: 0, leagues: 0 };

  for (const league of leagues) {
    try {
      const members = await sbGet(`league_members?league_id=eq.${league.id}&select=*`);
      if (!members.some(m => subsByUser.has(m.user_id))) continue;
      const [draftPicks, moves, captainPicks, benchPicks, spreadPicks] = await Promise.all([
        sbGet(`draft_picks?league_id=eq.${league.id}&select=*`),
        sbGet(`free_agency_moves?league_id=eq.${league.id}&select=*`),
        sbGet(`captain_picks?league_id=eq.${league.id}&select=*`),
        sbGet(`bench_picks?league_id=eq.${league.id}&select=*`),
        sbGet(`spread_picks?league_id=eq.${league.id}&select=*`),
      ]);
      if (draftPicks.length === 0) continue;

      const cfbdWeek = Math.max(1, league.current_week);
      if (!gamesByWeek.has(cfbdWeek)) {
        const seasonType = cfbdWeek > 15 ? 'postseason' : 'regular';
        gamesByWeek.set(cfbdWeek, await cfbdGames({ year, week: cfbdWeek, seasonType }));
      }
      const teamIds = new Set([...draftPicks.map(p => p.team_id), ...moves.map(m => m.added_team_id)]);
      const gameData = buildGameData(teamIds, gamesByWeek.get(cfbdWeek));

      const due = computeDueNotifications(
        { league, members, draftPicks, moves, captainPicks, benchPicks, spreadPicks, gameData },
        new Date(),
      );

      for (const n of due) {
        const userSubs = subsByUser.get(n.user_id);
        if (!userSubs) continue;
        const pref = prefs.get(n.user_id);
        if (pref && pref[PREF_COLUMN[n.kind]] === false) continue;
        const claimed = await claimLogKey({
          user_id: n.user_id, league_id: n.league_id, kind: n.kind, week: n.week, dedupe_key: n.dedupe_key,
        });
        if (!claimed) continue;
        const delivered = await sendToSubscriptions(userSubs, {
          title: n.title, body: n.body, url: n.url, tag: n.dedupe_key,
        });
        stats.sent += delivered;
      }
      stats.leagues++;
    } catch (e) {
      console.error(`[send-notifications] league ${league.id} failed:`, e);
    }
  }

  return new Response(JSON.stringify({ ranAt: new Date().toISOString(), ...stats }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  schedule: '*/10 * * * *',
};
