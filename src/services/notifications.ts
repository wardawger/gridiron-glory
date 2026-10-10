// Pure "what alerts are due right now" logic for the send-notifications
// scheduled function. Kept free of I/O so it can be unit-tested; the function
// handles fetching, de-duplication against notification_log, and delivery.

import type {
  BenchPick, CaptainPick, DraftPick, FreeAgencyMove, GameData, League,
  LeagueMember, SpreadPick,
} from '../types';
import { normalizeScoring } from '../types';
import { currentRosters } from './roster';

export type NotificationKind = 'scores' | 'captain' | 'bets' | 'lineup';

export interface DueNotification {
  user_id: string;
  league_id: string;
  kind: NotificationKind;
  week: number;
  // Unique per user; the function skips anything already in notification_log.
  dedupe_key: string;
  title: string;
  body: string;
  url: string;
}

export interface LeagueSnapshot {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  moves: FreeAgencyMove[];
  captainPicks: CaptainPick[];
  benchPicks: BenchPick[];
  spreadPicks: SpreadPick[];
  gameData: GameData;
}

const HOUR_MS = 60 * 60 * 1000;
const MORNING_HOUR = 9;
const PRE_LOCK_WINDOW_MS = HOUR_MS;
// Final-score alerts only for games that started recently, so the first run
// after deploy (or after an outage) doesn't flood people with old results.
const FINAL_RECENCY_MS = 36 * HOUR_MS;

function localDateAndHour(tz: string, date: Date): { ymd: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, hour };
}

type Reminder = Exclude<NotificationKind, 'scores'>;

const REMINDER_COPY: Record<Reminder, { title: string; body: (league: string, left: number) => string; url: string }> = {
  captain: {
    title: 'Set your captain',
    body: (league, left) => `${league}: ${left === 1 ? 'your captain pick is' : 'captain picks are'} still open this week.`,
    url: '/roster',
  },
  bets: {
    title: 'Place your bets',
    body: (league, left) => `${league}: you have ${left} spread pick${left === 1 ? '' : 's'} left to place this week.`,
    url: '/roster',
  },
  lineup: {
    title: 'Set your lineup',
    body: (league, left) => `${league}: bench ${left} more team${left === 1 ? '' : 's'} to finish your lineup.`,
    url: '/roster',
  },
};

export function computeDueNotifications(snap: LeagueSnapshot, now: Date): DueNotification[] {
  const { league, members, draftPicks, moves, captainPicks, benchPicks, spreadPicks, gameData } = snap;
  const scoring = normalizeScoring(league.scoring);
  const week = league.current_week;
  const tz = scoring.waiver_timezone || 'America/New_York';
  const { ymd: todayYmd, hour: localHour } = localDateAndHour(tz, now);
  const rosters = currentRosters(members, draftPicks, moves, week);
  const out: DueNotification[] = [];

  for (const member of members) {
    const uid = member.user_id;
    const roster = rosters.get(uid) ?? [];

    // ── Final scores ──────────────────────────────────────────────────────
    for (const t of roster) {
      const g = gameData[t.team_id]?.[week];
      if (!g || !g.completed || g.home_score == null || g.away_score == null) continue;
      if (g.start_date) {
        const age = now.getTime() - new Date(g.start_date).getTime();
        if (age > FINAL_RECENCY_MS) continue;
      }
      const mine = g.is_home ? g.home_score : g.away_score;
      const theirs = g.is_home ? g.away_score : g.home_score;
      const verb = g.result === 'W' ? 'beat' : g.result === 'L' ? 'lost to' : 'played';
      out.push({
        user_id: uid, league_id: league.id, kind: 'scores', week,
        dedupe_key: `scores:${league.id}:${week}:${t.team_id}`,
        title: `Final: ${t.team_name} ${mine}-${theirs}`,
        body: `${t.team_name} ${verb} ${g.opponent}. See how it moved ${league.name}.`,
        url: '/scoreboard',
      });
    }

    // ── Reminders ─────────────────────────────────────────────────────────
    // Picks lock per team at its own kickoff, so only teams that haven't
    // kicked off can still be acted on; the earliest such kickoff drives timing.
    let earliest: Date | null = null;
    for (const t of roster) {
      const g = gameData[t.team_id]?.[week];
      if (!g || !g.start_date || g.completed) continue;
      const kickoff = new Date(g.start_date);
      if (kickoff <= now) continue;
      if (!earliest || kickoff < earliest) earliest = kickoff;
    }
    if (!earliest) continue;

    const msToLock = earliest.getTime() - now.getTime();
    const kickoffYmd = localDateAndHour(tz, earliest).ymd;
    let stage: 'morning' | 'pre' | null = null;
    if (msToLock <= PRE_LOCK_WINDOW_MS) stage = 'pre';
    else if (kickoffYmd === todayYmd && localHour >= MORNING_HOUR) stage = 'morning';
    if (!stage) continue;

    const needs: { kind: Reminder; left: number }[] = [];

    if (scoring.captain_max_per_week > 0) {
      const needed = Math.max(scoring.captain_min_per_week, 1);
      const have = captainPicks.filter(p => p.user_id === uid && p.week === week).length;
      if (have < needed) needs.push({ kind: 'captain', left: needed - have });
    }
    if (scoring.spread_enabled && scoring.spread_max_per_week > 0) {
      const have = spreadPicks.filter(p => p.user_id === uid && p.week === week).length;
      if (have < scoring.spread_max_per_week) needs.push({ kind: 'bets', left: scoring.spread_max_per_week - have });
    }
    if (scoring.bench_enabled && scoring.bench_count > 0) {
      const have = benchPicks.filter(p => p.user_id === uid && p.week === week).length;
      if (have < scoring.bench_count) needs.push({ kind: 'lineup', left: scoring.bench_count - have });
    }

    for (const { kind, left } of needs) {
      const copy = REMINDER_COPY[kind];
      out.push({
        user_id: uid, league_id: league.id, kind, week,
        dedupe_key: `${kind}:${league.id}:${week}:${kickoffYmd}:${stage}`,
        title: copy.title,
        body: copy.body(league.name, left),
        url: copy.url,
      });
    }
  }

  return out;
}
