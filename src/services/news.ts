import { supabase } from '../lib/supabase';

export type NewsCategory = 'Suspension' | 'Coach Firing' | 'Player News' | 'General';

export interface NewsArticle {
  team_name: string;
  title: string;
  link: string;
  source: string | null;
  published_at: string;
  category: NewsCategory;
}

// Proxied through news-proxy.mjs (CollegeFootballData has no news endpoint
// at all) rather than called from the browser — avoids CORS and keeps the
// outbound-request fan-out and caching server-side. See that function for
// why this scopes to suspensions/coaching changes rather than all team news.
export async function fetchTeamNews(teamNames: string[]): Promise<NewsArticle[]> {
  if (teamNames.length === 0) return [];

  const { data: { session } } = await supabase.auth.getSession();
  try {
    const res = await fetch('/.netlify/functions/news-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ teams: teamNames }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.articles) ? data.articles : [];
  } catch {
    return [];
  }
}
