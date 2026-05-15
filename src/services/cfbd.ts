import type { CfbTeam, GameData, GameResult, APRanking, TeamSeasonStats } from '../types';

const BASE = 'https://api.collegefootballdata.com';
const KEY  = import.meta.env.VITE_CFBD_KEY as string;

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

const P4_CONFERENCES = new Set(['SEC', 'Big Ten', 'Big 12', 'ACC', 'FBS Independents', 'Pac-12']);

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
  const res = await fetch(`${BASE}${path}?year=${year}`, { headers });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    const res2 = await fetch(`${BASE}${path}?year=${year - 1}`, { headers });
    const data2 = await res2.json();
    return Array.isArray(data2) ? data2 : [];
  }
  return data;
}

// For /games specifically: try current year first, then fall back ONLY if
// truly empty (not just unplayed). The 2026 schedule exists pre-season with
// no scores — that is valid data, not an empty response.
async function fetchGames(year: number, seasonType = 'regular'): Promise<any[]> {
  const res = await fetch(`${BASE}/games?year=${year}&seasonType=${seasonType}`, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  if (Array.isArray(data) && data.length > 0) return data;
  // Only fall back if truly nothing returned
  const res2 = await fetch(`${BASE}/games?year=${year - 1}&seasonType=${seasonType}`, { headers });
  if (!res2.ok) return [];
  const data2 = await res2.json();
  return Array.isArray(data2) ? data2 : [];
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
  try {
    const rRes = await fetch(`${BASE}/rankings?year=${year}&seasonType=regular`, { headers });
    rankHistory = rRes.ok ? await rRes.json() : [];
    if (!Array.isArray(rankHistory) || !rankHistory.length) {
      const rRes2 = await fetch(`${BASE}/rankings?year=${year - 1}&seasonType=regular`, { headers });
      rankHistory = rRes2.ok ? await rRes2.json() : [];
    }
  } catch { /* rankings optional */ }

  const getRankAtWeek = (school: string, week: number): number | null => {
    const weekData = rankHistory.find((w: any) => w.week === week);
    if (!weekData) return null;
    const poll = weekData.polls?.find((p: any) =>
      p.poll === 'Playoff Committee Rankings' || p.poll === 'AP Top 25'
    );
    const entry = poll?.ranks?.find((r: any) => r.school === school);
    return entry?.rank ?? null;
  };

  // Fetch regular season and postseason games for the current year
  const [regGames, postGames] = await Promise.all([
    fetchGames(year, 'regular'),
    fetchGames(year, 'postseason'),
  ]);

  for (const g of [...regGames, ...postGames]) {
    // CFBD uses home_id/away_id (snake_case) in the /games endpoint
    const homeId = String(g.home_id ?? g.homeId ?? '');
    const awayId = String(g.away_id ?? g.awayId ?? '');
    if (!homeId || !awayId) continue;

    const home = teamMap.get(homeId);
    const away = teamMap.get(awayId);
    if (!home && !away) continue;   // neither team was drafted, skip

    // Week 0 detection: CFBD returns week=1 for "Week Zero" games played
    // in late August. Reclassify if game date is before Aug 28.
    let week = g.week ?? 0;
    if (week === 1) {
      const d = new Date(g.start_date);
      if (d.getMonth() === 7 && d.getDate() < 28) week = 0;
    }

    const completed = g.completed || (g.home_points != null && g.away_points != null);

    if (home) {
      const oppRank  = getRankAtWeek(g.away_team, week);
      const isG5Opp  = away ? away.is_g5 : !P4_CONFERENCES.has(g.away_conference ?? '');
      gameData[home.id][week] = {
        week,
        opponent:      g.away_team,
        opponent_rank: oppRank,
        result:        completed ? (g.home_points > g.away_points ? 'W' : 'L') : null,
        is_g5_opponent: isG5Opp,
        home_score:    g.home_points ?? null,
        away_score:    g.away_points ?? null,
        completed,
      };
    }

    if (away) {
      const oppRank  = getRankAtWeek(g.home_team, week);
      const isG5Opp  = home ? home.is_g5 : !P4_CONFERENCES.has(g.home_conference ?? '');
      gameData[away.id][week] = {
        week,
        opponent:      g.home_team,
        opponent_rank: oppRank,
        result:        completed ? (g.away_points > g.home_points ? 'W' : 'L') : null,
        is_g5_opponent: isG5Opp,
        home_score:    g.home_points ?? null,
        away_score:    g.away_points ?? null,
        completed,
      };
    }
  }

  return gameData;
}

export async function fetchRankings(teams: CfbTeam[]): Promise<APRanking[]> {
  const year = getCurrentSeasonYear();
  let data: any[] = [];
  try {
    const res = await fetch(`${BASE}/rankings?year=${year}&seasonType=regular`, { headers });
    data = res.ok ? await res.json() : [];
    if (!Array.isArray(data) || !data.length) {
      const res2 = await fetch(`${BASE}/rankings?year=${year - 1}&seasonType=regular`, { headers });
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
    let res = await fetch(`${BASE}/records?year=${year}`, { headers });
    let data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      res = await fetch(`${BASE}/records?year=${year - 1}`, { headers });
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

  const resolveId = (school: string): string | null => {
    const exact = nameToId.get(school.toLowerCase());
    if (exact) return exact;
    for (const [name, id] of nameToId.entries()) {
      if (name.includes(school.toLowerCase()) || school.toLowerCase().includes(name)) return id;
    }
    return null;
  };

  try {
    const [passingRes, rushingRes, defensiveRes] = await Promise.all([
      fetch(`${BASE}/stats/season?year=${year}&statType=passing`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/stats/season?year=${year}&statType=rushing`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/stats/season?year=${year}&statType=defensive`, { headers }).then(r => r.ok ? r.json() : []),
    ]);

    const qbrMap   = new Map<string, number>();
    const recTdMap = new Map<string, number>();
    passingRes.forEach((s: any) => {
      const id = resolveId(s.team);
      if (!id) return;
      if (s.statName === 'passer_rating') qbrMap.set(id, s.stat ?? 0);
      if (s.statName === 'receivingTDs')  recTdMap.set(id, s.stat ?? 0);
    });

    const rushTdMap = new Map<string, number>();
    rushingRes.forEach((s: any) => {
      const id = resolveId(s.team);
      if (!id) return;
      if (s.statName === 'rushingTDs') rushTdMap.set(id, s.stat ?? 0);
    });

    const intMap  = new Map<string, number>();
    const sackMap = new Map<string, number>();
    defensiveRes.forEach((s: any) => {
      const id = resolveId(s.team);
      if (!id) return;
      if (s.statName === 'interceptions') intMap.set(id, s.stat ?? 0);
      if (s.statName === 'sacks')         sackMap.set(id, s.stat ?? 0);
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
