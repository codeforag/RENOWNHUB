# MALLU CUPID — Documentation

This document describes the frontend pages, components, and the required backend (Supabase) schema and API interactions to run the application in production.

IMPORTANT: This repository has removed all mock/demo fallbacks. The app requires Supabase to be configured via environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Configure these in your local `.env` (for development) or in the AWS Amplify Console for production.

---

## Table of contents

- App overview
- Pages (list + responsibilities)
- Components (relevant for backend integration)
- Backend (Supabase) schema — tables and recommended columns
- API interactions and endpoints (Supabase driven)
- Auth and roles
- Security & RLS recommendations
- Deployment (AWS Amplify) and environment variables
- Integrations (payments, webhooks)

---

## App overview

MALLU CUPID is a creator platform enabling creators to:
- Create a public profile page (shared link)
- Host live events (free or paid)
- Create services (connect-with-me) and memberships
- Monetize via paid events and memberships

Users (audience) can:
- Visit a creator's public page via a shared link
- Book free events or pay for paid events
- Subscribe to memberships
- Sign up / sign in as `user` role (no phone required)

Creators have a separate onboarding and dashboard flows (role `creator`).

---

## Pages (frontend) — responsibilities and backend calls

The following pages exist in `src/pages` and must be backed by Supabase tables/APIs:

- `/` Home (`src/pages/Home.jsx`)
  - Purpose: Marketing, CTA to sign up, hero, features.
  - Backend: none required for public content, but may show featured creators.

- `/signin` Sign In (`src/pages/SignIn.jsx`)
  - Purpose: Sign in users using Supabase magic-link email authentication.
  - Backend: use `supabase.auth.signInWithOtp({ email })`.
  - UI: email-only input, not username; the app sends an authentication email to the provided address.
  - Role: signs in as `user` or creator depending on account metadata and stored account state.

- `/signup` Sign Up (`src/pages/SignUp.jsx`)
  - Purpose: Sign up using Supabase magic-link email authentication. No mobile number for `user` accounts.
  - Backend: `supabase.auth.signInWithOtp({ email })` for email verification; on successful callback finalize profile and assign role.
  - Expect `location.state.role` can be `'user'` (from shared links) or `'creator'` (default onboarding flow).
  - UI: collects email and username, checks username availability before sending the auth email.

- `/verify-otp` Verify OTP (`src/pages/VerifyOtp.jsx`) — deprecated
  - NOTE: OTP flows removed in favor of magic link. This page is kept for reference but production should use magic-link flows.

- `/onboarding/*` (`src/pages/onboarding`) — onboarding for creators
  - ProfileStep, CategoryStep, SocialStep
  - Backend: create `creators` row on finalize. Persist interim onboarding state in `app_user_state` or client-side until user confirms.

- `/dashboard` Dashboard (`src/pages/Dashboard.jsx`)
  - Purpose: Creator dashboard (mobile-only enforced). Shows upcoming events, earnings, metrics.
  - Backend: `live_events` for scheduled/live events; `bookings` for bookings; `payments`/`payouts` for earnings.

- `/dashboard/profile` Dashboard Profile (`src/pages/DashboardProfile.jsx`)
  - Purpose: edit and view creator's profile information
  - Backend: `creators` table updates; file uploads to Supabase Storage (avatars, banners).

- `/dashboard/connect` Connect With Me Edit (`src/pages/ConnectWithMeEdit.jsx`)
  - Purpose: CRUD creator services
  - Backend: `services` table (creator_id, title, description, price, duration, external_url)
  - Pagination: front-end uses URL-based pagination; backend list endpoint should support limit/offset.

- `/dashboard/membership` Membership Edit (`src/pages/MembershipEdit.jsx`)
  - Purpose: Manage membership tiers and subscribers
  - Backend: `memberships` table and `membership_subscriptions` table (user_id, membership_id, starts_at, ends_at, status)

- `/preview` Preview App (`src/pages/PreviewApp.jsx`) and `/share` ShareApp (`src/pages/ShareApp.jsx`)
  - Purpose: preview public creator app; share controls
  - Backend: reads creator profile and share counts

- `/u/:username` Public Creator (`src/pages/PublicCreator.jsx`) — NEW
  - Purpose: Public-facing creator page for shared links
  - Must be mobile-only (component enforces mobile via `debugger` to prevent desktop usage during development).
  - Backend: reads `creators` and `live_events`; supports booking actions which either redirect to sign-in or create a booking (for free events) for authenticated `user` accounts.


## Components

Key components requiring backend integration:

- `Nav.jsx` — Live button opens `LiveModal` which creates events.
  - `LiveModal` should write to `live_events` table for creators.

- `LiveModal.jsx`
  - Creates `live_events` with fields: title, when (timestamptz), price_type (`free`|`paid`), price, creator_username or creator_id, status (`scheduled`|`live`).

- `Pagination.jsx` — expects backend to support limit/offset or cursor.

- `PassCard`, `WhoFor`, `Hero`, `Footer` — mostly display; some show dynamic data from backend.

- `TextField`, `OtpInput` — UI fields.

---

## Supabase schema (recommended)

Run the following SQL in Supabase SQL editor. This is a recommended starting schema — extend as needed.

