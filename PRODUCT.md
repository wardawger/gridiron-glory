# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Groups of friends who want to run their own private college-football fantasy
league. Two roles within a league: a **commissioner** who creates the league,
configures scoring, manages the draft, and administers the season; and
**members** who join via an invite link, draft teams, and manage their roster
weekly. Any group can sign up and spin up their own independent league — this
isn't built around one specific group.

## Product Purpose

Gridiron Glory lets a group of friends run a season-long fantasy league built
on entire college football **teams** instead of individual players. Members
draft real FBS teams in a live snake draft, then score points weekly based on
those teams' real game outcomes (wins/losses, ranked-opponent bonuses),
captain picks, spread picks, and postseason bonuses. Success means a private
league that runs itself through a full college football season with minimal
commissioner overhead beyond initial setup and periodic in-season adjustments.

## Positioning

Unlike traditional fantasy football (drafting individual players against an
abstracted stat-scoring engine), Gridiron Glory is a team-draft format built
directly on real college football outcomes and public rankings (AP Top 25,
FPI/SP+ ratings, strength of schedule). The draft board and scoring are
inseparable from the actual college football season happening in real time,
rather than a simulation layered on top of it.

## Operating Context

Runs across a full college football season (roughly August through the
National Championship in January). Key workflows:

- Commissioner creates a league and invites members via a shareable link.
- Commissioner sets the draft order and starts a live snake draft; members
  take turns picking real FBS teams, watching picks update in real time.
- Each week, members set a team captain (doubles that team's points) and, if
  the league has those features enabled, make a spread pick and/or a
  free-agency roster swap.
- Commissioner manages scoring settings, awards manual postseason bonuses
  (bowls, CFP, Heisman, etc.), and — once a season concludes — archives final
  standings into League History and resets the league for the next season.
- Live game data, rankings, and team ratings come from the College Football
  Data API and refresh automatically through the season.

## Capabilities and Constraints

- Multi-league: one account can belong to and switch between several
  leagues, and any member can create a new league of their own.
- Supabase (Postgres, Auth, Realtime) backend; Netlify hosting; College
  Football Data API for live game/ranking/ratings data.
- Draft picks and scores sync in real time across everyone in a league.
- Per-league configurable scoring: win/loss points, ranked-opponent bonuses,
  captain multiplier, spread betting, free agency, statistical bonus
  categories.
- A league can have multiple co-commissioners, not just one.
- Undecided: no monetization or pricing model — currently free to use.

## Brand Commitments

Name is "Gridiron Glory." No other binding brand constraints established.

## Evidence on Hand

This is a real, live, deployed application actively used by real private
leagues — not a demo or a marketing product. Never invent testimonials,
customer logos, pricing, or usage-scale claims for it.

## Product Principles

1. The draft and scoring must always track the real, live college football
   season — never abstract away from actual outcomes.
2. A commissioner should be able to run an entire season with minimal
   ongoing maintenance beyond initial league setup.
3. Any group of friends should be able to spin up and self-manage their own
   independent private league.
4. Real-time visibility matters — draft picks and scores should feel live
   for everyone watching, not delayed or manually refreshed.

## Accessibility & Inclusion

No product-specific requirement established yet.
