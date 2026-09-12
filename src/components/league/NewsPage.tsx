import { useEffect, useId, useMemo, useState } from 'react';
import { Newspaper, ExternalLink, Users, Search, ChevronDown } from 'lucide-react';
import type { LeagueMember, RosterEntry } from '../../types';
import { fetchTeamNews, type NewsArticle, type NewsCategory } from '../../services/news';
import { TeamLogo } from '../ui/TeamLogo';

interface Props {
  members: LeagueMember[];
  rosters: Map<string, RosterEntry[]>;
}

// Colors follow this app's existing badge-color semantics (red = severe,
// gold = caution, blue = neutral-informative, gray = default catch-all) —
// not a new palette invented for this page.
const CATEGORY_BADGE: Record<NewsCategory, string> = {
  'Suspension':    'badge-gold',
  'Coach Firing':  'badge-red',
  'Player News':   'badge-blue',
  'General':       'badge-gray',
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function NewsPage({ members, rosters }: Props) {
  const uid = useId();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [managerFilter, setManagerFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Every team currently rostered by anyone in the league, keyed by name
  // (what the news search matches on) — one roster entry kept per team
  // purely for its logo, plus which manager currently owns it so the
  // manager filter below has something to check against.
  const { draftedTeams, ownerByTeamName } = useMemo(() => {
    const teams = new Map<string, RosterEntry>();
    const owner = new Map<string, string>();
    rosters.forEach((roster, userId) => roster.forEach(entry => {
      if (!teams.has(entry.team_name)) teams.set(entry.team_name, entry);
      owner.set(entry.team_name, userId);
    }));
    return { draftedTeams: teams, ownerByTeamName: owner };
  }, [rosters]);

  // Joined into a stable string key so the fetch effect only re-runs when
  // the actual set of drafted teams changes, not on every render a new Map
  // reference would otherwise trigger.
  const teamNamesKey = useMemo(() => Array.from(draftedTeams.keys()).sort().join('|'), [draftedTeams]);

  useEffect(() => {
    if (!teamNamesKey) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchTeamNews(teamNamesKey.split('|')).then(result => {
      if (!cancelled) { setArticles(result); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [teamNamesKey]);

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return articles.filter(a =>
      (managerFilter === 'all' || ownerByTeamName.get(a.team_name) === managerFilter) &&
      (q === '' || a.team_name.toLowerCase().includes(q))
    );
  }, [articles, managerFilter, search, ownerByTeamName]);

  const hasActiveFilters = managerFilter !== 'all' || search.trim() !== '';

  return (
    <div className="space-y-5 animate-fade-in motion-reduce:animate-none">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center flex-shrink-0">
            <Newspaper className="w-5 h-5 text-turf-950" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-wide text-white text-balance">Team News</h1>
            <p className="text-turf-500 text-sm">Suspensions and coaching changes for teams drafted in this league</p>
          </div>
        </div>
        <p className="text-xs text-turf-600 mt-3 pt-3 border-t border-turf-800">
          Sourced from Google News search results, not an official college football feed — coverage and accuracy aren't guaranteed.
        </p>
      </div>

      {draftedTeams.size > 0 && (
        <div className="card p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-turf-500 flex-shrink-0" aria-hidden="true" />
            <label htmlFor={`${uid}-mgr-filter`} className="text-xs text-turf-400 flex-shrink-0">Manager</label>
            <div className="relative flex-1 sm:flex-initial sm:w-44">
              <select
                id={`${uid}-mgr-filter`}
                name="manager_filter"
                className="input appearance-none pr-9 text-sm [&>option]:bg-turf-800 [&>option]:text-white"
                value={managerFilter}
                onChange={e => setManagerFilter(e.target.value)}
              >
                <option value="all">All managers</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 text-turf-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            </div>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500" aria-hidden="true" />
            <input
              id={`${uid}-team-search`}
              name="team_search"
              type="text"
              autoComplete="off"
              className="input pl-9 text-sm"
              placeholder="Search by team…"
              aria-label="Search by team"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {draftedTeams.size === 0 ? (
        <div className="card p-12 text-center text-turf-500">
          <Newspaper className="w-8 h-8 mx-auto mb-3 text-turf-700" aria-hidden="true" />
          <p>No teams drafted yet.</p>
        </div>
      ) : loading ? (
        <div className="card divide-y divide-turf-800" aria-busy="true" aria-label="Loading team news">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="p-4 flex items-center gap-3">
              <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="card p-12 text-center text-turf-500">
          <Newspaper className="w-8 h-8 mx-auto mb-3 text-turf-700" aria-hidden="true" />
          <p>No relevant news right now.</p>
          <p className="text-xs text-turf-500 mt-1">
            Nothing turned up for suspensions or coaching changes on your league's drafted teams.
          </p>
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="card p-12 text-center text-turf-500">
          <Newspaper className="w-8 h-8 mx-auto mb-3 text-turf-700" aria-hidden="true" />
          <p>No news matches these filters.</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setManagerFilter('all'); setSearch(''); }}
              className="text-xs text-field-400 hover:text-field-300 transition-colors mt-1"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="card divide-y divide-turf-800">
          {filteredArticles.map(a => {
            const team = draftedTeams.get(a.team_name);
            return (
              <a
                key={a.link}
                href={a.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-4 hover:bg-turf-800/40 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-field-400"
              >
                <TeamLogo src={team?.team_logo} alt="" fallbackName={a.team_name} size={32} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className={`${CATEGORY_BADGE[a.category]} mb-1`}>{a.category}</span>
                  <p className="text-sm text-white group-hover:text-field-300 transition-colors">{a.title}</p>
                  <p className="text-xs text-turf-500 mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="text-turf-400">{a.team_name}</span>
                    <span aria-hidden="true">·</span>
                    {a.source && <span>{a.source}</span>}
                    {a.source && <span aria-hidden="true">·</span>}
                    <span>{timeAgo(a.published_at)}</span>
                  </p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-turf-600 flex-shrink-0 mt-1" aria-hidden="true" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
