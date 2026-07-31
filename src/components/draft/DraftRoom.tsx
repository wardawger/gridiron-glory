import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Clock, CheckCircle2, Zap, ChevronDown, ChevronUp, AlertCircle, X, MapPin, Tv, Loader2 } from 'lucide-react';
import type { League, LeagueMember, DraftPick, CfbTeam, GameData, TeamRatings, APRanking } from '../../types';
import { normalizeScoring } from '../../types';
import { getPickOwner, P4_CONFERENCES as P4_CONF_LIST, isP4Conference, confCategory } from '../../services/scoring';
import { Tooltip } from '../ui/Tooltip';
import { TeamLogo } from '../ui/TeamLogo';
import { fireDraftCompleteConfetti } from '../../lib/confetti';

const WEEKS = Array.from({ length: 16 }, (_, i) => i); // weeks 0–15

function formatGameDate(startDate: string | null | undefined): { date: string; time: string } {
  if (!startDate) return { date: 'TBD', time: 'TBD' };
  const d = new Date(startDate);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.getMinutes() === 0 && d.getHours() === 0
    ? 'TBD'
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return { date, time };
}

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  teams: CfbTeam[];
  gameData: GameData;
  teamRatings: Map<string, TeamRatings>;
  rankings: APRanking[];
  userId: string;
  isCommissioner: boolean;
  onStartDraft: (order: string[]) => void;
  onMakePick: (teamId: string, teamName: string, teamLogo: string, teamConf: string) => Promise<{ error?: string }>;
}

