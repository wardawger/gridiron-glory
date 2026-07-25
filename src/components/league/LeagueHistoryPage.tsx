import { Archive, Crown, Medal } from 'lucide-react';
import type { League, SeasonHistory, SeasonHistoryEntry } from '../../types';
import { Avatar } from '../ui/Avatar';

interface Props {
  league: League;
  seasonHistory: SeasonHistory[];
}

const PODIUM_STYLES = [
  { icon: Crown, iconClass: 'text-gold-400',   ring: 'ring-gold-500/40',   bg: 'bg-gold-500/10',   label: 'Champion' },
  { icon: Medal, iconClass: 'text-slate-300',  ring: 'ring-slate-400/30',  bg: 'bg-slate-500/10',  label: '2nd Place' },
  { icon: Medal, iconClass: 'text-amber-700',  ring: 'ring-amber-700/30',  bg: 'bg-amber-700/10',  label: '3rd Place' },
];

function PodiumCard({ entry, place }: { entry: SeasonHistoryEntry; place: 0 | 1 | 2 }) {
  const style = PODIUM_STYLES[place];
  const Icon = style.icon;
  return (
    <div className={`card-inner p-4 text-center ring-1 ${style.ring} ${style.bg}`}>
      <Icon className={`w-6 h-6 mx-auto mb-2 ${style.iconClass}`} />
      <Avatar
        displayName={entry.display_name}
        avatarType={entry.avatar_type}
        avatarValue={entry.avatar_value}
        size={48}
        className="mx-auto"
      />
      <p className="font-medium text-white mt-2 truncate">{entry.display_name}</p>
      <p className="text-xs text-turf-500">{style.label}</p>
      <p className="font-mono font-bold text-lg text-white mt-1">{entry.total_points} pts</p>
    </div>
  );
}

function SeasonCard({ season }: { season: SeasonHistory }) {
  const [first, second, third] = season.standings;
  const rest = season.standings.slice(3);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-turf-800">
        <h2 className="font-display text-xl tracking-wide text-white">{season.season_label} Season</h2>
        <p className="text-xs text-turf-500">
          Archived {new Date(season.archived_at).toLocaleDateString()} · {season.standings.length} players
        </p>
      </div>

      <div className="p-5 grid grid-cols-3 gap-3">
        {first  && <PodiumCard entry={first}  place={0} />}
        {second && <PodiumCard entry={second} place={1} />}
        {third  && <PodiumCard entry={third}  place={2} />}
      </div>

      {rest.length > 0 && (
        <div className="border-t border-turf-800 divide-y divide-turf-800/60">
          {rest.map(e => (
            <div key={e.user_id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="font-mono text-sm text-turf-500 w-6 text-center flex-shrink-0">{e.rank}</span>
              <Avatar displayName={e.display_name} avatarType={e.avatar_type} avatarValue={e.avatar_value} size={28} />
              <span className="flex-1 text-sm text-turf-300 truncate">{e.display_name}</span>
              <span className="font-mono text-sm text-white">{e.total_points} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeagueHistoryPage({ league, seasonHistory }: Props) {
  return (
    <div className="space-y-5 animate-fade-in max-w-3xl mx-auto">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold-500 flex items-center justify-center flex-shrink-0">
            <Archive className="w-5 h-5 text-turf-950" />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-wide text-white">League History</h1>
            <p className="text-turf-500 text-sm">Past seasons and champions in {league.name}</p>
          </div>
        </div>
      </div>

      {seasonHistory.length === 0 ? (
        <div className="card p-12 text-center">
          <Archive className="w-10 h-10 mx-auto mb-3 text-turf-700" />
          <p className="text-turf-400 font-medium">No past seasons yet</p>
          <p className="text-turf-600 text-sm mt-1">
            Once your commissioner ends a season (after the national championship game), it'll show up here.
          </p>
        </div>
      ) : (
        seasonHistory.map(season => <SeasonCard key={season.id} season={season} />)
      )}
    </div>
  );
}
