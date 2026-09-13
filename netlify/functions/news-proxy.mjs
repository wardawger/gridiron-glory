// netlify/functions/news-proxy.mjs
//
// Server-side proxy for team news (player suspensions, coach firings).
// CollegeFootballData — this app's only other data source — has no news
// endpoint at all (only structured stats/games/coaches records), so this
// scopes Google News' public RSS search per drafted team instead. That feed
// is an unofficial, unauthenticated interface (its own response states it's
// meant for "personal, non-commercial" feed-reader use) — there's no SLA on
// its shape or availability, and it could be rate-limited or changed without
// notice. Proxied server-side (not called from the browser) both to avoid
// CORS and so a bad/slow response never blocks the caller past the timeout
// below.
//
// Required Netlify env vars — same as cfbd-proxy.mjs:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY

import { verifyUser } from './lib/verifyUser.mjs';

// Scopes every search to the two things this feature actually cares about —
// without this, "{team} football" alone returns ordinary game-recap and
// recruiting coverage, which is exactly the noise this page exists to cut
// out. Deliberately excludes "resigns" — a coach leaving for another job on
// their own isn't a firing, and this app's scoring/UI language elsewhere is
// careful about roster/coaching changes not misrepresenting a team's state.
const NEWS_KEYWORDS =
  '(suspended OR suspension OR fired OR fires OR dismissed OR dismissal OR "parts ways" OR ousted OR terminated OR "let go")';

// "college football" (not just "football") plus excluding NFL coverage —
// several school names are also NFL cities/franchises that get referred to
// by the bare city name in headlines (a "Miami" query pulled in Dolphins
// news alongside Hurricanes news). Verified live against the real feed:
// this leaves the Hurricanes coverage intact and removes the NFL results.
function buildQuery(teamName) {
  return `"${teamName}" college football -NFL ${NEWS_KEYWORDS}`;
}

// Module-scope cache — reused across invocations on a warm Netlify Function
// instance, cleared on cold start. Deliberately not persisted to Supabase:
// this app's free-tier database has been getting overwhelmed under
// concurrent load (see cfbd-proxy.mjs's CACHE_TTL_H comment), and this
// feature has no need to add its own read/write volume there — an
// in-memory, best-effort cache costs the database nothing.
const CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutes — news doesn't need to be second-fresh
const newsCache = new Map(); // teamName -> { items, fetchedAt }

const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
function decodeEntities(str) {
  return str.replace(/&(#\d+|[a-z]+);/gi, (m, code) => {
    if (ENTITY_MAP[code.toLowerCase()]) return ENTITY_MAP[code.toLowerCase()];
    if (code[0] === '#') return String.fromCharCode(Number(code.slice(1)));
    return m;
  });
}

// Google News RSS items are consistently shaped (confirmed against a live
// response before writing this): <item><title>…</title><link>…</link>
// <pubDate>…</pubDate><source url="…">Name</source></item> — a small
// regex extraction avoids pulling in an XML parser dependency for a feed
// this predictable.
function parseRssItems(xml, teamName) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1];
    if (!title || !link || !pubDate) continue;

    let cleanTitle = decodeEntities(title.trim());
    const sourceName = source ? decodeEntities(source.trim()) : null;
    // Google News titles are formatted "Headline - Source" — the source is
    // already its own field below, so strip the redundant suffix.
    if (sourceName && cleanTitle.endsWith(` - ${sourceName}`)) {
      cleanTitle = cleanTitle.slice(0, -(sourceName.length + 3));
    }

    const publishedAt = new Date(pubDate);
    if (isNaN(publishedAt.getTime())) continue;

    items.push({
      team_name: teamName,
      title: cleanTitle,
      link: link.trim(),
      source: sourceName,
      published_at: publishedAt.toISOString(),
      category: categorizeArticle(cleanTitle),
    });
  }
  return items;
}

// Best-effort classification from the headline text alone — there's no
// structured category data behind any of this (see the file header), so
// this can misfire on a title that names a person without saying "coach" or
// "player" (e.g. "Michigan fires Sherrone Moore" reads as a player firing
// without outside knowledge that Moore was the head coach). Order matters:
// checked most-specific first, since a title can trip more than one word
// list (a coach firing headline often also contains "suspended" in the
// context of a related player situation elsewhere in the same story).
function categorizeArticle(title) {
  const t = title.toLowerCase();
  const mentionsCoach = /\bcoach(es|ing)?\b|\bhead coach\b|\bcoordinator\b|\bhc\b|\boc\b|\bdc\b/.test(t);
  const firingWords = /\bfired\b|\bfires\b|\bfire\b|\bfiring\b|\bdismissed\b|\bdismisses\b|\bdismissal\b|\bparts ways\b|\bousted\b|\bterminated\b|\blet go\b/.test(t);
  const suspensionWords = /\bsuspend(ed|s|ing)?\b|\bsuspension\b/.test(t);

  if (firingWords && mentionsCoach) return 'Coach Firing';
  if (suspensionWords) return 'Suspension';
  if (firingWords) return 'Player News';
  return 'General';
}

