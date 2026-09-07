import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth }     from './hooks/useAuth';
import { useLeague }   from './hooks/useLeague';
import { useCfbData }  from './hooks/useCfbData';
import { Header }      from './components/layout/Header';
import { AuthPage }         from './pages/AuthPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { CreateLeaguePage } from './pages/CreateLeaguePage';
import { JoinPage }         from './pages/JoinPage';
import { PrivacyPage }      from './pages/PrivacyPage';
import { Loader2 }          from 'lucide-react';
import { ErrorBoundary }    from './components/ErrorBoundary';
import {
  HomePageSkeleton, RosterPageSkeleton, AccountPageSkeleton, DraftRoomSkeleton, AdminPanelSkeleton,
  RankingsPageSkeleton, DraftRecapPageSkeleton, LeagueSettingsPageSkeleton, TrophyCasePageSkeleton,
  FreeAgencyPageSkeleton, StatBonusPageSkeleton, ScoreboardPageSkeleton,
} from './components/ui/Skeletons';

// Lazy-loaded: only reachable once a user is authenticated with a league
// selected, so deferring them keeps the pre-auth/onboarding bundle small.
// AuthPage/ResetPasswordPage/CreateLeaguePage/JoinPage stay eager above —
// they're needed for the very first paint of logged-out/no-league states.
const HomePage           = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const RosterPage         = lazy(() => import('./pages/RosterPage').then(m => ({ default: m.RosterPage })));
const AccountPage        = lazy(() => import('./pages/AccountPage').then(m => ({ default: m.AccountPage })));
const DraftRoom          = lazy(() => import('./components/draft/DraftRoom').then(m => ({ default: m.DraftRoom })));
const AdminPanel         = lazy(() => import('./components/admin/AdminPanel').then(m => ({ default: m.AdminPanel })));
const RankingsPage       = lazy(() => import('./components/league/RankingsPage').then(m => ({ default: m.RankingsPage })));
const DraftRecapPage     = lazy(() => import('./components/league/DraftRecapPage').then(m => ({ default: m.DraftRecapPage })));
const LeagueSettingsPage = lazy(() => import('./components/league/LeagueSettingsPage').then(m => ({ default: m.LeagueSettingsPage })));
const TrophyCasePage     = lazy(() => import('./components/league/TrophyCasePage').then(m => ({ default: m.TrophyCasePage })));
const FreeAgencyPage     = lazy(() => import('./components/league/FreeAgencyPage').then(m => ({ default: m.FreeAgencyPage })));
const StatBonusPage      = lazy(() => import('./components/league/StatBonusPage').then(m => ({ default: m.StatBonusPage })));
const ScoreboardPage     = lazy(() => import('./components/league/ScoreboardPage').then(m => ({ default: m.ScoreboardPage })));

// Matched against the current path so the Suspense fallback mirrors the
// destination page's own layout (header/list/grid shapes) instead of a
// single generic spinner shown for every route — only visible for the
// brief window that route's lazy JS chunk is downloading/parsing, since
// this app's data is already loaded by the time a route renders.
function RouteFallback({ pathname }: { pathname: string }) {
  if (pathname === '/roster' || pathname.startsWith('/roster/')) return <RosterPageSkeleton />;
  if (pathname === '/account') return <AccountPageSkeleton />;
  if (pathname === '/draft') return <DraftRoomSkeleton />;
  if (pathname === '/admin') return <AdminPanelSkeleton />;
  if (pathname === '/rankings') return <RankingsPageSkeleton />;
  if (pathname === '/draft-recap') return <DraftRecapPageSkeleton />;
  if (pathname === '/league-settings') return <LeagueSettingsPageSkeleton />;
  if (pathname === '/league-history') return <TrophyCasePageSkeleton />;
  if (pathname === '/free-agency') return <FreeAgencyPageSkeleton />;
  if (pathname === '/stat-bonuses') return <StatBonusPageSkeleton />;
  if (pathname === '/scoreboard') return <ScoreboardPageSkeleton />;
  if (pathname === '/') return <HomePageSkeleton />;
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-turf-500" />
    </div>
  );
}

const ROUTE_TRANSITION_MS = 120;

interface AnimatedRoutesProps {
  lg: NonNullable<ReturnType<typeof useLeague>['league']>;
  league: ReturnType<typeof useLeague>;
  auth: ReturnType<typeof useAuth>;
  cfb: ReturnType<typeof useCfbData>;
}

