import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Clock, CheckCircle2, Zap, ChevronDown } from 'lucide-react';
import type { League, LeagueMember, DraftPick, CfbTeam } from '../../types';
import { getPickOwner } from '../../services/scoring';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  teams: CfbTeam[];
  userId: string;
  isCommissioner: boolean;
  onStartDraft: (order: string[]) => void;
  onMakePick: (teamId: string, teamName: string, teamLogo: string, teamConf: string) => Promise<{ error?: string }>;
}

const P4 = ['SEC', 'Big Ten', 'Big 12', 'ACC', 'FBS Independents'];

export function DraftRoom({
  league, members, draftPicks, teams, userId, isCommissioner,
  onStartDraft, onMakePick,
}: Props) {
  const [search, setSearch]     = useState('');
  const [confFilter, setConf]   = useState('ALL');
  const [picking, setPicking]   = useState(false);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState<string[]>(
    league.draft_order.length > 0 ? league.draft_order : members.map(m => m.user_id)
  );
  const picksRef = useRef<HTMLDivElement>(null);

  const pickedTeamIds = new Set(draftPicks.map(p => p.team_id));
  const totalPicks    = league.max_teams_per_user * league.draft_order.length;
  const currentPick   = league.draft_current_pick;
  const isDraftOver   = league.draft_status === 'complete';

  const onTheClock = league.draft_status === 'active'
    ? getPickOwner(currentPick, league.draft_order)
    : null;

  const isMyTurn = onTheClock === userId;

  // Build draft board — all picks slotted into grid
  const pickSlots = useMemo(() => {
    const slots: Array<{ pick: number; userId: string; draftPick: DraftPick | null }> = [];
    for (let i = 1; i <= totalPicks; i++) {
      const uid = getPickOwner(i, league.draft_order);
      const dp  = draftPicks.find(p => p.pick_number === i) ?? null;
      slots.push({ pick: i, userId: uid, draftPick: dp });
    }
    return slots;
  }, [totalPicks, league.draft_order, draftPicks]);

  // Available teams with search/filter
  const available = useMemo(() => {
    return teams.filter(t => {
      if (pickedTeamIds.has(t.id)) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (confFilter === 'P4' && !P4.includes(t.conference)) return false;
      if (confFilter === 'G5' && P4.includes(t.conference)) return false;
      if (confFilter !== 'ALL' && confFilter !== 'P4' && confFilter !== 'G5' && t.conference !== confFilter) return false;
      return true;
    });
  }, [teams, pickedTeamIds, search, confFilter]);

  const conferences = useMemo(() => {
    const set = new Set(teams.map(t => t.conference));
    return ['ALL', 'P4', 'G5', ...Array.from(set).sort()];
  }, [teams]);

  // Auto-scroll to latest pick
  useEffect(() => {
    picksRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [draftPicks.length]);

  const handlePick = async (team: CfbTeam) => {
    if (!isMyTurn || picking) return;
    setPicking(true);
    const result = await onMakePick(team.id, team.name, team.logo, team.conference);
    if (!result.error) setLastPick(team.id);
    setPicking(false);
  };

  const getMemberName = (uid: string) =>
    members.find(m => m.user_id === uid)?.display_name ?? 'Unknown';

  // ── PRE-DRAFT setup ──────────────────────────────────────────────────────
  if (league.draft_status === 'pending') {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6 animate-fade-in">
        <Zap className="w-12 h-12 text-field-400 mx-auto" />
        <div>
          <h2 className="font-display text-3xl tracking-wide text-white">Draft Room</h2>
          <p className="text-turf-400 mt-2">
            {isCommissioner
              ? 'Set the draft order, then start when everyone is ready.'
              : 'Waiting for the commissioner to start the draft.'}
          </p>
        </div>

        {isCommissioner && (
          <div className="card p-5 text-left space-y-4">
            <p className="text-sm font-medium text-turf-300">Draft Order (drag to rearrange)</p>
            <div className="space-y-2">
              {draftOrder.map((uid, i) => (
                <div key={uid} className="card-inner flex items-center gap-3 px-3 py-2">
                  <span className="font-mono text-sm text-turf-500 w-4">{i + 1}</span>
                  <span className="text-white text-sm flex-1">{getMemberName(uid)}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        if (i === 0) return;
                        const o = [...draftOrder];
                        [o[i], o[i-1]] = [o[i-1], o[i]];
                        setDraftOrder(o);
                      }}
                      disabled={i === 0}
                      className="btn-ghost btn-sm px-2 py-0.5 disabled:opacity-20"
                    >↑</button>
                    <button
                      onClick={() => {
                        if (i === draftOrder.length - 1) return;
                        const o = [...draftOrder];
                        [o[i], o[i+1]] = [o[i+1], o[i]];
                        setDraftOrder(o);
                      }}
                      disabled={i === draftOrder.length - 1}
                      className="btn-ghost btn-sm px-2 py-0.5 disabled:opacity-20"
                    >↓</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => onStartDraft(draftOrder)}
              className="btn-primary w-full btn-lg"
            >
              <Zap className="w-4 h-4" /> Start Draft
            </button>
          </div>
        )}

        {!isCommissioner && (
          <div className="card p-6 text-turf-400">
            <Clock className="w-8 h-8 mx-auto mb-2 animate-pulse-slow" />
            <p>Waiting for commissioner to start…</p>
          </div>
        )}
      </div>
    );
  }

  // ── COMPLETE ─────────────────────────────────────────────────────────────
  if (isDraftOver) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="card p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-field-400 mx-auto mb-3" />
          <h2 className="font-display text-3xl text-white tracking-wide">DRAFT COMPLETE</h2>
          <p className="text-turf-400 mt-1 text-sm">{draftPicks.length} picks made</p>
        </div>
        <DraftBoard pickSlots={pickSlots} members={members} rounds={league.max_teams_per_user} perRound={league.draft_order.length} />
      </div>
    );
  }

  // ── ACTIVE DRAFT ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      {/* On the clock banner */}
      <div className={`card p-4 flex items-center justify-between ${isMyTurn ? 'border-field-500/50 bg-field-950/30' : ''}`}>
        <div className="flex items-center gap-3">
          {isMyTurn ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-field-400 animate-pulse" />
              <div>
                <p className="font-bold text-field-300">YOUR PICK</p>
                <p className="text-xs text-turf-500">Pick {currentPick} of {totalPicks}</p>
              </div>
            </>
          ) : (
            <>
              <Clock className="w-5 h-5 text-turf-500 animate-pulse-slow" />
              <div>
                <p className="font-medium text-white">{getMemberName(onTheClock!)} is on the clock</p>
                <p className="text-xs text-turf-500">Pick {currentPick} of {totalPicks}</p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xs text-turf-500">Round</p>
            <p className="font-mono font-bold text-white">{Math.ceil(currentPick / league.draft_order.length)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Available teams */}
        <div className="lg:col-span-2 space-y-3">
          {/* Search + filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500" />
              <input
                className="input pl-9"
                placeholder="Search teams…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="relative">
              <select
                className="input appearance-none pr-8"
                value={confFilter}
                onChange={e => setConf(e.target.value)}
              >
                {conferences.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500 pointer-events-none" />
            </div>
          </div>

          {/* Team grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[600px] overflow-y-auto pr-1">
            {available.length === 0 && (
              <div className="col-span-2 py-12 text-center text-turf-500 card">
                No available teams match your filter
              </div>
            )}
            {available.map(team => (
              <button
                key={team.id}
                onClick={() => handlePick(team)}
                disabled={!isMyTurn || picking}
                className={`card text-left p-3 flex items-center gap-3 transition-all group ${
                  isMyTurn && !picking
                    ? 'hover:border-field-500/50 hover:bg-field-950/20 cursor-pointer active:scale-[0.98]'
                    : 'opacity-60 cursor-not-allowed'
                } ${lastPick === team.id ? 'animate-pick-flash' : ''}`}
              >
                <img
                  src={team.logo}
                  alt={team.name}
                  className="w-8 h-8 object-contain flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(team.name)}&background=166534&color=fff`; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white group-hover:text-field-300 transition-colors truncate">
                    {team.name}
                  </p>
                  <p className="text-xs text-turf-500">{team.conference}</p>
                </div>
                {isMyTurn && (
                  <span className="text-xs text-field-500 group-hover:text-field-300 transition-colors opacity-0 group-hover:opacity-100">
                    Pick →
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Draft board */}
        <div className="space-y-2">
          <p className="text-xs text-turf-500 uppercase tracking-wide font-medium">Draft Board</p>
          <div ref={picksRef} className="space-y-1 max-h-[660px] overflow-y-auto">
            {pickSlots.map(slot => {
              const isNext = slot.pick === currentPick;
              return (
                <div
                  key={slot.pick}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                    slot.draftPick
                      ? 'bg-turf-800/50'
                      : isNext
                      ? 'bg-field-900/40 border border-field-700/50'
                      : 'opacity-40'
                  }`}
                >
                  <span className="font-mono text-xs text-turf-600 w-5">{slot.pick}</span>
                  <span className="text-xs text-turf-500 w-20 truncate">{getMemberName(slot.userId)}</span>
                  {slot.draftPick ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <img
                        src={slot.draftPick.team_logo}
                        className="w-4 h-4 object-contain"
                        alt=""
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <span className="text-white text-xs truncate">{slot.draftPick.team_name}</span>
                    </div>
                  ) : isNext ? (
                    <span className="text-field-400 text-xs animate-pulse">On the clock…</span>
                  ) : (
                    <span className="text-turf-700 text-xs">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Draft board (post-draft view organized by rounds)
function DraftBoard({ pickSlots, members, rounds, perRound }: {
  pickSlots: Array<{ pick: number; userId: string; draftPick: DraftPick | null }>;
  members: LeagueMember[];
  rounds: number;
  perRound: number;
}) {
  const getMemberName = (uid: string) => members.find(m => m.user_id === uid)?.display_name ?? '?';

  const roundData: Array<typeof pickSlots> = [];
  for (let r = 0; r < rounds; r++) {
    roundData.push(pickSlots.slice(r * perRound, (r + 1) * perRound));
  }

  return (
    <div className="card p-4 space-y-4">
      <h3 className="font-display text-xl tracking-wide text-white">Draft Results</h3>
      {roundData.map((round, ri) => (
        <div key={ri}>
          <p className="text-xs text-turf-500 mb-2 uppercase tracking-wide">Round {ri + 1}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {round.map(slot => (
              <div key={slot.pick} className="card-inner p-2.5 flex items-center gap-2">
                {slot.draftPick ? (
                  <>
                    <img
                      src={slot.draftPick.team_logo}
                      className="w-6 h-6 object-contain flex-shrink-0"
                      alt=""
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{slot.draftPick.team_name}</p>
                      <p className="text-xs text-turf-500 truncate">{getMemberName(slot.userId)}</p>
                    </div>
                  </>
                ) : (
                  <span className="text-turf-700 text-xs">Skipped</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
