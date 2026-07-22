import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { APRanking, CfbTeam } from '../../types';
import { Tooltip, InfoTooltip } from '../ui/Tooltip';
import { TeamLogo } from '../ui/TeamLogo';

interface Props {
  rankings: APRanking[];
  teams: CfbTeam[];
  records: Map<string, { wins: number; losses: number }>;
}

export function RankingsPage({ rankings, teams, records }: Props) {
  const teamMap = new Map(teams.map(t => [t.id, t]));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="section-title text-2xl">AP Top 25</h1>
        <span className="badge-gray text-xs">Live Rankings</span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-turf-800 text-turf-500 text-xs uppercase tracking-wide">
              <th className="px-5 py-3 text-center w-12">
                <div className="flex items-center justify-center gap-1">
                  Rk
                  <InfoTooltip
                    content="Current AP Top 25 ranking. Updates weekly during the season."
                    position="bottom"
                    width="w-48"
                  />
                </div>
              </th>
              <th className="px-5 py-3 text-left">Team</th>
              <th className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  Rec
                  <InfoTooltip
                    content="Win-loss record for the current season."
                    position="bottom"
                    width="w-44"
                  />
                </div>
              </th>
              <th className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  Δ
                  <InfoTooltip
                    content="Change in ranking from last week. Arrow up = moved up, arrow down = moved down."
                    position="bottom"
                    width="w-52"
                  />
                </div>
              </th>
              <th className="px-4 py-3 text-center w-14">
                <div className="flex items-center justify-center gap-1">
                  Prev
                  <InfoTooltip
                    content="Last week's ranking. 'NR' means the team was not ranked."
                    position="bottom"
                    width="w-48"
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-turf-800/60">
            {rankings.map(r => {
              const appTeam = r.team_id ? teamMap.get(r.team_id) : null;
              const rec = r.team_id ? records.get(r.team_id) : null;

              const trendLabel =
                r.trend === 'up'   ? `Up from #${r.previous_rank} last week` :
                r.trend === 'down' ? `Down from #${r.previous_rank} last week` :
                r.trend === 'new'  ? 'Newly ranked this week' :
                'No change from last week';

              return (
                <tr key={r.rank} className="hover:bg-turf-800/30 transition-colors group">
                  <td className="px-5 py-3 text-center">
                    <span className={`font-mono font-bold text-base ${
                      r.rank <= 4 ? 'text-field-400' : 'text-turf-400'
                    }`}>
                      {r.rank}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <TeamLogo src={appTeam?.logo} alt={r.team_name} fallbackName={r.team_name} size={36} />
                      <div>
                        <p className="font-medium text-white group-hover:text-field-300 transition-colors">
                          {r.team_name}
                        </p>
                        {appTeam && (
                          <p className="text-xs text-turf-500">{appTeam.conference}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-turf-300 text-xs">
                    {rec ? `${rec.wins}-${rec.losses}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Tooltip content={trendLabel} position="left" width="w-44">
                      <span className="inline-flex items-center justify-center cursor-default">
                        {r.trend === 'up'   && <ArrowUp   className="w-4 h-4 text-field-400" />}
                        {r.trend === 'down' && <ArrowDown  className="w-4 h-4 text-red-400" />}
                        {r.trend === 'same' && <Minus       className="w-4 h-4 text-turf-600" />}
                        {r.trend === 'new'  && <span className="text-xs text-amber-400 font-medium">NEW</span>}
                      </span>
                    </Tooltip>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-turf-500 text-xs">
                    {r.previous_rank ?? 'NR'}
                  </td>
                </tr>
              );
            })}
            {rankings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-turf-500">
                  Rankings unavailable — check back during the season
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
