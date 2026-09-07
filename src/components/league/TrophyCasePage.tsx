import { useMemo, useState, useId } from 'react';
import { Archive, Crown, Medal, TrendingUp, Target, Rocket, Trophy, ChevronDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type {
  League, SeasonHistory, SeasonHistoryEntry, LeagueMember, DraftPick, CaptainPick,
  SpreadPick, FreeAgencyMove, ManualBonus, GameData, TrophyCategory, ScoreCorrection,
} from '../../types';
import { Avatar } from '../ui/Avatar';
import { TeamLogo } from '../ui/TeamLogo';
import { computeTrophies } from '../../services/trophies';
import { TiltCard } from '../amicro/tilt-card';
import {
  seriesColor, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_LABEL, CHART_TOOLTIP_ITEM,
  CHART_AXIS_TICK, legendFormatter,
} from '../../lib/chartTheme';

interface Props {
  league: League;
  seasonHistory: SeasonHistory[];
  members: LeagueMember[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  spreadPicks: SpreadPick[];
  freeAgencyMoves: FreeAgencyMove[];
  manualBonuses: ManualBonus[];
  gameData: GameData;
  scoreCorrections: ScoreCorrection[];
}

const PODIUM_STYLES = [
  { icon: Crown, iconClass: 'text-gold-400',   ring: 'ring-gold-500/40',   bg: 'bg-gold-500/10',   label: 'Champion' },
  { icon: Medal, iconClass: 'text-slate-300',  ring: 'ring-slate-400/30',  bg: 'bg-slate-500/10',  label: '2nd Place' },
  { icon: Medal, iconClass: 'text-amber-700',  ring: 'ring-amber-700/30',  bg: 'bg-amber-700/10',  label: '3rd Place' },
];

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function PodiumCard({ entry, place }: { entry: SeasonHistoryEntry; place: 0 | 1 | 2 }) {
  const style = PODIUM_STYLES[place];
  const Icon = style.icon;
  return (
    <TiltCard maxTilt={10} cardClassName={`card-inner p-3 sm:p-4 text-center ring-1 ${style.ring} ${style.bg}`}>
      <Icon className={`w-6 h-6 mx-auto mb-2 ${style.iconClass}`} aria-hidden="true" />
      <Avatar
        displayName={entry.display_name}
        avatarType={entry.avatar_type}
        avatarValue={entry.avatar_value}
        size={48}
        className="mx-auto"
      />
      <p className="font-medium text-white mt-2 truncate">{entry.display_name}</p>
      <p className="text-xs text-turf-500">{style.label}</p>
      <p className="font-mono font-bold text-lg text-white mt-1 tabular-nums">{entry.total_points} pts</p>
    </TiltCard>
  );
}

// One achievement category: name, description, and the qualifying
// manager(s) — with their team(s) where applicable. Shared by the live
// current-season grid and each past season's "Trophy Highlights" toggle.
function TrophyCategoryCard({ category }: { category: TrophyCategory }) {
  return (
    <div className="card-inner p-4 space-y-3">
      <div>
        <h3 className="font-medium text-white text-sm">{category.label}</h3>
        <p className="text-xs text-turf-500 mt-0.5">{category.description}</p>
      </div>
      {category.winners.length === 0 ? (
        <p className="text-xs text-turf-500 italic">Nobody yet</p>
      ) : (
        <div className="space-y-2.5">
          {category.winners.map(w => (
            <div key={w.user_id} className="flex items-center gap-2.5">
              <Avatar displayName={w.display_name} avatarType={w.avatar_type} avatarValue={w.avatar_value} size={28} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-turf-200 truncate">{w.display_name}</p>
                {(w.teams.length > 0 || w.detail) && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {w.teams.map(t => (
                      <span key={t.team_id} className="inline-flex items-center gap-1 text-xs text-turf-400">
                        <TeamLogo src={t.team_logo} alt="" fallbackName={t.team_name} size={16} />
                        {t.team_name}
                      </span>
                    ))}
                    {w.detail && <span className="text-xs text-turf-500 font-mono tabular-nums">{w.detail}</span>}
                  </div>
                )}
              </div>
              {w.tier != null && (
                <span
                  className="w-6 h-6 rounded-full bg-gold-500/15 text-gold-400 text-xs font-mono font-bold flex items-center justify-center flex-shrink-0 tabular-nums"
                  title={`Tier ${w.tier}`}
                >
                  <span className="sr-only">Tier </span>{w.tier}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrophyGrid({ categories }: { categories: TrophyCategory[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {categories.map(cat => <TrophyCategoryCard key={cat.id} category={cat} />)}
    </div>
  );
}

function SeasonCard({ season }: { season: SeasonHistory }) {
  const [first, second, third] = season.standings;
  const rest = season.standings.slice(3);
  const [showTrophies, setShowTrophies] = useState(false);
  const panelId = useId();
  const trophyCategories = (season.trophies?.categories ?? []).filter(c => c.winners.length > 0);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-turf-800">
        <h2 className="font-display text-xl tracking-wide text-white">{season.season_label} Season</h2>
        <p className="text-xs text-turf-500">
          Archived {dateFmt.format(new Date(season.archived_at))} · {plural(season.standings.length, 'player')}
        </p>
      </div>

      <div className="p-5 grid grid-cols-3 gap-2 sm:gap-3">
        {first  && <PodiumCard entry={first}  place={0} />}
        {second && <PodiumCard entry={second} place={1} />}
        {third  && <PodiumCard entry={third}  place={2} />}
      </div>

      {rest.length > 0 && (
        <div className="border-t border-turf-800 divide-y divide-turf-800/60">
          {rest.map(e => (
            <div key={e.user_id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="font-mono text-sm text-turf-500 w-6 text-center flex-shrink-0 tabular-nums">{e.rank}</span>
              <Avatar displayName={e.display_name} avatarType={e.avatar_type} avatarValue={e.avatar_value} size={28} />
              <span className="flex-1 text-sm text-turf-300 truncate">{e.display_name}</span>
              <span className="font-mono text-sm text-white tabular-nums">{e.total_points} pts</span>
            </div>
          ))}
        </div>
      )}

      {trophyCategories.length > 0 && (
        <div className="border-t border-turf-800">
          <button
            type="button"
            onClick={() => setShowTrophies(v => !v)}
            aria-expanded={showTrophies}
            aria-controls={panelId}
            className="w-full flex items-center justify-between px-5 py-3 text-sm text-turf-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-field-400"
          >
            <span className="flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5 text-gold-400" aria-hidden="true" /> Trophy Highlights
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform motion-reduce:transition-none ${showTrophies ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {showTrophies && (
            <div id={panelId} className="px-5 pb-5">
              <TrophyGrid categories={trophyCategories} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TrendCallout {
  label: string;
  name: string;
  detail: string;
}

// seasonHistory is loaded newest-first. Members can join/leave between
// seasons, so every derived stat here is keyed by user_id and tolerates
// gaps rather than assuming every member appears in every season.
function useSeasonTrends(seasonHistory: SeasonHistory[]) {
  return useMemo(() => {
    const chronological = [...seasonHistory].reverse(); // oldest → newest, for the chart's x-axis

    const latestNameByUser = new Map<string, string>();
    seasonHistory.forEach(season => {
      season.standings.forEach(e => {
        if (!latestNameByUser.has(e.user_id)) latestNameByUser.set(e.user_id, e.display_name);
      });
    });

    const chartData = chronological.map(season => {
      const row: Record<string, string | number> = { season_label: season.season_label };
      season.standings.forEach(e => { row[e.user_id] = e.total_points; });
      return row;
    });

    const userIds = Array.from(latestNameByUser.keys());

    // Most championships: highest count of rank === 1 finishes.
    const championshipCounts = new Map<string, number>();
    seasonHistory.forEach(season => {
      const champ = season.standings.find(e => e.rank === 1);
      if (champ) championshipCounts.set(champ.user_id, (championshipCounts.get(champ.user_id) ?? 0) + 1);
    });
    let mostChampionships: TrendCallout | null = null;
    if (championshipCounts.size > 0) {
      const [userId, count] = [...championshipCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      mostChampionships = {
        label: 'Most Championships',
        name: latestNameByUser.get(userId) ?? 'Unknown',
        detail: plural(count, 'title'),
      };
    }

    // Most consistent: lowest variance in finishing rank, among members
    // with at least 2 seasons played (a single appearance has zero variance
    // by definition, which would be a misleading "most consistent" result).
    const ranksByUser = new Map<string, number[]>();
    seasonHistory.forEach(season => {
      season.standings.forEach(e => {
        if (!ranksByUser.has(e.user_id)) ranksByUser.set(e.user_id, []);
        ranksByUser.get(e.user_id)!.push(e.rank);
      });
    });
    const consistencyCandidates = Array.from(ranksByUser.entries())
      .filter(([, ranks]) => ranks.length >= 2)
      .map(([userId, ranks]) => {
        const mean = ranks.reduce((s, r) => s + r, 0) / ranks.length;
        const variance = ranks.reduce((s, r) => s + (r - mean) ** 2, 0) / ranks.length;
        return { userId, mean, variance, seasons: ranks.length };
      })
      .sort((a, b) => a.variance - b.variance);
    const mostConsistent: TrendCallout | null = consistencyCandidates.length > 0
      ? {
          label: 'Most Consistent',
          name: latestNameByUser.get(consistencyCandidates[0].userId) ?? 'Unknown',
          detail: `avg. rank ${consistencyCandidates[0].mean.toFixed(1)} across ${plural(consistencyCandidates[0].seasons, 'season')}`,
        }
      : null;

    // Biggest riser: largest rank improvement between the two most recent
    // seasons, among members who appeared in both.
    let riserCandidate: { name: string; prevRank: number; rank: number } | null = null;
    if (seasonHistory.length >= 2) {
      const [latest, previous] = seasonHistory;
      const prevRankByUser = new Map(previous.standings.map(e => [e.user_id, e.rank]));
      const risers = latest.standings
        .map(e => {
          const prevRank = prevRankByUser.get(e.user_id);
          return prevRank == null ? null : { name: e.display_name, prevRank, rank: e.rank, improvement: prevRank - e.rank };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null && c.improvement > 0)
        .sort((a, b) => b.improvement - a.improvement);
      riserCandidate = risers[0] ?? null;
    }
    const biggestRiser: TrendCallout | null = riserCandidate
      ? {
          label: 'Biggest Riser',
          name: riserCandidate.name,
          detail: `${riserCandidate.prevRank}${ordinal(riserCandidate.prevRank)} → ${riserCandidate.rank}${ordinal(riserCandidate.rank)}`,
        }
      : null;

    return { chartData, userIds, latestNameByUser, mostChampionships, mostConsistent, biggestRiser };
  }, [seasonHistory]);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}

function TrendsSection({ seasonHistory }: { seasonHistory: SeasonHistory[] }) {
  const { chartData, userIds, latestNameByUser, mostChampionships, mostConsistent, biggestRiser } =
    useSeasonTrends(seasonHistory);

  const callouts = [
    mostChampionships && { ...mostChampionships, icon: Crown },
    mostConsistent && { ...mostConsistent, icon: Target },
    biggestRiser && { ...biggestRiser, icon: Rocket },
  ].filter((c): c is TrendCallout & { icon: typeof Crown } => c !== null);

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-field-400" aria-hidden="true" />
        <h2 className="font-display text-xl tracking-wide text-white">Trends</h2>
      </div>

      {callouts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {callouts.map(c => (
            <div key={c.label} className="card-inner p-3 text-center">
              <c.icon className="w-4 h-4 mx-auto mb-1.5 text-gold-400" aria-hidden="true" />
              <p className="text-xs text-turf-500">{c.label}</p>
              <p className="font-medium text-white mt-0.5 truncate">{c.name}</p>
              <p className="text-xs text-turf-400 font-mono mt-0.5 tabular-nums">{c.detail}</p>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs text-turf-500 mb-3">Total points by season</p>
        <div
          className="h-72"
          role="img"
          aria-label={`Line chart of total points by season for ${plural(userIds.length, 'manager')} across ${plural(chartData.length, 'season')}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="season_label" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL}
                itemStyle={CHART_TOOLTIP_ITEM}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} formatter={legendFormatter} />
              {/* No connectNulls: a manager who sat a season out should show a
                  gap rather than a line implying they played through it. */}
              {userIds.map((userId, i) => (
                <Line
                  key={userId}
                  type="monotone"
                  name={latestNameByUser.get(userId) ?? 'Unknown'}
                  dataKey={userId}
                  stroke={seriesColor(i)}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function TrophyCasePage({
  league, seasonHistory, members, draftPicks, captainPicks, spreadPicks, freeAgencyMoves, manualBonuses, gameData,
  scoreCorrections,
}: Props) {
  const currentTrophies = useMemo(
    () => computeTrophies(members, draftPicks, captainPicks, spreadPicks, freeAgencyMoves, manualBonuses, gameData, league.scoring, scoreCorrections, league.current_week),
    [members, draftPicks, captainPicks, spreadPicks, freeAgencyMoves, manualBonuses, gameData, league.scoring, scoreCorrections, league.current_week]
  );

  return (
    <div className="space-y-5 animate-fade-in motion-reduce:animate-none max-w-3xl mx-auto">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold-500 flex items-center justify-center flex-shrink-0">
            <Archive className="w-5 h-5 text-turf-950" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-wide text-white text-balance">Trophy Case</h1>
            <p className="text-turf-500 text-sm">Achievements, champions, and past seasons in {league.name}</p>
          </div>
        </div>
      </div>

      {draftPicks.length > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-gold-400" aria-hidden="true" />
            <h2 className="font-display text-xl tracking-wide text-white">This Season’s Trophies</h2>
          </div>
          <TrophyGrid categories={currentTrophies.categories} />
        </div>
      )}

      {seasonHistory.length === 0 ? (
        <div className="card p-12 text-center">
          <Archive className="w-10 h-10 mx-auto mb-3 text-turf-700" aria-hidden="true" />
          <p className="text-turf-400 font-medium">No past seasons yet</p>
          <p className="text-turf-500 text-sm mt-1">
            Once your commissioner ends a season (after the national championship game), it’ll show up here.
          </p>
        </div>
      ) : (
        <>
          {seasonHistory.length >= 2 && <TrendsSection seasonHistory={seasonHistory} />}
          {seasonHistory.map(season => <SeasonCard key={season.id} season={season} />)}
        </>
      )}
    </div>
  );
}
