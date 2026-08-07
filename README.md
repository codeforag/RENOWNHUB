# MALLU CUPID — Creator Platform

React + Vite, Tailwind CSS, Framer Motion, React Router. A creator-monetization
landing page plus a full sign-in / sign-up / OTP / onboarding flow with
URL-based routing, input validation, and animated 3D page transitions.

## Getting started

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build
npm run preview
```

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/signin` | Sign in with email or username |
| `/signup` | Create an account (email + username, with live availability check) |
| `/check-email` | Interstitial page instructing users to check email for magic link |
| `/onboarding/profile` | Full name, gender, date of birth (18+ required) |
| `/onboarding/category` | "What defines you best?" — up to 3 category cards |
| `/onboarding/social` | Optional social profile links, with format validation |
| `/dashboard` | Landing spot after sign-in or completed onboarding |

Each onboarding step redirects back to the appropriate earlier step if
visited directly out of order (e.g. hitting `/onboarding/social` before
`/onboarding/profile` is complete bounces you back).

## Backend

This project is production-ready to integrate with Supabase. Configure the following environment variables in AWS Amplify Console or your local `.env`:

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon/public key

The app uses Supabase for authentication (magic link), user profiles, creator profiles, live events, bookings, memberships, and app state. See `DOCUMENTATIONS.md` for full schema and migration SQL.
## Production backend (Supabase) and deployment

This project can be connected to Supabase for Auth, Database and Storage. Below are recommended steps and the minimal database schema required for persisting per-user app state and reserved usernames.

Environment variables (set in AWS Amplify or local `.env`):

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon/public key

Database schema (run in Supabase SQL editor)

```sql
-- Persist per-user app state
create table if not exists app_user_state (
  user_id uuid primary key,
  state jsonb,
  updated_at timestamptz default now()
);

-- Optional: reserved usernames
create table if not exists reserved_usernames (
  id uuid primary key default gen_random_uuid(),
  username text unique not null
);

-- Optional: small health check table
create table if not exists app_health (
  id integer primary key default 1,
  ok boolean default true
);
```

Deployment

- Frontend: Deploy to AWS Amplify. Set environment variables in Amplify Console: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Connect repository and enable auto-deploy on pushes to `main`.
- Domain: Configure `mallucupid.com` DNS and add the domain in Amplify hosting settings.

Notes

- This repo includes a `src/lib/supabaseClient.js` file that reads `VITE_SUPABASE_*` env vars and exports a client. No secret keys are committed.
- After deploying, create the DB tables above in your Supabase project. The app will persist per-user state to `app_user_state` when users are authenticated.
- For production, consider using Row Level Security (RLS) policies to restrict access to user-specific rows.

If you want, I can create a tiny migration script and example Amplify build settings next.

Note: This repository is configured for production use with Supabase. All demo OTP flows have been removed. Authentication is handled via Supabase magic links.

## State across the flow

`src/context/AuthFlowContext.jsx` holds sign-up/onboarding answers in memory
and mirrors them to `sessionStorage`, so a refresh mid-flow doesn't lose
progress. It resets automatically when the browser tab/session ends.

## Design

Same "backstage / spotlight" identity as the original landing page —
deep plum background, gold spotlight accent, coral secondary, Fraunces +
Manrope + Space Mono. Auth and onboarding screens reuse the spotlight
backdrop and the same button/card language so the whole flow feels like one
product. Page transitions use a subtle 3D slide (`PageTransition.jsx`) via
Framer Motion's `AnimatePresence`.

## Structure

```
src/
  components/       shared UI: Nav, Hero, TiltCard, PassCard, AuthLayout,
                     OtpInput, TextField, PageTransition, and the landing
                     page sections
  context/
    AuthFlowContext.jsx   in-memory + sessionStorage flow state
  lib/
    mockApi.js             Supabase-backed helpers for username checks and health
  pages/
    Home.jsx                the landing page
    SignIn.jsx
    SignUp.jsx
    VerifyOtp.jsx (informational — app uses magic links)
    Dashboard.jsx
    onboarding/
      ProfileStep.jsx
      CategoryStep.jsx
      SocialStep.jsx
  App.jsx             route table + animated transitions
  main.jsx            BrowserRouter + AuthFlowProvider + App
```
