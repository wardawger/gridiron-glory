import { useMemo, useState } from 'react';
import { ArrowLeftRight, Search, ChevronDown, AlertCircle, CheckCircle2, X, ArrowRight, History, Clock, Users } from 'lucide-react';
import type { League, LeagueMember, DraftPick, FreeAgencyMove, CfbTeam, WaiverClaim } from '../../types';
import { normalizeScoring } from '../../types';
import { P4_CONFERENCES, isP4Conference, confCategory } from '../../services/scoring';
import { rosterAtWeek, currentRosters } from '../../services/roster';
import { Tooltip } from '../ui/Tooltip';
import { TeamLogo } from '../ui/TeamLogo';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  freeAgencyMoves: FreeAgencyMove[];
  waiverClaims: WaiverClaim[];
  teams: CfbTeam[];
  userId: string;
  onMakeMove: (
    droppedTeamId: string, droppedTeamName: string,
    addedTeamId: string, addedTeamName: string, addedTeamLogo: string, addedTeamConference: string,
  ) => Promise<{ error?: string }>;
  onSubmitClaim: (
    droppedTeamId: string, droppedTeamName: string,
    addedTeamId: string, addedTeamName: string, addedTeamLogo: string, addedTeamConference: string,
  ) => Promise<{ error?: string }>;
}

function formatMoveTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

