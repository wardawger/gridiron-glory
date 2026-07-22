import { useMemo, useState } from 'react';
import { History, ListOrdered, Users, Search, Shield } from 'lucide-react';
import type { League, LeagueMember, DraftPick } from '../../types';
import { TeamLogo } from '../ui/TeamLogo';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
}

function formatPickTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return `${hrs}h ${remMins}m`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return `${days}d ${remHrs}h`;
}

export function DraftRecapPage({ league, members, draftPicks }: Props) {
  const [view, setView]     = useState<'timeline' | 'byManager'>('timeline');
  const [search, setSearch] = useState('');

  const getMemberName = (uid: string) =>
    members.find(m => m.user_id === uid)?.display_name ?? 'Unknown';
  const getMemberRole = (uid: string) =>
    members.find(m => m.user_id === uid)?.role;

  const totalPicks = league.max_teams_per_user * league.draft_order.length;
  const perRound   = league.draft_order.length;

  const sortedPicks = useMemo(
    () => [...draftPicks].sort((a, b) => a.pick_number - b.pick_number),
    [draftPicks]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return sortedPicks;
    const q = search.toLowerCase();
    return sortedPicks.filter(p =>
      p.team_name.toLowerCase().includes(q) ||
      p.team_conference.toLowerCase().includes(q) ||
      getMemberName(p.user_id).toLowerCase().includes(q)
    );
  }, [sortedPicks, search, members]);

  const byManager = useMemo(() => {
    const order = league.draft_order.length > 0 ? league.draft_order : members.map(m => m.user_id);
    return order.map(uid => ({
      userId: uid,
      picks: filtered.filter(p => p.user_id === uid),
    })).filter(g => g.picks.length > 0 || !search.trim());
  }, [league.draft_order, members, filtered, search]);

  const firstPick = sortedPicks[0] ?? null;
  const lastPick  = sortedPicks[sortedPicks.length - 1] ?? null;

  const statusLabel =
    league.draft_status === 'pending'  ? 'Not Started' :
    league.draft_status === 'active'   ? 'In Progress' :
    'Complete';
  const statusBadge =
    league.draft_status === 'pending'  ? 'badge-gray' :
    league.draft_status === 'active'   ? 'badge-gold' :
    'badge-green';

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center flex-shrink-0">
              <History className="w-5 h-5 text-turf-950" />
            </div>
            <div>
              <h1 className="font-display text-2xl tracking-wide text-white">Draft Recap</h1>
              <p className="text-turf-500 text-sm">{league.name}</p>
            </div>
          </div>
          <span className={statusBadge}>{statusLabel}</span>
        </div>

        {sortedPicks.length > 0 && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card-inner p-3 text-center">
              <p className="font-mono text-xl font-bold text-white">{draftPicks.length}/{totalPicks || draftPicks.length}</p>
              <p className="text-xs text-turf-500 mt-0.5">Picks made</p>
            </div>
            <div className="card-inner p-3 text-center">
              <p className="font-mono text-sm font-bold text-white">{formatPickTime(firstPick!.picked_at)}</p>
              <p className="text-xs text-turf-500 mt-0.5">First pick</p>
            </div>
            <div className="card-inner p-3 text-center">
              <p className="font-mono text-sm font-bold text-white">{formatPickTime(lastPick!.picked_at)}</p>
              <p className="text-xs text-turf-500 mt-0.5">Most recent pick</p>
            </div>
            <div className="card-inner p-3 text-center">
              <p className="font-mono text-xl font-bold text-white">
                {formatDuration(new Date(lastPick!.picked_at).getTime() - new Date(firstPick!.picked_at).getTime())}
              </p>
              <p className="text-xs text-turf-500 mt-0.5">Span</p>
            </div>
          </div>
        )}
      </div>

      {sortedPicks.length === 0 ? (
        <div className="card p-12 text-center text-turf-500">
          <History className="w-8 h-8 mx-auto mb-3 text-turf-700" />
          <p>No picks have been made yet.</p>
        </div>
      ) : (
        <>
          {/* View toggle + search */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-1 bg-turf-900 p-1 rounded-xl border border-turf-800 sm:w-72">
              <button
                onClick={() => setView('timeline')}
                className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-sm font-medium transition-all ${
                  view === 'timeline' ? 'bg-field-500 text-turf-950' : 'text-turf-400 hover:text-white'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" /> Timeline
              </button>
              <button
                onClick={() => setView('byManager')}
                className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-sm font-medium transition-all ${
                  view === 'byManager' ? 'bg-field-500 text-turf-950' : 'text-turf-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" /> By Manager
              </button>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500" />
              <input
                className="input pl-9"
                placeholder="Search team, conference, or manager…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* TIMELINE VIEW */}
          {view === 'timeline' && (
            <div className="card divide-y divide-turf-800/60 overflow-hidden">
              {filtered.length === 0 && (
                <p className="py-10 text-center text-turf-500">No picks match your search</p>
              )}
              {filtered.map(pick => (
                <div key={pick.id} className="flex items-center gap-3 px-4 py-3 hover:bg-turf-800/20 transition-colors">
                  <div className="w-14 flex-shrink-0 text-center">
                    <p className="font-mono text-xs text-turf-500">Rd {pick.round}</p>
                    <p className="font-mono text-sm font-bold text-turf-300">#{pick.pick_number}</p>
                  </div>
                  <TeamLogo src={pick.team_logo} alt={pick.team_name} fallbackName={pick.team_name} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{pick.team_name}</p>
                    <p className="text-xs text-turf-500">{pick.team_conference}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-turf-300 flex items-center justify-end gap-1">
                      {getMemberRole(pick.user_id) === 'commissioner' && <Shield className="w-3 h-3 text-field-400" />}
                      {getMemberName(pick.user_id)}
                    </p>
                    <p className="text-xs text-turf-500 font-mono">{formatPickTime(pick.picked_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* BY MANAGER VIEW */}
          {view === 'byManager' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {byManager.length === 0 && (
                <p className="col-span-2 py-10 text-center text-turf-500">No picks match your search</p>
              )}
              {byManager.map(({ userId, picks }) => (
                <div key={userId} className="card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    {getMemberRole(userId) === 'commissioner' && <Shield className="w-3.5 h-3.5 text-field-400" />}
                    <h3 className="font-display text-lg tracking-wide text-white">{getMemberName(userId)}</h3>
                    <span className="text-xs text-turf-500 ml-auto">{picks.length} pick{picks.length !== 1 ? 's' : ''}</span>
                  </div>
                  {picks.length === 0 ? (
                    <p className="text-sm text-turf-600 py-2">No picks yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {picks.map(pick => (
                        <div key={pick.id} className="card-inner flex items-center gap-2.5 px-3 py-2">
                          <span className="font-mono text-xs text-turf-500 w-6 flex-shrink-0">#{pick.pick_number}</span>
                          <TeamLogo src={pick.team_logo} alt={pick.team_name} fallbackName={pick.team_name} size={24} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{pick.team_name}</p>
                          </div>
                          <p className="text-xs text-turf-500 font-mono flex-shrink-0">{formatPickTime(pick.picked_at)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
