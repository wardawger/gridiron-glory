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
import { Loader2 }          from 'lucide-react';
import { ErrorBoundary }    from './components/ErrorBoundary';

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

function RouteFallback() {
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

  return (
    <div className={routeExiting ? 'animate-content-fade-out' : 'animate-content-fade-in'}>
      <Suspense fallback={<RouteFallback />}>
        <Routes location={displayedLocation}>
          <Route path="/" element={
            <HomePage
              league={lg}
              members={league.members}
              draftPicks={league.draftPicks}
              captainPicks={league.captainPicks}
              manualBonuses={league.manualBonuses}
              spreadPicks={league.spreadPicks}
              freeAgencyMoves={league.freeAgencyMoves}
              scoreCorrections={league.scoreCorrections}
              gameData={cfb.gameData}
              seasonStats={cfb.seasonStats}
              rankings={cfb.rankings}
              teams={cfb.teams}
              userId={auth.user!.id}
              cfbLoading={cfb.loading}
            />
          } />
          <Route path="/roster"         element={<RosterPage league={lg} members={league.members} draftPicks={league.draftPicks} captainPicks={league.captainPicks} gameData={cfb.gameData} spreadData={cfb.spreadData} spreadPicks={league.spreadPicks} freeAgencyMoves={league.freeAgencyMoves} scoreCorrections={league.scoreCorrections} userId={auth.user!.id} onSetCaptain={league.setCaptain} onSetSpread={league.setSpreadPick} onRemoveSpread={league.removeSpreadPick} onRefreshSpreads={cfb.refreshSpreads} />} />
          <Route path="/roster/:userId" element={<RosterPage league={lg} members={league.members} draftPicks={league.draftPicks} captainPicks={league.captainPicks} gameData={cfb.gameData} spreadData={cfb.spreadData} spreadPicks={league.spreadPicks} freeAgencyMoves={league.freeAgencyMoves} scoreCorrections={league.scoreCorrections} userId={auth.user!.id} onSetCaptain={league.setCaptain} onSetSpread={league.setSpreadPick} onRemoveSpread={league.removeSpreadPick} onRefreshSpreads={cfb.refreshSpreads} />} />
          <Route path="/rankings" element={<RankingsPage rankings={cfb.rankings} teams={cfb.teams} records={cfb.records} />} />
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
          } />
          <Route path="/stat-bonuses" element={
            <StatBonusPage
              league={lg}
              members={league.members}
              rosters={league.rosters}
              seasonStats={cfb.seasonStats}
            />
          } />
          <Route path="/free-agency" element={
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
          } />
          <Route path="/draft"          element={
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
              gameData={cfb.gameData}
              seasonStats={cfb.seasonStats}
              teams={cfb.teams}
              isCommissioner={league.isCommissioner}
              onSendInvite={league.sendInvite}
              onUpdateWeek={league.updateWeek}
              onUpdateScoring={league.updateScoring}
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default function App() {
  const auth   = useAuth();
  const league = useLeague(auth.user);
  const cfb    = useCfbData();

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
          <Route path="*" element={<AuthPage auth={auth} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // User is logged in but has no leagues yet
  if (!league.league) {
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
          <Route path="*" element={
            <CreateLeaguePage
              displayName={auth.displayName ?? 'Commissioner'}
              onCreate={league.createLeague}
            />
          } />
        </Routes>
      </BrowserRouter>
    );
  }

  const lg = league.league;

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
