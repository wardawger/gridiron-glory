# Gridiron Glory 🏈

College Football Fantasy League — live draft, real-time scoring, invite-based leagues.

## Tech Stack

- **React 18 + Vite + TypeScript** — frontend
- **Supabase** — database, auth, real-time subscriptions (free tier)
- **College Football Data API** — live game data, rankings, schedules
- **Tailwind CSS** — styling
- **Netlify** — hosting (free tier)

---

## Setup

### 1. Supabase (Database + Auth)

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project called `gridiron-glory`
3. Go to **SQL Editor** → **New Query** → paste the contents of `supabase-setup.sql` → **Run**
4. Go to **Authentication → Providers** → confirm **Email** is enabled
5. Go to **Authentication → URL Configuration** → set **Site URL** to your Netlify URL (after deploy)
6. Go to **Project Settings → API** → copy **Project URL** and **anon public key**
7. Go to **Database → Replication** → enable realtime for: `draft_picks`, `leagues`, `captain_picks`

### 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_CFBD_KEY=your-cfbd-api-key
```

Get a free CFBD API key at [collegefootballdata.com](https://collegefootballdata.com)

### 3. Local Development

```bash
npm install
npm run dev
```

### 4. Deploy to Netlify

1. Push this repo to GitHub
2. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from GitHub**
3. Build command: `npm run build`
4. Publish directory: `dist`
5. **Site settings → Environment variables** → add your 3 env vars
6. Deploy

---

## How It Works

### League Flow

1. **Sign up** → verify email → **create a league** (you become commissioner)
2. Commissioner **invites players** via the Admin panel (generates a shareable link)
3. Invited players sign up, click the link, and join the league
4. Commissioner sets **draft order** in the Draft Room → **starts draft**
5. Players take **live turns picking teams** (real-time, all players see picks instantly)
6. Once draft completes, the season scoring begins

### Scoring

| Event | Points |
|-------|--------|
| Win | +1 |
| Beat a ranked team | +1 bonus |
| Beat Top 15 | +2 bonus |
| Beat Top 5 | +3 bonus |
| Loss | −1 |
| Loss to G5 team | −5 bonus |
| Captain (weekly, max 2× per team) | 2× multiplier |

Postseason bonuses (bowls, CFP, Heisman) are awarded manually by the commissioner in the Admin panel.

### Captain Rules

- Each player designates one captain per week
- Captain's points are doubled for that week
- Each team can be captain a maximum of **2 times** per season

---

## File Structure

```
src/
  lib/
    supabase.ts          # Supabase client singleton
  hooks/
    useAuth.ts           # Login, signup, session
    useLeague.ts         # All league data + actions
    useCfbData.ts        # CFBD API fetching
  services/
    cfbd.ts              # CFBD API functions
    scoring.ts           # Pure scoring engine (no side effects)
  components/
    layout/Header.tsx
    league/Leaderboard.tsx
    league/RosterView.tsx
    league/RankingsPage.tsx
    draft/DraftRoom.tsx
    admin/AdminPanel.tsx
  pages/
    AuthPage.tsx
    CreateLeaguePage.tsx
    HomePage.tsx
    RosterPage.tsx
    JoinPage.tsx
  types/index.ts
  App.tsx                # Routing only (~80 lines)
```