// Decouples what <Routes> renders from the real browser location so a route
// change can fade the outgoing view out before swapping to the new one,
// instead of cutting across instantly — useLocation() must be called from
// inside <BrowserRouter>, hence this being a separate component rather than
// logic directly in App (which renders <BrowserRouter> itself).
function AnimatedRoutes({ lg, league, auth, cfb }: AnimatedRoutesProps) {
  const location = useLocation();
  const [displayedLocation, setDisplayedLocation] = useState(location);
  const [routeExiting, setRouteExiting] = useState(false);
  const routeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (location.pathname === displayedLocation.pathname) return;
    setRouteExiting(true);
    if (routeTimeout.current) clearTimeout(routeTimeout.current);
    routeTimeout.current = setTimeout(() => {
      setDisplayedLocation(location);
      setRouteExiting(false);
    }, ROUTE_TRANSITION_MS);
  }, [location, displayedLocation]);

  useEffect(() => () => {
    if (routeTimeout.current) clearTimeout(routeTimeout.current);
  }, []);

  // True only until the very first cfb data fetch has fully finished, never
  // again afterward — not equivalent to `cfb.loading && cfb.teams.length
  // === 0`, which was the original version of this check and had a real
  // gap: teams resolves and gets set well before gameData does (they're
  // sequential fetches inside the hook, not parallel), so there's a window
  // where teams.length > 0 but gameData is still {}. Gating on teams.length
  // alone treated that window as "loaded" and let pages render real UI
  // against still-empty game data — the exact bug this was meant to fix,
  // just moved earlier. cfb.hasLoadedOnce is a dedicated flag set once,
  // after the whole first load (including gameData) completes, and never
  // reset — so later 30-minute auto-refreshes/manual Refresh clicks (which
  // do flip cfb.loading again) never re-trigger this skeleton over data
  // that's already on screen. Pages whose content is entirely derived from
  // cfb data (teams/gameData/rankings/etc.) render a real "0 results" state
  // when that data is still empty, indistinguishable from a genuine empty
  // state (e.g. Scoreboard's "No active teams have a game this week", Stat
  // Bonuses' "No season stats available yet") — this swaps in the route's
  // own skeleton for that window instead — including HomePage, whose
  // leaderboard still shows a real "loading live game data" banner via its
  // `cfbLoading` prop for the ongoing (non-initial) refreshes this flag
  // deliberately never re-triggers on.
  const cfbInitialLoading = !cfb.hasLoadedOnce;

  return (
    <div className={routeExiting ? 'animate-content-fade-out' : 'animate-content-fade-in'}>
      <Suspense fallback={<RouteFallback pathname={displayedLocation.pathname} />}>
        <Routes location={displayedLocation}>
          <Route path="/" element={
            cfbInitialLoading ? <HomePageSkeleton /> : (
              <HomePage
                league={lg}
                members={league.members}
                draftPicks={league.draftPicks}
                captainPicks={league.captainPicks}
                manualBonuses={league.manualBonuses}
                spreadPicks={league.spreadPicks}
                freeAgencyMoves={league.freeAgencyMoves}
                scoreCorrections={league.scoreCorrections}
                benchPicks={league.benchPicks}
                gameData={cfb.gameData}
                seasonStats={cfb.seasonStats}
                rankings={cfb.rankings}
                teams={cfb.teams}
                userId={auth.user!.id}
                cfbLoading={cfb.loading}
              />
            )
          } />
          <Route path="/roster"         element={cfbInitialLoading ? <RosterPageSkeleton /> : <RosterPage league={lg} members={league.members} draftPicks={league.draftPicks} captainPicks={league.captainPicks} gameData={cfb.gameData} rankings={cfb.rankings} spreadData={cfb.spreadData} spreadPicks={league.spreadPicks} freeAgencyMoves={league.freeAgencyMoves} scoreCorrections={league.scoreCorrections} benchPicks={league.benchPicks} userId={auth.user!.id} onSetCaptain={league.setCaptain} onSetSpread={league.setSpreadPick} onRemoveSpread={league.removeSpreadPick} onRefreshSpreads={cfb.refreshSpreads} onSwapBench={league.swapBench} onEnsureBenchSeeded={league.ensureBenchSeeded} />} />
          <Route path="/roster/:userId" element={cfbInitialLoading ? <RosterPageSkeleton /> : <RosterPage league={lg} members={league.members} draftPicks={league.draftPicks} captainPicks={league.captainPicks} gameData={cfb.gameData} rankings={cfb.rankings} spreadData={cfb.spreadData} spreadPicks={league.spreadPicks} freeAgencyMoves={league.freeAgencyMoves} scoreCorrections={league.scoreCorrections} benchPicks={league.benchPicks} userId={auth.user!.id} onSetCaptain={league.setCaptain} onSetSpread={league.setSpreadPick} onRemoveSpread={league.removeSpreadPick} onRefreshSpreads={cfb.refreshSpreads} onSwapBench={league.swapBench} onEnsureBenchSeeded={league.ensureBenchSeeded} />} />
          <Route path="/rankings" element={cfbInitialLoading ? <RankingsPageSkeleton /> : <RankingsPage rankings={cfb.rankings} teams={cfb.teams} records={cfb.records} />} />
          <Route path="/account" element={
            <AccountPage
              auth={auth}
              league={lg}
              myMembership={league.myMembership}
              allLeagues={league.allLeagues}
              allMemberships={league.allMemberships}
              teams={cfb.teams}
              onUpdateDisplayName={league.updateDisplayName}
              onUpdateAvatar={league.updateAvatar}
            />
          } />
          <Route path="/draft-recap" element={<DraftRecapPage league={lg} members={league.members} draftPicks={league.draftPicks} teams={cfb.teams} />} />
          <Route path="/league-settings" element={<LeagueSettingsPage league={lg} members={league.members} />} />
          <Route path="/league-history" element={
            cfbInitialLoading ? <TrophyCasePageSkeleton /> : (
              <TrophyCasePage
                league={lg}
                seasonHistory={league.seasonHistory}
                members={league.members}
                draftPicks={league.draftPicks}
                captainPicks={league.captainPicks}
                spreadPicks={league.spreadPicks}
                freeAgencyMoves={league.freeAgencyMoves}
                manualBonuses={league.manualBonuses}
                gameData={cfb.gameData}
                scoreCorrections={league.scoreCorrections}
              />
            )
          } />
          <Route path="/stat-bonuses" element={
            cfbInitialLoading ? <StatBonusPageSkeleton /> : (
              <StatBonusPage
                league={lg}
                members={league.members}
                rosters={league.rosters}
                seasonStats={cfb.seasonStats}
              />
            )
          } />
          <Route path="/scoreboard" element={
            cfbInitialLoading ? <ScoreboardPageSkeleton /> : (
              <ScoreboardPage
                league={lg}
                members={league.members}
                draftPicks={league.draftPicks}
                captainPicks={league.captainPicks}
                gameData={cfb.gameData}
                spreadData={cfb.spreadData}
                spreadPicks={league.spreadPicks}
                freeAgencyMoves={league.freeAgencyMoves}
                scoreCorrections={league.scoreCorrections}
                benchPicks={league.benchPicks}
                rankings={cfb.rankings}
                teams={cfb.teams}
                currentUserId={auth.user!.id}
                onRefreshSpreads={cfb.refreshSpreads}
              />
            )
          } />
          <Route path="/free-agency" element={
            cfbInitialLoading ? <FreeAgencyPageSkeleton /> : (
              <FreeAgencyPage
                league={lg}
                members={league.members}
                draftPicks={league.draftPicks}
                freeAgencyMoves={league.freeAgencyMoves}
                waiverClaims={league.waiverClaims}
                teams={cfb.teams}
                userId={auth.user!.id}
                onMakeMove={league.makeFreeAgencyMove}
                onSubmitClaim={league.submitWaiverClaim}
              />
            )
          } />
          <Route path="/draft"          element={
            cfbInitialLoading ? <DraftRoomSkeleton /> : (
              <DraftRoom
                league={lg}
                members={league.members}
                draftPicks={league.draftPicks}
                teams={cfb.teams}
                gameData={cfb.gameData}
                teamRatings={cfb.teamRatings}
                rankings={cfb.rankings}
                userId={auth.user!.id}
                isCommissioner={league.isCommissioner}
                onStartDraft={league.startDraft}
                onMakePick={league.makeDraftPick}
              />
            )
          } />
          <Route path="/admin"          element={
            <AdminPanel
              league={lg}
              currentUserId={auth.user!.id}
              members={league.members}
              draftPicks={league.draftPicks}
              captainPicks={league.captainPicks}
              manualBonuses={league.manualBonuses}
              spreadPicks={league.spreadPicks}
              freeAgencyMoves={league.freeAgencyMoves}
              scoreCorrections={league.scoreCorrections}
              benchPicks={league.benchPicks}
              invites={league.invites}
              gameData={cfb.gameData}
              seasonStats={cfb.seasonStats}
              teams={cfb.teams}
              isCommissioner={league.isCommissioner}
              onSendInvite={league.sendInvite}
              onUpdateWeek={league.updateWeek}
              onUpdateScoring={league.updateScoring}
              onUpdateDraftSchedule={league.updateDraftSchedule}
              onUpdateMaxTeams={league.updateMaxTeams}
              onAddBonus={league.addManualBonus}
              onRemoveBonus={league.removeManualBonus}
              onAddCorrection={league.addScoreCorrection}
              onRemoveCorrection={league.removeScoreCorrection}
              onRemoveFromRoster={league.removeFromRoster}
              onResetDraft={league.resetDraft}
              onDeleteLeague={league.deleteLeague}
              onEndSeason={league.endSeason}
              onUpdateMemberRole={league.updateMemberRole}
              onRemoveMember={league.removeMember}
              onOverrideSpread={league.overrideSpreadResult}
              onClearSpreadOverride={league.clearSpreadOverride}
            />
          } />
          <Route path="/create-league"  element={
            <CreateLeaguePage
              displayName={auth.displayName ?? 'Commissioner'}
              onCreate={league.createLeague}
              hasExistingLeague
            />
          } />
          <Route path="/join/:token"    element={
            <JoinPage
              user={auth.user}
              onJoined={(leagueId) => {
                league.switchLeague(leagueId);
              }}
            />
          } />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default function App() {
  const auth   = useAuth();
  const league = useLeague(auth.user);
  const cfb    = useCfbData(!!auth.user);

  // Resume an invite flow once the user is authenticated, regardless of
  // whether that happened via the invite's own auth prompt, the general
  // sign-in page, or an email-confirmation link opened in a new tab.
  useEffect(() => {
    if (!auth.user) return;
    const pending = localStorage.getItem('pending_invite');
    if (pending && !window.location.pathname.startsWith('/join/')) {
      localStorage.removeItem('pending_invite');
      window.location.href = `/join/${pending}`;
    }
  }, [auth.user]);

  if (auth.loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-turf-400">
          <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center animate-pulse">
            <span className="font-display text-turf-950 text-2xl">G</span>
          </div>
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </div>
    );
  }

  if (auth.passwordRecovery) {
    return <ResetPasswordPage auth={auth} />;
  }

  if (auth.user && league.loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-turf-400">
          <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center animate-pulse">
            <span className="font-display text-turf-950 text-2xl">G</span>
          </div>
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/join/:token" element={<JoinPage user={null} />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<AuthPage auth={auth} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // User is logged in but has no leagues yet. If they got here via an
  // invite link, the token survives in localStorage (set by JoinPage
  // before it sent them off to sign up/in) even though the actual browser
  // URL is often just "/" by now — client-side navigation away from
  // /join/:token, an OAuth round-trip, or an email-confirmation link
  // opened in a new tab all land back here without that path. Checking
  // for it before falling through to CreateLeaguePage means a new user
  // never sees "create a league" while they're mid-invite, rather than
  // relying solely on the hard-reload recovery below (which still handles
  // the case where the user already belongs to a different league).
  if (!league.league) {
    const pendingInvite = localStorage.getItem('pending_invite');
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/join/:token" element={
            <JoinPage
              user={auth.user}
              onJoined={(leagueId) => {
                league.reload();
              }}
            />
          } />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={
            pendingInvite
              ? <Navigate to={`/join/${pendingInvite}`} replace />
              : <CreateLeaguePage
                  displayName={auth.displayName ?? 'Commissioner'}
                  onCreate={league.createLeague}
                />
          } />
        </Routes>
      </BrowserRouter>
    );
  }

  const lg = league.league;

  // Same reasoning as the no-league branch above, extended to a user who
  // already belongs to a different league: without this render-time check,
  // recovering a pending invite here depended entirely on the useEffect
  // above firing a hard reload at the right moment — a real gap for anyone
  // signing in via an OAuth round-trip (Google), since that always lands
  // back on this already-has-a-league branch with a fresh auth.user, and a
  // race between this effect and useLeagueCore's own load could let the
  // user settle into their existing league's Home page before the redirect
  // ever fires. Checking here instead makes the redirect happen the moment
  // this branch would otherwise render, no timing dependency involved.
  const pendingInviteWithLeague = localStorage.getItem('pending_invite');
  if (pendingInviteWithLeague && !window.location.pathname.startsWith('/join/')) {
    return (
      <BrowserRouter>
        <Navigate to={`/join/${pendingInviteWithLeague}`} replace />
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-dvh flex flex-col">
        <Header
          league={lg}
          allLeagues={league.allLeagues}
          myMembership={league.myMembership}
          displayName={auth.displayName}
          userId={auth.user.id}
          waiverClaims={league.waiverClaims}
          gameData={cfb.gameData}
          onSignOut={auth.signOut}
          onRefresh={cfb.refresh}
          isRefreshing={cfb.loading}
          onSwitchLeague={league.switchLeague}
        />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
          <ErrorBoundary inline>
            <AnimatedRoutes lg={lg} league={league} auth={auth} cfb={cfb} />
          </ErrorBoundary>
        </main>
      </div>
    </BrowserRouter>
  );
}
