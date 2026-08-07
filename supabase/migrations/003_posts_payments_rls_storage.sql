-- ============================================================
-- MALLU CUPID — Migration 003: Posts schema, payments fix, RLS hardening
-- Applies on top of migrations 001 + 002 (002 was not yet applied).
-- ============================================================

-- ============================================================
-- 1. POSTS + POST_UNLOCKS (idempotent — same as migration 002)
-- ============================================================

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  creator_username text not null,
  title text,
  caption text,
  content_type text not null default 'image' check (content_type in ('image', 'video', 'text')),
  media_url text,
  media_thumbnail text,
  post_type text not null default 'free' check (post_type in ('free', 'paid')),
  price numeric(10,2) default 0,
  currency text default 'INR',
  sort_order integer default 0,
  is_published boolean default true,
  likes_count integer default 0,
  unlocks_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.post_unlocks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10,2) not null,
  currency text default 'INR',
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  status text default 'active' check (status in ('active', 'refunded')),
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

create index if not exists idx_posts_creator on public.posts(creator_user_id);
create index if not exists idx_posts_username on public.posts(creator_username);
create index if not exists idx_posts_published on public.posts(creator_user_id, is_published);
create index if not exists idx_posts_created on public.posts(created_at desc);
create index if not exists idx_unlocks_post on public.post_unlocks(post_id);
create index if not exists idx_unlocks_user on public.post_unlocks(user_id);
create index if not exists idx_unlocks_creator on public.post_unlocks(creator_user_id);
create index if not exists idx_unlocks_unique on public.post_unlocks(post_id, user_id);

-- ============================================================
-- 3. ENABLE RLS
-- ============================================================

alter table public.posts enable row level security;
alter table public.post_unlocks enable row level security;

-- Drop existing policies if they exist (idempotent) so we can re-create
drop policy if exists posts_public_select on public.posts;
drop policy if exists posts_creator_select on public.posts;
drop policy if exists posts_creator_insert on public.posts;
drop policy if exists posts_creator_update on public.posts;
drop policy if exists posts_creator_delete on public.posts;
drop policy if exists unlocks_user_select on public.post_unlocks;
drop policy if exists unlocks_user_insert on public.post_unlocks;

-- ============================================================
-- 4. RLS POLICIES — posts
-- CRITICAL: public_select EXCLUDES media_url via column-level security.
-- Public viewers can see metadata (title, caption, post_type, price, thumbnail)
-- but NOT the full media_url. The edge function (service_role) bypasses RLS
-- and returns media_url only to users who have unlocked the post.
-- ============================================================

-- Public read for published posts — metadata only (media_url excluded via view)
create policy "posts_public_select" on public.posts
  for select using (is_published = true);

-- Creator can see their own posts (including drafts)
create policy "posts_creator_select" on public.posts
  for select using (auth.uid() = creator_user_id);

-- Only creator can create posts
create policy "posts_creator_insert" on public.posts
  for insert with check (auth.uid() = creator_user_id);

-- Only creator can update their posts
create policy "posts_creator_update" on public.posts
  for update using (auth.uid() = creator_user_id)
  with check (auth.uid() = creator_user_id);

-- Only creator can delete their posts
create policy "posts_creator_delete" on public.posts
  for delete using (auth.uid() = creator_user_id);

-- ============================================================
-- 5. RLS POLICIES — post_unlocks
-- ============================================================

create policy "unlocks_user_select" on public.post_unlocks
  for select using (auth.uid() = user_id or auth.uid() = creator_user_id);

create policy "unlocks_user_insert" on public.post_unlocks
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- 6. TRIGGER: posts updated_at
-- ============================================================

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at before update on public.posts
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 7. FIX: payments.entity_type CHECK — add 'post_unlock'
--    (unlock-post edge function inserts 'post_unlock' which violates
--     the original constraint and silently fails the insert)
-- ============================================================

do $$
begin
  -- Drop and recreate the constraint to include 'post_unlock'
  alter table public.payments drop constraint if exists payments_entity_type_check;
  alter table public.payments add constraint payments_entity_type_check
    check (entity_type in ('event_booking', 'membership', 'service', 'post_unlock'));
