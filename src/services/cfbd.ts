import type { CfbTeam, GameData, GameResult, APRanking, TeamSeasonStats, SpreadData, TeamRatings, LiveGameStatus } from '../types';
import { P4_CONFERENCES as P4_CONF_LIST } from '../types';
import { supabase } from '../lib/supabase';

// All CFBD API calls are routed through a Netlify serverless proxy to avoid
// CORS issues when fetching from the browser. The proxy adds the API key
// server-side (stored as CFBD_KEY in Netlify env vars — NOT in the bundle).
const PROXY = '/.netlify/functions/cfbd-proxy';

// Build a proxied URL: instead of calling CFBD directly, we call our function
// which forwards the request with the API key attached server-side.
function proxyUrl(path: string, params: Record<string, string | number> = {}): string {
  const qs = new URLSearchParams({ path, ...Object.fromEntries(Object.entries(params).map(([k,v]) => [k, String(v)])) });
  return `${PROXY}?${qs.toString()}`;
}

// Drop-in replacement for fetch({BASE}{path}?{params}, { headers }).
// The proxy requires a signed-in caller — it spends a metered CFBD key, so
// leaving it open let anyone drain the quota. Callers are all behind the
// auth gate already (useCfbData only runs once there's a session), so a
// missing token here means something is wrong rather than something
// expected, and the proxy's 401 surfaces it instead of failing silently.
async function cfbdFetch(path: string, params: Record<string, string | number> = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(proxyUrl(path, params), {
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
}

// Canonical P4 list (types/index.ts) — previously diverged here (also
// treated FBS Independents/Pac-12 as P4), which meant losses to teams like
// Notre Dame never triggered the loss_g5 scoring penalty. Consolidated so
// P4/G5 classification agrees everywhere in the app.
const P4_CONFERENCES = new Set(P4_CONF_LIST as readonly string[]);

// CFB seasons run Aug–Jan. We want to show the UPCOMING season's schedule
// as soon as it exists (~spring before the season). The CFBD API has 2026
// schedules available now (May 2026), so we use a "draft year" approach:
//
//   Jan 1 – Jul 31  → use current calendar year (2026 draft/preseason)
//   Aug 1 – Dec 31  → use current calendar year (2026 active season)
//   Jan 1 – Jan 31  → use prior calendar year (e.g. Jan 2027 → 2026 season)
//
// In practice: if month is 0 (Jan) we're in the bowl/postseason window so
// use prior year. Otherwise use the current calendar year.
function getCurrentSeasonYear(): number {
  const now = new Date();
  const month = now.getMonth(); // 0 = Jan
  return month === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

// For non-game endpoints (rankings, records, stats): fall back to prior year
// if the current year returns nothing — those endpoints are empty pre-season.
async function fetchWithFallback(path: string, year: number): Promise<any[]> {
  const res = await cfbdFetch(path, { year });
  if (!res.ok) {
    const res2 = await cfbdFetch(path, { year: year - 1 });
    if (!res2.ok) return [];
    const data2 = await res2.json();
    return Array.isArray(data2) ? data2 : [];
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    const res2 = await cfbdFetch(path, { year: year - 1 });
    if (!res2.ok) return [];
    const data2 = await res2.json();
    return Array.isArray(data2) ? data2 : [];
  }
  return data;
}

// For /games specifically: try current year first, then fall back ONLY if
// truly empty (not just unplayed). The 2026 schedule exists pre-season with
// no scores — that is valid data, not an empty response.
async function fetchGames(year: number, seasonType = 'regular'): Promise<any[]> {
  const res = await cfbdFetch('/games', { year, seasonType });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  // Never fall back to a prior year for games — stale scores corrupt the display.
  // If 2026 regular season returns games, use them even if scores are null (preseason).
  // If truly empty (e.g. postseason before bowls), return empty — don't bleed 2025 data.
  return data;
}

export async function fetchFbsTeams(): Promise<CfbTeam[]> {
  const year = getCurrentSeasonYear();
  const raw = await fetchWithFallback('/teams/fbs', year);
  return raw
    .map((t: any): CfbTeam => ({
      id:         String(t.id),
      name:       t.school,
      conference: t.conference ?? 'Independent',
      logo:       t.logos?.[0] ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(t.school)}&background=052e16&color=22c55e`,
      color:      t.color     ?? '#052e16',
      alt_color:  t.alt_color ?? '#22c55e',
      is_g5:      !P4_CONFERENCES.has(t.conference ?? ''),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchSeasonData(teams: CfbTeam[]): Promise<GameData> {
  const year = getCurrentSeasonYear();
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const gameData: GameData = {};
  teams.forEach(t => { gameData[t.id] = {}; });

  let rankHistory: any[] = [];
  let rankHistoryIsCurrentYear = true;
  try {
    const rRes = await cfbdFetch('/rankings', { year, seasonType: 'regular' });
    rankHistory = rRes.ok ? await rRes.json() : [];
    if (!Array.isArray(rankHistory) || !rankHistory.length) {
      const rRes2 = await cfbdFetch('/rankings', { year: year - 1, seasonType: 'regular' });
      rankHistory = rRes2.ok ? await rRes2.json() : [];
      rankHistoryIsCurrentYear = false;
    }
  } catch { /* rankings optional */ }

  // When the current season has no polls published yet, we fall back to
  // last season's history above — but matching a past week's poll against
  // this year's game-week number is meaningless (that week's opponent
  // ranking has no connection to this year's schedule). In that case, use
  // last season's single latest/final poll for every game instead, so it
  // matches the "most recent known rank" shown elsewhere (e.g. the AP Top
  // 25 page). Once this season's own polls exist, real per-week history
  // is used again.
  const fallbackLatestWeek = !rankHistoryIsCurrentYear && rankHistory.length
    ? rankHistory.reduce((max: any, c: any) => c.week > max.week ? c : max, rankHistory[0])
    : null;

  const getRankAtWeek = (school: string, week: number): number | null => {
    // Carry the most recent published poll forward rather than requiring an
    // exact week match — a future week's opponent (e.g. week 6, before that
    // week's games happen) has no poll of its own yet, but is still ranked
    // right now under whatever the latest available poll says (preseason,
    // most commonly, early in the year). Requiring week === poll.week left
    // every future opponent unranked until its own week's poll existed.
    const weekData = rankHistoryIsCurrentYear
      ? [...rankHistory].filter((w: any) => w.week <= week).sort((a: any, b: any) => b.week - a.week)[0]
      : fallbackLatestWeek;
    if (!weekData) return null;
    const poll = weekData.polls?.find((p: any) =>
      p.poll === 'Playoff Committee Rankings' || p.poll === 'AP Top 25'
    );
    const entry = poll?.ranks?.find((r: any) => r.school === school);
    return entry?.rank ?? null;
  };

  // Build a name→{logo,color} map from the FBS teams list for opponent
  // lookup, below.
  const teamNameToLogo = new Map(teams.map(t => [t.name, t.logo]));
  const teamNameToColor = new Map(teams.map(t => [t.name, t.color]));

  // Fetch games, media (TV), venues, weather, and every team CFBD knows
  // about (not just FBS) in parallel — a drafted FBS team's opponent is
  // frequently an FCS "buy game" (e.g. Bethune-Cookman, Arkansas-Pine
  // Bluff), which never appears in the FBS-only `teams` list above, so
  // those opponents had no logo/color source at all without this. `/teams`
  // with no classification filter returns every division for the year.
  const [regGames, postGames, mediaRaw, venuesRaw, weatherRaw, allTeamsRaw] = await Promise.all([
    fetchGames(year, 'regular'),
    fetchGames(year, 'postseason'),
    cfbdFetch('/games/media', { year, seasonType: 'regular' })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    cfbdFetch('/venues', {})
      .then(r => r.ok ? r.json() : []).catch(() => []),
    // CFBD only has real forecasts within roughly a week of kickoff — most
    // future games simply won't have an entry here yet, which is expected.
    cfbdFetch('/games/weather', { year, seasonType: 'regular' })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    cfbdFetch('/teams', { year })
      .then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  // Fallback source for opponent logo/color when the opponent isn't in the
  // FBS-only teams list above (FCS and lower-division opponents).
  if (Array.isArray(allTeamsRaw)) {
    for (const t of allTeamsRaw) {
      const name = t.school;
      if (!name || teamNameToLogo.has(name)) continue; // FBS entry already wins
      const logo = t.logos?.[0] ?? null;
      if (logo) teamNameToLogo.set(name, logo);
      if (t.color) teamNameToColor.set(name, t.color);
    }
  }

  // Build gameId → TV outlet map
  const mediaMap = new Map<string, string>();
  if (Array.isArray(mediaRaw)) {
    for (const m of mediaRaw) {
      const id = String(m.id ?? m.gameId ?? '');
      const outlet = m.outlet ?? m.network ?? m.mediaType ?? null;
      if (id && outlet) mediaMap.set(id, outlet);
    }
  }

  // Build gameId → weather map
  const weatherMap = new Map<string, { condition: string | null; temp: number | null; windSpeed: number | null; indoors: boolean }>();
  if (Array.isArray(weatherRaw)) {
    for (const w of weatherRaw) {
      const id = String(w.id ?? w.gameId ?? '');
      if (!id) continue;
      weatherMap.set(id, {
        condition: w.weatherCondition ?? null,
        temp: typeof w.temperature === 'number' ? w.temperature : null,
        windSpeed: typeof w.windSpeed === 'number' ? w.windSpeed : null,
        indoors: w.gameIndoors === true,
      });
    }
  }

  // Build gameId → venue string map using venueId on the game
  const venueById = new Map<string, any>();
  if (Array.isArray(venuesRaw)) {
    for (const v of venuesRaw) {
      if (v.id) venueById.set(String(v.id), v);
    }
  }

  const allGames = [...regGames, ...postGames];

  // Build gameId → venue string after we have games
  const venueMap = new Map<string, string>();
  for (const g of allGames) {
    const gameId = String(g.id ?? g.gameId ?? '');
    const venueId = String(g.venueId ?? g.venue_id ?? '');
    if (!gameId) continue;
    const v = venueById.get(venueId);
    if (v) {
      const parts = [v.name, v.city, v.state].filter(Boolean);
      venueMap.set(gameId, parts.join(', '));
    }
  }

  for (const g of allGames) {
    // CFBD API returns camelCase (homeId, awayId) in some contexts and
    // snake_case (home_id, away_id) in others — handle both defensively.
    const rawHomeId = g.home_id ?? g.homeId;
    const rawAwayId = g.away_id ?? g.awayId;
    if (rawHomeId == null || rawAwayId == null) continue;
    const homeId = String(rawHomeId);
    const awayId = String(rawAwayId);
    if (!homeId || !awayId || homeId === 'undefined' || awayId === 'undefined') continue;

    const home = teamMap.get(homeId);
    const away = teamMap.get(awayId);
    if (!home && !away) continue;   // neither team was drafted, skip

    // venueMap/mediaMap are keyed by String(id) (built above) — stringify
    // here too, since g.id arrives as a raw JSON number and a Map's key
    // lookup doesn't coerce types (a number key never matches a string key).
    const gameKey = String(g.id ?? g.gameId ?? '');
    const venue   = venueMap.get(gameKey) ?? null;
    const tv      = mediaMap.get(gameKey) ?? null;
    const weather = weatherMap.get(gameKey) ?? null;

    // Normalize field names — API returns both camelCase and snake_case
    const homeTeam       = g.home_team       ?? g.homeTeam       ?? '';
    const awayTeam       = g.away_team       ?? g.awayTeam       ?? '';
    const homeConference = g.home_conference ?? g.homeConference ?? '';
    const awayConference = g.away_conference ?? g.awayConference ?? '';
    const homePoints     = g.home_points     ?? g.homePoints     ?? null;
    const awayPoints     = g.away_points     ?? g.awayPoints     ?? null;
    const startDate      = g.start_date      ?? g.startDate      ?? '';
    const startTimeTbd   = g.start_time_tbd  ?? g.startTimeTBD   ?? false;

    // CFBD returns Week Zero games as week=1 with an August start date.
    // Reclassify: if week=1 and the game is in August, it's actually week 0.
    let week = g.week ?? 1;
    if (week === 1 && startDate) {
      const d = new Date(startDate);
      if (d.getMonth() === 7) week = 0; // month 7 = August
    }

    const completed = g.completed || (homePoints != null && awayPoints != null);

    if (home) {
      const oppRank    = getRankAtWeek(awayTeam, week);
      const isG5Opp    = away ? away.is_g5 : !P4_CONFERENCES.has(awayConference);
      const oppLogo    = away?.logo ?? teamNameToLogo.get(awayTeam) ?? null;
      const oppColor   = away?.color ?? teamNameToColor.get(awayTeam) ?? null;
      const oppId      = awayId;
      gameData[home.id][week] = {
        week,
        opponent:        awayTeam,
        opponent_id:     oppId,
        opponent_logo:   oppLogo,
        opponent_color:  oppColor,
        opponent_rank:   oppRank,
        result:          completed ? (homePoints > awayPoints ? 'W' : 'L') : null,
        is_g5_opponent:  isG5Opp,
        home_score:      homePoints,
        away_score:      awayPoints,
        completed,
        start_date:      startDate,
        start_time_tbd:  startTimeTbd,
        is_home:         true,
        venue,
        tv,
        weather_condition: weather?.condition ?? null,
        weather_temp:       weather?.temp ?? null,
        wind_speed:         weather?.windSpeed ?? null,
        game_indoors:       weather?.indoors ?? false,
      };
    }

    if (away) {
      const oppRank    = getRankAtWeek(homeTeam, week);
      const isG5Opp    = home ? home.is_g5 : !P4_CONFERENCES.has(homeConference);
      const oppLogo    = home?.logo ?? teamNameToLogo.get(homeTeam) ?? null;
      const oppColor   = home?.color ?? teamNameToColor.get(homeTeam) ?? null;
      const oppId      = homeId;
      gameData[away.id][week] = {
        week,
        opponent:        homeTeam,
        opponent_id:     oppId,
        opponent_logo:   oppLogo,
        opponent_color:  oppColor,
        opponent_rank:   oppRank,
        result:          completed ? (awayPoints > homePoints ? 'W' : 'L') : null,
        is_g5_opponent:  isG5Opp,
        home_score:      homePoints,
        away_score:      awayPoints,
        completed,
        start_date:      startDate,
        start_time_tbd:  startTimeTbd,
        is_home:         false,
        venue,
        tv,
        weather_condition: weather?.condition ?? null,
        weather_temp:       weather?.temp ?? null,
        wind_speed:         weather?.windSpeed ?? null,
        game_indoors:       weather?.indoors ?? false,
      };
    }
  }

  return gameData;
}

export async function fetchRankings(teams: CfbTeam[]): Promise<APRanking[]> {
  const year = getCurrentSeasonYear();
  let data: any[] = [];
  try {
    const res = await cfbdFetch('/rankings', { year, seasonType: 'regular' });
    data = res.ok ? await res.json() : [];
    if (!Array.isArray(data) || !data.length) {
      const res2 = await cfbdFetch('/rankings', { year: year - 1, seasonType: 'regular' });
      data = res2.ok ? await res2.json() : [];
    }
  } catch { return []; }

  if (!data.length) return [];

  const latest = data.reduce((max: any, c: any) => c.week > max.week ? c : max, data[0]);
  const prev   = data.find((w: any) => w.week === latest.week - 1);
  const teamMap = new Map(teams.map(t => [t.name, t]));

  const getPoll = (weekData: any) =>
    weekData?.polls?.find((p: any) =>
      p.poll === 'Playoff Committee Rankings' || p.poll === 'AP Top 25'
    );

  const currPoll = getPoll(latest);
  const prevPoll = getPoll(prev);
  if (!currPoll) return [];

  const prevRanks = new Map<string, number>();
  prevPoll?.ranks?.forEach((r: any) => prevRanks.set(r.school, r.rank));

  return currPoll.ranks.map((r: any): APRanking => {
    const t = teamMap.get(r.school);
    const curr = r.rank;
    const prev = prevRanks.get(r.school) ?? null;
    return {
      rank:          curr,
      team_name:     r.school,
      team_id:       t?.id,
      record:        t ? t.name : r.school,
      previous_rank: prev,
      trend:         prev == null ? 'new' : curr < prev ? 'up' : curr > prev ? 'down' : 'same',
    };
  });
}

export async function fetchTeamRecords(): Promise<Map<string, { wins: number; losses: number }>> {
  const year = getCurrentSeasonYear();
  const map = new Map<string, { wins: number; losses: number }>();
  try {
    let res = await cfbdFetch('/records', { year });
    let data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      res = await cfbdFetch('/records', { year: year - 1 });
      data = await res.json();
    }
    data?.forEach((r: any) => {
      if (r.teamId) map.set(String(r.teamId), { wins: r.total?.wins ?? 0, losses: r.total?.losses ?? 0 });
    });
  } catch { /* optional */ }
  return map;
}

export async function fetchSeasonStats(teams: CfbTeam[]): Promise<Map<string, TeamSeasonStats>> {
  const year = getCurrentSeasonYear();
  const nameToId = new Map(teams.map(t => [t.name.toLowerCase(), t.id]));
  const map = new Map<string, TeamSeasonStats>();

  // Exact match only — a substring-containment fallback here previously
  // matched any "<FBS team> State"-style FCS opponent onto the shorter FBS
  // team's own id (confirmed live: a South Carolina State player's stats
  // got attributed to South Carolina, since "South Carolina State".includes
  // ("south carolina") is true). A team not in this app's own FBS list
  // should resolve to nothing, not to whichever unrelated team's name
  // happens to be a prefix of it.
  const resolveId = (school: string): string | null => nameToId.get(school.toLowerCase()) ?? null;

  try {
    const [rushingRes, defensiveRes, playerRes] = await Promise.all([
      cfbdFetch('/stats/season', { year, statType: 'rushing' }).then(r => r.ok ? r.json() : []),
      cfbdFetch('/stats/season', { year, statType: 'defensive' }).then(r => r.ok ? r.json() : []),
      cfbdFetch('/stats/player/season', { year }).then(r => r.ok ? r.json() : []),
    ]);

    // CFBD's team-level /stats/season entries carry the number in
    // `statValue`, not `stat` — confirmed against a real cached response
    // (e.g. { team: "NC State", statName: "rushingTDs", statValue: 1 }).
    // Reading `s.stat` silently produced 0 for every team here.
    const rushTdMap = new Map<string, number>();
    rushingRes.forEach((s: any) => {
      const id = resolveId(s.team);
      if (!id) return;
      if (s.statName === 'rushingTDs') rushTdMap.set(id, s.statValue ?? 0);
    });

    const intMap  = new Map<string, number>();
    const sackMap = new Map<string, number>();
    defensiveRes.forEach((s: any) => {
      const id = resolveId(s.team);
      if (!id) return;
      if (s.statName === 'interceptions') intMap.set(id, s.statValue ?? 0);
      if (s.statName === 'sacks')         sackMap.set(id, s.statValue ?? 0);
    });

    // QBR/Receiving TDs: CFBD's team-level /stats/season has no passer
    // rating or receiving-TD field at all — confirmed by inspecting a real
    // response, neither exists there under any name. Both are only
    // published per-player, so this computes them itself from
    // /stats/player/season (field is `stat`, a numeric string, here —
    // different from the team-level endpoint's `statValue`).
    //
    // QBR is the standard NCAA passer-efficiency formula, summed across
    // every passing-category entry on a team (not filtered to QB — a rare
    // trick-play pass from a non-QB is still real team passing production):
    //   (8.4 × yards + 330 × TD + 100 × completions − 200 × INT) / attempts
    //
    // Receiving TDs is summed only across WR-position players, per league
    // request, rather than every pass-catcher (RB/TE included).
    type PassTotals = { completions: number; attempts: number; yards: number; td: number; int: number };
    const passTotals = new Map<string, PassTotals>();
    const recTdMap = new Map<string, number>();

    playerRes.forEach((p: any) => {
      const id = resolveId(p.team);
      if (!id) return;
      const value = parseFloat(p.stat);
      if (isNaN(value)) return;

      if (p.category === 'passing') {
        const totals = passTotals.get(id) ?? { completions: 0, attempts: 0, yards: 0, td: 0, int: 0 };
        if (p.statType === 'COMPLETIONS') totals.completions += value;
        if (p.statType === 'ATT')         totals.attempts += value;
        if (p.statType === 'YDS')         totals.yards += value;
        if (p.statType === 'TD')          totals.td += value;
        if (p.statType === 'INT')         totals.int += value;
        passTotals.set(id, totals);
      }

      if (p.category === 'receiving' && p.position === 'WR' && p.statType === 'TD') {
        recTdMap.set(id, (recTdMap.get(id) ?? 0) + value);
      }
    });

    const qbrMap = new Map<string, number>();
    passTotals.forEach((t, id) => {
      if (t.attempts <= 0) return;
      qbrMap.set(id, (8.4 * t.yards + 330 * t.td + 100 * t.completions - 200 * t.int) / t.attempts);
    });

    const allIds = new Set([
      ...qbrMap.keys(), ...rushTdMap.keys(), ...recTdMap.keys(),
      ...intMap.keys(), ...sackMap.keys(),
    ]);

    allIds.forEach(id => {
      map.set(id, {
        team_id:       id,
        qbr:           qbrMap.get(id)    ?? null,
        rushing_tds:   rushTdMap.get(id) ?? null,
        receiving_tds: recTdMap.get(id)  ?? null,
        def_ints:      intMap.get(id)    ?? null,
        sacks:         sackMap.get(id)   ?? null,
      });
    });
  } catch (e) {
    console.warn('Failed to fetch season stats:', e);
  }

  return map;
}

// ── Team Ratings (FPI + SP+) ─────────────────────────────────────────────
// FPI gives an overall rank plus a strength-of-schedule rank; SP+ gives
// clean, pre-computed offense/defense ranks. Neither publishes ranks until
// there's enough of the season played to calibrate, so both endpoints fall
// back to the prior year via fetchWithFallback when empty. Strength of
// schedule is further refined below using each team's real current-season
// schedule (see oppAvgFpi).

export async function fetchTeamRatings(teams: CfbTeam[], gameData: GameData): Promise<Map<string, TeamRatings>> {
  const year = getCurrentSeasonYear();
  const nameToId = new Map(teams.map(t => [t.name.toLowerCase(), t.id]));
  const map = new Map<string, TeamRatings>();

  // Exact match only — a substring-containment fallback here previously
  // matched any "<FBS team> State"-style FCS opponent onto the shorter FBS
  // team's own id (confirmed live: a South Carolina State player's stats
  // got attributed to South Carolina, since "South Carolina State".includes
  // ("south carolina") is true). A team not in this app's own FBS list
  // should resolve to nothing, not to whichever unrelated team's name
  // happens to be a prefix of it.
  const resolveId = (school: string): string | null => nameToId.get(school.toLowerCase()) ?? null;

  try {
    const [fpiRes, spRes] = await Promise.all([
      fetchWithFallback('/ratings/fpi', year),
      fetchWithFallback('/ratings/sp', year),
    ]);

    const fpiByTeam = new Map<string, any>();
    fpiRes.forEach((r: any) => {
      const id = resolveId(r.team);
      if (id) fpiByTeam.set(id, r);
    });
    const spByTeam = new Map<string, any>();
    spRes.forEach((r: any) => {
      const id = resolveId(r.team);
      if (id) spByTeam.set(id, r);
    });

    // CFBD doesn't publish current-season SOS until enough of the season is
    // played to calibrate it. In the meantime, estimate schedule strength
    // ourselves from data we already have: each team's real schedule for
    // this season (gameData) combined with each opponent's most recent FPI
    // rating. This auto-updates every year with no hardcoded teams, and is
    // more accurate than reusing a team's own SOS rank from last season
    // (which reflects last year's opponents, not this year's).
    const oppAvgFpi = new Map<string, number>();
    teams.forEach(team => {
      const games = gameData[team.id] ?? {};
      const oppFpiValues: number[] = [];
      Object.values(games).forEach(g => {
        const oppFpi = fpiByTeam.get(g.opponent_id)?.fpi;
        if (typeof oppFpi === 'number') oppFpiValues.push(oppFpi);
      });
      if (oppFpiValues.length > 0) {
        oppAvgFpi.set(team.id, oppFpiValues.reduce((a, b) => a + b, 0) / oppFpiValues.length);
      }
    });

    // Higher average opponent FPI = tougher schedule = rank 1, matching
    // CFBD's own "lower rank = tougher" convention for strength of schedule.
    const preseasonSosRank = new Map<string, number>();
    [...oppAvgFpi.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([teamId], i) => preseasonSosRank.set(teamId, i + 1));

    const allIds = new Set([...fpiByTeam.keys(), ...spByTeam.keys()]);
    allIds.forEach(id => {
      const fpi = fpiByTeam.get(id);
      const sp  = spByTeam.get(id);
      map.set(id, {
        fpi_rank:           fpi?.resumeRanks?.fpi ?? null,
        offense_rank:       sp?.offense?.ranking ?? null,
        defense_rank:       sp?.defense?.ranking ?? null,
        sos_rank:           preseasonSosRank.get(id) ?? fpi?.resumeRanks?.strengthOfSchedule ?? null,
      });
    });
  } catch (e) {
    console.warn('Failed to fetch team ratings:', e);
  }

  return map;
}

// ── Spread / Betting Lines ─────────────────────────────────────────────────
// Fetches point spreads for a given week from CFBD /lines endpoint.
// Returns a map of teamId → spread (negative = favored, positive = underdog).
// Uses DraftKings as primary provider, falls back to ESPN Bet, then any available.

const PREFERRED_PROVIDERS = ['draftkings', 'espnbet', 'fanduel', 'bovada'];

export async function fetchSpreads(
  teams: CfbTeam[],
  year: number,
  week: number,
  gameData: GameData = {},
  seasonType = 'regular',
): Promise<SpreadData> {
  const result: SpreadData = {};
  teams.forEach(t => { result[t.id] = null; });

  try {
    const res = await cfbdFetch('/lines', { year, week, seasonType });
    if (!res.ok) return result;
    const data = await res.json();
    if (!Array.isArray(data)) return result;

    // Build name→id map for matching
    const nameToId = new Map(teams.map(t => [t.name.toLowerCase(), t.id]));

    for (const game of data) {
      const homeTeam = (game.homeTeam ?? game.home_team ?? '').toLowerCase();
      const awayTeam = (game.awayTeam ?? game.away_team ?? '').toLowerCase();
      const homeId   = nameToId.get(homeTeam) ?? null;
      const awayId   = nameToId.get(awayTeam) ?? null;

      if (!homeId && !awayId) continue;

      // CFBD's /lines feed has occasionally carried a stray extra entry for
      // a team on a week it isn't actually playing (e.g. a mismatched/stale
      // matchup) alongside its real game. Matching purely by team name let
      // whichever entry appeared first in the response silently claim that
      // team's spread — cross-checking against gameData's opponent_id (its
      // actual scheduled opponent that week, from the real /games schedule)
      // rejects any line that doesn't belong to the team's real matchup.
      const homeOpponentId = gameData[homeId ?? '']?.[week]?.opponent_id;
      const awayOpponentId = gameData[awayId ?? '']?.[week]?.opponent_id;
      const homeMatches = homeId && (!homeOpponentId || homeOpponentId === awayId);
      const awayMatches = awayId && (!awayOpponentId || awayOpponentId === homeId);

      const lines: any[] = game.lines ?? [];
      if (!lines.length) continue;

      // Pick best available provider
      let line: any = null;
      for (const provider of PREFERRED_PROVIDERS) {
        line = lines.find((l: any) =>
          (l.provider ?? l.formattedSpread ?? '').toLowerCase().includes(provider)
        );
        if (line) break;
      }
      if (!line) line = lines[0]; // fallback to whatever is available
      if (!line) continue;

      // spread is from home team perspective: negative = home favored
      const rawSpread = parseFloat(line.spread ?? line.homeSpread ?? line.formattedSpread ?? '0');
      if (isNaN(rawSpread)) continue;

      if (homeMatches && result[homeId!] === null) result[homeId!] = rawSpread;
      if (awayMatches && result[awayId!] === null) result[awayId!] = -rawSpread; // flip for away
    }
  } catch (e) {
    console.warn('[CFBD] fetchSpreads failed:', e);
  }

  return result;
}

// Live in-game state — CFBD's Patreon-tier-only /scoreboard endpoint.
// Confirmed both against CFBD's published OpenAPI spec AND a real cached
// response pulled from this app's own cfbd_cache table during a live
// Week 0 slate (2026-08-29): homeTeam.name/awayTeam.name come back as full
// mascot names (e.g. "Florida State Seminoles"), NOT the school-only names
// this app uses everywhere else ("Florida State", from /teams/fbs). And
// `possession` is a bare side indicator — literally the string "home" or
// "away" — not a team name, despite what the OpenAPI schema's field name
// implies. Both of those were confirmed wrong in the first version of this
// function (which assumed possession was a team name and matched map keys
// by exact school name), so this resolves possession to an actual mascot
// name at parse time here, and callers match team names with a prefix
// check (see findLiveStatus / teamNameMatches below) instead of exact
// equality, since a school-only name is always a prefix of the mascot name.
function statusPriority(status: string): number {
  return status === 'in_progress' ? 2 : status === 'completed' ? 1 : 0;
}

// A team can legitimately appear more than once in a single /scoreboard
// response — e.g. during the Week 0/Week 1 overlap in late August, a team's
// just-finished opener and its upcoming Week 1 game are both present at
// once. Each entry carries the opponent's name so callers can pick the
// entry for the specific game they're rendering, rather than collapsing to
// one entry per team and risking a finished game's score leaking onto an
// unrelated, not-yet-played matchup against a different opponent.
export interface LiveScoreboardEntry extends LiveGameStatus {
  opponentName: string;
}

function addEntry(map: Map<string, LiveScoreboardEntry[]>, key: string, entry: LiveScoreboardEntry): void {
  const list = map.get(key);
  if (list) list.push(entry); else map.set(key, [entry]);
}

export async function fetchScoreboard(): Promise<Map<string, LiveScoreboardEntry[]>> {
  const map = new Map<string, LiveScoreboardEntry[]>();
  try {
    // `classification` defaults to 'fbs' server-side even when omitted, and
    // CFBD has no single value covering both fbs+fcs — so a drafted FBS
    // team's game against an FCS "buy game" opponent may or may not appear
    // here depending on how CFBD tags that game internally. Left as the
    // (equivalent) explicit default rather than a fix, since omitting it
    // changes nothing; this is a known gap, not something this app can
    // route around from a single scoreboard call.
    const res = await cfbdFetch('/scoreboard', { classification: 'fbs' });
    if (!res.ok) {
      console.warn('[CFBD] /scoreboard returned', res.status, await res.text().catch(() => ''));
      return map;
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      console.warn('[CFBD] /scoreboard returned unexpected shape:', data);
      return map;
    }

    for (const g of data) {
      const homeName = typeof g.homeTeam?.name === 'string' ? g.homeTeam.name : null;
      const awayName = typeof g.awayTeam?.name === 'string' ? g.awayTeam.name : null;

      const possessionSide = typeof g.possession === 'string' ? g.possession.toLowerCase() : null;
      const possessionTeam = possessionSide === 'home' ? homeName : possessionSide === 'away' ? awayName : null;

      const status: LiveGameStatus = {
        status:     typeof g.status === 'string' ? g.status : 'scheduled',
        period:     typeof g.period === 'number' ? g.period : null,
        clock:      typeof g.clock === 'string' ? g.clock : null,
        situation:  typeof g.situation === 'string' ? g.situation : null,
        possession: possessionTeam,
        home_points: typeof g.homeTeam?.points === 'number' ? g.homeTeam.points : null,
        away_points: typeof g.awayTeam?.points === 'number' ? g.awayTeam.points : null,
      };

      // /scoreboard returns every game for the classification, not just
      // today's — a team can be listed more than once at once (its
      // just-finished game and its next game), so every entry is kept
      // rather than collapsed to one per team; findLiveStatus below
      // disambiguates by opponent name.
      if (homeName) addEntry(map, homeName.toLowerCase(), { ...status, opponentName: awayName ?? '' });
      if (awayName) addEntry(map, awayName.toLowerCase(), { ...status, opponentName: homeName ?? '' });
    }
  } catch (e) {
    console.warn('[CFBD] fetchScoreboard failed:', e);
  }
  return map;
}

// fetchScoreboard's map is keyed by full mascot name ("Florida State
// Seminoles"), but this app's own team names are school-only ("Florida
// State") — a school name is always a prefix of its mascot name, so match
// on that instead of exact equality. `opponentName` (also school-only) is
// required to pick the right game when a team has more than one entry in
// the map at once — without it, a team's already-finished prior game could
// otherwise win over its real upcoming game via statusPriority.
export function findLiveStatus(
  live: Map<string, LiveScoreboardEntry[]>, teamName: string, opponentName: string
): LiveGameStatus | null {
  const needle = teamName.toLowerCase();
  const oppNeedle = opponentName.toLowerCase();
  let best: LiveScoreboardEntry | null = null;
  for (const [key, entries] of live) {
    if (!key.startsWith(needle)) continue;
    for (const entry of entries) {
      if (!entry.opponentName.toLowerCase().startsWith(oppNeedle)) continue;
      if (!best || statusPriority(entry.status) > statusPriority(best.status)) best = entry;
    }
  }
  return best;
}

// Same prefix relationship applies to a resolved possession team name
// (also a full mascot name) against this app's school-only names.
export function teamNameMatches(liveName: string | null, shortName: string): boolean {
  return liveName != null && liveName.toLowerCase().startsWith(shortName.toLowerCase());
}
