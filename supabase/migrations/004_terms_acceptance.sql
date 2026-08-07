-- ============================================================
-- Migration 004: Track terms acceptance (signup-time + permanent record)
-- Adds audit columns to otp_verifications (signup attempt) and users (final record).
-- ============================================================

-- ---- otp_verifications: track acceptance at the time the OTP was issued ----
alter table public.otp_verifications
  add column if not exists accepted_terms boolean default false,
  add column if not exists accepted_age boolean default false,
  add column if not exists accepted_terms_at timestamptz;

-- ---- users: permanent record of acceptance (for legal/audit) ----
alter table public.users
  add column if not exists accepted_terms boolean default false,
  add column if not exists accepted_age boolean default false,
  add column if not exists accepted_terms_at timestamptz;

-- Backfill existing rows to false (they predate the requirement)
update public.otp_verifications set accepted_terms = false where accepted_terms is null;
update public.otp_verifications set accepted_age = false where accepted_age is null;
update public.users set accepted_terms = false where accepted_terms is null;
update public.users set accepted_age = false where accepted_age is null;

-- Add an index so we can quickly find users who haven't accepted (compliance reports)
create index if not exists idx_users_accepted_terms on public.users(accepted_terms);
create index if not exists idx_users_accepted_age on public.users(accepted_age);