export function DraftRoom({
  league, members, draftPicks, teams, gameData, teamRatings, rankings, userId, isCommissioner,
  onStartDraft, onMakePick,
}: Props) {
  const [search, setSearch]     = useState('');
  const [confFilter, setConf]   = useState('ALL');
  const [picking, setPicking]   = useState(false);
  const [showAllPicksMobile, setShowAllPicksMobile] = useState(false);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [pickError, setPickError] = useState('');
  const [scheduleModalTeam, setScheduleModalTeam] = useState<CfbTeam | null>(null);
  const [draftOrder, setDraftOrder] = useState<string[]>(
    league.draft_order.length > 0 ? league.draft_order : members.map(m => m.user_id)
  );
  const picksRef = useRef<HTMLDivElement>(null);
  const scoring = normalizeScoring(league.scoring);

  // draftOrder is only captured once on mount, so anyone who joins the
  // league after the commissioner opened the Draft Room (but before they
  // click Start Draft) would otherwise be silently left out of the order
  // entirely — not just missing from the room, missing from draft_order
  // itself, which is what actually drives whose turn it is.
  useEffect(() => {
    if (league.draft_status !== 'pending') return;
    setDraftOrder(prev => {
      const seated = new Set(prev);
      const missing = members.map(m => m.user_id).filter(id => !seated.has(id));
      return missing.length === 0 ? prev : [...prev, ...missing];
    });
  }, [members, league.draft_status]);

  const pickedTeamIds = new Set(draftPicks.map(p => p.team_id));
  const totalPicks    = league.max_teams_per_user * league.draft_order.length;
  const currentPick   = league.draft_current_pick;
  const isDraftOver   = league.draft_status === 'complete';

  // Celebrate the moment the draft actually finishes (not on later visits to an
  // already-completed draft room).
  const prevDraftStatus = useRef(league.draft_status);
  useEffect(() => {
    if (prevDraftStatus.current !== 'complete' && league.draft_status === 'complete') {
      fireDraftCompleteConfetti();
    }
    prevDraftStatus.current = league.draft_status;
  }, [league.draft_status]);

  const onTheClock = league.draft_status === 'active'
    ? getPickOwner(currentPick, league.draft_order)
    : null;

  const isMyTurn = onTheClock === userId;

  // My current picks
  const myPicks = draftPicks.filter(p => p.user_id === userId);
  const myPicksRemaining = league.max_teams_per_user - myPicks.length;

  // Conference counts for MY roster — P4 tracked per-conference, G5 tracked
  // as one combined bucket (a single min/max across every non-P4 conference).
  const myConfCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    myPicks.forEach(p => {
      counts[p.team_conference] = (counts[p.team_conference] ?? 0) + 1;
    });
    return counts;
  }, [myPicks]);
  const myG5Count = useMemo(
    () => myPicks.filter(p => !isP4Conference(p.team_conference)).length,
    [myPicks]
  );
  const g5Configured = scoring.g5_conf_min > 0 || scoring.g5_conf_max < 99;

  // Check if a team is blocked by conference rules
  const getConfBlock = (team: CfbTeam): string | null => {
    if (isP4Conference(team.conference)) {
      const count = myConfCounts[team.conference] ?? 0;
      if (count >= scoring.p4_conf_max) {
        return `Max ${scoring.p4_conf_max} from ${team.conference}`;
      }
    } else if (myG5Count >= scoring.g5_conf_max) {
      return `Max ${scoring.g5_conf_max} G5/non-P4 teams`;
    }
    return null;
  };

  // Warn if minimum won't be met
  const confWarnings = useMemo(() => {
    if (!isMyTurn) return [];
    const warnings: string[] = [];
    (P4_CONF_LIST as readonly string[]).forEach(conf => {
      const current = myConfCounts[conf] ?? 0;
      const needed = Math.max(0, scoring.p4_conf_min - current);
      if (needed > 0 && needed >= myPicksRemaining) {
        warnings.push(`Must pick ${needed} more from ${conf}`);
      }
    });
    const g5Needed = Math.max(0, scoring.g5_conf_min - myG5Count);
    if (g5Needed > 0 && g5Needed >= myPicksRemaining) {
      warnings.push(`Must pick ${g5Needed} more G5/non-P4 team${g5Needed === 1 ? '' : 's'}`);
    }
    return warnings;
  }, [myConfCounts, myG5Count, myPicksRemaining, isMyTurn, scoring.p4_conf_min, scoring.g5_conf_min]);

  // Build draft board
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
      if (confFilter === 'P4' && !(P4_CONF_LIST as readonly string[]).includes(t.conference)) return false;
      if (confFilter === 'G5' && (P4_CONF_LIST as readonly string[]).includes(t.conference)) return false;
      if (confFilter !== 'ALL' && confFilter !== 'P4' && confFilter !== 'G5' && t.conference !== confFilter) return false;
      return true;
    });
  }, [teams, pickedTeamIds, search, confFilter]);

  const conferences = useMemo(() => {
    const set = new Set(teams.map(t => t.conference));
    return ['ALL', 'P4', 'G5', ...Array.from(set).sort()];
  }, [teams]);

  const byeWeeksByTeam = useMemo(() => {
    const map = new Map<string, number[]>();
    teams.forEach(t => {
      const g = gameData[t.id] ?? {};
      map.set(t.id, WEEKS.filter(w => !g[w] && w >= 1 && w <= 15));
    });
    return map;
  }, [teams, gameData]);

  // Always land on the top of the page when entering the Draft Room — on
  // mobile especially, starting scrolled down into the picks list buries
  // the available-teams grid you actually need to make a selection.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  // Auto-scroll the picks list to the latest pick, but only for picks made
  // *after* the page has already loaded — draftPicks.length has no "previous"
  // value to compare against on first mount, so without this guard the
  // effect fires on every page load too, not just on a new pick coming in.
  const isFirstPicksRender = useRef(true);
  useEffect(() => {
    if (isFirstPicksRender.current) {
      isFirstPicksRender.current = false;
      return;
    }
    picksRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [draftPicks.length]);

  const handlePick = async (team: CfbTeam) => {
    if (!isMyTurn || picking) return;

    const block = getConfBlock(team);
    if (block) {
      setPickError(block);
      setTimeout(() => setPickError(''), 3000);
      return;
    }

    // Categories (P4 conference names, or the 'G5' sentinel for the combined
    // non-P4 bucket) the user must pick from this turn to still be able to
    // hit their minimums before picks run out.
    const mustPickCategories = (P4_CONF_LIST as readonly string[]).filter(conf => {
      const current = myConfCounts[conf] ?? 0;
      const needed = Math.max(0, scoring.p4_conf_min - current);
      return needed > 0 && needed >= myPicksRemaining;
    });
    const g5Needed = Math.max(0, scoring.g5_conf_min - myG5Count);
    if (g5Needed > 0 && g5Needed >= myPicksRemaining) {
      mustPickCategories.push('G5');
    }
    if (mustPickCategories.length > 0 && !mustPickCategories.includes(confCategory(team.conference))) {
      setPickError(`You must pick from: ${mustPickCategories.join(', ')}`);
      setTimeout(() => setPickError(''), 3000);
      return;
    }

    setPicking(true);
    setPickError('');
    const result = await onMakePick(team.id, team.name, team.logo, team.conference);
    if (!result.error) {
      setLastPick(team.id);
      setScheduleModalTeam(null);
    } else {
      setPickError(result.error);
    }
    setPicking(false);
  };

  const getMemberName = (uid: string) =>
    members.find(m => m.user_id === uid)?.display_name ?? 'Unknown';

  // ── PRE-DRAFT ─────────────────────────────────────────────────────────────
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

        <div className="card p-4 text-left text-sm space-y-2">
          <p className="font-medium text-turf-300">Draft Rules</p>
          <ul className="text-turf-400 space-y-1">
            <li>
              • Min <strong className="text-white">{scoring.p4_conf_min}</strong> and max{' '}
              <strong className="text-white">{scoring.p4_conf_max}</strong> teams from each P4 conference
              (SEC, Big Ten, Big 12, ACC)
            </li>
            {g5Configured ? (
              <li>
                • Min <strong className="text-white">{scoring.g5_conf_min}</strong> and max{' '}
                <strong className="text-white">{scoring.g5_conf_max}</strong> combined G5/non-P4 teams
              </li>
            ) : (
              <li>• No limit on G5/non-P4 teams</li>
            )}
            <li>• Snake draft order</li>
          </ul>
        </div>

        {isCommissioner && (
          <div className="card p-5 text-left space-y-4">
            <p className="text-sm font-medium text-turf-300">Draft Order (use arrows to rearrange)</p>
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
                      aria-label={`Move ${getMemberName(uid)} up`}
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
                      aria-label={`Move ${getMemberName(uid)} down`}
                      className="btn-ghost btn-sm px-2 py-0.5 disabled:opacity-20"
                    >↓</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => onStartDraft(draftOrder)}
              disabled={draftOrder.length < 2}
              className="btn-primary w-full btn-lg"
            >
              <Zap className="w-4 h-4" /> Start Draft
            </button>
            {draftOrder.length < 2 && (
              <p className="text-xs text-amber-400 text-center -mt-2">
                Invite at least one more player before starting the draft.
              </p>
            )}
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

  // ── COMPLETE ──────────────────────────────────────────────────────────────
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
      {scheduleModalTeam && (
        <DraftTeamModal
          team={scheduleModalTeam}
          gameData={gameData}
          ratings={teamRatings.get(scheduleModalTeam.id) ?? null}
          apRank={rankings.find(r => r.team_id === scheduleModalTeam.id)?.rank ?? null}
          isMyTurn={isMyTurn}
          picking={picking}
          pickError={pickError}
          blockReason={getConfBlock(scheduleModalTeam)}
          onConfirmPick={() => handlePick(scheduleModalTeam)}
          onClose={() => setScheduleModalTeam(null)}
        />
      )}

      {/* On the clock banner */}
      <div className={`card p-4 flex items-center justify-between ${isMyTurn ? 'border-field-500/50 bg-field-950/30' : ''}`}>
        <div className="flex items-center gap-3">
          {isMyTurn ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-field-400 animate-pulse" />
              <div>
                <p className="font-bold text-field-300">YOUR PICK</p>
                <p className="text-xs text-turf-500">Pick {currentPick} of {totalPicks} · {myPicksRemaining} picks remaining</p>
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
        <div className="text-right">
          <p className="text-xs text-turf-500">Round</p>
          <p className="font-mono font-bold text-white">{Math.ceil(currentPick / league.draft_order.length)}</p>
        </div>
      </div>

      {/* Conference tracker */}
      {isMyTurn && (
        <div className={`card p-3 grid gap-2 ${g5Configured ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {(P4_CONF_LIST as readonly string[]).map(conf => {
            const count = myConfCounts[conf] ?? 0;
            const atMax = count >= scoring.p4_conf_max;
            const atMin = count >= scoring.p4_conf_min;
            return (
              <Tooltip
                key={conf}
                content={
                  atMax
                    ? `Maximum reached — you can't draft any more ${conf} teams.`
                    : atMin
                    ? `${conf} minimum met. You can draft up to ${scoring.p4_conf_max - count} more.`
                    : `You need at least ${scoring.p4_conf_min - count} more from ${conf}.`
                }
                position="bottom"
                width="w-52"
              >
                <div className={`text-center p-2 rounded-lg w-full cursor-default ${
                  atMax ? 'bg-red-900/30 border border-red-800/50' :
                  atMin ? 'bg-field-900/30 border border-field-800/50' :
                  'bg-turf-800'
                }`}>
                  <p className="text-xs text-turf-400 truncate">{conf}</p>
                  <p className={`font-mono font-bold text-lg ${
                    atMax ? 'text-red-300' : atMin ? 'text-field-400' : 'text-white'
                  }`}>{count}/{scoring.p4_conf_max}</p>
                  <p className="text-xs text-turf-500">min {scoring.p4_conf_min}</p>
                </div>
              </Tooltip>
            );
          })}
          {g5Configured && (() => {
            const atMax = myG5Count >= scoring.g5_conf_max;
            const atMin = myG5Count >= scoring.g5_conf_min;
            return (
              <Tooltip
                content={
                  atMax
                    ? `Maximum reached — you can't draft any more G5/non-P4 teams.`
                    : atMin
                    ? `G5 minimum met. You can draft up to ${scoring.g5_conf_max - myG5Count} more.`
                    : `You need at least ${scoring.g5_conf_min - myG5Count} more G5/non-P4 teams.`
                }
                position="bottom"
                width="w-52"
              >
                <div className={`text-center p-2 rounded-lg w-full cursor-default ${
                  atMax ? 'bg-red-900/30 border border-red-800/50' :
                  atMin ? 'bg-field-900/30 border border-field-800/50' :
                  'bg-turf-800'
                }`}>
                  <p className="text-xs text-turf-400 truncate">G5</p>
                  <p className={`font-mono font-bold text-lg ${
                    atMax ? 'text-red-300' : atMin ? 'text-field-400' : 'text-white'
                  }`}>{myG5Count}/{scoring.g5_conf_max}</p>
                  <p className="text-xs text-turf-500">min {scoring.g5_conf_min}</p>
                </div>
              </Tooltip>
            );
          })()}
        </div>
      )}

      {/* Warnings */}
      {confWarnings.length > 0 && (
        <div className="card p-3 border-amber-700/50 bg-amber-950/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-300 space-y-0.5">
            {confWarnings.map(w => <p key={w}>{w}</p>)}
          </div>
        </div>
      )}

      {/* Pick error */}
      {pickError && (
        <div className="card p-3 border-red-800/50 bg-red-950/20 flex items-center gap-2 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {pickError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Available teams */}
        <div className="lg:col-span-2 space-y-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[600px] overflow-y-auto pr-1">
            {available.length === 0 && (
              <div className="col-span-2 py-12 text-center text-turf-500 card">
                No available teams match your filter
              </div>
            )}
            {available.map(team => {
              const block = isMyTurn ? getConfBlock(team) : null;
              const isBlocked = !!block;
              const byes = byeWeeksByTeam.get(team.id) ?? [];
              const fpiRank = teamRatings.get(team.id)?.fpi_rank ?? null;

              const card = (
                <button
                  key={team.id}
                  onClick={() => setScheduleModalTeam(team)}
                  className={`card text-left p-3 flex items-center gap-3 transition-all group w-full ${
                    isBlocked
                      ? 'opacity-60 border-red-900/30'
                      : isMyTurn
                      ? 'hover:border-field-500/50 hover:bg-field-950/20 cursor-pointer active:scale-[0.98]'
                      : 'opacity-70'
                  } ${lastPick === team.id ? 'animate-pick-flash' : ''}`}
                >
                  <TeamLogo src={team.logo} alt={team.name} fallbackName={team.name} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate transition-colors ${
                      isBlocked ? 'text-turf-600' : 'text-white group-hover:text-field-300'
                    }`}>
                      {team.name}
                    </p>
                    <p className="text-xs text-turf-500">{team.conference}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {fpiRank != null && (
                        <span className="text-xs font-mono text-field-400 bg-field-900/30 border border-field-800/50 px-1.5 rounded flex-shrink-0">
                          FPI #{fpiRank}
                        </span>
                      )}
                      <p className="text-xs text-turf-500 truncate">
                        {byes.length > 0 ? `Bye: ${byes.map(w => `Wk ${w}`).join(', ')}` : 'No bye'}
                      </p>
                    </div>
                  </div>
                  {isBlocked && (
                    <span className="text-xs text-red-500 flex-shrink-0">Max</span>
                  )}
                  {!isBlocked && isMyTurn && (
                    <span className="text-xs text-field-500 group-hover:text-field-300 transition-colors opacity-0 group-hover:opacity-100">
                      View →
                    </span>
                  )}
                </button>
              );

              // Wrap blocked teams in a styled tooltip
              return isBlocked ? (
                <Tooltip key={team.id} content={block} position="top" width="w-48" fullWidth>
                  {card}
                </Tooltip>
              ) : card;
            })}
          </div>
        </div>

        {/* Draft board */}
        <div className="space-y-2">
          <p className="text-xs text-turf-500 uppercase tracking-wide font-medium">Draft Board</p>

          {/* Desktop: unchanged, full scrollable board */}
          <div ref={picksRef} className="hidden sm:block space-y-1 max-h-[660px] overflow-y-auto">
            {pickSlots.map(slot => renderPickSlot(slot, currentPick, getMemberName))}
          </div>

          {/* Mobile: collapsed to the last 10 picks + on-deck by default */}
          <div className="sm:hidden space-y-1">
            {(showAllPicksMobile ? pickSlots : pickSlots.slice(Math.max(0, currentPick - 11), currentPick))
              .map(slot => renderPickSlot(slot, currentPick, getMemberName))}
            {pickSlots.length > 11 && (
              <button
                onClick={() => setShowAllPicksMobile(v => !v)}
                className="w-full flex items-center justify-center gap-1 text-xs text-field-400 hover:text-field-300 py-2 mt-1 border-t border-turf-800/60 transition-colors"
              >
                {showAllPicksMobile ? (
                  <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
                ) : (
                  <>Show all {pickSlots.length} picks <ChevronDown className="w-3.5 h-3.5" /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderPickSlot(
  slot: { pick: number; userId: string; draftPick: DraftPick | null },
  currentPick: number,
  getMemberName: (uid: string) => string,
) {
  const isNext = slot.pick === currentPick;
  return (
    <div
      key={slot.pick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
        slot.draftPick ? 'bg-turf-800/50' :
        isNext ? 'bg-field-900/40 border border-field-700/50' :
        'opacity-40'
      }`}
    >
      <span className="font-mono text-xs text-turf-500 w-5">{slot.pick}</span>
      <span className="text-xs text-turf-500 w-20 truncate">{getMemberName(slot.userId)}</span>
      {slot.draftPick ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <TeamLogo src={slot.draftPick.team_logo} alt="" fallbackName={slot.draftPick.team_name} size={16} />
          <span className="text-white text-xs truncate">{slot.draftPick.team_name}</span>
        </div>
      ) : isNext ? (
        <span className="text-field-400 text-xs animate-pulse">On the clock…</span>
      ) : (
        <span className="text-turf-700 text-xs">—</span>
      )}
    </div>
  );
}

// ── Team schedule + confirm pick modal ──────────────────────────────────────

interface DraftTeamModalProps {
  team: CfbTeam;
  gameData: GameData;
  ratings: TeamRatings | null;
  apRank: number | null;
  isMyTurn: boolean;
  picking: boolean;
  pickError: string;
  blockReason: string | null;
  onConfirmPick: () => void;
  onClose: () => void;
}

function DraftTeamModal({ team, gameData, ratings, apRank, isMyTurn, picking, pickError, blockReason, onConfirmPick, onClose }: DraftTeamModalProps) {
  const teamGames = gameData[team.id] ?? {};
  const weeks = WEEKS.filter(w => teamGames[w]);
  const byes  = WEEKS.filter(w => !teamGames[w] && w >= 1 && w <= 15);

  const reason = !isMyTurn ? 'Not your turn yet' : blockReason;
  const canPick = isMyTurn && !picking && !blockReason;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-turf-700 bg-turf-950 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — team info + Confirm Pick action up top */}
        <div className="sticky top-0 z-10 bg-turf-950 border-b border-turf-800 px-6 py-4 space-y-3">
          <div className="flex items-center gap-4">
            <TeamLogo src={team.logo} alt={team.name} fallbackName={team.name} size={48} />
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-xl font-bold text-white tracking-wide">{team.name}</h2>
              <p className="text-sm text-turf-400">{team.conference} · 2026 Schedule</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg border border-turf-700 p-1.5 text-turf-400 hover:border-turf-500 hover:text-white transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={onConfirmPick}
            disabled={!canPick}
            className={`w-full btn-lg flex items-center justify-center gap-2 ${
              canPick ? 'btn-primary' : 'btn-secondary opacity-60 cursor-not-allowed'
            }`}
          >
            {picking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {picking ? 'Drafting…' : canPick ? `Confirm Pick: ${team.name}` : reason ?? 'Not available'}
          </button>
          {pickError && (
            <p className="text-xs text-red-300 text-center">{pickError}</p>
          )}
        </div>

        {/* Bye weeks summary */}
        {byes.length > 0 && (
          <div className="px-6 pt-4">
            <p className="text-xs text-turf-500">
              <span className="text-turf-400 font-medium">Bye weeks: </span>
              {byes.map(w => `Wk ${w}`).join(', ')}
            </p>
          </div>
        )}

        {/* Team strength */}
        <div className="px-6 pt-4">
          <p className="text-xs font-bold uppercase tracking-widest text-turf-500 mb-2">Team Strength</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'AP Rank',       value: apRank },
              { label: 'Offense',       value: ratings?.offense_rank ?? null },
              { label: 'Defense',       value: ratings?.defense_rank ?? null },
              { label: 'Strength of Sched', value: ratings?.sos_rank ?? null },
            ].map(stat => (
              <div
                key={stat.label}
                className="rounded-lg border border-field-800/50 bg-field-900/30 px-3 py-2 text-center"
              >
                <p className="font-mono text-lg font-bold text-field-400">
                  {stat.value != null ? `#${stat.value}` : '—'}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-turf-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Games list */}
        <div className="divide-y divide-turf-800/60 px-2 py-2">
          {weeks.length === 0 && (
            <p className="py-8 text-center text-turf-500">No schedule data available yet.</p>
          )}

          {WEEKS.map(w => {
            const game = teamGames[w];
            if (!game) return null;

            const { date, time } = formatGameDate((game as any).start_date);
            const venue   = (game as any).venue    ?? null;
            const tv      = (game as any).tv       ?? null;
            const isHome  = (game as any).is_home  ?? true;
            const oppLogo = (game as any).opponent_logo ?? null;

            return (
              <div key={w} className="flex items-start gap-4 rounded-xl px-4 py-4 transition-colors hover:bg-turf-900/40">
                {/* Week badge */}
                <div className="flex-shrink-0 w-12 text-center pt-0.5">
                  <div className="text-xs font-bold uppercase tracking-widest text-turf-500">
                    {w === 0 ? 'Wk0' : `Wk ${w}`}
                  </div>
                </div>

                {/* Opponent logo */}
                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 mt-0.5">
                  <TeamLogo src={oppLogo} alt={game.opponent} fallbackName={game.opponent} size={40} />
                </div>

                {/* Main game info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-turf-500">{isHome ? 'vs' : 'at'}</span>
                    <span className="font-semibold text-white">
                      {game.opponent_rank ? (
                        <span className="text-turf-400 font-normal">#{game.opponent_rank} </span>
                      ) : null}
                      {game.opponent}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-turf-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      {date}{time !== 'TBD' ? ` · ${time}` : ''}
                    </span>
                    {venue && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate max-w-48">{venue}</span>
                      </span>
                    )}
                    {tv && (
                      <span className="flex items-center gap-1">
                        <Tv className="h-3 w-3 flex-shrink-0" />
                        {tv}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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
                    <TeamLogo src={slot.draftPick.team_logo} alt="" fallbackName={slot.draftPick.team_name} size={24} />
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
