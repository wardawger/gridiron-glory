import type { CfbTeam, GameData, GameResult, APRanking, TeamSeasonStats } from '../types';

const BASE = 'https://api.collegefootballdata.com';
const KEY  = import.meta.env.VITE_CFBD_KEY as string;

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

const P4_CONFERENCES = new Set(['SEC', 'Big Ten', 'Big 12', 'ACC', 'FBS Independents', 'Pac-12']);

async function fetchWithFallback(path: string, year: number): Promise<any[]> {
  let res = await fetch(`${BASE}${path}?year=${year}`, { headers });
  let data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    res = await fetch(`${BASE}${path}?year=${year - 1}`, { headers });
    data = await res.json();
  }
  return Array.isArray(data) ? data : [];
}

export async function fetchFbsTeams(year = 2025): Promise<CfbTeam[]> {
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

export async function fetchSeasonData(teams: CfbTeam[], year = 2025): Promise<GameData> {
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const gameData: GameData = {};
  teams.forEach(t => { gameData[t.id] = {}; });

  let rankHistory: any[] = [];
  try {
    const rRes = await fetch(`${BASE}/rankings?year=${year}&seasonType=regular`, { headers });
    rankHistory = rRes.ok ? await rRes.json() : [];
    if (!rankHistory.length) {
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

  const [regGames, postGames] = await Promise.all([
    fetchWithFallback('/games', year),
    fetch(`${BASE}/games?year=${year}&seasonType=postseason`, { headers })
      .then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  for (const g of [...regGames, ...postGames]) {
    if (!g.home_id || !g.away_id) continue;
    const homeId = String(g.home_id);
    const awayId = String(g.away_id);
    const home = teamMap.get(homeId);
    const away = teamMap.get(awayId);
    if (!home && !away) continue;

    let week = g.week ?? 0;
    if (week === 1) {
      const d = new Date(g.start_date);
      if (d.getMonth() === 7 && d.getDate() < 28) week = 0;
    }

    const completed = g.completed || (g.home_points != null && g.away_points != null);

    if (home) {
      const oppRank = getRankAtWeek(g.away_team, week);
      const isG5Opp = away ? away.is_g5 : !P4_CONFERENCES.has(g.away_conference ?? '');
      gameData[home.id][week] = {
        week, opponent: g.away_team, opponent_rank: oppRank,
        result: completed ? (g.home_points > g.away_points ? 'W' : 'L') : null,
        is_g5_opponent: isG5Opp,
        home_score: g.home_points ?? null, away_score: g.away_points ?? null, completed,
      };
    }

    if (away) {
      const oppRank = getRankAtWeek(g.home_team, week);
      const isG5Opp = home ? home.is_g5 : !P4_CONFERENCES.has(g.home_conference ?? '');
      gameData[away.id][week] = {
        week, opponent: g.home_team, opponent_rank: oppRank,
        result: completed ? (g.away_points > g.home_points ? 'W' : 'L') : null,
        is_g5_opponent: isG5Opp,
        home_score: g.home_points ?? null, away_score: g.away_points ?? null, completed,
      };
    }
  }

  return gameData;
}

export async function fetchRankings(teams: CfbTeam[], year = 2025): Promise<APRanking[]> {
  let data: any[] = [];
  try {
    const res = await fetch(`${BASE}/rankings?year=${year}&seasonType=regular`, { headers });
    data = res.ok ? await res.json() : [];
    if (!data.length) {
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
      rank: curr, team_name: r.school, team_id: t?.id,
      record: t ? t.name : r.school, previous_rank: prev,
      trend: prev == null ? 'new' : curr < prev ? 'up' : curr > prev ? 'down' : 'same',
    };
  });
}

export async function fetchTeamRecords(year = 2025): Promise<Map<string, { wins: number; losses: number }>> {
  const map = new Map<string, { wins: number; losses: number }>();
  try {
    let res = await fetch(`${BASE}/records?year=${year}`, { headers });
    let data = await res.json();
    if (!data?.length) {
      res = await fetch(`${BASE}/records?year=${year - 1}`, { headers });
      data = await res.json();
    }
    data?.forEach((r: any) => {
      if (r.teamId) map.set(String(r.teamId), { wins: r.total?.wins ?? 0, losses: r.total?.losses ?? 0 });
    });
  } catch { /* optional */ }
  return map;
}

// ─── Season Stats (for Top/Bottom 3 auto-scoring) ──────────────────────────

export async function fetchSeasonStats(teams: CfbTeam[], year = 2025): Promise<Map<string, TeamSeasonStats>> {
  const nameToId = new Map(teams.map(t => [t.name.toLowerCase(), t.id]));
  const map = new Map<string, TeamSeasonStats>();

  const resolveId = (school: string): string | null => {
    // Try exact match first, then partial
    const exact = nameToId.get(school.toLowerCase());
    if (exact) return exact;
    for (const [name, id] of nameToId.entries()) {
      if (name.includes(school.toLowerCase()) || school.toLowerCase().includes(name)) return id;
    }
    return null;
  };

  try {
    // Fetch passing (for QBR/passer rating), rushing, and defensive stats in parallel
    const [passingRes, rushingRes, defensiveRes, sackRes] = await Promise.all([
      fetch(`${BASE}/stats/season?year=${year}&statType=passing`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/stats/season?year=${year}&statType=rushing`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/stats/season?year=${year}&statType=defensive`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/stats/season?year=${year}&statType=fumbles`, { headers }).then(r => r.ok ? r.json() : []),
    ]);

    // QBR / passer rating — use "passer_rating" stat
    const qbrMap = new Map<string, number>();
    passingRes.forEach((s: any) => {
      if (s.statName === 'passer_rating') {
        const id = resolveId(s.team);
        if (id) qbrMap.set(id, s.stat ?? 0);
      }
    });

    // Rushing TDs
    const rushTdMap = new Map<string, number>();
    rushingRes.forEach((s: any) => {
      if (s.statName === 'rushingTDs') {
        const id = resolveId(s.team);
        if (id) rushTdMap.set(id, s.stat ?? 0);
      }
    });

    // Receiving TDs — in passing stats as receivingTDs
    const recTdMap = new Map<string, number>();
    passingRes.forEach((s: any) => {
      if (s.statName === 'receivingTDs') {
        const id = resolveId(s.team);
        if (id) recTdMap.set(id, s.stat ?? 0);
      }
    });

    // Defensive INTs
    const intMap = new Map<string, number>();
    defensiveRes.forEach((s: any) => {
      if (s.statName === 'interceptions') {
        const id = resolveId(s.team);
        if (id) intMap.set(id, s.stat ?? 0);
      }
    });

    // Sacks — in defensive stats
    const sackMap = new Map<string, number>();
    defensiveRes.forEach((s: any) => {
      if (s.statName === 'sacks') {
        const id = resolveId(s.team);
        if (id) sackMap.set(id, s.stat ?? 0);
      }
    });

    // Merge into one map per team
    const allIds = new Set([
      ...qbrMap.keys(), ...rushTdMap.keys(), ...recTdMap.keys(),
      ...intMap.keys(), ...sackMap.keys(),
    ]);

    allIds.forEach(id => {
      map.set(id, {
        team_id:       id,
        qbr:           qbrMap.get(id) ?? null,
        rushing_tds:   rushTdMap.get(id) ?? null,
        receiving_tds: recTdMap.get(id) ?? null,
        def_ints:      intMap.get(id) ?? null,
        sacks:         sackMap.get(id) ?? null,
      });
    });

  } catch (e) {
    console.warn('Failed to fetch season stats:', e);
  }

  return map;
}