// Google News' search is relevance-based, not a strict phrase match — a
// query for "Boise State" can return an article that never mentions Boise
// State in its own headline (e.g. a roundup piece the query matched on body
// text or a "related" association) and get mis-attributed to that team's
// feed. Requiring the team's own name to actually appear in the returned
// headline is a cheap, effective filter for that class of mismatch.
function isRelevantToTeam(title, teamName) {
  return title.toLowerCase().includes(teamName.toLowerCase());
}

// Same class of problem as the NFL/college mixup above, one level down: a
// school's name is shared across its own athletic department, so a query
// for "Houston" (football) can return a real, on-topic-looking result about
// Houston's *baseball* coach instead. Excluding an explicit other-sport
// mention is deliberately narrow — it only blocks a headline that names a
// different sport outright, so it never drops a genuine football headline
// just for not literally saying "football" (most correct ones don't).
// Verified live: this removes exactly the baseball-coach mismatches without
// touching any real football result in the same sample.
const OTHER_SPORTS_RE = /\b(baseball|basketball|softball|volleyball|hockey|soccer|lacrosse|wrestling|golf|tennis|swimming|gymnastics|rowing|track and field)\b/i;
function isAboutOtherSport(title) {
  return OTHER_SPORTS_RE.test(title);
}

// Restricts results to a set of established, editorially-reviewed outlets
// rather than every blog/fansite/aggregator Google indexes — trades recall
// for reliability. Widened from the original 4 (ESPN/CBS Sports/FOX
// Sports/RotoWire) after live testing showed several teams had zero results
// passing every filter at once — the strict set covers a national beat
// unevenly, and a program's actual suspension/firing news that week is often
// carried by one of these instead. Matched case-insensitively since Google
// News' <source> casing isn't perfectly consistent (a live sample returned
// "FOX Sports", not "Fox Sports").
const ALLOWED_SOURCES = new Set([
  'espn', 'cbs sports', 'fox sports', 'rotowire',
  'sports illustrated', 'usa today', 'on3', '247sports',
]);
function isAllowedSource(source) {
  return !!source && ALLOWED_SOURCES.has(source.trim().toLowerCase());
}

async function fetchTeamNews(teamName) {
  const cached = newsCache.get(teamName);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.items;

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(buildQuery(teamName))}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const xml = await res.text();
    const items = parseRssItems(xml, teamName)
      .filter(item => isRelevantToTeam(item.title, teamName) && !isAboutOtherSport(item.title) && isAllowedSource(item.source));
    newsCache.set(teamName, { items, fetchedAt: Date.now() });
    return items;
  } catch (e) {
    console.warn(`[news-proxy] fetch failed for "${teamName}":`, e.message);
    // Serve the last good result rather than a hole in the list if this
    // team's fetch fails but an earlier one succeeded; otherwise empty.
    return cached?.items ?? [];
  }
}

// Bounded concurrency rather than one giant Promise.all — a full league can
// have 40-60 distinct drafted teams, and firing that many simultaneous
// requests at an unofficial, unauthenticated endpoint is a good way to get
// rate-limited or blocked outright.
const CONCURRENCY = 6;
async function fetchAllTeamsNews(teamNames) {
  const results = [];
  for (let i = 0; i < teamNames.length; i += CONCURRENCY) {
    const batch = teamNames.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(batch.map(fetchTeamNews))).flat());
  }
  return results;
}

export default async (req) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Cache-Control': 'no-store',
    'Netlify-CDN-Cache-Control': 'no-store',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  // Gates quota/abuse of the outbound feed, same reasoning as cfbd-proxy —
  // the data itself isn't sensitive, but an open proxy onto an unofficial
  // endpoint is how that endpoint gets blocked for everyone.
  const user = await verifyUser(req, supabaseUrl, serviceKey);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  let teamNames;
  try {
    const body = await req.json();
    teamNames = Array.isArray(body?.teams)
      ? body.teams.filter(t => typeof t === 'string' && t.trim().length > 0)
      : [];
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders });
  }

  if (teamNames.length === 0) {
    return new Response(JSON.stringify({ articles: [] }), { status: 200, headers: corsHeaders });
  }

  // Caps the outbound fan-out regardless of how large the caller's list is.
  const MAX_TEAMS = 60;
  const uniqueTeams = [...new Set(teamNames)].slice(0, MAX_TEAMS);

  try {
    const articles = await fetchAllTeamsNews(uniqueTeams);

    // The same story sometimes surfaces once per team it mentions (a
    // multi-suspension report, a conference-wide coaching-carousel
    // recap) — de-dupe by link and keep the newest-first order this page
    // is meant to read as.
    const seen = new Set();
    const deduped = [];
    for (const a of articles.sort((x, y) => new Date(y.published_at) - new Date(x.published_at))) {
      if (seen.has(a.link)) continue;
      seen.add(a.link);
      deduped.push(a);
    }

    return new Response(JSON.stringify({ articles: deduped.slice(0, 100) }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
};

export const config = {
  path: '/.netlify/functions/news-proxy',
};
