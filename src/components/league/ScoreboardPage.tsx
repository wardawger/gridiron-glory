import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, ChevronDown, Star, Search } from 'lucide-react';
import type {
  League, LeagueMember, DraftPick, CaptainPick, GameData, SpreadData, SpreadPick, FreeAgencyMove,
  ScoreCorrection, BenchPick, APRanking, CfbTeam, ScoreBreakdown, LiveGameStatus,
} from '../../types';
import { normalizeScoring } from '../../types';
import { calcWeeklyScore } from '../../services/scoring';
import { rosterAtWeek } from '../../services/roster';
import { useLiveScoreboard } from '../../hooks/useLiveScoreboard';
import { findLiveStatus, teamNameMatches } from '../../services/cfbd';
import { TeamLogo } from '../ui/TeamLogo';
import { Avatar } from '../ui/Avatar';
import { GameScoreModal } from './GameScoreModal';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  gameData: GameData;
  spreadData: Record<number, SpreadData>;
  spreadPicks: SpreadPick[];
  freeAgencyMoves: FreeAgencyMove[];
  scoreCorrections: ScoreCorrection[];
  benchPicks: BenchPick[];
  rankings: APRanking[];
  teams: CfbTeam[];
  currentUserId: string;
  onRefreshSpreads: (week: number) => Promise<void>;
}

// Same "+3.5" / "-7" / "EVEN" formatting as GameScoreModal's own local
// helper — intentionally duplicated (small pure function, no new
// cross-file coupling) rather than shared.
function formatSpread(spread: number | null | undefined): string {
  if (spread == null) return '';
  if (spread === 0) return 'EVEN';
  return spread > 0 ? `+${spread}` : `${spread}`;
}

// A row is one rostered team's week — the same shape calcWeeklyScore has
// always produced. `live`/`isLive`/etc. are resolved once here (rather
// than per-render inside a card) since both the sort order and the
// "This Week's Points" ticker need them before any card renders.
type Row = {
  member: LeagueMember;
  breakdown: ScoreBreakdown;
  spreadPick: SpreadPick | null;
  live: LiveGameStatus | null;
  isLive: boolean;
  showFinal: boolean;
  started: boolean;
  myScore: number | null;
  oppScore: number | null;
  displayResult: 'W' | 'L' | null;
};

// One real-world game — one or two Rows, depending on whether one or both
// sides happen to be rostered by different managers in this league.
type GameCard = {
  key: string;
  rows: Row[];
  startDate: string | null;
  started: boolean;
  isLive: boolean;
};

function formatGameDate(startDate: string | null, startTimeTbd: boolean): { date: string; time: string } {
  if (!startDate) return { date: 'TBD', time: 'TBD' };
  const d = new Date(startDate);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = startTimeTbd
    ? 'TBD'
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return { date, time };
}

// CFBD's /scoreboard reports quarter as a plain integer with no OT
// distinction beyond continuing to increment past 4.
function ordinal(period: number): string {
  if (period >= 5) return 'OT';
  return ['', '1st', '2nd', '3rd', '4th'][period] ?? `${period}th`;
}

// CFBD reports halftime as period 2 with the clock run all the way down
// to 0, rather than a distinct status — a real "2nd · 0:00" line reads as
// if the game just froze, so it's called out by name instead.
function isHalftime(period: number, clock: string): boolean {
  return period === 2 && /^0?0:00$/.test(clock);
}

// Possession indicator — a small football rather than a plain dot, styled
// after a typical scorebug football glyph (flat oval, seam + laces).
// Uses only currentColor (set via the caller's text-* class, kept green
// per request) plus the existing turf-950 token for the laces, so no new
// palette is added.
function FootballIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <ellipse cx="8" cy="8" rx="7" ry="4.2" fill="currentColor" />
      <g className="text-turf-950" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round">
        <line x1="2.4" y1="8" x2="13.6" y2="8" />
        <line x1="6.4" y1="6.9" x2="6.4" y2="9.1" />
        <line x1="8" y1="6.7" x2="8" y2="9.3" />
        <line x1="9.6" y1="6.9" x2="9.6" y2="9.1" />
      </g>
    </svg>
  );
}

