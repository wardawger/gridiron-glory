import { ClipboardList, Coins, ArrowLeftRight, Award, Gift, TrendingUp, TrendingDown } from 'lucide-react';
import type { League, LeagueMember } from '../../types';
import { normalizeScoring, STAT_BONUS_CATEGORIES, STAT_BONUS_LABELS, BONUS_LABELS, BONUS_DEFAULT_POINTS, BONUS_GROUPS } from '../../types';

interface Props {
  league: League;
  members: LeagueMember[];
}

function pts(n: number): string {
  return `${n > 0 ? '+' : ''}${n}`;
}

export function LeagueSettingsPage({ league, members }: Props) {
  const scoring = normalizeScoring(league.scoring);
  const postseasonGroups = BONUS_GROUPS.filter(g => !g.label.startsWith('Statistical Rankings'));

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl mx-auto">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-5 h-5 text-turf-950" />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-wide text-white">League Settings</h1>
            <p className="text-turf-500 text-sm">How scoring works in {league.name} — set by your commissioner</p>
          </div>
        </div>
      </div>

      {/* Draft rules */}
      <div className="card p-5 space-y-3">
        <h3 className="font-medium text-white text-sm">Draft Rules</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="card-inner p-3 text-center">
            <p className="font-mono text-xl font-bold text-white">{members.length}</p>
            <p className="text-xs text-turf-500 mt-0.5">Players</p>
          </div>
          <div className="card-inner p-3 text-center">
            <p className="font-mono text-xl font-bold text-white">{league.max_teams_per_user}</p>
            <p className="text-xs text-turf-500 mt-0.5">Teams each</p>
          </div>
          <div className="card-inner p-3 text-center">
            <p className="font-mono text-xl font-bold text-white">2–3</p>
            <p className="text-xs text-turf-500 mt-0.5">Per P4 conference</p>
          </div>
          <div className="card-inner p-3 text-center">
            <p className="font-mono text-xl font-bold text-white">Snake</p>
            <p className="text-xs text-turf-500 mt-0.5">Draft format</p>
          </div>
        </div>
        <p className="text-xs text-turf-500">
          Every roster needs at least 2 and at most 3 teams from each Power 4 conference (SEC, Big Ten, Big 12, ACC).
          No limit on G5, Independent, or Pac-12 teams.
        </p>
      </div>

      {/* Base scoring */}
      <div className="card p-5 space-y-3">
        <h3 className="font-medium text-white text-sm">Weekly Game Scoring</h3>
        <p className="text-xs text-turf-500">
          Ranked-win bonuses stack — beating a Top 5 team earns the win, ranked-win, Top 15, and Top 5 bonuses all at once.
          A Captain doubles whatever a team earns that week, wins or losses.
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="card-inner px-3 py-2 flex items-center justify-between"><span className="text-turf-300">Win</span><span className="font-mono font-medium text-field-400">{pts(scoring.win)}</span></div>
          <div className="card-inner px-3 py-2 flex items-center justify-between"><span className="text-turf-300">Beat a ranked team</span><span className="font-mono font-medium text-field-400">{pts(scoring.win_ranked)}</span></div>
          <div className="card-inner px-3 py-2 flex items-center justify-between"><span className="text-turf-300">Beat Top 15</span><span className="font-mono font-medium text-field-400">{pts(scoring.win_top15)}</span></div>
          <div className="card-inner px-3 py-2 flex items-center justify-between"><span className="text-turf-300">Beat Top 5</span><span className="font-mono font-medium text-field-400">{pts(scoring.win_top5)}</span></div>
          <div className="card-inner px-3 py-2 flex items-center justify-between"><span className="text-turf-300">Loss</span><span className="font-mono font-medium text-red-400">{pts(scoring.loss)}</span></div>
          <div className="card-inner px-3 py-2 flex items-center justify-between"><span className="text-turf-300">Loss to a G5 team</span><span className="font-mono font-medium text-red-400">{pts(scoring.loss_g5)}</span></div>
        </div>
      </div>

      {/* Spread betting */}
      {scoring.spread_enabled && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-blue-400" />
            <h3 className="font-medium text-white text-sm">Spread Betting</h3>
            <span className="badge-green text-xs ml-auto">Enabled</span>
          </div>
          <p className="text-xs text-turf-500">
            Each week, pick a rostered team you think will cover the point spread. The line locks in the moment you pick it,
            and the pick locks entirely once that game kicks off.
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="card-inner px-3 py-2 flex items-center justify-between">
              <span className="text-turf-300">{scoring.spread_is_multiplier ? 'Cover multiplier' : 'Points for covering'}</span>
              <span className="font-mono font-medium text-blue-300">
                {scoring.spread_is_multiplier ? `×${scoring.spread_points}` : pts(scoring.spread_points)}
              </span>
            </div>
            <div className="card-inner px-3 py-2 flex items-center justify-between">
              <span className="text-turf-300">Missing the spread</span>
              <span className="font-mono font-medium text-red-400">
                {scoring.spread_is_multiplier ? `×${scoring.spread_points}` : `-${scoring.spread_points}`}
              </span>
            </div>
            <div className="card-inner px-3 py-2 flex items-center justify-between"><span className="text-turf-300">Max picks / week</span><span className="font-mono font-medium text-white">{scoring.spread_max_per_week}</span></div>
            <div className="card-inner px-3 py-2 flex items-center justify-between"><span className="text-turf-300">Max picks / team / season</span><span className="font-mono font-medium text-white">{scoring.spread_max_per_team}</span></div>
          </div>
          <p className="text-xs text-turf-500">
            {scoring.spread_allow_captain_stack
              ? 'You can pick the spread on your Captain\'s team the same week.'
              : 'You cannot pick the spread on your Captain\'s team the same week — pick a different team.'}
          </p>
        </div>
      )}

      {/* Free agency */}
      {scoring.free_agency_enabled && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-field-400" />
            <h3 className="font-medium text-white text-sm">Free Agency</h3>
            <span className="badge-green text-xs ml-auto">Enabled</span>
          </div>
          <p className="text-xs text-turf-500">
            Drop a team from your roster and add any team nobody currently owns, within the limits below.
            Past weeks keep scoring whichever team you actually held that week — swapping doesn't change history.
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="card-inner px-3 py-2 flex items-center justify-between"><span className="text-turf-300">Max moves / week</span><span className="font-mono font-medium text-white">{scoring.fa_max_moves_per_week}</span></div>
            <div className="card-inner px-3 py-2 flex items-center justify-between"><span className="text-turf-300">Max moves / season</span><span className="font-mono font-medium text-white">{scoring.fa_max_moves_per_season}</span></div>
          </div>
          <p className="text-xs text-turf-500">
            {scoring.fa_penalty_enabled
              ? `Each swap costs ${pts(-Math.abs(scoring.fa_penalty_points))} points that week.`
              : 'No point penalty for making a swap.'}
          </p>
        </div>
      )}

      {/* Statistical bonuses */}
      {scoring.stat_bonus_enabled && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-gold-400" />
            <h3 className="font-medium text-white text-sm">Statistical Ranking Bonuses</h3>
            <span className="badge-green text-xs ml-auto">Enabled</span>
          </div>
          <p className="text-xs text-turf-500">
            Automatically awarded to whoever owns a top- or bottom-ranked team in each category, among all drafted teams.
            Shown as a live preview until conference championship week, then locks in — see the Stat Bonuses page for who's earning what right now.
          </p>
          <div className="space-y-1.5">
            {STAT_BONUS_CATEGORIES.map(cat => {
              const c = scoring.stat_bonus_categories[cat];
              if (!c.top_enabled && !c.bottom_enabled) return null;
              return (
                <div key={cat} className="card-inner px-3 py-2 flex items-center justify-between text-sm flex-wrap gap-1">
                  <span className="text-turf-300">{STAT_BONUS_LABELS[cat]}</span>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    {c.top_enabled && (
                      <span className="text-field-400 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Top {c.top_count}: {pts(c.top_points)}
                      </span>
                    )}
                    {c.bottom_enabled && (
                      <span className="text-red-400 flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" /> Bottom {c.bottom_count}: {pts(c.bottom_points)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Postseason bonuses */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-gold-400" />
          <h3 className="font-medium text-white text-sm">Postseason Bonuses</h3>
        </div>
        <p className="text-xs text-turf-500">
          Awarded manually by the commissioner as each milestone happens through bowl season and the CFP —
          the values below are the defaults they start from, and can be adjusted per award.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {postseasonGroups.map(group => (
            <div key={group.label} className="card-inner overflow-hidden">
              <p className="text-xs text-turf-500 uppercase tracking-wide font-medium px-3 py-2 border-b border-turf-700">{group.label}</p>
              <div className="divide-y divide-turf-800/60">
                {group.types.map(type => (
                  <div key={type} className="px-3 py-1.5 flex items-center justify-between text-xs">
                    <span className="text-turf-300">{BONUS_LABELS[type]}</span>
                    <span className={`font-mono font-medium ${BONUS_DEFAULT_POINTS[type] >= 0 ? 'text-field-400' : 'text-red-400'}`}>
                      {pts(BONUS_DEFAULT_POINTS[type])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
