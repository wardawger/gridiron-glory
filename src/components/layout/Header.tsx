import { Link, useLocation } from 'react-router-dom';
import { Trophy, Users, Shield, BarChart3, LogOut, RefreshCw, Zap } from 'lucide-react';
import type { League, LeagueMember } from '../../types';

interface Props {
  league: League | null;
  myMembership: LeagueMember | undefined;
  displayName: string | undefined;
  onSignOut: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Header({ league, myMembership, displayName, onSignOut, onRefresh, isRefreshing }: Props) {
  const loc = useLocation();

  const nav = [
    { to: '/',          label: 'Standings',  icon: Trophy },
    { to: '/roster',    label: 'My Roster',  icon: Users },
    { to: '/rankings',  label: 'AP Top 25',  icon: BarChart3 },
    ...(myMembership?.role === 'commissioner'
      ? [{ to: '/admin', label: 'Admin', icon: Shield }]
      : []),
    ...(league?.draft_status !== 'complete'
      ? [{ to: '/draft', label: 'Draft Room', icon: Zap }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-turf-950/90 backdrop-blur border-b border-turf-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded bg-field-500 flex items-center justify-center">
              <span className="font-display text-turf-950 text-sm leading-none">G</span>
            </div>
            <span className="font-display text-lg tracking-wider text-white group-hover:text-field-400 transition-colors">
              {league?.name ?? 'GRIDIRON GLORY'}
            </span>
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {nav.map(({ to, label, icon: Icon }) => {
              const active = loc.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-field-900/60 text-field-400'
                      : 'text-turf-400 hover:text-white hover:bg-turf-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="btn-ghost btn-sm"
              title="Refresh game data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <div className="h-5 w-px bg-turf-700" />
            <span className="text-sm text-turf-400 hidden sm:inline">{displayName}</span>
            <button onClick={onSignOut} className="btn-ghost btn-sm">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex md:hidden gap-1 pb-2 overflow-x-auto">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = loc.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-field-900/60 text-field-400'
                    : 'text-turf-400 hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
