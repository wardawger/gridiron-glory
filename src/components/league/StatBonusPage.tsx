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

export function StatBonusPage({ league, members, rosters, seasonStats }: Props) {
  const confChampComplete = league.current_week >= 15;
  const scoring = useMemo(() => normalizeScoring(league.scoring), [league.scoring]);

  const board = useMemo(() => {
    const byUser = calcStatRankingBonuses(rosters, seasonStats, !confChampComplete, scoring);
    return buildStatBonusBoard(byUser, rosters, members);
  }, [rosters, seasonStats, confChampComplete, scoring, members]);

  const hasAnyData = board.some(b => b.top.length > 0 || b.bottom.length > 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center flex-shrink-0">
              <Award className="w-5 h-5 text-turf-950" />
            </div>
            <div>
              <h1 className="font-display text-2xl tracking-wide text-white">Statistical Bonuses</h1>
              <p className="text-turf-500 text-sm">
                Awarded to whoever owns a top- or bottom-ranked team in each enabled category
              </p>
            </div>
          </div>
          <span className={confChampComplete ? 'badge-green' : 'badge-gold'}>
            {confChampComplete ? 'Locked In' : 'Live Preview ◎'}
          </span>
        </div>
        {!confChampComplete && (
          <p className="text-xs text-turf-500 mt-3 pt-3 border-t border-turf-800">
            These stand today, but can still move until conference championship week — they lock in permanently after that.
          </p>
        )}
      </div>

      {!hasAnyData ? (
        <div className="card p-12 text-center text-turf-500">
          <Award className="w-8 h-8 mx-auto mb-3 text-turf-700" />
          <p>No season stats available yet.</p>
          <p className="text-xs text-turf-600 mt-1">Check back once the season is underway.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {board.map(category => {
            const catSettings = scoring.stat_bonus_categories[category.stat];
            const topOn = scoring.stat_bonus_enabled && catSettings.top_enabled;
            const botOn = scoring.stat_bonus_enabled && catSettings.bottom_enabled;
            return (
              <div key={category.stat} className="card p-4 space-y-3">
                <h3 className="font-display text-lg tracking-wide text-white">{category.label}</h3>

                <div>
                  <p className="text-xs text-field-500 uppercase tracking-wide font-medium mb-1.5 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Top{topOn ? ` ${catSettings.top_count}` : ''}
                  </p>
                  {!topOn ? (
                    <p className="text-xs text-turf-600 py-1">Not enabled</p>
                  ) : category.top.length === 0 ? (
                    <p className="text-xs text-turf-600 py-1">No data yet</p>
                  ) : (
                    <div className="space-y-1">
                      {category.top.map(e => (
                        <div key={e.team_id} className="card-inner flex items-center gap-2.5 px-3 py-2">
                          <span className="font-mono text-xs text-field-400 w-5 flex-shrink-0">#{e.rank}</span>
                          <TeamLogo src={e.team_logo} alt={e.team_name} fallbackName={e.team_name} size={24} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{e.team_name}</p>
                            <p className="text-xs text-turf-500 truncate">{e.owner_name}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-mono text-xs text-turf-300">{e.value.toFixed(1)}</p>
                            <p className="font-mono text-xs text-field-400">+{e.points}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs text-red-400 uppercase tracking-wide font-medium mb-1.5 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" /> Bottom{botOn ? ` ${catSettings.bottom_count}` : ''}
                  </p>
                  {!botOn ? (
                    <p className="text-xs text-turf-600 py-1">Not enabled</p>
                  ) : category.bottom.length === 0 ? (
                    <p className="text-xs text-turf-600 py-1">No data yet</p>
                  ) : (
                    <div className="space-y-1">
                      {category.bottom.map(e => (
                        <div key={e.team_id} className="card-inner flex items-center gap-2.5 px-3 py-2">
                          <span className="font-mono text-xs text-red-400 w-5 flex-shrink-0">#{e.rank}</span>
                          <TeamLogo src={e.team_logo} alt={e.team_name} fallbackName={e.team_name} size={24} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{e.team_name}</p>
                            <p className="text-xs text-turf-500 truncate">{e.owner_name}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-mono text-xs text-turf-300">{e.value.toFixed(1)}</p>
                            <p className="font-mono text-xs text-red-400">{e.points}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