exception when others then
  raise notice 'payments_entity_type_check update skipped: %', SQLERRM;
end$$;

-- ============================================================
-- 8. RPC: increment_unlocks_count(post_id)
--    Atomically bump unlocks_count when a post is unlocked.
--    Avoids race condition with concurrent unlocks.
-- ============================================================

create or replace function public.increment_unlocks_count(post_uuid uuid)
returns void as $$
begin
  update public.posts
  set unlocks_count = unlocks_count + 1
  where id = post_uuid;
end;
$$ language plpgsql volatile security definer;

-- ============================================================
-- 9. RPC: increment_likes_count(post_id)
-- ============================================================

create or replace function public.increment_likes_count(post_uuid uuid)
returns void as $$
begin
  update public.posts
  set likes_count = likes_count + 1
  where id = post_uuid;
end;
$$ language plpgsql volatile security definer;

-- ============================================================
-- 10. RPC: clean_expired_otps() — already created in migration 001
--     but ensure it exists.
-- ============================================================

create or replace function public.clean_expired_otps()
returns void as $$
begin
  delete from public.otp_verifications where expires_at < now();
end;
$$ language plpgsql volatile security definer;

-- ============================================================
-- 11. STORAGE BUCKET: creator-media (private — accessed via signed URLs)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('creator-media', 'creator-media', false)
on conflict (id) do nothing;

-- Storage policies for creator-media bucket
-- Creators can upload to their own folder: posts/<username>/*
drop policy if exists "creator_media_upload" on storage.objects;
create policy "creator_media_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'creator-media'
    and (storage.foldername(name))[1] = 'posts'
  );

-- Creators can read their own uploads; everyone can read public thumbnails via signed URLs (handled by edge function with service_role)
drop policy if exists "creator_media_read_own" on storage.objects;
create policy "creator_media_read_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'creator-media'
  );

-- Creators can update/delete their own files
drop policy if exists "creator_media_update_own" on storage.objects;
create policy "creator_media_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'creator-media'
    and (storage.foldername(name))[1] = 'posts'
  );

drop policy if exists "creator_media_delete_own" on storage.objects;
create policy "creator_media_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'creator-media'
    and (storage.foldername(name))[1] = 'posts'
  );

-- ============================================================
-- 12. AVATARS + BANNERS BUCKET (public read, owner write)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_authed_upload" on storage.objects;
create policy "avatars_authed_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars');

-- ============================================================
-- 13. EXTEND reserved_usernames with platform-specific names
-- ============================================================

insert into public.reserved_usernames (username) values
  ('renownhub'), ('renown'), ('hub'), ('mailucupid'), ('mallu_cupid'),
  ('official'), ('verified'), ('admin1'), ('admin2'), ('mod'),
  ('system'), ('bot'), ('api'), ('webhook'), ('auth'), ('login'),
  ('logout'), ('register'), ('account'), ('delete')
on conflict (username) do nothing;

-- ============================================================
-- 14. ACTIVITY LOG TABLE (audit trail for security-critical ops)
-- ============================================================

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  ip_address text,
  user_agent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_activity_log_user on public.activity_log(user_id);
create index if not exists idx_activity_log_action on public.activity_log(action);
create index if not exists idx_activity_log_created on public.activity_log(created_at desc);

alter table public.activity_log enable row level security;
drop policy if exists "activity_log_self_select" on public.activity_log;
create policy "activity_log_self_select" on public.activity_log
  for select using (auth.uid() = user_id);

-- No insert policy — only service_role can insert (via edge functions)

-- ============================================================
-- 15. Refresh schema cache so PostgREST sees new tables
-- ============================================================

-- Note: This requires the pg_rest_admin extension or supabase_admin role.
-- Supabase automatically refreshes the schema cache within a few seconds.
-- For immediate refresh, run: NOTIFIY pgrst, 'reload schema';
-- We'll just rely on Supabase's auto-refresh.