// Final-game detail trigger — a plain "i" glyph (no inner circle of its
// own; the button's own round border supplies that) so it reads as a
// quiet, secondary control rather than competing with the score.
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="17" x2="12" y2="10" />
      <line x1="12" y1="6.5" x2="12.01" y2="6.5" />
    </svg>
  );
}

// Resolves everything about a rostered team's week that depends on the
// live feed — extracted from the per-card render so the same numbers back
// both the card grid's sort order and its displayed scores/status.
function resolveRowLiveState(breakdown: ScoreBreakdown, live: LiveGameStatus | null) {
  const game = breakdown.game!;
  const isHome = game.is_home;

  // Only trust `live` as an in-progress signal once it actually carries a
  // period+clock — CFBD's /scoreboard also lists scheduled/final games, and
  // `game.completed` (from the separate /games endpoint) already covers final.
  const isLive = !game.completed && live?.status === 'in_progress' && live.period != null && live.clock != null;

  // `game.completed` (from /games, cached up to 30 min) can lag well behind
  // reality — a game that just ended sits with stale pre-game info for up
  // to 30 minutes otherwise. When the live endpoint has already moved past
  // "in_progress" to "completed" and carries a final score, use that
  // immediately instead of waiting on the next /games refresh. Points
  // scoring itself still waits for the real /games data (unaffected here);
  // this only fixes what's displayed.
  const justFinished = !game.completed && live?.status === 'completed'
    && live.home_points != null && live.away_points != null;

  // While in-progress, the running score comes from the live endpoint too —
  // game.home_score/away_score (from /games) stay null until the game is
  // fully final.
  const liveMyPoints = isHome ? live?.home_points ?? null : live?.away_points ?? null;
  const liveOppPoints = isHome ? live?.away_points ?? null : live?.home_points ?? null;
  const myScore = game.completed
    ? (isHome ? game.home_score : game.away_score)
    : ((justFinished || isLive) ? liveMyPoints : null);
  const oppScore = game.completed
    ? (isHome ? game.away_score : game.home_score)
    : ((justFinished || isLive) ? liveOppPoints : null);
  const liveResult: 'W' | 'L' | null = justFinished && myScore != null && oppScore != null
    ? (myScore > oppScore ? 'W' : 'L')
    : null;
  const showFinal = game.completed || justFinished;
  const displayResult = game.completed ? game.result : liveResult;

  return { isLive, showFinal, started: isLive || showFinal, myScore, oppScore, displayResult };
}

interface CardLine {
  key: string;
  teamName: string;
  logo: string | null | undefined;
  color: string | null | undefined;
  rank: number | null;
  ownerLabel: string | null;
  score: number | null;
  spread: number | null;
  hasBall: boolean;
  isCaptain: boolean;
  row: Row | null;
}

