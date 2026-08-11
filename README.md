# Gridiron Glory 🏈

College Football Fantasy League — live draft, real-time scoring, portal/free agency, and invite-based leagues.

## Tech Stack

- **React 18 + Vite + TypeScript** — frontend
- **Supabase** — database, auth (email/password + Google OAuth), real-time subscriptions (free tier)
- **College Football Data API** — live game data, rankings, schedules, ratings
- **Resend** — transactional email for league invites
- **Netlify** — hosting + serverless Functions (free tier)
- **Tailwind CSS** — styling
- **PostHog** — product analytics (optional)

---

## Setup

### 1. Supabase (Database + Auth)

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project called `gridiron-glory`
3. Go to **SQL Editor** → **New Query** → paste the contents of `supabase-setup.sql` → **Run** (this is the base schema; a fresh project needs nothing else, but if you're catching up an older database, also run each root-level `supabase-migration-*.sql` file, in the order they were added)
4. Go to **Authentication → Providers** → confirm **Email** is enabled
5. (Optional) Go to **Authentication → Providers** → enable **Google** → paste in the Client ID/Secret from a Google Cloud Console OAuth client (authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`)
6. Go to **Authentication → URL Configuration** → set **Site URL** (and add any additional redirect URLs) to your Netlify URL(s) (after deploy)
7. Go to **Project Settings → API** → copy **Project URL**, **anon public key**, and the **service_role** key
8. Go to **Database → Replication** → enable realtime for: `draft_picks`, `leagues`, `captain_picks`

### 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in the client-side (`VITE_`) vars:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_CFBD_KEY=your-cfbd-api-key
VITE_POSTHOG_KEY=phc_your_project_token   # optional
VITE_POSTHOG_HOST=https://us.i.posthog.com # optional
```

Get a free CFBD API key at [collegefootballdata.com](https://collegefootballdata.com).

`netlify dev` also needs the **server-side** vars below (set these in Netlify's dashboard for production; a local `.env` works for `netlify dev`) — they power the Netlify Functions in `netlify/functions/`, not the Vite build, so they're deliberately not `VITE_`-prefixed:

```
SUPABASE_URL=https://your-project-id.supabase.co        # same project, service-role context
SUPABASE_SERVICE_KEY=eyJ...                              # service_role key, not anon
CFBD_KEY=your-cfbd-api-key                                # used server-side by the CFBD proxy/cache
RESEND_API_KEY=re_...                                     # from resend.com, powers invite emails
```

For invite emails to deliver to arbitrary recipients (not just your own Resend account email), verify a sending domain in the Resend dashboard and update `FROM_ADDRESS` in `netlify/functions/send-invite-email.mjs` — until then, Resend's shared sandbox sender only delivers to the Resend account's own inbox.

### 3. Local Development

```bash
npm install
npm run dev
```

Note: `npm run dev` runs the Vite dev server only — the Netlify Functions (CFBD proxy/cache, waiver processing, invite email) won't be reachable that way. Use `netlify dev` instead when you need to exercise those.

### 4. Deploy to Netlify

1. Push this repo to GitHub
2. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from GitHub**
3. Build command: `npm run build`
4. Publish directory: `dist`
5. **Site configuration → Environment variables** → add all the `VITE_` and server-side vars above (mark `SUPABASE_SERVICE_KEY` and `RESEND_API_KEY` as **secret**)
6. Deploy

---

## How It Works

### League Flow

1. **Sign up** (email/password or **Continue with Google**) → verify email (email/password only) → **create a league** (you become commissioner). One account can belong to and switch between multiple leagues.
2. Commissioner **invites players** via the Admin panel — this sends a branded invite email (via Resend) *and* generates a shareable `/join/:token` link as a fallback. The invite card automatically hides once the draft begins and stays hidden for the season.
3. Invited players sign up (or sign in, if they already have an account) and are added to the league automatically.
4. Commissioner sets **draft order** in the Draft Room → **starts draft**.
5. Players take **live turns picking teams** (real-time, all players see picks instantly).
6. Once the draft completes, season scoring begins. Each week, players can set a **captain**, and — if enabled for the league — make a **spread pick** and/or a **free agency/portal** roster swap (including waiver-style claims when multiple players want the same team).
7. A commissioner can **remove a member** from the league before the draft starts or after it's complete (not mid-draft) — their drafted teams return to the available pool and they're excluded from standings/trophies going forward.
8. At season's end, the commissioner **archives the season** into Trophy Case (final standings + season trophies) and resets the league for a new draft.

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
| Spread pick miss | configurable penalty |

Postseason bonuses (bowls, CFP, Heisman, etc.) and one-off score corrections are awarded manually by the commissioner in the Admin panel. Scoring rules, postseason bonus values, and excluded conferences are all configurable per league in League Settings.

### Captain Rules

- Each player designates one captain per week
- Captain's points are doubled for that week
- Each team can be captain a maximum of **2 times** per season

---

## File Structure

```
netlify/functions/
  cfbd-proxy.mjs           # Server-side CFBD proxy + Supabase-backed cache
  process-waivers.mjs      # Scheduled function that resolves weekly waiver claims
  send-invite-email.mjs    # Sends branded invite emails via Resend
  lib/inviteEmailTemplate.mjs

src/
  lib/
    supabase.ts             # Supabase client singleton
  hooks/
    useAuth.ts               # Login, signup, Google OAuth, session
    useCfbData.ts             # CFBD API fetching
    useLeague.ts              # Composes the hooks below into one league API
    league/
      useLeagueCore.ts         # League/member state, invites, draft, member removal
      useCaptainPicks.ts
      useSpreadPicks.ts
      useFreeAgencyAndWaivers.ts
      useManualBonuses.ts
      useScoreCorrections.ts
  services/
    cfbd.ts                  # CFBD API functions
    scoring.ts                # Pure scoring engine (no side effects)
    trophies.ts                # Season trophy computation
    roster.ts                  # Roster/free-agency pool derivation
  components/
    layout/Header.tsx
    league/Leaderboard.tsx
    league/RosterView.tsx
    league/RankingsPage.tsx
    league/FreeAgencyPage.tsx
    league/DraftRecapPage.tsx
    league/TrophyCasePage.tsx
    league/LeagueSettingsPage.tsx
    league/StatBonusPage.tsx
    draft/DraftRoom.tsx
    admin/AdminPanel.tsx        # Members / Scoring / Adjustments tabs
    admin/MembersTab.tsx
    admin/ScoringTab.tsx
    admin/AdjustmentsTab.tsx
  pages/
    AuthPage.tsx
    CreateLeaguePage.tsx
    HomePage.tsx
    RosterPage.tsx
    JoinPage.tsx
    AccountPage.tsx
    ResetPasswordPage.tsx
  types/index.ts
  App.tsx                    # Routing + wiring (route-level code-split)
```
