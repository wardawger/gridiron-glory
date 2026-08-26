import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Clock, CheckCircle2, Zap, ChevronDown, AlertCircle, AlertTriangle, X, MapPin, Tv, Loader2, CalendarClock, Star, Users, LayoutGrid } from 'lucide-react';
import type { League, LeagueMember, DraftPick, CfbTeam, GameData, TeamRatings, APRanking } from '../../types';
import { normalizeScoring } from '../../types';
import { getPickOwner, P4_CONFERENCES as P4_CONF_LIST, isP4Conference, confCategory } from '../../services/scoring';
import { Tooltip } from '../ui/Tooltip';
import { TeamLogo } from '../ui/TeamLogo';
import { TriviaCard } from '../ui/TriviaCard';
import { WeatherBadge } from '../ui/WeatherBadge';
import { fireDraftCompleteConfetti } from '../../lib/confetti';
import ncaaLogo from '../../assets/ncaa-logo.webp';

const WEEKS = Array.from({ length: 16 }, (_, i) => i); // weeks 0–15

// Same ESPN conference-logo CDN already trusted elsewhere in the app (Draft
// Recap's conference breakdown) — CFBD has no conference logo data of its
// own. G5/non-P4 gets the NCAA's own mark, same as everywhere else that
// combined bucket needs a stand-in identity.
const CONFERENCE_LOGO: Record<string, string> = {
  'SEC':     'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/sec.png',
  'Big Ten': 'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/big_ten.png',
  'Big 12':  'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/big_12.png',
  'ACC':     'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/acc.png',
};

function formatGameDate(startDate: string | null | undefined, startTimeTbd: boolean): { date: string; time: string } {
  if (!startDate) return { date: 'TBD', time: 'TBD' };
  const d = new Date(startDate);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = startTimeTbd
    ? 'TBD'
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return { date, time };
}

