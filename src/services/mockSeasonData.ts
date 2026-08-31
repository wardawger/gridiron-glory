// ─────────────────────────────────────────────────────────────────────────
// DEV-ONLY mock season data. Fabricates several weeks of completed games
// and an AP-style poll so the app can be previewed with realistic-looking
// history before the real season has any actual results to fetch from
// CFBD. Gated entirely behind VITE_MOCK_SEASON_DATA in useCfbData — never
// imported or built into anything that ships. Deterministic (seeded by
// team id + week) so the same preview renders identically on every reload.
// ─────────────────────────────────────────────────────────────────────────
import type { CfbTeam, GameData, GameResult, APRanking, TeamSeasonStats } from '../types';

export const MOCK_WEEKS = [0, 1, 2, 3];

const logo = (id: string) => `http://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;

// Real FBS teams with real CFBD ids — not fetched, because fetchFbsTeams()
// depends on the Netlify Function proxy, which doesn't exist under plain
// `vite dev`. The first block matches whatever's actually drafted in the
// league used to build/verify this mock, so that roster renders full games
// immediately; the rest pads out the pool for realistic weekly pairings and
// a fuller fake Top 25.
export const MOCK_TEAMS: CfbTeam[] = [
  { id: '2005', name: 'Air Force',       conference: 'Mountain West', logo: logo('2005'), color: '#004a7c', alt_color: '#ffffff', is_g5: true },
  { id: '2026', name: 'App State',       conference: 'Sun Belt',      logo: logo('2026'), color: '#000000', alt_color: '#ffcc00', is_g5: true },
  { id: '333',  name: 'Alabama',         conference: 'SEC',           logo: logo('333'),  color: '#9e1b32', alt_color: '#ffffff', is_g5: false },
  { id: '152',  name: 'NC State',        conference: 'ACC',           logo: logo('152'),  color: '#cc0000', alt_color: '#ffffff', is_g5: false },
  { id: '2628', name: 'TCU',             conference: 'Big 12',        logo: logo('2628'), color: '#4d1979', alt_color: '#a3a9ac', is_g5: false },
  { id: '153',  name: 'North Carolina',  conference: 'ACC',           logo: logo('153'),  color: '#7bafd4', alt_color: '#ffffff', is_g5: false },
  { id: '127',  name: 'Michigan State',  conference: 'Big Ten',       logo: logo('127'),  color: '#18453b', alt_color: '#ffffff', is_g5: false },
  { id: '254',  name: 'Utah',            conference: 'Big 12',        logo: logo('254'),  color: '#cc0000', alt_color: '#ffffff', is_g5: false },
  { id: '194',  name: 'Ohio State',      conference: 'Big Ten',       logo: logo('194'),  color: '#bb0000', alt_color: '#ffffff', is_g5: false },
  { id: '84',   name: 'Indiana',         conference: 'Big Ten',       logo: logo('84'),   color: '#990000', alt_color: '#ffffff', is_g5: false },
  { id: '252',  name: 'BYU',             conference: 'Big 12',        logo: logo('252'),  color: '#002e5d', alt_color: '#ffffff', is_g5: false },
  { id: '57',   name: 'Florida',         conference: 'SEC',           logo: logo('57'),   color: '#0021a5', alt_color: '#fa4616', is_g5: false },
  { id: '61',   name: 'Georgia',         conference: 'SEC',           logo: logo('61'),   color: '#ba0c2f', alt_color: '#000000', is_g5: false },
  { id: '251',  name: 'Texas',           conference: 'SEC',           logo: logo('251'),  color: '#bf5700', alt_color: '#ffffff', is_g5: false },
  { id: '9',    name: 'Arizona State',   conference: 'Big 12',        logo: logo('9'),    color: '#8c1d40', alt_color: '#ffc627', is_g5: false },
  { id: '2483', name: 'Oregon',          conference: 'Big Ten',       logo: logo('2483'), color: '#154733', alt_color: '#fee123', is_g5: false },
  { id: '213',  name: 'Penn State',      conference: 'Big Ten',       logo: logo('213'),  color: '#041e42', alt_color: '#ffffff', is_g5: false },
  { id: '97',   name: 'Louisville',      conference: 'ACC',           logo: logo('97'),   color: '#ad0000', alt_color: '#ffffff', is_g5: false },
  { id: '154',  name: 'Wake Forest',     conference: 'ACC',           logo: logo('154'),  color: '#9e7e38', alt_color: '#000000', is_g5: false },
  { id: '258',  name: 'Virginia',        conference: 'ACC',           logo: logo('258'),  color: '#232d4b', alt_color: '#f84c1e', is_g5: false },
  // Padding for pairing variety and a fuller fake poll — not tied to any
  // specific drafted roster.
  { id: '2641', name: 'Texas Tech',      conference: 'Big 12',        logo: logo('2641'), color: '#cc0000', alt_color: '#000000', is_g5: false },
  { id: '8',    name: 'Arkansas',        conference: 'SEC',           logo: logo('8'),    color: '#9d2235', alt_color: '#ffffff', is_g5: false },
  { id: '130',  name: 'Michigan',        conference: 'Big Ten',       logo: logo('130'),  color: '#00274c', alt_color: '#ffcb05', is_g5: false },
  { id: '87',   name: 'Notre Dame',      conference: 'FBS Independents', logo: logo('87'), color: '#0c2340', alt_color: '#ae9142', is_g5: false },
  { id: '228',  name: 'Clemson',         conference: 'ACC',           logo: logo('228'),  color: '#f56600', alt_color: '#522d80', is_g5: false },
  { id: '99',   name: 'LSU',             conference: 'SEC',           logo: logo('99'),   color: '#461d7c', alt_color: '#fdd023', is_g5: false },
  { id: '201',  name: 'Oklahoma',        conference: 'SEC',           logo: logo('201'),  color: '#841617', alt_color: '#ffffff', is_g5: false },
  { id: '2',    name: 'Auburn',          conference: 'SEC',           logo: logo('2'),    color: '#0c2340', alt_color: '#e87722', is_g5: false },
  { id: '2633', name: 'Tennessee',       conference: 'SEC',           logo: logo('2633'), color: '#ff8200', alt_color: '#ffffff', is_g5: false },
  { id: '275',  name: 'Wisconsin',       conference: 'Big Ten',       logo: logo('275'),  color: '#c5050c', alt_color: '#ffffff', is_g5: false },
  { id: '52',   name: 'Florida State',   conference: 'ACC',           logo: logo('52'),   color: '#782f40', alt_color: '#ceb888', is_g5: false },
  { id: '245',  name: 'Texas A&M',       conference: 'SEC',           logo: logo('245'),  color: '#500000', alt_color: '#ffffff', is_g5: false },
  { id: '2390', name: 'Miami',           conference: 'ACC',           logo: logo('2390'), color: '#f47321', alt_color: '#005030', is_g5: false },
  { id: '30',   name: 'USC',             conference: 'Big Ten',       logo: logo('30'),   color: '#990000', alt_color: '#ffcc00', is_g5: false },
  // Extra padding — enough undrafted supply for two more full 10-team
  // rosters (preview data only, not tied to any specific league draft).
  { id: '2294', name: 'Iowa',            conference: 'Big Ten',       logo: logo('2294'), color: '#000000', alt_color: '#ffcd00', is_g5: false },
  { id: '158',  name: 'Nebraska',        conference: 'Big Ten',       logo: logo('158'),  color: '#e41c38', alt_color: '#ffffff', is_g5: false },
  { id: '135',  name: 'Minnesota',       conference: 'Big Ten',       logo: logo('135'),  color: '#7a0019', alt_color: '#ffcc33', is_g5: false },
  { id: '2306', name: 'Kansas State',    conference: 'Big 12',        logo: logo('2306'), color: '#512888', alt_color: '#ffffff', is_g5: false },
  { id: '66',   name: 'Iowa State',      conference: 'Big 12',        logo: logo('66'),   color: '#c8102e', alt_color: '#f1be48', is_g5: false },
  { id: '239',  name: 'Baylor',          conference: 'Big 12',        logo: logo('239'),  color: '#003015', alt_color: '#ffb81c', is_g5: false },
  { id: '248',  name: 'Houston',         conference: 'Big 12',        logo: logo('248'),  color: '#c8102e', alt_color: '#ffffff', is_g5: false },
  { id: '2132', name: 'Cincinnati',      conference: 'Big 12',        logo: logo('2132'), color: '#000000', alt_color: '#e00122', is_g5: false },
  { id: '277',  name: 'West Virginia',   conference: 'Big 12',        logo: logo('277'),  color: '#002855', alt_color: '#eaaa00', is_g5: false },
  { id: '38',   name: 'Colorado',        conference: 'Big 12',        logo: logo('38'),   color: '#000000', alt_color: '#cfb87c', is_g5: false },
  { id: '12',   name: 'Arizona',         conference: 'Big 12',        logo: logo('12'),   color: '#0c234b', alt_color: '#ab0520', is_g5: false },
  { id: '150',  name: 'Duke',            conference: 'ACC',           logo: logo('150'),  color: '#003087', alt_color: '#ffffff', is_g5: false },
  { id: '59',   name: 'Georgia Tech',    conference: 'ACC',           logo: logo('59'),   color: '#b3a369', alt_color: '#003057', is_g5: false },
  { id: '221',  name: 'Pittsburgh',      conference: 'ACC',           logo: logo('221'),  color: '#003594', alt_color: '#ffb81c', is_g5: false },
  { id: '183',  name: 'Syracuse',        conference: 'ACC',           logo: logo('183'),  color: '#d44500', alt_color: '#ffffff', is_g5: false },
  { id: '24',   name: 'Stanford',        conference: 'ACC',           logo: logo('24'),   color: '#8c1515', alt_color: '#ffffff', is_g5: false },
  { id: '25',   name: 'California',      conference: 'ACC',           logo: logo('25'),   color: '#003262', alt_color: '#fdb515', is_g5: false },
  { id: '2567', name: 'SMU',             conference: 'ACC',           logo: logo('2567'), color: '#c8102e', alt_color: '#354ca1', is_g5: false },
  { id: '238',  name: 'Vanderbilt',      conference: 'SEC',           logo: logo('238'),  color: '#000000', alt_color: '#866d4b', is_g5: false },
  { id: '145',  name: 'Ole Miss',        conference: 'SEC',           logo: logo('145'),  color: '#14213d', alt_color: '#ce1126', is_g5: false },
  { id: '142',  name: 'Missouri',        conference: 'SEC',           logo: logo('142'),  color: '#000000', alt_color: '#f1b82d', is_g5: false },
  { id: '96',   name: 'Kentucky',        conference: 'SEC',           logo: logo('96'),   color: '#0033a0', alt_color: '#ffffff', is_g5: false },
  { id: '26',   name: 'UCLA',            conference: 'Big Ten',       logo: logo('26'),   color: '#2d68c4', alt_color: '#f2a900', is_g5: false },
  { id: '264',  name: 'Washington',      conference: 'Big Ten',       logo: logo('264'),  color: '#4b2e83', alt_color: '#b7a57a', is_g5: false },
];

// Small deterministic PRNG (mulberry32) seeded from a string, so mock games
// are stable across reloads instead of re-randomizing every render.
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const TV_NETWORKS = ['ESPN', 'ABC', 'FOX', 'CBS', 'ESPN2'];
const MOCK_CONDITIONS = ['Clear', 'Cloudy', 'Light Rain', 'Fog', 'Fair', 'Overcast'];

// Late-August/September Saturdays, roughly matching real week-0..3 dates.
const WEEK_DATES: Record<number, string> = {
  0: '2026-08-23T19:00:00Z',
  1: '2026-08-30T19:00:00Z',
  2: '2026-09-06T19:00:00Z',
  3: '2026-09-13T19:00:00Z',
};

export function buildMockSeasonData(teams: CfbTeam[]): {
  gameData: GameData;
  rankings: APRanking[];
  records: Map<string, { wins: number; losses: number }>;
} {
  const gameData: GameData = {};
  teams.forEach(t => { gameData[t.id] = {}; });

  const sorted = [...teams].sort((a, b) => a.id.localeCompare(b.id));
  const n = sorted.length;

  MOCK_WEEKS.forEach(week => {
    // Rotate the pairing order each week so the same two teams don't always
    // face each other, then pair up neighbors.
    const offset = (week * 7) % n;
    const rotated = [...sorted.slice(offset), ...sorted.slice(0, offset)];

    for (let i = 0; i + 1 < rotated.length; i += 2) {
      const home = rotated[i];
      const away = rotated[i + 1];
      const rand = seededRandom(`${home.id}-${away.id}-w${week}`);

      const homeScore = 10 + Math.floor(rand() * 35);
      let awayScore = 10 + Math.floor(rand() * 35);
      if (awayScore === homeScore) awayScore += 1; // no ties
      const homeWon = homeScore > awayScore;
      const tv = TV_NETWORKS[Math.floor(rand() * TV_NETWORKS.length)];
      const startDate = WEEK_DATES[week] ?? WEEK_DATES[0];
      const condition = MOCK_CONDITIONS[Math.floor(rand() * MOCK_CONDITIONS.length)];
      const windSpeed = Math.round(rand() * 25);

      const base: Omit<GameResult, 'opponent' | 'opponent_id' | 'opponent_logo' | 'opponent_color' | 'result' | 'is_g5_opponent' | 'is_home'> = {
        week,
        opponent_rank: null, // backfilled below once rankings exist
        home_score: homeScore,
        away_score: awayScore,
        completed: true,
        start_date: startDate,
        start_time_tbd: false,
        venue: `${home.name} Stadium`,
        tv,
        weather_condition: condition,
        weather_temp: 50 + Math.round(rand() * 40),
        wind_speed: windSpeed,
        game_indoors: false,
      };

      gameData[home.id][week] = {
        ...base,
        opponent: away.name,
        opponent_id: away.id,
        opponent_logo: away.logo,
        opponent_color: away.color,
        result: homeWon ? 'W' : 'L',
        is_g5_opponent: away.is_g5,
        is_home: true,
      };
      gameData[away.id][week] = {
        ...base,
        opponent: home.name,
        opponent_id: home.id,
        opponent_logo: home.logo,
        opponent_color: home.color,
        result: homeWon ? 'L' : 'W',
        is_g5_opponent: home.is_g5,
        is_home: false,
      };
    }
  });

  // Records + a fake AP Top 25, both derived from the mock results above so
  // everything the app displays (rank, W-L record, opponent_rank) agrees.
  const records = new Map<string, { wins: number; losses: number }>();
  teams.forEach(t => {
    let wins = 0, losses = 0;
    MOCK_WEEKS.forEach(w => {
      const g = gameData[t.id][w];
      if (g?.result === 'W') wins++;
      else if (g?.result === 'L') losses++;
    });
    records.set(t.id, { wins, losses });
  });

  const rankedTeams = [...teams]
    .filter(t => !t.is_g5) // keep the fake poll Power-4-flavored, like a real early-season AP poll
    .sort((a, b) => {
      const ra = records.get(a.id)!, rb = records.get(b.id)!;
      return (rb.wins - rb.losses) - (ra.wins - ra.losses) || a.id.localeCompare(b.id);
    })
    .slice(0, 25);

  const rankings: APRanking[] = rankedTeams.map((t, i) => {
    const rec = records.get(t.id)!;
    return {
      rank: i + 1,
      team_name: t.name,
      team_id: t.id,
      record: `${rec.wins}-${rec.losses}`,
      previous_rank: i + 1,
      trend: 'same',
    };
  });

  // Backfill each game's opponent_rank now that the fake poll exists.
  const rankByTeamId = new Map(rankings.map(r => [r.team_id!, r.rank]));
  Object.values(gameData).forEach(weeks => {
    Object.values(weeks).forEach(g => {
      g.opponent_rank = rankByTeamId.get(g.opponent_id) ?? null;
    });
  });

  return { gameData, rankings, records };
}

// Fabricated per-team season stats, for previewing the Stat Bonuses page
// (Top/Bottom N by QBR, rushing/receiving TDs, defensive INTs, sacks).
// Deterministic per team id, independent of the mock schedule above.
export function buildMockSeasonStats(teams: CfbTeam[]): Map<string, TeamSeasonStats> {
  const stats = new Map<string, TeamSeasonStats>();
  teams.forEach(t => {
    const rand = seededRandom(`stats-${t.id}`);
    stats.set(t.id, {
      team_id:       t.id,
      qbr:           Math.round((80 + rand() * 100) * 10) / 10, // ~80-180 passer rating
      rushing_tds:   Math.floor(rand() * 9),                    // 0-8
      receiving_tds: Math.floor(rand() * 9),                    // 0-8
      def_ints:      Math.floor(rand() * 6),                    // 0-5
      sacks:         Math.floor(rand() * 13),                   // 0-12
    });
  });
  return stats;
}