function GameCardView({
  card, teamsById, rankByTeamId, weekSpread, onDetails,
}: {
  card: GameCard;
  teamsById: Map<string, CfbTeam>;
  rankByTeamId: Map<string, number>;
  weekSpread: SpreadData | undefined;
  onDetails: (row: Row) => void;
}) {
  const primary = card.rows[0];
  const game = primary.breakdown.game!;
  const isLive = card.isLive;
  const showFinal = primary.showFinal;
  const showScore = showFinal || isLive;
  const live = primary.live;

  const lines: CardLine[] = card.rows.length === 2
    ? card.rows.map(r => ({
        key: r.breakdown.team_id,
        teamName: r.breakdown.team_name,
        logo: teamsById.get(r.breakdown.team_id)?.logo,
        color: teamsById.get(r.breakdown.team_id)?.color,
        rank: rankByTeamId.get(r.breakdown.team_id) ?? null,
        ownerLabel: `${r.member.display_name}'s team`,
        score: r.myScore,
        spread: weekSpread?.[r.breakdown.team_id] ?? null,
        hasBall: isLive && teamNameMatches(r.live?.possession ?? null, r.breakdown.team_name),
        isCaptain: r.breakdown.is_captain,
        row: r,
      }))
    : [
        {
          key: primary.breakdown.team_id,
          teamName: primary.breakdown.team_name,
          logo: teamsById.get(primary.breakdown.team_id)?.logo,
          color: teamsById.get(primary.breakdown.team_id)?.color,
          rank: rankByTeamId.get(primary.breakdown.team_id) ?? null,
          ownerLabel: `${primary.member.display_name}'s team`,
          score: primary.myScore,
          spread: weekSpread?.[primary.breakdown.team_id] ?? null,
          hasBall: isLive && teamNameMatches(live?.possession ?? null, primary.breakdown.team_name),
          isCaptain: primary.breakdown.is_captain,
          row: primary,
        },
        {
          key: 'opponent',
          teamName: game.opponent,
          logo: game.opponent_logo,
          color: teamsById.get(game.opponent_id)?.color,
          rank: rankByTeamId.get(game.opponent_id) ?? game.opponent_rank,
          ownerLabel: null,
          score: primary.oppScore,
          spread: weekSpread?.[game.opponent_id] ?? null,
          hasBall: isLive && teamNameMatches(live?.possession ?? null, game.opponent),
          isCaptain: false,
          row: null,
        },
      ];

  // Winning side's score reads green, the other gray — only once the
  // result is real; a live or upcoming score stays plain white.
  const scores = lines.map(l => l.score);
  const winnerIdx = showFinal && scores[0] != null && scores[1] != null && scores[0] !== scores[1]
    ? (scores[0]! > scores[1]! ? 0 : 1)
    : -1;

  const gameDateInfo = formatGameDate(game.start_date, game.start_time_tbd);
  const halftime = isLive && live?.period != null && live?.clock != null && isHalftime(live.period, live.clock);
  const statusLabel = isLive
    ? (halftime ? 'Halftime' : `${ordinal(live!.period!)} · ${live!.clock}`)
    : showFinal ? 'Final' : 'Upcoming';
  const bottomText = isLive
    ? (!halftime ? live?.situation ?? null : null)
    : !showFinal
      ? `${gameDateInfo.date}${gameDateInfo.time !== 'TBD' ? ` · ${gameDateInfo.time}` : ''}`
      : null;

  return (
    <div className={`card p-3 space-y-2 ${isLive ? 'border-field-500/50' : ''}`}>
      <div className="flex items-center justify-between text-[11px] font-semibold text-turf-500">
        <span className="truncate">{game.tv ?? '—'}</span>
        {isLive ? (
          <span className="flex items-center gap-1.5 text-field-400 flex-shrink-0" aria-live="polite" aria-atomic="true">
            <span className="w-1.5 h-1.5 rounded-full bg-field-400 animate-pulse flex-shrink-0" aria-hidden="true" />
            {statusLabel}
          </span>
        ) : (
          <span className="flex-shrink-0">{statusLabel}</span>
        )}
      </div>

      <div className="rounded-lg border border-turf-800 divide-y divide-turf-800 overflow-hidden">
        {lines.map((line, i) => (
          <div
            key={line.key}
            className="flex items-center gap-2 pl-[7px] pr-2.5 py-2 border-l-[3px]"
            style={{ borderLeftColor: line.color || 'transparent' }}
          >
            {showFinal && (
              line.row ? (
                <button
                  type="button"
                  onClick={() => onDetails(line.row!)}
                  aria-label={`${line.teamName} scoring details`}
                  className="w-6 h-6 rounded-full border border-turf-700 text-turf-500 hover:border-field-500 hover:text-field-400 flex items-center justify-center flex-shrink-0 transition-colors"
                >
                  <InfoIcon className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
              )
            )}
            <TeamLogo src={line.logo} alt={line.teamName} fallbackName={line.teamName} size={30} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-turf-500 truncate min-h-[12px]">{line.ownerLabel ?? ' '}</p>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-white truncate">
                  {line.rank ? `#${line.rank} ` : ''}{line.teamName}
                </span>
                {line.isCaptain && (
                  <>
                    <Star className="w-3 h-3 text-gold-400 fill-current flex-shrink-0" />
                    <span className="sr-only">Captain</span>
                  </>
                )}
                {line.hasBall && (
                  <>
                    <FootballIcon className="w-3.5 h-3.5 text-field-400 flex-shrink-0" />
                    <span className="sr-only">Has possession</span>
                  </>
                )}
              </div>
            </div>
            {showScore ? (
              <span className={`font-mono text-sm font-bold flex-shrink-0 ${
                winnerIdx === -1 ? 'text-white' : i === winnerIdx ? 'text-field-400' : 'text-turf-500'
              }`}>
                {line.score}
              </span>
            ) : line.spread != null && (
              <span className="font-mono text-sm font-medium text-turf-400 flex-shrink-0">
                {formatSpread(line.spread)}
              </span>
            )}
          </div>
        ))}
      </div>

      {bottomText && <p className="text-center text-[11px] text-turf-500">{bottomText}</p>}
    </div>
  );
}

