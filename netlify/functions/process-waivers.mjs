// netlify/functions/process-waivers.mjs
//
// Scheduled function that resolves pending waiver_claims rows once a week,
// at 9am in each league's own configured timezone. Runs hourly and
// self-filters which leagues are actually due on each tick, since a single
// cron expression can't natively express "this weekday, in this timezone."
//
// Required Netlify env vars (Site Settings → Environment Variables):
//   CFBD_KEY             — your CFBD API bearer token (same var cfbd-proxy uses)
//   SUPABASE_URL         — your Supabase project URL
//   SUPABASE_SERVICE_KEY — your Supabase service role key (NOT the anon key)
//
// This is the only place besides cfbd-proxy.mjs that uses the service-role
// key, and the first place it's used to write into a league-domain table.
// waiver_claims deliberately has no client-facing UPDATE/DELETE RLS policy —
// resolution (pending → processed/cancelled) happens exclusively here.
//
// Reuses the app's own pure scoring/roster/analytics functions from src/ —
// confirmed via an esbuild spike that Netlify's function bundler can import
// TS modules from outside netlify/functions/ into an .mjs bundle.

import { normalizeScoring } from '../../src/types';
import { buildLeaderboard, isP4Conference, confCategory } from '../../src/services/scoring';
import { currentRosters } from '../../src/services/roster';
import { computeAnalytics } from '../../src/services/analytics';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const CFBD_KEY     = process.env.CFBD_KEY;
const CFBD_BASE    = 'https://api.collegefootballdata.com';

// The commissioner configures the day and timezone; the hour is fixed to
// keep scope reasonable, matching the original request's "day of the week"
// framing rather than a full time-of-day picker.
const PROCESS_HOUR_LOCAL = 9;

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// ── Supabase REST helpers (plain fetch, no SDK — same style as cfbd-proxy) ──