// Live countdown to a commissioner-set draft time — purely informational,
// it never starts the draft itself. Ticks locally once a second rather
// than re-deriving from a server clock; drift over the span of a pre-draft
// wait is not worth a network round-trip every tick.
function DraftCountdown({ scheduledAt }: { scheduledAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(scheduledAt).getTime();
  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
  const isPast = totalSeconds <= 0;
  const units = [
    { label: 'Days', value: Math.floor(totalSeconds / 86400) },
    { label: 'Hrs',  value: Math.floor((totalSeconds % 86400) / 3600) },
    { label: 'Min',  value: Math.floor((totalSeconds % 3600) / 60) },
    { label: 'Sec',  value: totalSeconds % 60 },
  ];

  const formattedDate = new Date(scheduledAt).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

  return (
    <div className="card p-5 border-field-500/30 bg-field-950/10 space-y-3">
      <p className="flex items-center justify-center gap-1.5 text-turf-400 text-sm">
        <CalendarClock className="w-4 h-4 flex-shrink-0" />
        {isPast ? "It's go time" : `Draft scheduled for ${formattedDate}`}
      </p>
      {isPast ? (
        <p className="text-center text-field-300 text-sm">Waiting for the commissioner to start…</p>
      ) : (
        <div className="flex items-center justify-center gap-3 sm:gap-5">
          {units.map(unit => (
            <div key={unit.label} className="flex flex-col items-center min-w-[3.25rem]">
              <span className="font-mono text-3xl sm:text-4xl font-bold text-field-400 tabular-nums">
                {String(unit.value).padStart(2, '0')}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-turf-500">{unit.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  const [searchParams] = useSearchParams();
  const [search, setSearch]     = useState('');
  // Seeded once from a `?conference=` link (e.g. the Draft Recap conference
  // breakdown tiles) — a one-time preset, not kept in sync with the URL
  // afterward, so changing the dropdown doesn't fight the address bar.
  const [confFilter, setConf]   = useState(() => searchParams.get('conference') ?? 'ALL');
  const [sortBy, setSortBy]     = useState<'name' | 'fpi' | 'ap' | 'offense' | 'defense' | 'sos'>('name');
  const [picking, setPicking]   = useState(false);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [pickError, setPickError] = useState('');
  const [scheduleModalTeam, setScheduleModalTeam] = useState<CfbTeam | null>(null);
  const [draftOrder, setDraftOrder] = useState<string[]>(
    league.draft_order.length > 0 ? league.draft_order : members.map(m => m.user_id)
  );
  // Mobile-only tabbed layout state (Players/Queue/Rosters/Board) — desktop
  // keeps its existing two-column layout untouched at lg: and up.
  const [mobileTab, setMobileTab] = useState<'players' | 'queue' | 'rosters' | 'board'>('players');
  const [rosterViewUserId, setRosterViewUserId] = useState(userId);
  // Session-only scratchpad, not synced to the database — a personal
  // draft-day aid, not league state anyone else needs to see.
  const [queuedTeamIds, setQueuedTeamIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`gridiron_draft_queue_${league.id}_${userId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
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

  useEffect(() => {
    localStorage.setItem(`gridiron_draft_queue_${league.id}_${userId}`, JSON.stringify(queuedTeamIds));
  }, [queuedTeamIds, league.id, userId]);

  // A queued team that gets drafted (by anyone) can't be drafted again, so
  // it's pruned out rather than left to linger as a dead entry.
  useEffect(() => {
    setQueuedTeamIds(prev => prev.filter(id => !pickedTeamIds.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPicks]);

  const toggleQueue = (teamId: string) => {
    setQueuedTeamIds(prev => prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]);
  };

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

  // Same conference-count shape as myConfCounts/myG5Count above, but for
  // whichever member is selected in the mobile Rosters tab (defaults to
  // the current user) — a compact "count/max" readout, not the full
  // Draft Recap breakdown, per-conference min/max included only via color.
  const rosterViewPicks = useMemo(
    () => draftPicks.filter(p => p.user_id === rosterViewUserId),
    [draftPicks, rosterViewUserId]
  );
  const rosterViewConfCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rosterViewPicks.forEach(p => {
      counts[p.team_conference] = (counts[p.team_conference] ?? 0) + 1;
    });
    return counts;
  }, [rosterViewPicks]);
  const rosterViewG5Count = useMemo(
    () => rosterViewPicks.filter(p => !isP4Conference(p.team_conference)).length,
    [rosterViewPicks]
  );

  // Categories (P4 conference names, or the 'G5' sentinel for the combined
  // non-P4 bucket) still short of their minimum, and how many more each
  // needs. Deliberately keyed by remaining need summed ACROSS categories,
  // not checked one category at a time — a single conference needing 1
  // more team never looks urgent on its own (1 < picksRemaining easily),
  // but three different conferences each needing 1 more, with only 2
  // picks left, is exactly as blocked as one conference needing 2. This
  // is what let a real drafter take a non-P4 team while three P4
  // conferences were collectively unsatisfiable with their remaining
  // picks — each conference's own need was individually "not yet urgent."
  const categoryNeeds = useMemo(() => {
    const needs: { category: string; needed: number }[] = [];
    (P4_CONF_LIST as readonly string[]).forEach(conf => {
      const current = myConfCounts[conf] ?? 0;
      const needed = Math.max(0, scoring.p4_conf_min - current);
      if (needed > 0) needs.push({ category: conf, needed });
    });
    const g5Needed = Math.max(0, scoring.g5_conf_min - myG5Count);
    if (g5Needed > 0) needs.push({ category: 'G5', needed: g5Needed });
    return needs;
  }, [myConfCounts, myG5Count, scoring.p4_conf_min, scoring.g5_conf_min]);

  // Once the total still-needed across every category equals (or somehow
  // exceeds) the picks left, every remaining pick is precious — none of
  // them can go to a category that already met its minimum, since that
  // would burn a pick without shrinking the deficit. Below that
  // threshold, there's slack and any legal team is fine.
  const mustPickCategories = useMemo(() => {
    const totalNeeded = categoryNeeds.reduce((s, n) => s + n.needed, 0);
    if (totalNeeded === 0 || totalNeeded < myPicksRemaining) return [];
    return categoryNeeds.map(n => n.category);
  }, [categoryNeeds, myPicksRemaining]);

  // Check if a team is blocked by conference rules
  const getConfBlock = (team: CfbTeam): string | null => {
    if (scoring.excluded_conferences.includes(team.conference)) {
      return `${team.conference} is excluded by your commissioner`;
    }
    if (isP4Conference(team.conference)) {
      const count = myConfCounts[team.conference] ?? 0;
      if (count >= scoring.p4_conf_max) {
        return `Max ${scoring.p4_conf_max} from ${team.conference}`;
      }
    } else if (myG5Count >= scoring.g5_conf_max) {
      return `Max ${scoring.g5_conf_max} G5/non-P4 teams`;
    }
    if (mustPickCategories.length > 0 && !mustPickCategories.includes(confCategory(team.conference))) {
      return `You must pick from: ${mustPickCategories.join(', ')}`;
    }
    return null;
  };

  // Warn if minimum won't be met — scoped to the same urgency threshold as
  // mustPickCategories (every remaining pick is now spoken for), not just
  // "this category isn't at its minimum yet," which would fire from round
  // one onward and drown out the one moment this warning actually matters.
  const confWarnings = useMemo(() => {
    if (!isMyTurn || mustPickCategories.length === 0) return [];
    return categoryNeeds
      .filter(n => mustPickCategories.includes(n.category))
      .map(n =>
        n.category === 'G5'
          ? `Must pick ${n.needed} more G5/non-P4 team${n.needed === 1 ? '' : 's'}`
          : `Must pick ${n.needed} more from ${n.category}`
      );
  }, [categoryNeeds, mustPickCategories, isMyTurn]);

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

  // AP Top 25 rank isn't on TeamRatings — it comes from the separate
  // `rankings` prop, keyed by team_id like the schedule modal's lookup above.
  const apRankByTeam = useMemo(() => {
    const map = new Map<string, number>();
    rankings.forEach(r => { if (r.team_id) map.set(r.team_id, r.rank); });
    return map;
  }, [rankings]);

  // Available teams with search/filter/sort
  const available = useMemo(() => {
    const filtered = teams.filter(t => {
      if (pickedTeamIds.has(t.id)) return false;
      if (scoring.excluded_conferences.includes(t.conference)) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (confFilter === 'P4' && !(P4_CONF_LIST as readonly string[]).includes(t.conference)) return false;
      if (confFilter === 'G5' && (P4_CONF_LIST as readonly string[]).includes(t.conference)) return false;
      if (confFilter !== 'ALL' && confFilter !== 'P4' && confFilter !== 'G5' && t.conference !== confFilter) return false;
      return true;
    });

    if (sortBy === 'name') return filtered;

    const rankGetters: Record<Exclude<typeof sortBy, 'name'>, (team: CfbTeam) => number | null | undefined> = {
      fpi:     t => teamRatings.get(t.id)?.fpi_rank,
      ap:      t => apRankByTeam.get(t.id),
      offense: t => teamRatings.get(t.id)?.offense_rank,
      defense: t => teamRatings.get(t.id)?.defense_rank,
      sos:     t => teamRatings.get(t.id)?.sos_rank,
    };
    const getRank = rankGetters[sortBy];
    return [...filtered].sort((a, b) => {
      const aRank = getRank(a);
      const bRank = getRank(b);
      // Teams without a published rank sort to the end, not to the top.
      if (aRank == null && bRank == null) return a.name.localeCompare(b.name);
      if (aRank == null) return 1;
      if (bRank == null) return -1;
      return aRank - bRank;
    });
  }, [teams, pickedTeamIds, search, confFilter, sortBy, teamRatings, apRankByTeam, scoring.excluded_conferences]);

  const conferences = useMemo(() => {
    const set = new Set(teams.map(t => t.conference));
    return ['ALL', 'P4', 'G5', ...Array.from(set).sort()];
  }, [teams]);

  const byeWeeksByTeam = useMemo(() => {
    const map = new Map<string, number[]>();
    teams.forEach(t => {
      const g = gameData[t.id] ?? {};
      // Weeks 14–15 are excluded: week 14 is conference championship week,
      // when only teams playing in a title game have a game at all, and
      // week 15 is dead except for the Army-Navy game — neither is a real
      // "off week" in the bye-week sense for the vast majority of teams.
      map.set(t.id, WEEKS.filter(w => !g[w] && w >= 1 && w <= 13));
    });
    return map;
  }, [teams, gameData]);

  // Teams already on my roster whose bye week(s) overlap the modal team's —
  // not a hard block (a shared bye is legal, just worth knowing before you
  // pick), so this only ever informs the modal, never getConfBlock.
  const scheduleModalByeConflicts = useMemo(() => {
    if (!scheduleModalTeam) return [];
    const targetByes = new Set(byeWeeksByTeam.get(scheduleModalTeam.id) ?? []);
    if (targetByes.size === 0) return [];
    return myPicks
      .map(p => ({
        teamName: p.team_name,
        weeks: (byeWeeksByTeam.get(p.team_id) ?? []).filter(w => targetByes.has(w)),
      }))
      .filter(c => c.weeks.length > 0);
  }, [scheduleModalTeam, byeWeeksByTeam, myPicks]);

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

  // Mobile row (Players/Queue tabs) — a flatter, thumb-friendly layout than
  // the desktop card grid: star to queue, tap the row for the same schedule
  // sheet the desktop card opens, a Draft shortcut that opens the same
  // sheet too (Confirm Pick inside it is still what actually drafts).
  const renderMobileTeamRow = (team: CfbTeam) => {
    const block = isMyTurn ? getConfBlock(team) : null;
    const isBlocked = !!block;
    const byes = byeWeeksByTeam.get(team.id) ?? [];
    const fpiRank = teamRatings.get(team.id)?.fpi_rank ?? null;
    const isQueued = queuedTeamIds.includes(team.id);

    return (
      <div
        key={team.id}
        className={`card flex items-center gap-2 p-2.5 ${lastPick === team.id ? 'animate-pick-flash' : ''}`}
      >
        <button
          type="button"
          onClick={() => toggleQueue(team.id)}
          aria-label={isQueued ? `Remove ${team.name} from queue` : `Add ${team.name} to queue`}
          aria-pressed={isQueued}
          className="flex-shrink-0 p-1.5 -m-1.5"
        >
          <Star className={`w-4 h-4 transition-colors ${isQueued ? 'fill-gold-400 text-gold-400' : 'text-turf-600'}`} />
        </button>

        <button
          type="button"
          onClick={() => setScheduleModalTeam(team)}
          className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
        >
          <TeamLogo src={team.logo} alt={team.name} fallbackName={team.name} size={28} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium truncate ${isBlocked ? 'text-turf-600' : 'text-white'}`}>{team.name}</p>
            <p className="text-xs text-turf-500 truncate">
              {team.conference}{byes.length > 0 ? ` · Bye Wk ${byes.join(', ')}` : ''}
            </p>
            {isBlocked && <p className="text-xs text-red-400 truncate mt-0.5">{block}</p>}
          </div>
          {fpiRank != null && (
            <span className="text-xs font-mono text-field-400 bg-field-900/30 border border-field-800/50 px-1.5 py-0.5 rounded flex-shrink-0">
              FPI #{fpiRank}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setScheduleModalTeam(team)}
          className={`btn-sm flex-shrink-0 ${isBlocked ? 'btn-secondary' : 'btn-primary'}`}
        >
          Draft
        </button>
      </div>
    );
  };

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

        {league.draft_scheduled_at && <DraftCountdown scheduledAt={league.draft_scheduled_at} />}

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
            <TriviaCard className="mt-6" />
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
          byeConflicts={scheduleModalByeConflicts}
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

      {/* Desktop / tablet — unchanged two-column layout, lg: and up. Mobile
          gets its own tabbed layout below instead of this stacking down
          to a single column. */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-4">
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
            <div className="relative">
              <select
                className="input appearance-none pr-8"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                aria-label="Sort available teams"
              >
                <option value="name">Name (A–Z)</option>
                <option value="fpi">FPI Rank</option>
                <option value="ap">AP Rank</option>
                <option value="offense">Offense Rank</option>
                <option value="defense">Defense Rank</option>
                <option value="sos">Strength of Schedule</option>
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
          <div ref={picksRef} className="space-y-1 max-h-[660px] overflow-y-auto">
            {pickSlots.map(slot => renderPickSlot(slot, currentPick, getMemberName))}
          </div>
        </div>
      </div>

      {/* Mobile — tabbed layout: Players / Queue / Rosters / Board, matched
          to a bottom tab bar rather than everything stacked on one long
          scroll. Bottom padding clears the fixed bar below. */}
      <div className="lg:hidden pb-24 space-y-3">
        {mobileTab === 'players' && (
          <>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500" />
                <input
                  className="input pl-9"
                  placeholder="Search teams…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    className="input appearance-none pr-8"
                    value={confFilter}
                    onChange={e => setConf(e.target.value)}
                  >
                    {conferences.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500 pointer-events-none" />
                </div>
                <div className="relative flex-1">
                  <select
                    className="input appearance-none pr-8"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as typeof sortBy)}
                    aria-label="Sort available teams"
                  >
                    <option value="name">Name (A–Z)</option>
                    <option value="fpi">FPI Rank</option>
                    <option value="ap">AP Rank</option>
                    <option value="offense">Offense Rank</option>
                    <option value="defense">Defense Rank</option>
                    <option value="sos">Strength of Schedule</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {available.length === 0 ? (
                <div className="card p-8 text-center text-turf-500 text-sm">
                  No available teams match your filter
                </div>
              ) : (
                available.map(team => renderMobileTeamRow(team))
              )}
            </div>
          </>
        )}

        {mobileTab === 'queue' && (
          <div className="space-y-2">
            {queuedTeamIds.length === 0 ? (
              <div className="card p-8 text-center text-turf-500 text-sm space-y-2">
                <Star className="w-6 h-6 mx-auto text-turf-700" />
                <p>No teams queued yet — tap the star next to a team to add it here.</p>
              </div>
            ) : (
              queuedTeamIds
                .map(id => teams.find(t => t.id === id))
                .filter((t): t is CfbTeam => !!t && !pickedTeamIds.has(t.id))
                .map(team => renderMobileTeamRow(team))
            )}
          </div>
        )}

        {mobileTab === 'rosters' && (
          <div className="space-y-3">
            <div className="relative">
              <select
                className="input appearance-none pr-8"
                value={rosterViewUserId}
                onChange={e => setRosterViewUserId(e.target.value)}
                aria-label="View roster for"
              >
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id === userId ? `${m.display_name} (Me)` : m.display_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500 pointer-events-none" />
            </div>

            {/* Conference summary — count/max per category, colored the same
                way the on-the-clock conference tracker above already is. */}
            <div className={`grid gap-1.5 ${g5Configured ? 'grid-cols-5' : 'grid-cols-4'}`}>
              {(P4_CONF_LIST as readonly string[]).map(conf => {
                const count = rosterViewConfCounts[conf] ?? 0;
                const atMax = count >= scoring.p4_conf_max;
                const atMin = count >= scoring.p4_conf_min;
                return (
                  <div
                    key={conf}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border ${
                      atMax ? 'bg-red-900/30 border-red-800/50 text-red-300' :
                      atMin ? 'bg-field-900/30 border-field-800/50 text-field-400' :
                      'bg-turf-800 border-turf-700 text-turf-300'
                    }`}
                  >
                    <TeamLogo src={CONFERENCE_LOGO[conf]} alt={`${conf} logo`} fallbackName={conf} size={32} />
                    <span className="text-xs font-mono">{count}/{scoring.p4_conf_max}</span>
                  </div>
                );
              })}
              {g5Configured && (() => {
                const atMax = rosterViewG5Count >= scoring.g5_conf_max;
                const atMin = rosterViewG5Count >= scoring.g5_conf_min;
                return (
                  <div
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border ${
                      atMax ? 'bg-red-900/30 border-red-800/50 text-red-300' :
                      atMin ? 'bg-field-900/30 border-field-800/50 text-field-400' :
                      'bg-turf-800 border-turf-700 text-turf-300'
                    }`}
                  >
                    <TeamLogo src={ncaaLogo} alt="G5 logo" fallbackName="G5" size={32} />
                    <span className="text-xs font-mono">{rosterViewG5Count}/{scoring.g5_conf_max}</span>
                  </div>
                );
              })()}
            </div>

            <div className="space-y-1.5">
              {draftPicks.filter(p => p.user_id === rosterViewUserId).length === 0 ? (
                <div className="card p-8 text-center text-turf-500 text-sm">No teams drafted yet</div>
              ) : (
                draftPicks
                  .filter(p => p.user_id === rosterViewUserId)
                  .sort((a, b) => a.pick_number - b.pick_number)
                  .map(p => (
                    <div key={p.id} className="card flex items-center gap-3 p-2.5">
                      <span className="font-mono text-xs text-turf-500 w-6 flex-shrink-0">{p.pick_number}</span>
                      <TeamLogo src={p.team_logo} alt={p.team_name} fallbackName={p.team_name} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">{p.team_name}</p>
                        <p className="text-xs text-turf-500 truncate">{p.team_conference}</p>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {mobileTab === 'board' && (
          <DraftBoard pickSlots={pickSlots} members={members} rounds={league.max_teams_per_user} perRound={league.draft_order.length} currentPick={currentPick} />
        )}
      </div>

      {/* Mobile bottom tab bar */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-turf-900 border-t border-turf-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-4">
          {([
            { id: 'players', label: 'Players', icon: Search, count: 0 },
            { id: 'queue',   label: 'Queue',   icon: Star,   count: queuedTeamIds.length },
            { id: 'rosters', label: 'Rosters', icon: Users,  count: 0 },
            { id: 'board',   label: 'Board',   icon: LayoutGrid, count: 0 },
          ] as const).map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobileTab(id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                mobileTab === id ? 'text-field-400' : 'text-turf-500'
              }`}
            >
              <span className="relative">
                <Icon className="w-5 h-5" />
                {count > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 rounded-full bg-field-500 text-turf-950 text-[9px] font-bold flex items-center justify-center">
                    {count}
                  </span>
                )}
              </span>
              {label}
            </button>
          ))}
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
  byeConflicts: { teamName: string; weeks: number[] }[];
  isMyTurn: boolean;
  picking: boolean;
  pickError: string;
  blockReason: string | null;
  onConfirmPick: () => void;
  onClose: () => void;
}

// How long the sheet's slide-down exit plays before the parent actually
// unmounts it — must match the sheet-down keyframe's duration in
// tailwind.config.js, or the sheet would visually snap away mid-animation.
const SHEET_CLOSE_MS = 200;

function DraftTeamModal({ team, gameData, ratings, apRank, byeConflicts, isMyTurn, picking, pickError, blockReason, onConfirmPick, onClose }: DraftTeamModalProps) {
  const [closing, setClosing] = useState(false);
  const teamGames = gameData[team.id] ?? {};
  const weeks = WEEKS.filter(w => teamGames[w]);
  const byes  = WEEKS.filter(w => !teamGames[w] && w >= 1 && w <= 13);

  const reason = !isMyTurn ? 'Not your turn yet' : blockReason;
  const canPick = isMyTurn && !picking && !blockReason;

  // Desktop's centered modal has no direction to reverse, so it still just
  // disappears instantly (unchanged from before). Mobile's bottom sheet
  // slides down first — closing this way rather than unmounting immediately
  // is what makes the open/close feel like one continuous motion instead of
  // a pop in, snap out.
  const requestClose = () => {
    setClosing(true);
    setTimeout(onClose, SHEET_CLOSE_MS);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={requestClose}
    >
      <div
        className={`relative w-full sm:max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-turf-700 bg-turf-950 shadow-2xl sm:animate-none ${
          closing ? 'animate-sheet-down' : 'animate-sheet-up'
        }`}
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
              onClick={requestClose}
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

        {/* Bye week conflict warning — not a block, just a heads-up */}
        {byeConflicts.length > 0 && (
          <div className="px-6 pt-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">
                <span className="font-medium">Bye week overlap: </span>
                {byeConflicts.map((c, i) => (
                  <span key={c.teamName}>
                    {i > 0 && ', '}
                    {c.teamName} (Wk {c.weeks.join(', ')})
                  </span>
                ))}
                {' '}{byeConflicts.length === 1 ? 'is' : 'are'} also on a bye then — you could be short a starter that week.
              </p>
            </div>
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

            const { date, time } = formatGameDate((game as any).start_date, (game as any).start_time_tbd ?? false);
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
                    <WeatherBadge
                      condition={(game as any).weather_condition ?? null}
                      temp={(game as any).weather_temp ?? null}
                      windSpeed={(game as any).wind_speed ?? null}
                      indoors={(game as any).game_indoors ?? false}
                    />
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

function DraftBoard({ pickSlots, members, rounds, perRound, currentPick }: {
  pickSlots: Array<{ pick: number; userId: string; draftPick: DraftPick | null }>;
  members: LeagueMember[];
  rounds: number;
  perRound: number;
  currentPick?: number;
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
            {round.map(slot => {
              const isNext = slot.pick === currentPick;
              return (
                <div
                  key={slot.pick}
                  className={`p-2.5 flex flex-col gap-1.5 rounded-lg ${
                    isNext ? 'bg-field-900/40 border border-field-700/50' : 'card-inner'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] text-turf-500 flex-shrink-0">#{slot.pick}</span>
                    <span className="text-[10px] text-turf-500 truncate">{getMemberName(slot.userId)}</span>
                  </div>
                  {slot.draftPick ? (
                    <div className="flex items-center gap-2">
                      <TeamLogo src={slot.draftPick.team_logo} alt="" fallbackName={slot.draftPick.team_name} size={24} />
                      <p className="text-xs font-medium text-white truncate">{slot.draftPick.team_name}</p>
                    </div>
                  ) : isNext ? (
                    <span className="text-field-400 text-xs animate-pulse">On the clock…</span>
                  ) : (
                    <span className="text-turf-700 text-xs">No pick yet</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