export function ScoreboardPage({
  league, members, draftPicks, captainPicks, gameData, spreadData, spreadPicks, freeAgencyMoves,
  scoreCorrections, benchPicks, rankings, teams, currentUserId, onRefreshSpreads,
}: Props) {
  const scoring = normalizeScoring(league.scoring);
  const week = league.current_week;
  const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);
  const rankByTeamId = useMemo(
    () => new Map(rankings.filter(r => r.team_id).map(r => [r.team_id!, r.rank])),
    [rankings]
  );
  const [tickerCollapsed, setTickerCollapsed] = useState(false);
  const [modalRow, setModalRow] = useState<Row | null>(null);
  // Live polling only runs while this page is mounted (see useLiveScoreboard) —
  // scoped here rather than in the app-wide 30-minute CFBD refresh cycle.
  const liveScoreboard = useLiveScoreboard(true);

  // Same auto-fetch-once-per-week pattern as RosterView — spreads are
  // fetched on demand rather than baked into the app-wide load cycle. Shown
  // here regardless of the league's spread_enabled toggle (unlike
  // RosterView's spread-picking UI) since this is just an informational
  // line, not the pick-against-the-spread feature itself.
  useEffect(() => {
    if (spreadData[week] !== undefined) return;
    onRefreshSpreads(week);
  }, [week, spreadData, onRefreshSpreads]);
  const weekSpread = spreadData[week];

  // One row per active (non-benched) rostered team that has a game this
  // week — bye-week teams and benched teams are excluded entirely, per the
  // "only active teams" brief. Reuses calcWeeklyScore directly (the same
  // math standings/roster views already use) rather than recomputing
  // anything, so this page can never disagree with the real scores.
  const matchups = useMemo(() => {
    const rows: Row[] = [];
    members.forEach(member => {
      const roster = rosterAtWeek(member.user_id, week, draftPicks, freeAgencyMoves);
      if (roster.length === 0) return;
      const weekly = calcWeeklyScore(
        member.user_id, week, roster, captainPicks, gameData, scoring,
        spreadPicks, freeAgencyMoves, scoreCorrections, benchPicks
      );
      weekly.breakdown.forEach(b => {
        if (b.is_benched || !b.game) return;
        const spreadPick = spreadPicks.find(
          p => p.user_id === member.user_id && p.week === week && p.team_id === b.team_id
        ) ?? null;
        const live = findLiveStatus(liveScoreboard, b.team_name, b.game!.opponent);
        const liveState = resolveRowLiveState(b, live);
        rows.push({ member, breakdown: b, spreadPick, live, ...liveState });
      });
    });
    return rows;
  }, [members, draftPicks, freeAgencyMoves, captainPicks, gameData, scoring, spreadPicks, scoreCorrections, benchPicks, week, liveScoreboard]);

  // One card per real-world game — two rows merge into a single card
  // (with a Details trigger on each rostered side) whenever both teams in
  // a matchup happen to be drafted by different managers in this league,
  // rather than showing the same game twice from each owner's perspective.
  // Sorted by kickoff time descending among games that have started (a
  // game going live always has the most recent kickoff among started
  // games, so it lands on top automatically; one that's been live longer
  // sits lower) — finishing doesn't reshuffle anything, since the sort key
  // is kickoff time, which never changes. Games that haven't kicked off
  // yet have no "started" timestamp to sort by, so they're appended below
  // in their own ascending order.
  const cards = useMemo(() => {
    const byGame = new Map<string, Row[]>();
    matchups.forEach(row => {
      const game = row.breakdown.game!;
      const key = [row.breakdown.team_id, game.opponent_id].sort().join('-');
      const list = byGame.get(key) ?? [];
      list.push(row);
      byGame.set(key, list);
    });

    const list: GameCard[] = Array.from(byGame.entries()).map(([key, rows]) => ({
      key,
      rows,
      startDate: rows[0].breakdown.game!.start_date,
      started: rows[0].started,
      isLive: rows[0].isLive,
    }));

    const timeVal = (d: string | null) => d ? new Date(d).getTime() : 0;
    const started = list.filter(c => c.started).sort((a, b) => timeVal(b.startDate) - timeVal(a.startDate));
    const notStarted = list.filter(c => !c.started).sort((a, b) => timeVal(a.startDate) - timeVal(b.startDate));
    return [...started, ...notStarted];
  }, [matchups]);

  // "This Week's Points" ticker — every manager's current total, ranked,
  // with a live badge for anyone with a game still in progress.
  const standings = useMemo(() => {
    const byUser = new Map<string, { member: LeagueMember; points: number; live: boolean }>();
    matchups.forEach(row => {
      const cur = byUser.get(row.member.user_id) ?? { member: row.member, points: 0, live: false };
      cur.points += row.breakdown.points;
      if (row.isLive) cur.live = true;
      byUser.set(row.member.user_id, cur);
    });
    return Array.from(byUser.values()).sort((a, b) => b.points - a.points);
  }, [matchups]);

  // The real span of kickoff dates covered by this week's games, rather
  // than a hardcoded date range — computed from the same data driving
  // everything else on the page, so it can never drift out of sync.
  const weekDateRange = useMemo(() => {
    const times = matchups
      .map(r => r.breakdown.game?.start_date)
      .filter((d): d is string => !!d)
      .map(d => new Date(d).getTime());
    if (times.length === 0) return null;
    const fmt = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const min = Math.min(...times);
    const max = Math.max(...times);
    return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  }, [matchups]);

  // Filters the card grid only — the ticker keeps showing every manager's
  // total regardless of search, since it's a standings summary, not a
  // per-game list. Matches either team name or the owning manager's
  // display name; the unrostered side of a single-row card has no manager
  // to match against.
  const [search, setSearch] = useState('');
  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(card => {
      const names = card.rows.length === 2
        ? card.rows.flatMap(r => [r.breakdown.team_name, r.member.display_name])
        : [card.rows[0].breakdown.team_name, card.rows[0].member.display_name, card.rows[0].breakdown.game!.opponent];
      return names.some(n => n.toLowerCase().includes(q));
    });
  }, [cards, search]);

  return (
    <div className="space-y-5 animate-fade-in">
      {modalRow && (
        <GameScoreModal
          game={modalRow.breakdown.game!}
          teamName={modalRow.breakdown.team_name}
          teamLogo={teamsById.get(modalRow.breakdown.team_id)?.logo ?? ''}
          week={week}
          isCaptain={modalRow.breakdown.is_captain}
          scoring={scoring}
          spreadPick={modalRow.spreadPick}
          onClose={() => setModalRow(null)}
        />
      )}

      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center flex-shrink-0">
            <LayoutGrid className="w-5 h-5 text-turf-950" />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-wide text-white">Scoreboard</h1>
            <p className="text-turf-500 text-sm">
              Week {week}{weekDateRange ? ` · ${weekDateRange}` : ''}
            </p>
          </div>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="card p-12 text-center text-turf-500">
          <LayoutGrid className="w-8 h-8 mx-auto mb-3 text-turf-700" />
          <p>No active teams have a game this week.</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setTickerCollapsed(v => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-turf-800/40 transition-colors"
              aria-expanded={!tickerCollapsed}
            >
              <span className="text-sm font-medium text-white">This Week's Points</span>
              <ChevronDown className={`w-4 h-4 text-turf-500 flex-shrink-0 ml-auto transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${tickerCollapsed ? '' : 'rotate-180'}`} />
            </button>
            {/* Grid-rows 0fr/1fr collapse trick — animates from a real (not
                hardcoded) content height without touching height directly,
                which layout-shifts on ordinary `height` transitions.
                Always rendered so the transition can play in both
                directions; overflow-hidden clips it at 0fr. */}
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                tickerCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
              }`}
            >
              <div className="overflow-hidden">
                <div className="divide-y divide-turf-800 border-t border-turf-800">
                  {standings.map(({ member, points, live }, i) => {
                    const isMe = member.user_id === currentUserId;
                    const isFiltered = search.trim().toLowerCase() === member.display_name.toLowerCase();
                    return (
                      <button
                        type="button"
                        key={member.user_id}
                        onClick={() => setSearch(isFiltered ? '' : member.display_name)}
                        aria-pressed={isFiltered}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-turf-800/40 ${
                          isFiltered ? 'bg-field-900/30' : isMe ? 'bg-field-950/10' : ''
                        }`}
                      >
                        <span className="font-mono text-xs font-bold text-turf-500 w-4 flex-shrink-0">{i + 1}</span>
                        <Avatar
                          displayName={member.display_name}
                          avatarType={member.avatar_type}
                          avatarValue={member.avatar_value}
                          size={24}
                          bgClassName={isMe ? 'bg-field-500' : undefined}
                          textClassName={isMe ? 'text-turf-950' : undefined}
                        />
                        <span className={`text-sm font-medium truncate flex-1 min-w-0 ${isFiltered || isMe ? 'text-field-400' : 'text-white'}`}>
                          {member.display_name}{isMe ? ' (You)' : ''}
                        </span>
                        {live && (
                          <span className="badge-green text-[9px] uppercase tracking-wide flex-shrink-0">
                            <span className="w-1 h-1 rounded-full bg-field-400 flex-shrink-0" aria-hidden="true" />
                            Live
                          </span>
                        )}
                        <span className={`font-mono font-bold text-sm flex-shrink-0 min-w-[28px] text-right ${
                          points > 0 ? 'text-field-400' : points < 0 ? 'text-red-300' : 'text-turf-500'
                        }`}>
                          {points > 0 ? '+' : ''}{points}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500" />
            <input
              className="input pl-9"
              placeholder="Search team or manager…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {filteredCards.length === 0 ? (
            <div className="card p-8 text-center text-turf-500 text-sm">No teams match your search.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredCards.map(card => (
                <GameCardView key={card.key} card={card} teamsById={teamsById} rankByTeamId={rankByTeamId} weekSpread={weekSpread} onDetails={setModalRow} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
