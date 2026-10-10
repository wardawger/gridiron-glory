import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MoreHorizontal, LogOut, User } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';

export interface TabNavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
  badge?: number;
  live?: boolean;
}

interface Props {
  // The four primary destinations; "More" is always the fifth tab.
  tabs: TabNavItem[];
  moreItems: TabNavItem[];
  displayName?: string;
  onSignOut: () => void;
}

const SHEET_CLOSE_MS = 200;

function isActivePath(pathname: string, to: string): boolean {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

function Dot({ badge, live }: { badge?: number; live?: boolean }) {
  if (badge && badge > 0) {
    return (
      <span className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
        {badge}
      </span>
    );
  }
  if (live) {
    return <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-field-400 animate-pulse" aria-hidden="true" />;
  }
  return null;
}

function MoreSheet({ items, displayName, onSignOut, onClose }: {
  items: TabNavItem[];
  displayName?: string;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const { pathname } = useLocation();
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    setClosing(true);
    setTimeout(onClose, SHEET_CLOSE_MS);
  };
  // Escape plays the same slide-down exit as the backdrop and Close button.
  const panelRef = useDialog(requestClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="More"
        tabIndex={-1}
        className={`relative w-full max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-turf-700 bg-turf-950 shadow-2xl focus:outline-none ${
          closing ? 'animate-sheet-down' : 'animate-sheet-up'
        } motion-reduce:animate-none`}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-turf-700" aria-hidden="true" />
        <ul className="p-2">
          {items.map(({ to, label, icon: Icon, description, badge, live }) => {
            const active = isActivePath(pathname, to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  onClick={requestClose}
                  className={`flex items-center gap-3 px-3 min-h-[52px] rounded-xl transition-colors ${
                    active ? 'bg-field-900/60 text-field-400' : 'text-turf-200 active:bg-turf-800'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{label}</span>
                    {description && <span className="block text-xs text-turf-500 truncate">{description}</span>}
                  </span>
                  {badge && badge > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">{badge}</span>
                  ) : live ? (
                    <span className="w-2 h-2 rounded-full bg-field-400 animate-pulse" aria-hidden="true" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-turf-800 p-2">
          <Link
            to="/account"
            onClick={requestClose}
            className="flex items-center gap-3 px-3 min-h-[52px] rounded-xl text-turf-200 active:bg-turf-800"
          >
            <User className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-sm font-medium truncate">{displayName ? `Account · ${displayName}` : 'Account'}</span>
          </Link>
          <button
            type="button"
            onClick={() => { requestClose(); onSignOut(); }}
            className="w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl text-turf-400 active:bg-turf-800 text-left"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Phone-sized primary navigation: four destinations plus a "More" sheet for
// everything else, in thumb reach at the bottom of the screen. Desktop keeps
// the top nav; this is hidden from md: up. Lives outside <header> on purpose
// — the header's backdrop-blur would otherwise become the containing block
// for this fixed element and pin it to the header instead of the viewport.
export function MobileTabBar({ tabs, moreItems, displayName, onSignOut }: Props) {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  // A route change means a link was just followed — never leave the sheet
  // open over the newly-loaded page.
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const moreActive = moreOpen || moreItems.some(i => isActivePath(pathname, i.to));
  const moreBadge = moreItems.reduce((sum, i) => sum + (i.badge ?? 0), 0);

  const base = 'relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:bg-turf-800';

  return (
    <>
      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-turf-950/95 backdrop-blur border-t border-turf-800 grid grid-cols-5"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {tabs.map(({ to, label, icon: Icon, badge, live }) => {
          const active = isActivePath(pathname, to);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`${base} ${active ? 'text-field-400' : 'text-turf-500 active:text-white'}`}
            >
              <span className="relative">
                <Icon className="w-6 h-6" />
                <Dot badge={badge} live={live} />
              </span>
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`${base} ${moreActive ? 'text-field-400' : 'text-turf-500 active:text-white'}`}
        >
          <span className="relative">
            <MoreHorizontal className="w-6 h-6" />
            <Dot badge={moreBadge} />
          </span>
          More
        </button>
      </nav>

      {moreOpen && (
        <MoreSheet
          items={moreItems}
          displayName={displayName}
          onSignOut={onSignOut}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </>
  );
}