```sql
-- Users are managed by Supabase Auth; profile tables store additional metadata
create table if not exists users (
  user_id uuid primary key,
  username text unique,
  display_name text,
  role text not null default 'user', -- 'user' or 'creator' or 'admin'
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists creators (
  user_id uuid references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  bio text,
  theme_color text,
  avatar_url text,
  social jsonb,
  created_at timestamptz default now(),
  primary key (user_id)
);

create table if not exists live_events (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete cascade,
  creator_username text,
  title text,
  description text,
  when timestamptz,
  duration integer, -- minutes
  price_type text not null default 'free', -- 'free' or 'paid'
  price numeric default 0,
  status text default 'scheduled', -- scheduled|live|ended
  created_at timestamptz default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references live_events(id) on delete cascade,
  user_id uuid references auth.users(id),
  amount numeric default 0,
  currency text default 'INR',
  status text default 'pending', -- pending|paid|cancelled
  payment_provider jsonb,
  created_at timestamptz default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete cascade,
  title text,
  description text,
  price numeric,
  interval text, -- monthly|yearly
  created_at timestamptz default now()
);

create table if not exists membership_subscriptions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid references memberships(id) on delete cascade,
  user_id uuid references auth.users(id),
  starts_at timestamptz,
  ends_at timestamptz,
  status text default 'active'
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete cascade,
  title text,
  description text,
  price numeric,
  duration integer,
  created_at timestamptz default now()
);

create table if not exists app_user_state (
  user_id uuid primary key,
  state jsonb,
  updated_at timestamptz default now()
);

create table if not exists reserved_usernames (
  id uuid primary key default gen_random_uuid(),
  username text unique not null
);

create table if not exists app_health (
  id integer primary key default 1,
  ok boolean default true
);
```

Notes:
- `auth.users` is Supabase's auth table. Use `auth.users(id)` as foreign keys for convenience.
- Consider using `user_id` from `supabase.auth.getUser()` when inserting rows.

---

## API interactions (frontend → Supabase)

This app uses Supabase client on the frontend. Key operations:

- Auth
  - Sign up / sign in: `supabase.auth.signInWithOtp({ email })` (magic link)
  - After sign-in callback, call `supabase.auth.getUser()` to get user id and metadata.
  - Finalize signup: insert into `users` or `creators` table depending on role.

- Creator profile
  - GET `/creators?username=...` → `supabase.from('creators').select('*').eq('username', username).single()`
  - PATCH `/creators` → `supabase.from('creators').update({...}).eq('user_id', userId)`

- Live events
  - Create: `supabase.from('live_events').insert({...})` (creator only)
  - List: `supabase.from('live_events').select('*').eq('creator_username', username)`
  - Book: create a row in `bookings` and process payment (Stripe)

- Bookings & payments
  - On paid booking: create `bookings` row with status `pending`, then initialize Stripe Checkout session on server (or use Supabase Edge Functions), and update booking on webhook when payment succeeds.

- Memberships & services
  - CRUD `memberships` and `services` via `supabase.from(...).insert()/update()/delete()` restricted to creator user.

- App state
  - Persist per-user app state: `supabase.from('app_user_state').upsert({ user_id, state })`

---

## Auth and roles

- Two primary roles: `creator` and `user`.
- Assign role in Auth metadata or in `users`/`creators` tables.
- Use RLS policies to limit who can write or read certain tables (see next section).

---

## Security & RLS recommendations

Enable Row Level Security (RLS) on production tables and add policies:

- `creators`: public `select` for anonymous users, `insert`/`update` only for authenticated user matching `auth.uid()` if they own the creator row.
- `live_events`: public `select` allowed; `insert`/`update` only for matching creator user id.
- `bookings`: `insert` allowed for authenticated users; `select` allowed for booking owner or creator.
- `app_user_state`: `select`/`upsert` only for matching `user_id = auth.uid()`.

Example RLS (simple):

```sql
-- allow public read of creators
alter table creators enable row level security;
create policy "public_select" on creators for select using (true);

-- allow insert/update only for authenticated owner
create policy "creators_owner" on creators for insert, update using (auth.uid() = user_id);
```

Adjust policies carefully in Supabase console.

---

## Payments & webhooks

Recommended pattern for paid events and memberships:

- Create `bookings` row with status `pending`.
- Create a Stripe Checkout session on a server endpoint (Edge Function or serverless) with booking id and price.
- Redirect user to Stripe Checkout.
- Configure Stripe webhook to update `bookings` status to `paid` on successful payment and send confirmation email.
- Optional: store transaction data in `payments` table.

Supabase Edge Functions are a good place to implement Stripe server-side logic.

---

## AWS Amplify deployment

- Add `amplify.yml` at project root (provided in this repo).
- In Amplify Console:
  - Connect repository and branch `main`.
  - Set environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and any Stripe keys for Edge Functions.
  - Add domain `mallucupid.com` and configure DNS.

Build command is `npm run build` and publish directory is `dist`.

---

## Post-auth callback and role finalization

Implement a callback route (e.g., `/auth/callback`) that reads the Supabase session after magic link sign-in, then:

1. Call `supabase.auth.getUser()` to get `user.id`.
2. Check whether a `users` or `creators` row exists; if not, create one based on `state` carried in session or URL params (e.g., signupRole).
3. Optionally set `user_metadata` via Supabase Admin API if you need role stored in JWT.
4. Redirect to `redirect` param or dashboard.

I can implement this helper page next if you'd like.

---

## Files added in this update

- `src/lib/supabaseClient.js` — Supabase client loader
- `src/lib/authClient.js` — helpers for sign-up/sign-in (basic)
- `src/pages/PublicCreator.jsx` — public creator page for shared links (mobile-only)
- `src/components/LiveModal.jsx` — create live events (writes to `live_events`)
- `amplify.yml` — Amplify build settings
- `DOCUMENTATIONS.md` — this file

---

If you'd like, next I can:
- Implement the post-auth callback route to finalize signup and set role.
- Add example Supabase Edge Function (Stripe checkout) and webhook handler template.
- Add the recommended RLS policies as SQL migration files.

Which of the above would you like me to implement next?
