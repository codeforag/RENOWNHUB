-- ============================================================
-- MALLU CUPID — Full Database Schema + RLS Policies
-- Never trust the frontend. All validation happens server-side.
-- ============================================================

-- ============================================================
-- 1. CORE TABLES
-- ============================================================

-- Users table: stores role and metadata beyond Supabase Auth
create table if not exists public.users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  role text not null default 'user' check (role in ('user', 'creator', 'admin')),
  avatar_url text,
  email text not null,
  phone text,
  gender text check (gender in ('female', 'male', 'non-binary', 'prefer_not_to_say')),
  dob date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Creators table: extended profile for creator role
create table if not exists public.creators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  bio text default 'Welcome to my official app...',
  theme_color text default '#f1a2b5',
  avatar_url text,
  banner_url text,
  social jsonb default '{}'::jsonb,
  categories text[] default '{}',
  is_verified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Live events
create table if not exists public.live_events (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  creator_username text not null,
  title text not null,
  description text,
  event_when timestamptz not null,
  duration_minutes integer default 60,
  price_type text not null default 'free' check (price_type in ('free', 'paid')),
  price numeric(10,2) default 0,
  currency text default 'INR',
  status text default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  max_attendees integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Bookings
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.live_events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10,2) default 0,
  currency text default 'INR',
  status text default 'pending' check (status in ('pending', 'paid', 'cancelled', 'refunded')),
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Memberships (tiers created by creators)
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  price numeric(10,2) not null,
  interval_type text not null default 'monthly' check (interval_type in ('monthly', 'yearly')),
  benefits text[] default '{}',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Membership subscriptions
create table if not exists public.membership_subscriptions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text default 'active' check (status in ('active', 'expired', 'cancelled')),
  razorpay_subscription_id text,
  created_at timestamptz default now()
);

-- Services (Connect with Me)
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  price numeric(10,2) default 0,
  duration_minutes integer default 30,
  external_url text,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- OTP verification table (server-side only, no RLS needed - service role manages it)
create table if not exists public.otp_verifications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_code text not null,
  purpose text not null check (purpose in ('signup', 'signin', 'change_email')),
  role_hint text check (role_hint in ('user', 'creator')),
  username_hint text,
  verified boolean default false,
  expires_at timestamptz not null,
  attempts integer default 0,
  max_attempts integer default 5,
  created_at timestamptz default now()
);

-- Per-user app state (client state persistence)
create table if not exists public.app_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb,
  updated_at timestamptz default now()
);

-- Reserved usernames (system-managed)
create table if not exists public.reserved_usernames (
  id uuid primary key default gen_random_uuid(),
  username text unique not null
);

-- Payments ledger
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10,2) not null,
  currency text default 'INR',
  razorpay_order_id text unique,
  razorpay_payment_id text,
  razorpay_signature text,
  status text default 'pending' check (status in ('pending', 'captured', 'failed', 'refunded')),
  entity_type text not null check (entity_type in ('event_booking', 'membership', 'service')),
  entity_id uuid,
  created_at timestamptz default now()
);