export function FreeAgencyPage({
  league, members, draftPicks, freeAgencyMoves, waiverClaims, teams, userId, onMakeMove, onSubmitClaim,
}: Props) {
  const scoring = normalizeScoring(league.scoring);
  const waiverMode = scoring.waiver_enabled;

  const [search, setSearch]         = useState('');
  const [confFilter, setConfFilter] = useState('ALL');
  const [dropId, setDropId]         = useState<string | null>(null);
  const [addId, setAddId]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  const myRoster = useMemo(
    () => rosterAtWeek(userId, league.current_week, draftPicks, freeAgencyMoves),
    [userId, league.current_week, draftPicks, freeAgencyMoves]
  );

  const allRosters = useMemo(
    () => currentRosters(members, draftPicks, freeAgencyMoves, league.current_week),
    [members, draftPicks, freeAgencyMoves, league.current_week]
  );

  const rosteredTeamIds = useMemo(() => {
    const set = new Set<string>();
    allRosters.forEach(r => r.forEach(t => set.add(t.team_id)));
    return set;
  }, [allRosters]);

  const myMoves = useMemo(
    () => freeAgencyMoves.filter(m => m.user_id === userId),
    [freeAgencyMoves, userId]
  );
  const myPendingClaims = useMemo(
    () => waiverClaims.filter(c => c.user_id === userId && c.status === 'pending'),
    [waiverClaims, userId]
  );
  const myClaimsHistory = useMemo(
    () => waiverClaims
      .filter(c => c.user_id === userId && c.status !== 'pending')
      .sort((a, b) => (b.processed_at ?? '').localeCompare(a.processed_at ?? ''))
      .slice(0, 10),
    [waiverClaims, userId]
  );
  const myMovesThisWeek = myMoves.filter(m => m.week === league.current_week);
  const myPendingClaimsThisWeek = myPendingClaims.filter(c => c.week === league.current_week);
  // A pending claim counts against the cap immediately, before it resolves.
  const seasonRemaining = scoring.fa_max_moves_per_season - myMoves.length - myPendingClaims.length;
  const weekRemaining   = scoring.fa_max_moves_per_week - myMovesThisWeek.length - myPendingClaimsThisWeek.length;

  const available = useMemo(() => {
    return teams.filter(t => {
      if (rosteredTeamIds.has(t.id)) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (confFilter === 'P4' && !(P4_CONFERENCES as readonly string[]).includes(t.conference)) return false;
      if (confFilter === 'G5' && (P4_CONFERENCES as readonly string[]).includes(t.conference)) return false;
      if (confFilter !== 'ALL' && confFilter !== 'P4' && confFilter !== 'G5' && t.conference !== confFilter) return false;
      return true;
    });
  }, [teams, rosteredTeamIds, search, confFilter]);

  const conferences = useMemo(() => {
    const set = new Set(teams.map(t => t.conference));
    return ['ALL', 'P4', 'G5', ...Array.from(set).sort()];
  }, [teams]);

  const dropTeam = myRoster.find(t => t.team_id === dropId) ?? null;

  // Competing pending claims on a given team, from OTHER users — shown as a
  // transparency signal while waivers are on (everyone can see who else is
  // in the running; resolution priority isn't revealed here).
  const competingClaims = useMemo(() => {
    const map = new Map<string, number>();
    waiverClaims.forEach(c => {
      if (c.status !== 'pending' || c.user_id === userId) return;
      map.set(c.added_team_id, (map.get(c.added_team_id) ?? 0) + 1);
    });
    return map;
  }, [waiverClaims, userId]);

  const getConfBlock = (team: CfbTeam): string | null => {
    const category = confCategory(team.conference);
    const max = category === 'G5' ? scoring.g5_conf_max : scoring.p4_conf_max;
    const currentCount = category === 'G5'
      ? myRoster.filter(t => !isP4Conference(t.team_conference)).length
      : myRoster.filter(t => t.team_conference === team.conference).length;
    const droppingSameCategory = dropTeam ? confCategory(dropTeam.team_conference) === category : false;
    const newCount = currentCount - (droppingSameCategory ? 1 : 0) + 1;
    if (newCount > max) return `Max ${max} ${category === 'G5' ? 'G5/non-P4' : category} teams`;
    return null;
  };

  // Would dropping the selected team take that conference/category below its
  // configured minimum, without the selected add-team backfilling the same
  // category? Checked once both a drop and an add are chosen.
  const minBlock = useMemo(() => {
    if (!dropTeam) return null;
    const category = confCategory(dropTeam.team_conference);
    const min = category === 'G5' ? scoring.g5_conf_min : scoring.p4_conf_min;
    if (min <= 0) return null;
    const currentCount = category === 'G5'
      ? myRoster.filter(t => !isP4Conference(t.team_conference)).length
      : myRoster.filter(t => t.team_conference === dropTeam.team_conference).length;
    const addTeam = teams.find(t => t.id === addId);
    const addingSameCategory = addTeam ? confCategory(addTeam.conference) === category : false;
    if (!addingSameCategory && currentCount - 1 < min) {
      const label = category === 'G5' ? 'G5/non-P4' : category;
      return `Dropping ${dropTeam.team_name} would leave you below the ${min}-team ${label} minimum — add another ${label} team instead`;
    }
    return null;
  }, [dropTeam, addId, teams, myRoster, scoring.p4_conf_min, scoring.g5_conf_min]);

  const getMemberName = (uid: string) => members.find(m => m.user_id === uid)?.display_name ?? 'Unknown';

  const canSubmit = !!dropId && !!addId && seasonRemaining > 0 && weekRemaining > 0 && !submitting && !minBlock;

  const handleConfirm = async () => {
    const addTeam = teams.find(t => t.id === addId);
    if (!dropTeam || !addTeam || !canSubmit) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    const action = waiverMode ? onSubmitClaim : onMakeMove;
    const result = await action(dropTeam.team_id, dropTeam.team_name, addTeam.id, addTeam.name, addTeam.logo, addTeam.conference);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(waiverMode
        ? `Claim submitted — resolves on the next processing day.`
        : `Dropped ${dropTeam.team_name}, added ${addTeam.name}.`);
      setDropId(null);
      setAddId(null);
      setTimeout(() => setSuccess(''), 4000);
    }
    setSubmitting(false);
  };

  const activityLog = useMemo(
    () => [...freeAgencyMoves].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [freeAgencyMoves]
  );

  if (!scoring.free_agency_enabled) {
    return (
      <div className="card p-12 text-center text-turf-500">
        <ArrowLeftRight className="w-8 h-8 mx-auto mb-3 text-turf-700" />
        <p>Free agency is not enabled for this league.</p>
        <p className="text-xs text-turf-500 mt-1">Ask your commissioner to turn it on in Admin → Scoring.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center flex-shrink-0">
              <ArrowLeftRight className="w-5 h-5 text-turf-950" />
            </div>
            <div>
              <h1 className="font-display text-2xl tracking-wide text-white">Free Agency</h1>
              <p className="text-turf-500 text-sm">Drop a team, pick up an available one</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="card-inner p-3 text-center">
            <p className={`font-mono text-xl font-bold ${weekRemaining > 0 ? 'text-white' : 'text-red-300'}`}>
              {Math.max(0, weekRemaining)}/{scoring.fa_max_moves_per_week}
            </p>
            <p className="text-xs text-turf-500 mt-0.5">Moves left this week</p>
          </div>
          <div className="card-inner p-3 text-center">
            <p className={`font-mono text-xl font-bold ${seasonRemaining > 0 ? 'text-white' : 'text-red-300'}`}>
              {Math.max(0, seasonRemaining)}/{scoring.fa_max_moves_per_season}
            </p>
            <p className="text-xs text-turf-500 mt-0.5">Moves left this season</p>
          </div>
          <div className="card-inner p-3 text-center">
            <p className="font-mono text-xl font-bold text-white">
              {scoring.fa_penalty_enabled ? `−${Math.abs(scoring.fa_penalty_points)}` : 'None'}
            </p>
            <p className="text-xs text-turf-500 mt-0.5">Penalty per swap</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="card p-3 border-red-800/50 bg-red-950/20 flex items-center gap-2 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="card p-3 border-field-800/50 bg-field-950/20 flex items-center gap-2 text-sm text-field-300">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Drop panel */}
        <div className="space-y-2">
          <p className="text-xs text-turf-500 uppercase tracking-wide font-medium">1. Select a team to drop</p>
          <div className="card divide-y divide-turf-800/60 max-h-[500px] overflow-y-auto">
            {myRoster.length === 0 && (
              <p className="py-10 text-center text-turf-500 text-sm">You have no teams to drop</p>
            )}
            {myRoster.map(t => (
              <button
                key={t.team_id}
                onClick={() => setDropId(prev => prev === t.team_id ? null : t.team_id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  dropId === t.team_id ? 'bg-field-900/30' : 'hover:bg-turf-800/30'
                }`}
              >
                <TeamLogo src={t.team_logo} alt={t.team_name} fallbackName={t.team_name} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.team_name}</p>
                  <p className="text-xs text-turf-500">{t.team_conference}</p>
                </div>
                {dropId === t.team_id && <X className="w-4 h-4 text-field-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Add panel */}
        <div className="space-y-2">
          <p className="text-xs text-turf-500 uppercase tracking-wide font-medium">2. Select a team to add</p>
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
                onChange={e => setConfFilter(e.target.value)}
              >
                {conferences.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500 pointer-events-none" />
            </div>
          </div>
          <div className="card divide-y divide-turf-800/60 max-h-[440px] overflow-y-auto">
            {available.length === 0 && (
              <p className="py-10 text-center text-turf-500 text-sm">No available teams match your filter</p>
            )}
            {available.map(team => {
              const block = getConfBlock(team);
              const competing = competingClaims.get(team.id) ?? 0;
              const row = (
                <button
                  key={team.id}
                  onClick={() => !block && setAddId(prev => prev === team.id ? null : team.id)}
                  disabled={!!block}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    block ? 'opacity-40 cursor-not-allowed' :
                    addId === team.id ? 'bg-field-900/30' : 'hover:bg-turf-800/30'
                  }`}
                >
                  <TeamLogo src={team.logo} alt={team.name} fallbackName={team.name} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{team.name}</p>
                    <p className="text-xs text-turf-500">{team.conference}</p>
                  </div>
                  {waiverMode && competing > 0 && (
                    <Tooltip content={`${competing} other pending claim${competing === 1 ? '' : 's'} on this team`} position="left" width="w-48">
                      <span className="badge-gray text-xs flex items-center gap-1 flex-shrink-0">
                        <Users className="w-3 h-3" />{competing}
                      </span>
                    </Tooltip>
                  )}
                  {block && <span className="text-xs text-red-500 flex-shrink-0">Max</span>}
                  {!block && addId === team.id && <CheckCircle2 className="w-4 h-4 text-field-400 flex-shrink-0" />}
                </button>
              );
              return block ? (
                <Tooltip key={team.id} content={block} position="left" width="w-48" fullWidth>{row}</Tooltip>
              ) : row;
            })}
          </div>
        </div>
      </div>

      {/* Confirm bar */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 text-sm min-w-0">
            {dropTeam ? (
              <span className="flex items-center gap-1.5 text-turf-300 truncate">
                <TeamLogo src={dropTeam.team_logo} alt="" fallbackName={dropTeam.team_name} size={20} />
                {dropTeam.team_name}
              </span>
            ) : (
              <span className="text-turf-500">No team selected to drop</span>
            )}
            <ArrowRight className="w-4 h-4 text-turf-600 flex-shrink-0" />
            {addId ? (() => {
              const t = teams.find(x => x.id === addId)!;
              return (
                <span className="flex items-center gap-1.5 text-turf-300 truncate">
                  <TeamLogo src={t.logo} alt="" fallbackName={t.name} size={20} />
                  {t.name}
                </span>
              );
            })() : (
              <span className="text-turf-500">No team selected to add</span>
            )}
          </div>
          <button onClick={handleConfirm} disabled={!canSubmit} className="btn-primary flex-shrink-0">
            {submitting ? 'Submitting…' : waiverMode ? 'Submit Claim' : 'Confirm Swap'}
          </button>
        </div>
        {minBlock && (
          <p className="text-xs text-red-300 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{minBlock}
          </p>
        )}
      </div>

      {/* My waiver claims */}
      {waiverMode && myPendingClaims.length + myClaimsHistory.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <Clock className="w-3.5 h-3.5 text-turf-500" />
            <p className="text-xs text-turf-500 uppercase tracking-wide font-medium">My Waiver Claims</p>
          </div>
          <div className="card divide-y divide-turf-800/60 overflow-hidden">
            {[...myPendingClaims, ...myClaimsHistory].map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-turf-500 flex-1 min-w-0">
                  <TeamLogo src={c.dropped_team_logo} alt="" fallbackName={c.dropped_team_name} size={18} />
                  <span className="truncate max-w-28">{c.dropped_team_name}</span>
                  <ArrowRight className="w-3 h-3 flex-shrink-0" />
                  <TeamLogo src={c.added_team_logo} alt="" fallbackName={c.added_team_name} size={18} />
                  <span className="truncate max-w-28 text-turf-300">{c.added_team_name}</span>
                </div>
                <span className={
                  c.status === 'pending' ? 'badge-gold text-xs' :
                  c.status === 'processed' ? 'badge-green text-xs' : 'badge-red text-xs'
                }>
                  {c.status === 'pending' ? 'Pending' : c.status === 'processed' ? 'Won' : 'Lost priority'}
                </span>
                <span className="text-xs text-turf-500 font-mono flex-shrink-0">{formatMoveTime(c.submitted_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* League activity */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 px-1">
          <History className="w-3.5 h-3.5 text-turf-500" />
          <p className="text-xs text-turf-500 uppercase tracking-wide font-medium">League Activity</p>
        </div>
        {activityLog.length === 0 ? (
          <div className="card p-8 text-center text-turf-500 text-sm">No free agency moves yet</div>
        ) : (
          <div className="card divide-y divide-turf-800/60 overflow-hidden">
            {activityLog.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                <span className="text-xs text-turf-500 w-16 flex-shrink-0">Wk {m.week}</span>
                <span className="text-sm text-turf-300 flex-shrink-0">{getMemberName(m.user_id)}</span>
                <div className="flex items-center gap-1.5 text-xs text-turf-500 flex-1 min-w-0">
                  <TeamLogo src={m.dropped_team_logo} alt="" fallbackName={m.dropped_team_name} size={18} />
                  <span className="truncate max-w-28">{m.dropped_team_name}</span>
                  <ArrowRight className="w-3 h-3 flex-shrink-0" />
                  <TeamLogo src={m.added_team_logo} alt="" fallbackName={m.added_team_name} size={18} />
                  <span className="truncate max-w-28 text-turf-300">{m.added_team_name}</span>
                </div>
                {m.penalty_points !== 0 && (
                  <span className="text-xs font-mono text-red-300 flex-shrink-0">{m.penalty_points} pts</span>
                )}
                <span className="text-xs text-turf-500 font-mono flex-shrink-0">{formatMoveTime(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
