import { useMemo, useState } from 'react';
import { History, ListOrdered, Users, Search, Shield } from 'lucide-react';
import type { League, LeagueMember, DraftPick, CfbTeam } from '../../types';
import { normalizeScoring } from '../../types';
import { P4_CONFERENCES, isP4Conference } from '../../services/scoring';
import { useTabCrossfade } from '../../hooks/useCrossfade';
import { TeamLogo } from '../ui/TeamLogo';
import { TriviaCard } from '../ui/TriviaCard';

type View = 'timeline' | 'byManager';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  teams: CfbTeam[];
}

// Each P4 conference gets its own bucket; every non-P4 conference is
// combined into one "Other" bucket, matching how the rest of the app
// (roster conference limits, the excluded-conferences setting) already
// treats G5/non-P4 as one combined category.
const CONFERENCE_CATEGORIES = [...P4_CONFERENCES, 'Other'] as const;

function conferenceCategory(conference: string): string {
  return isP4Conference(conference) ? conference : 'Other';
}

// Stylized per-conference identity — CFBD has no conference logo data (only
// team logos), so this is a designed monogram + accent color per category,
// not a real crest. Short codes are plain descriptive abbreviations (not
// trademarked wordmarks like the Big Ten's stylized "B1G" mark). Green is
// deliberately not used here since it's already the app's own semantic
// color (primary actions, success, "covered" spread results).
const CONFERENCE_BADGE: Record<string, { short: string; text: string; bg: string; border: string; bar: string }> = {
  'SEC':     { short: 'SEC', text: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/30',  bar: 'bg-amber-400' },
  'Big Ten': { short: 'B10', text: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/30',   bar: 'bg-blue-400' },
  'Big 12':  { short: 'B12', text: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/30', bar: 'bg-purple-400' },
  'ACC':     { short: 'ACC', text: 'text-rose-400',   bg: 'bg-rose-500/15',   border: 'border-rose-500/30',   bar: 'bg-rose-400' },
  'Other':   { short: 'OTH', text: 'text-turf-300',   bg: 'bg-turf-700/40',   border: 'border-turf-600/50',   bar: 'bg-turf-400' },
};

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

export function DraftRecapPage({ league, members, draftPicks, teams }: Props) {
  const { active: view, select: selectView, panelClass: viewPanelClass } = useTabCrossfade<View>('timeline');
  const [search, setSearch] = useState('');
  const scoring = normalizeScoring(league.scoring);
  const g5Configured = scoring.g5_conf_min > 0 || scoring.g5_conf_max < 99;

  // Total real FBS teams per category — the denominator for the league-wide
  // breakdown (e.g. "SEC: 10/14").
  const conferenceTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    CONFERENCE_CATEGORIES.forEach(c => { totals[c] = 0; });
    teams.forEach(t => {
      const cat = conferenceCategory(t.conference);
      totals[cat] = (totals[cat] ?? 0) + 1;
    });
    return totals;
  }, [teams]);

  const leagueDraftedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    CONFERENCE_CATEGORIES.forEach(c => { counts[c] = 0; });
    draftPicks.forEach(p => {
      const cat = conferenceCategory(p.team_conference);
      counts[cat] = (counts[cat] ?? 0) + 1;
    });
    return counts;
  }, [draftPicks]);

  const perManagerCounts = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    members.forEach(m => {
      const counts: Record<string, number> = {};
      CONFERENCE_CATEGORIES.forEach(c => { counts[c] = 0; });
      map.set(m.user_id, counts);
    });
    draftPicks.forEach(p => {
      const counts = map.get(p.user_id);
      if (!counts) return;
      const cat = conferenceCategory(p.team_conference);
      counts[cat] = (counts[cat] ?? 0) + 1;
    });
    return map;
  }, [draftPicks, members]);

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

      {sortedPicks.length > 0 && (
        <div className="card p-5 space-y-4">
          <h3 className="font-medium text-white text-sm">League Conference Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {CONFERENCE_CATEGORIES.map(cat => {
              const badge = CONFERENCE_BADGE[cat];
              const drafted = leagueDraftedCounts[cat];
              const total = conferenceTotals[cat];
              const pct = total > 0 ? Math.min(100, Math.round((drafted / total) * 100)) : 0;
              return (
                <div key={cat} className="card-inner p-3 text-center">
                  <div className={`w-9 h-9 mx-auto mb-2 rounded-lg flex items-center justify-center font-display text-xs font-bold border ${badge.text} ${badge.bg} ${badge.border}`}>
                    {badge.short}
                  </div>
                  <p className="font-mono text-lg font-bold text-white">{drafted}/{total}</p>
                  <p className="text-xs text-turf-500 mt-0.5">{cat}</p>
                  <div className="h-1 rounded-full bg-turf-800 mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${badge.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-3 border-t border-turf-800">
            <p className="text-xs text-turf-500 uppercase tracking-wide font-medium">By Manager</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {members.map(m => {
                const counts = perManagerCounts.get(m.user_id) ?? {};
                return (
                  <div key={m.user_id} className="card-inner px-3 py-2">
                    <p className="text-sm text-white font-medium mb-1.5 truncate">{m.display_name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CONFERENCE_CATEGORIES.map(cat => {
                        const badge = CONFERENCE_BADGE[cat];
                        const denom = cat === 'Other'
                          ? (g5Configured ? scoring.g5_conf_max : null)
                          : scoring.p4_conf_max;
                        const count = counts[cat] ?? 0;
                        return (
                          <span
                            key={cat}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium ${badge.text} ${badge.bg} ${badge.border}`}
                          >
                            {badge.short}
                            <span className="font-mono">{count}{denom != null ? `/${denom}` : ''}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {sortedPicks.length === 0 ? (
        <div className="card p-12 text-center text-turf-500">
          <History className="w-8 h-8 mx-auto mb-3 text-turf-700" />
          <p>No picks have been made yet.</p>
          <TriviaCard className="mt-8" />
        </div>
      ) : (
        <>
          {/* View toggle + search */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-1 bg-turf-900 p-1 rounded-xl border border-turf-800 sm:w-72">
              <button
                onClick={() => selectView('timeline')}
                className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-sm font-medium transition-all ${
                  view === 'timeline' ? 'bg-field-500 text-turf-950' : 'text-turf-400 hover:text-white'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" /> Timeline
              </button>
              <button
                onClick={() => selectView('byManager')}
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
          <div className={`card divide-y divide-turf-800/60 overflow-hidden ${viewPanelClass('timeline')}`}>
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

          {/* BY MANAGER VIEW */}
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${viewPanelClass('byManager')}`}>
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
                    <p className="text-sm text-turf-500 py-2">No picks yet</p>
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
        </>
      )}
    </div>
  );
}
