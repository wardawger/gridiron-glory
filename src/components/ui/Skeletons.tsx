import type { CSSProperties } from 'react';

// Page-load skeletons — one per lazy route in App.tsx, each shaped to mirror
// that page's actual card/list/grid structure rather than a single generic
// spinner, so the layout doesn't jump once real content mounts. Shown only
// for the brief window a route's JS chunk is downloading/parsing (this
// app's data is already loaded by the time a route renders — see
// AnimatedRoutes' Suspense boundary in App.tsx), composed from a handful of
// shared primitives so every page's skeleton reads as one consistent
// language rather than bespoke shapes per page.

function Bar({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

function Circle({ size }: { size: number }) {
  return <div className="skeleton rounded-full flex-shrink-0" style={{ width: size, height: size }} />;
}

// Icon-box + title + subtitle — the header every page in this app opens
// with (Trophy Case, Free Agency, Stat Bonuses, League Settings, etc.).
function HeaderCardSkeleton({ badge = false }: { badge?: boolean }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="space-y-2">
            <Bar className="h-6 w-48" />
            <Bar className="h-3.5 w-32" />
          </div>
        </div>
        {badge && <Bar className="h-5 w-20 rounded-full" />}
      </div>
    </div>
  );
}

// Rank/logo/name/trailing-value — Leaderboard, AP rankings, draft recap
// timeline all share this exact row shape.
function ListRowSkeleton({ trailing = true }: { trailing?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Bar className="h-4 w-5 flex-shrink-0" />
      <Circle size={32} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Bar className="h-3.5 w-2/5" />
        <Bar className="h-2.5 w-1/4" />
      </div>
      {trailing && <Bar className="h-4 w-8 flex-shrink-0" />}
    </div>
  );
}

function StatTileSkeleton() {
  return (
    <div className="card-inner p-3 text-center space-y-2">
      <Bar className="h-5 w-10 mx-auto" />
      <Bar className="h-2.5 w-14 mx-auto" />
    </div>
  );
}

function ListCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-turf-800/60 overflow-hidden">
      {Array.from({ length: rows }, (_, i) => <ListRowSkeleton key={i} />)}
    </div>
  );
}

const PAGE_PADDING = 'space-y-5 animate-fade-in';

export function HomePageSkeleton() {
  return (
    <div className={PAGE_PADDING}>
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Bar className="h-6 w-40" />
          <Bar className="h-5 w-16 rounded-full" />
        </div>
        <div className="h-48 space-y-2 flex flex-col justify-end">
          {[70, 55, 40, 30, 20].map((w, i) => <Bar key={i} className="h-6" style={{ width: `${w}%` }} />)}
        </div>
      </div>
      <ListCardSkeleton rows={5} />
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-turf-800">
          <Bar className="h-6 w-44" />
        </div>
        <div className="p-5 space-y-3">
          {Array.from({ length: 4 }, (_, i) => <Bar key={i} className="h-4" />)}
        </div>
      </div>
    </div>
  );
}

export function RosterPageSkeleton() {
  return (
    <div className={PAGE_PADDING}>
      <div className="card p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Circle size={40} />
          <div className="space-y-2">
            <Bar className="h-6 w-32" />
            <Bar className="h-3 w-20" />
          </div>
        </div>
        <Bar className="h-8 w-14" />
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton w-10 h-10 rounded-lg" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card p-4 flex items-center gap-3">
            <Circle size={40} />
            <div className="flex-1 space-y-2">
              <Bar className="h-4 w-2/3" />
              <Bar className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountPageSkeleton() {
  return (
    <div className={`${PAGE_PADDING} max-w-2xl mx-auto`}>
      <div className="flex items-center gap-3">
        <div className="skeleton w-10 h-10 rounded-xl" />
        <div className="space-y-2">
          <Bar className="h-6 w-32" />
          <Bar className="h-3 w-48" />
        </div>
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <Bar className="h-4 w-28" />
          <Bar className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export function DraftRoomSkeleton() {
  return (
    <div className={PAGE_PADDING}>
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="skeleton w-2.5 h-2.5 rounded-full" />
          <div className="space-y-2">
            <Bar className="h-4 w-24" />
            <Bar className="h-2.5 w-32" />
          </div>
        </div>
        <Bar className="h-6 w-8" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="card p-3 flex items-center gap-3">
              <Circle size={32} />
              <div className="flex-1 space-y-2">
                <Bar className="h-3.5 w-3/4" />
                <Bar className="h-2.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <Bar className="h-3 w-20 mb-2" />
          {Array.from({ length: 8 }, (_, i) => <Bar key={i} className="h-8 w-full" />)}
        </div>
      </div>
    </div>
  );
}

export function AdminPanelSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="skeleton w-6 h-6 rounded" />
        <Bar className="h-7 w-56" />
      </div>
      <div className="flex gap-1 bg-turf-900 p-1 rounded-xl border border-turf-800">
        {Array.from({ length: 3 }, (_, i) => <Bar key={i} className="h-8 flex-1 rounded-lg" />)}
      </div>
      <ListCardSkeleton rows={5} />
    </div>
  );
}

export function RankingsPageSkeleton() {
  return (
    <div className={PAGE_PADDING}>
      <div className="flex items-center justify-between">
        <Bar className="h-7 w-40" />
        <Bar className="h-5 w-24 rounded-full" />
      </div>
      <ListCardSkeleton rows={10} />
    </div>
  );
}

export function DraftRecapPageSkeleton() {
  return (
    <div className={PAGE_PADDING}>
      <HeaderCardSkeleton badge />
      <div className="card p-5 space-y-4">
        <Bar className="h-4 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }, (_, i) => <StatTileSkeleton key={i} />)}
        </div>
      </div>
      <ListCardSkeleton rows={6} />
    </div>
  );
}

export function LeagueSettingsPageSkeleton() {
  return (
    <div className={`${PAGE_PADDING} max-w-3xl mx-auto`}>
      <HeaderCardSkeleton />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <Bar className="h-4 w-40" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, j) => <StatTileSkeleton key={j} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrophyCasePageSkeleton() {
  return (
    <div className={PAGE_PADDING}>
      <HeaderCardSkeleton />
      <div className="card p-5 space-y-4">
        <Bar className="h-5 w-56" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card-inner p-3 space-y-2">
              <Circle size={28} />
              <Bar className="h-3 w-3/4" />
              <Bar className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FreeAgencyPageSkeleton() {
  return (
    <div className={PAGE_PADDING}>
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="skeleton w-10 h-10 rounded-xl" />
          <Bar className="h-6 w-24" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => <StatTileSkeleton key={i} />)}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ListCardSkeleton rows={4} />
        <ListCardSkeleton rows={4} />
      </div>
    </div>
  );
}

export function StatBonusPageSkeleton() {
  return (
    <div className={PAGE_PADDING}>
      <HeaderCardSkeleton badge />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <Bar className="h-5 w-32" />
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="card-inner flex items-center gap-2.5 px-3 py-2">
                <Bar className="h-3 w-5 flex-shrink-0" />
                <Circle size={24} />
                <Bar className="h-3 flex-1" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
