import { useMemo } from 'react';
import { Award, TrendingUp, TrendingDown } from 'lucide-react';
import type { League, LeagueMember, RosterEntry, TeamSeasonStats } from '../../types';
import { normalizeScoring } from '../../types';
import { calcStatRankingBonuses } from '../../services/scoring';
import { buildStatBonusBoard } from '../../services/analytics';
import { TeamLogo } from '../ui/TeamLogo';

interface Props {
  league: League;
  members: LeagueMember[];
  rosters: Map<string, RosterEntry[]>;
  seasonStats: Map<string, TeamSeasonStats>;
}

const statFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

interface RowProps {
  rank: number;
  teamLogo: string;
  teamName: string;
  ownerName: string;
  value: number;
  points: number;
  statLabel: string;
  tone: 'top' | 'bottom';
}

function BonusRow({ rank, teamLogo, teamName, ownerName, value, points, statLabel, tone }: RowProps) {
  const accent = tone === 'top' ? 'text-field-400' : 'text-red-300';
  return (
    <li className="card-inner flex items-center gap-2.5 px-3 py-2">
      <span className={`font-mono text-xs w-5 flex-shrink-0 tabular-nums ${accent}`}>
        <span className="sr-only">Rank </span>#{rank}
      </span>
      <TeamLogo src={teamLogo} alt="" fallbackName={teamName} size={24} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{teamName}</p>
        <p className="text-xs text-turf-500 truncate">{ownerName}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-mono text-xs text-turf-300 tabular-nums">
          <span className="sr-only">{statLabel}: </span>{statFmt.format(value)}
        </p>
        <p className={`font-mono text-xs tabular-nums ${accent}`}>
          {signed(points)}<span className="sr-only"> pts</span>
        </p>
      </div>
    </li>
  );
}

export function StatBonusPage({ league, members, rosters, seasonStats }: Props) {
  const confChampComplete = league.current_week >= 15;
  const scoring = useMemo(() => normalizeScoring(league.scoring), [league.scoring]);

  const board = useMemo(() => {
    const byUser = calcStatRankingBonuses(rosters, seasonStats, !confChampComplete, scoring);
    return buildStatBonusBoard(byUser, rosters, members);
  }, [rosters, seasonStats, confChampComplete, scoring, members]);

  const featureOn = scoring.stat_bonus_enabled;
  const hasAnyData = board.some(b => b.top.length > 0 || b.bottom.length > 0);

  return (
    <div className="space-y-5 animate-fade-in motion-reduce:animate-none">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center flex-shrink-0">
              <Award className="w-5 h-5 text-turf-950" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-2xl tracking-wide text-white text-balance">Statistical Bonuses</h1>
              <p className="text-turf-500 text-sm">
                Awarded to whoever owns a top- or bottom-ranked team in each enabled category
              </p>
            </div>
          </div>
          <span className={confChampComplete ? 'badge-green' : 'badge-gold'}>
            {confChampComplete ? 'Locked In' : (
              <>
                Live Preview<span aria-hidden="true"> ◎</span><span className="sr-only"> (provisional)</span>
              </>
            )}
          </span>
        </div>
        <p className="text-xs text-turf-500 mt-3 pt-3 border-t border-turf-800">
          Ranks are computed only among drafted teams that have a value for that stat this season — a team missing
          data (e.g. too early in the season, or a stat CFBD hasn’t published for it yet) is left out of the count
          entirely, so “bottom” ranks can land short of your full roster size rather than at the very end of it.
        </p>
        {!confChampComplete && (
          <p className="text-xs text-turf-500 mt-2">
            These stand today, but can still move until conference championship week — they lock in permanently after that.
          </p>
        )}
      </div>

      {!featureOn ? (
        <div className="card p-12 text-center text-turf-500">
          <Award className="w-8 h-8 mx-auto mb-3 text-turf-700" aria-hidden="true" />
          <p>Statistical bonuses are turned off for this league.</p>
          <p className="text-xs text-turf-500 mt-1">A commissioner can enable them under Admin → Scoring.</p>
        </div>
      ) : !hasAnyData ? (
        <div className="card p-12 text-center text-turf-500">
          <Award className="w-8 h-8 mx-auto mb-3 text-turf-700" aria-hidden="true" />
          <p>No season stats available yet.</p>
          <p className="text-xs text-turf-500 mt-1">Check back once the season is underway.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {board.map(category => {
            const catSettings = scoring.stat_bonus_categories[category.stat];
            const topOn = catSettings.top_enabled;
            const botOn = catSettings.bottom_enabled;
            return (
              <section key={category.stat} className="card p-4 space-y-3" aria-labelledby={`stat-${category.stat}`}>
                <h2 id={`stat-${category.stat}`} className="font-display text-lg tracking-wide text-white">{category.label}</h2>

                <div>
                  <h3 className="text-xs text-field-500 uppercase tracking-wide font-medium mb-1.5 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" aria-hidden="true" /> Top{topOn ? ` ${catSettings.top_count}` : ''}
                  </h3>
                  {!topOn ? (
                    <p className="text-xs text-turf-500 py-1">Not enabled</p>
                  ) : category.top.length === 0 ? (
                    <p className="text-xs text-turf-500 py-1">No data yet</p>
                  ) : (
                    <ul className="space-y-1">
                      {category.top.map(e => (
                        <BonusRow
                          key={e.team_id}
                          rank={e.rank}
                          teamLogo={e.team_logo}
                          teamName={e.team_name}
                          ownerName={e.owner_name}
                          value={e.value}
                          points={e.points}
                          statLabel={category.label}
                          tone="top"
                        />
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="text-xs text-red-300 uppercase tracking-wide font-medium mb-1.5 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" aria-hidden="true" /> Bottom{botOn ? ` ${catSettings.bottom_count}` : ''}
                  </h3>
                  {!botOn ? (
                    <p className="text-xs text-turf-500 py-1">Not enabled</p>
                  ) : category.bottom.length === 0 ? (
                    <p className="text-xs text-turf-500 py-1">No data yet</p>
                  ) : (
                    <ul className="space-y-1">
                      {category.bottom.map(e => (
                        <BonusRow
                          key={e.team_id}
                          rank={e.rank}
                          teamLogo={e.team_logo}
                          teamName={e.team_name}
                          ownerName={e.owner_name}
                          value={e.value}
                          points={e.points}
                          statLabel={category.label}
                          tone="bottom"
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