function sbHeaders(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function sbGet(pathWithQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathWithQuery}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase GET ${pathWithQuery} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase INSERT ${table} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function sbPatch(table, id, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} failed: ${res.status} ${await res.text()}`);
}

// ── Timezone helpers ─────────────────────────────────────────────────────

function computeLocalParts(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false,
  }).formatToParts(date);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value;
  let hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '-1', 10);
  if (hour === 24) hour = 0; // some environments render midnight as "24"
  return { weekday: WEEKDAY_INDEX[weekdayStr] ?? -1, hour };
}

// ── CFBD helpers (direct calls — cfbd.ts's browser-relative proxy URL can't
//    be reused inside another function) ─────────────────────────────────────

function getCurrentSeasonYear() {
  const now = new Date();
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

async function cfbdGet(path, params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${CFBD_BASE}${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${CFBD_KEY}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchGamesRaw(year) {
  const [reg, post] = await Promise.all([
    cfbdGet('/games', { year, seasonType: 'regular' }),
    cfbdGet('/games', { year, seasonType: 'postseason' }),
  ]);
  return [...reg, ...post];
}

async function fetchRankingsRaw(year) {
  let history = await cfbdGet('/rankings', { year, seasonType: 'regular' });
  let isCurrentYear = true;
  if (!history.length) {
    history = await cfbdGet('/rankings', { year: year - 1, seasonType: 'regular' });
    isCurrentYear = false;
  }
  return { history, isCurrentYear };
}

// Builds GameData scoped to just the team ids we care about (currently
// rostered + involved in a pending claim), not every FBS team — we only
// need each of those teams' own results, not a browsable schedule.
function buildGameDataForTeams(teamIds, rawGames, rankHistory, isCurrentYear) {
  const gameData = {};
  teamIds.forEach(id => { gameData[id] = {}; });

  const fallbackLatestWeek = !isCurrentYear && rankHistory.length
    ? rankHistory.reduce((max, c) => (c.week > max.week ? c : max), rankHistory[0])
    : null;

  const getRankAtWeek = (school, week) => {
    const weekData = isCurrentYear ? rankHistory.find(w => w.week === week) : fallbackLatestWeek;
    if (!weekData) return null;
    const poll = weekData.polls?.find(p => p.poll === 'Playoff Committee Rankings' || p.poll === 'AP Top 25');
    const entry = poll?.ranks?.find(r => r.school === school);
    return entry?.rank ?? null;
  };

  for (const g of rawGames) {
    const rawHomeId = g.home_id ?? g.homeId;
    const rawAwayId = g.away_id ?? g.awayId;
    if (rawHomeId == null || rawAwayId == null) continue;
    const homeId = String(rawHomeId);
    const awayId = String(rawAwayId);
    if (!teamIds.has(homeId) && !teamIds.has(awayId)) continue;

    const homeTeam       = g.home_team       ?? g.homeTeam       ?? '';
    const awayTeam       = g.away_team       ?? g.awayTeam       ?? '';
    const homeConference = g.home_conference ?? g.homeConference ?? '';
    const awayConference = g.away_conference ?? g.awayConference ?? '';
    const homePoints     = g.home_points     ?? g.homePoints     ?? null;
    const awayPoints     = g.away_points     ?? g.awayPoints     ?? null;
    const startDate      = g.start_date      ?? g.startDate      ?? '';

    let week = g.week ?? 1;
    if (week === 1 && startDate) {
      const d = new Date(startDate);
      if (d.getMonth() === 7) week = 0;
    }

    const completed = g.completed || (homePoints != null && awayPoints != null);

    if (teamIds.has(homeId)) {
      gameData[homeId][week] = {
        week,
        opponent:       awayTeam,
        opponent_id:    awayId,
        opponent_logo:  null,
        opponent_rank:  getRankAtWeek(awayTeam, week),
        result:         completed ? (homePoints > awayPoints ? 'W' : 'L') : null,
        is_g5_opponent: !isP4Conference(awayConference),
        home_score:     homePoints,
        away_score:     awayPoints,
        completed,
        start_date:     startDate,
        is_home:        true,
        venue:          null,
        tv:             null,
      };
    }
    if (teamIds.has(awayId)) {
      gameData[awayId][week] = {
        week,
        opponent:       homeTeam,
        opponent_id:    homeId,
        opponent_logo:  null,
        opponent_rank:  getRankAtWeek(homeTeam, week),
        result:         completed ? (awayPoints > homePoints ? 'W' : 'L') : null,
        is_g5_opponent: !isP4Conference(homeConference),
        home_score:     homePoints,
        away_score:     awayPoints,
        completed,
        start_date:     startDate,
        is_home:        false,
        venue:          null,
        tv:             null,
      };
    }
  }

  return gameData;
}

// ── Conference-limit re-validation (mirrors useLeague.ts's checkConferenceLimits;
//    duplicated here since that file is a React hook, not a portable module) ──

function checkConferenceLimits(myRoster, droppedTeamId, addedTeamConference, settings) {
  const droppedTeam = myRoster.find(t => t.team_id === droppedTeamId);
  const addCategory = confCategory(addedTeamConference);
  const addMax = addCategory === 'G5' ? settings.g5_conf_max : settings.p4_conf_max;
  const addCurrentCount = addCategory === 'G5'
    ? myRoster.filter(t => !isP4Conference(t.team_conference)).length
    : myRoster.filter(t => t.team_conference === addedTeamConference).length;
  const droppingSameCategory = droppedTeam ? confCategory(droppedTeam.team_conference) === addCategory : false;
  const newCount = addCurrentCount - (droppingSameCategory ? 1 : 0) + 1;
  if (newCount > addMax) return { error: 'over max' };

  if (droppedTeam) {
    const dropCategory = confCategory(droppedTeam.team_conference);
    const dropMin = dropCategory === 'G5' ? settings.g5_conf_min : settings.p4_conf_min;
    if (dropMin > 0 && !droppingSameCategory) {
      const dropCurrentCount = dropCategory === 'G5'
        ? myRoster.filter(t => !isP4Conference(t.team_conference)).length
        : myRoster.filter(t => t.team_conference === droppedTeam.team_conference).length;
      if (dropCurrentCount - 1 < dropMin) return { error: 'under min' };
    }
  }
  return {};
}

// ── Per-league processing ────────────────────────────────────────────────

async function processLeague(league, scoring) {
  const [members, draftPicks, moves, captainPicks, manualBonuses, spreadPicks, pendingClaims] = await Promise.all([
    sbGet(`league_members?league_id=eq.${league.id}&select=*`),
    sbGet(`draft_picks?league_id=eq.${league.id}&select=*`),
    sbGet(`free_agency_moves?league_id=eq.${league.id}&select=*`),
    sbGet(`captain_picks?league_id=eq.${league.id}&select=*`),
    sbGet(`manual_bonuses?league_id=eq.${league.id}&select=*`),
    sbGet(`spread_picks?league_id=eq.${league.id}&select=*`),
    sbGet(`waiver_claims?league_id=eq.${league.id}&status=eq.pending&select=*`),
  ]);

  if (pendingClaims.length === 0) return { skipped: 'no pending claims' };

  const teamIds = new Set([
    ...draftPicks.map(p => p.team_id),
    ...moves.map(m => m.added_team_id),
    ...pendingClaims.map(c => c.added_team_id),
    ...pendingClaims.map(c => c.dropped_team_id),
  ]);

  const year = getCurrentSeasonYear();
  const [rawGames, rankResult] = await Promise.all([
    fetchGamesRaw(year),
    fetchRankingsRaw(year),
  ]);
  const gameData = buildGameDataForTeams(teamIds, rawGames, rankResult.history, rankResult.isCurrentYear);

  // Stat ranking bonuses are excluded here (empty seasonStats map) — a small,
  // slow-moving part of total score, unlikely to flip a real waiver ordering.
  const confChampComplete = league.current_week >= 15;
  const leaderboard = buildLeaderboard(
    members, draftPicks, captainPicks, gameData, scoring, manualBonuses,
    new Map(), confChampComplete, spreadPicks, moves, league.current_week,
  );
  const { analytics } = computeAnalytics(leaderboard, draftPicks, []);
  const analyticsByUser = new Map(analytics.map(a => [a.user_id, a]));

  // Lower priorityValue = higher claim priority (worse record / fewer points goes first).
  const priorityValue = new Map();
  for (const entry of leaderboard) {
    if (scoring.waiver_priority_metric === 'worst_record') {
      const a = analyticsByUser.get(entry.user_id);
      const gp = (a?.wins ?? 0) + (a?.losses ?? 0);
      priorityValue.set(entry.user_id, gp > 0 ? a.wins / gp : 0.5);
    } else {
      priorityValue.set(entry.user_id, entry.total_points);
    }
  }

  const rosters = currentRosters(members, draftPicks, moves, league.current_week);
  const teamOwner = new Map();
  rosters.forEach((roster, uid) => roster.forEach(t => teamOwner.set(t.team_id, uid)));

  const byAddedTeam = new Map();
  pendingClaims.forEach(c => {
    if (!byAddedTeam.has(c.added_team_id)) byAddedTeam.set(c.added_team_id, []);
    byAddedTeam.get(c.added_team_id).push(c);
  });

  const now = new Date().toISOString();
  let processedCount = 0;
  let cancelledCount = 0;

  for (const group of byAddedTeam.values()) {
    const sorted = [...group].sort((a, b) => {
      const pa = priorityValue.get(a.user_id) ?? 0;
      const pb = priorityValue.get(b.user_id) ?? 0;
      if (pa !== pb) return pa - pb;
      return a.submitted_at.localeCompare(b.submitted_at);
    });

    let winner = null;
    for (const claim of sorted) {
      const myRoster = rosters.get(claim.user_id) ?? [];
      const ownsDropped = myRoster.some(t => t.team_id === claim.dropped_team_id);
      const targetTaken = teamOwner.has(claim.added_team_id);
      if (!ownsDropped || targetTaken) continue;
      const confCheck = checkConferenceLimits(myRoster, claim.dropped_team_id, claim.added_team_conference, scoring);
      if (confCheck.error) continue;
      winner = claim;
      break;
    }

    if (winner) {
      const penaltyPoints = scoring.fa_penalty_enabled ? -Math.abs(scoring.fa_penalty_points) : 0;
      const moveRow = await sbInsert('free_agency_moves', {
        league_id:                league.id,
        user_id:                  winner.user_id,
        week:                     league.current_week,
        dropped_team_id:          winner.dropped_team_id,
        dropped_team_name:        winner.dropped_team_name,
        dropped_team_logo:        winner.dropped_team_logo,
        dropped_team_conference:  winner.dropped_team_conference,
        added_team_id:            winner.added_team_id,
        added_team_name:          winner.added_team_name,
        added_team_logo:          winner.added_team_logo,
        added_team_conference:    winner.added_team_conference,
        penalty_points:           penaltyPoints,
      });

      const myRoster = rosters.get(winner.user_id) ?? [];
      const newRoster = myRoster.filter(t => t.team_id !== winner.dropped_team_id);
      newRoster.push({
        team_id: winner.added_team_id, team_name: winner.added_team_name,
        team_logo: winner.added_team_logo, team_conference: winner.added_team_conference,
        team_color: '#052e16',
      });
      rosters.set(winner.user_id, newRoster);
      teamOwner.delete(winner.dropped_team_id);
      teamOwner.set(winner.added_team_id, winner.user_id);

      await sbPatch('waiver_claims', winner.id, {
        status: 'processed',
        processed_at: now,
        priority_snapshot: priorityValue.get(winner.user_id) ?? null,
        resulting_move_id: moveRow.id,
      });
      processedCount++;

      for (const claim of group) {
        if (claim.id === winner.id) continue;
        await sbPatch('waiver_claims', claim.id, { status: 'cancelled', processed_at: now });
        cancelledCount++;
      }
    } else {
      for (const claim of group) {
        await sbPatch('waiver_claims', claim.id, { status: 'cancelled', processed_at: now });
        cancelledCount++;
      }
    }
  }

  return { processed: processedCount, cancelled: cancelledCount, groups: byAddedTeam.size };
}

// ── Main handler ──────────────────────────────────────────────────────────

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), { status: 500 });
  }
  if (!CFBD_KEY) {
    return new Response(JSON.stringify({ error: 'Missing CFBD_KEY env var' }), { status: 500 });
  }

  let leagues;
  try {
    leagues = await sbGet('leagues?select=*');
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }

  const now = new Date();
  const results = [];

  for (const league of leagues) {
    const scoring = normalizeScoring(league.scoring);
    if (!scoring.waiver_enabled) continue;

    const { weekday, hour } = computeLocalParts(scoring.waiver_timezone, now);
    if (weekday !== scoring.waiver_process_day || hour !== PROCESS_HOUR_LOCAL) continue;

    try {
      const outcome = await processLeague(league, scoring);
      results.push({ league_id: league.id, ...outcome });
    } catch (e) {
      console.error(`[process-waivers] league ${league.id} failed:`, e);
      results.push({ league_id: league.id, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ ranAt: now.toISOString(), results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  schedule: '0 * * * *',
};