-- Health check
create table if not exists public.app_health (
  id integer primary key default 1,
  ok boolean default true
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

create index if not exists idx_creators_username on public.creators(username);
create index if not exists idx_users_username on public.users(username);
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_live_events_creator on public.live_events(creator_user_id);
create index if not exists idx_live_events_username on public.live_events(creator_username);
create index if not exists idx_live_events_status on public.live_events(status);
create index if not exists idx_bookings_user on public.bookings(user_id);
create index if not exists idx_bookings_event on public.bookings(event_id);
create index if not exists idx_bookings_creator on public.bookings(creator_user_id);
create index if not exists idx_memberships_creator on public.memberships(creator_user_id);
create index if not exists idx_membership_subs_user on public.membership_subscriptions(user_id);
create index if not exists idx_membership_subs_membership on public.membership_subscriptions(membership_id);
create index if not exists idx_services_creator on public.services(creator_user_id);
create index if not exists idx_otp_email on public.otp_verifications(email);
create index if not exists idx_otp_expires on public.otp_verifications(expires_at);
create index if not exists idx_payments_user on public.payments(user_id);
create index if not exists idx_payments_order on public.payments(razorpay_order_id);

-- ============================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table public.users enable row level security;
alter table public.creators enable row level security;
alter table public.live_events enable row level security;
alter table public.bookings enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_subscriptions enable row level security;
alter table public.services enable row level security;
alter table public.app_user_state enable row level security;
alter table public.payments enable row level security;

-- NOTE: otp_verifications has NO RLS — it is managed ONLY via service_role key in edge functions.
-- NOTE: reserved_usernames has NO RLS — it is managed ONLY via service_role key.

-- ============================================================
-- 4. RLS POLICIES
-- ============================================================

-- ---------- users ----------
-- Anyone can read user profiles (for public lookups)
create policy "users_public_select" on public.users
  for select using (true);

-- Users can insert their own row (edge function does this with service_role, but policy as defense-in-depth)
create policy "users_self_insert" on public.users
  for insert with check (auth.uid() = user_id);

-- Users can update their own row only
create policy "users_self_update" on public.users
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- creators ----------
-- Public read for creator pages (/u/:username)
create policy "creators_public_select" on public.creators
  for select using (true);

-- Creator can insert their own row
create policy "creators_self_insert" on public.creators
  for insert with check (auth.uid() = user_id);

-- Creator can update their own row only
create policy "creators_self_update" on public.creators
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- live_events ----------
-- Public read (upcoming events on creator page)
create policy "events_public_select" on public.live_events
  for select using (true);

-- Only creator can create events
create policy "events_creator_insert" on public.live_events
  for insert with check (auth.uid() = creator_user_id);

-- Only creator can update their events
create policy "events_creator_update" on public.live_events
  for update using (auth.uid() = creator_user_id);

-- Only creator can delete their events
create policy "events_creator_delete" on public.live_events
  for delete using (auth.uid() = creator_user_id);

-- ---------- bookings ----------
-- Authenticated users can view their own bookings
create policy "bookings_user_select" on public.bookings
  for select using (auth.uid() = user_id or auth.uid() = creator_user_id);

-- Authenticated users can create bookings
create policy "bookings_user_insert" on public.bookings
  for insert with check (auth.uid() = user_id);

-- Creator can update bookings on their events (e.g., status changes)
create policy "bookings_creator_update" on public.bookings
  for update using (auth.uid() = creator_user_id);

-- ---------- memberships ----------
-- Public read (show membership tiers on creator page)
create policy "memberships_public_select" on public.memberships
  for select using (true);

-- Only creator can manage their memberships
create policy "memberships_creator_insert" on public.memberships
  for insert with check (auth.uid() = creator_user_id);

create policy "memberships_creator_update" on public.memberships
  for update using (auth.uid() = creator_user_id);

create policy "memberships_creator_delete" on public.memberships
  for delete using (auth.uid() = creator_user_id);

-- ---------- membership_subscriptions ----------
-- Users can see their own subscriptions
create policy "subs_user_select" on public.membership_subscriptions
  for select using (auth.uid() = user_id or auth.uid() = creator_user_id);

-- Authenticated users can subscribe
create policy "subs_user_insert" on public.membership_subscriptions
  for insert with check (auth.uid() = user_id);

-- ---------- services ----------
-- Public read (show services on creator page)
create policy "services_public_select" on public.services
  for select using (true);

-- Only creator can manage their services
create policy "services_creator_insert" on public.services
  for insert with check (auth.uid() = creator_user_id);

create policy "services_creator_update" on public.services
  for update using (auth.uid() = creator_user_id);

create policy "services_creator_delete" on public.services
  for delete using (auth.uid() = creator_user_id);

-- ---------- app_user_state ----------
-- Users can only read/write their own state
create policy "state_self_select" on public.app_user_state
  for select using (auth.uid() = user_id);

create policy "state_self_insert" on public.app_user_state
  for insert with check (auth.uid() = user_id);

create policy "state_self_update" on public.app_user_state
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "state_self_delete" on public.app_user_state
  for delete using (auth.uid() = user_id);

-- ---------- payments ----------
-- Users see their own payments
create policy "payments_user_select" on public.payments
  for select using (auth.uid() = user_id);

-- Creators see payments they received
create policy "payments_creator_select" on public.payments
  for select using (auth.uid() = creator_user_id);

-- ============================================================
-- 5. TRIGGER: updated_at auto-update
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at before update on public.users
  for each row execute function public.handle_updated_at();

create trigger trg_creators_updated_at before update on public.creators
  for each row execute function public.handle_updated_at();

create trigger trg_events_updated_at before update on public.live_events
  for each row execute function public.handle_updated_at();

create trigger trg_bookings_updated_at before update on public.bookings
  for each row execute function public.handle_updated_at();

create trigger trg_memberships_updated_at before update on public.memberships
  for each row execute function public.handle_updated_at();

create trigger trg_services_updated_at before update on public.services
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 6. SEED: Reserved usernames
-- ============================================================

insert into public.reserved_usernames (username) values
  ('admin'), ('root'), ('api'), ('auth'), ('login'), ('signup'), ('signin'),
  ('dashboard'), ('settings'), ('profile'), ('support'), ('help'), ('faq'),
  ('terms'), ('privacy'), ('legal'), ('billing'), ('pricing'), ('about'),
  ('blog'), ('news'), ('press'), ('careers'), ('contact'), ('team'),
  ('mallucupid'), ('creator'), ('creators'), ('user'), ('users'),
  ('moderator'), ('moderators'), ('superadmin'), ('sysadmin'),
  ('null'), ('undefined'), ('test'), ('testing'), ('debug'), ('staging')
on conflict (username) do nothing;

-- Seed health check
insert into public.app_health (id, ok) values (1, true)
on conflict (id) do nothing;

-- ============================================================
-- 7. FUNCTION: Clean expired OTPs
-- ============================================================

create or replace function public.clean_expired_otps()
returns void as $$
begin
  delete from public.otp_verifications where expires_at < now();
end;
$$ language plpgsql volatile security definer;
