-- ============================================================
-- Posts + Post Unlocks Schema with RLS
-- Creator post uploads (free/paid) with payment wall
-- ============================================================

-- Posts table: creator content uploads
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  creator_username text not null,
  title text,
  caption text,
  content_type text not null default 'image' check (content_type in ('image', 'video', 'text')),
  media_url text,           -- Supabase Storage URL for image/video
  media_thumbnail text,     -- Thumbnail/preview (blurred or low-res)
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

-- Post unlocks: tracks which users paid for which posts
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
  unique(post_id, user_id)  -- one unlock per user per post
);

-- ============================================================
-- INDEXES
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
-- ENABLE RLS
-- ============================================================

alter table public.posts enable row level security;
alter table public.post_unlocks enable row level security;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ---------- posts ----------
-- Public read for published posts (creator pages)
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

-- ---------- post_unlocks ----------
-- Users can see their own unlocks
create policy "unlocks_user_select" on public.post_unlocks
  for select using (auth.uid() = user_id or auth.uid() = creator_user_id);

-- Authenticated users can have unlocks (created by edge function with service_role, but policy as defense)
create policy "unlocks_user_insert" on public.post_unlocks
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- TRIGGER: updated_at auto-update
-- ============================================================

create trigger trg_posts_updated_at before update on public.posts
  for each row execute function public.handle_updated_at();
