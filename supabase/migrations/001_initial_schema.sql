-- =====================================================================
-- PREFLY — Initial Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query)
-- =====================================================================

-- 1. Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text unique not null,
  avatar_url text,
  is_public boolean default true,
  created_at timestamptz default now()
);

-- 2. Rankings table (stores completed rankings)
create table if not exists public.rankings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  list_name text not null,
  list_id text,
  mode text not null check (mode in ('classic', 'bracket')),
  items jsonb not null,
  result jsonb not null,
  comparisons_count integer not null default 0,
  duration_seconds integer,
  is_public boolean default true,
  created_at timestamptz default now()
);

-- 3. Indexes
create index if not exists idx_rankings_user_id on public.rankings(user_id);
create index if not exists idx_rankings_list_name on public.rankings(user_id, list_name);
create index if not exists idx_rankings_created_at on public.rankings(created_at desc);

-- 4. Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, pseudo)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'pseudo',
      new.raw_user_meta_data ->> 'full_name',
      'user_' || left(new.id::text, 8)
    )
  );
  return new;
end;
$$;

-- Drop existing trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Row Level Security

-- Profiles: anyone can read public profiles, users can update their own
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (is_public = true);

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Rankings: users can CRUD their own, anyone can read public rankings
alter table public.rankings enable row level security;

create policy "Users can view own rankings"
  on public.rankings for select
  using (auth.uid() = user_id);

create policy "Public rankings are viewable by everyone"
  on public.rankings for select
  using (is_public = true);

create policy "Users can insert own rankings"
  on public.rankings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own rankings"
  on public.rankings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own rankings"
  on public.rankings for delete
  using (auth.uid() = user_id);
