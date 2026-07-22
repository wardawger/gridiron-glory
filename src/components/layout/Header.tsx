import { Link, useLocation } from 'react-router-dom';
import { Trophy, Users, Shield, BarChart3, LogOut, RefreshCw, Zap, ChevronDown, Plus, History, ArrowLeftRight } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { League, LeagueMember } from '../../types';

interface Props {
  league: League | null;
  allLeagues: League[];
  myMembership: LeagueMember | undefined;
  displayName: string | undefined;
  onSignOut: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSwitchLeague: (id: string) => void;
}

export function Header({
  league, allLeagues, myMembership, displayName,
  onSignOut, onRefresh, isRefreshing, onSwitchLeague,
}: Props) {
  const loc = useLocation();
  const [showLeaguePicker, setShowLeaguePicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowLeaguePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const nav = [
    { to: '/',          label: 'Standings',  icon: Trophy },
    { to: '/roster',    label: 'My Roster',  icon: Users },
    { to: '/rankings',  label: 'AP Top 25',  icon: BarChart3 },
    { to: '/draft-recap', label: 'Draft Recap', icon: History },
    ...(league?.scoring.free_agency_enabled
      ? [{ to: '/free-agency', label: 'Free Agency', icon: ArrowLeftRight }]
      : []),
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

          {/* Logo + League Switcher */}
          <div className="flex items-center gap-2">
            <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
              <div className="w-7 h-7 rounded bg-field-500 flex items-center justify-center">
                <span className="font-display text-turf-950 text-sm leading-none">G</span>
              </div>
            </Link>

            {/* League picker */}
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setShowLeaguePicker(p => !p)}
                className="flex items-center gap-1 group px-2 py-1 rounded-lg hover:bg-turf-800 transition-colors"
              >
                <span className="font-display text-lg tracking-wider text-white group-hover:text-field-400 transition-colors truncate max-w-[160px] sm:max-w-xs">
                  {league?.name ?? 'GRIDIRON GLORY'}
                </span>
                {allLeagues.length > 1 && (
                  <ChevronDown className={`w-4 h-4 text-turf-500 transition-transform flex-shrink-0 ${showLeaguePicker ? 'rotate-180' : ''}`} />
                )}
              </button>

              {showLeaguePicker && (
                <div className="absolute top-full left-0 mt-1 w-64 card shadow-xl shadow-black/40 overflow-hidden animate-slide-up z-50">
                  <div className="p-2 space-y-0.5">
                    <p className="text-xs text-turf-500 px-2 py-1 uppercase tracking-wide font-medium">Your Leagues</p>
                    {allLeagues.map(l => (
                      <button
                        key={l.id}
                        onClick={() => { onSwitchLeague(l.id); setShowLeaguePicker(false); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between gap-2 ${
                          l.id === league?.id
                            ? 'bg-field-900/60 text-field-300'
                            : 'text-turf-300 hover:bg-turf-800 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{l.name}</span>
                        {l.id === league?.id && (
                          <span className="text-xs text-field-500 flex-shrink-0">Active</span>
                        )}
                      </button>
                    ))}
                    <div className="border-t border-turf-700 my-1" />
                    <Link
                      to="/create-league"
                      onClick={() => setShowLeaguePicker(false)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-turf-400 hover:bg-turf-800 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" /> Create new league
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

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
            <Link
              to="/account"
              className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-turf-800 transition-colors group"
              title="My Account"
            >
              <div className="w-6 h-6 rounded-full bg-field-900 flex items-center justify-center text-field-400 font-bold text-xs flex-shrink-0">
                {displayName?.[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="text-sm text-turf-400 group-hover:text-white transition-colors hidden sm:inline">{displayName}</span>
            </Link>
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
