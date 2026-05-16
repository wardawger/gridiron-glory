import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth }     from './hooks/useAuth';
import { useLeague }   from './hooks/useLeague';
import { useCfbData }  from './hooks/useCfbData';
import { Header }      from './components/layout/Header';
import { AuthPage }         from './pages/AuthPage';
import { CreateLeaguePage } from './pages/CreateLeaguePage';
import { HomePage }         from './pages/HomePage';
import { RosterPage }       from './pages/RosterPage';
import { JoinPage }         from './pages/JoinPage';
import { DraftRoom }        from './components/draft/DraftRoom';
import { AdminPanel }       from './components/admin/AdminPanel';
import { RankingsPage }     from './components/league/RankingsPage';
import { Loader2 }          from 'lucide-react';

export default function App() {
  const auth   = useAuth();
  const league = useLeague(auth.user);
  const cfb    = useCfbData();

  if (auth.loading || (auth.user && league.loading)) {
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
          onSignOut={auth.signOut}
          onRefresh={cfb.refresh}
          isRefreshing={cfb.loading}
          onSwitchLeague={league.switchLeague}
        />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
          <Routes>
            <Route path="/" element={
              <HomePage
                league={lg}
                members={league.members}
                draftPicks={league.draftPicks}
                captainPicks={league.captainPicks}
                manualBonuses={league.manualBonuses}
                spreadPicks={league.spreadPicks}
                gameData={cfb.gameData}
                seasonStats={cfb.seasonStats}
                rankings={cfb.rankings}
                userId={auth.user.id}
                cfbLoading={cfb.loading}
              />
            } />
            <Route path="/roster"         element={<RosterPage league={lg} members={league.members} draftPicks={league.draftPicks} captainPicks={league.captainPicks} gameData={cfb.gameData} spreadData={cfb.spreadData} spreadPicks={league.spreadPicks} userId={auth.user.id} onSetCaptain={league.setCaptain} onSetSpread={league.setSpreadPick} onRemoveSpread={league.removeSpreadPick} onRefreshSpreads={cfb.refreshSpreads} />} />
            <Route path="/roster/:userId" element={<RosterPage league={lg} members={league.members} draftPicks={league.draftPicks} captainPicks={league.captainPicks} gameData={cfb.gameData} spreadData={cfb.spreadData} spreadPicks={league.spreadPicks} userId={auth.user.id} onSetCaptain={league.setCaptain} onSetSpread={league.setSpreadPick} onRemoveSpread={league.removeSpreadPick} onRefreshSpreads={cfb.refreshSpreads} />} />
            <Route path="/rankings" element={<RankingsPage rankings={cfb.rankings} teams={cfb.teams} records={cfb.records} />} />
            <Route path="/draft"          element={
              <DraftRoom
                league={lg}
                members={league.members}
                draftPicks={league.draftPicks}
                teams={cfb.teams}
                userId={auth.user.id}
                isCommissioner={league.isCommissioner}
                onStartDraft={league.startDraft}
                onMakePick={league.makeDraftPick}
              />
            } />
            <Route path="/admin"          element={
              <AdminPanel
                league={lg}
                members={league.members}
                draftPicks={league.draftPicks}
                manualBonuses={league.manualBonuses}
                spreadPicks={league.spreadPicks}
                isCommissioner={league.isCommissioner}
                onSendInvite={league.sendInvite}
                onUpdateWeek={league.updateWeek}
                onUpdateScoring={league.updateScoring}
                onAddBonus={league.addManualBonus}
                onRemoveBonus={league.removeManualBonus}
                onRemoveFromRoster={league.removeFromRoster}
                onResetDraft={league.resetDraft}
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
        </main>
      </div>
    </BrowserRouter>
  );
}
