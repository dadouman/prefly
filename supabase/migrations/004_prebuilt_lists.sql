-- =====================================================================
-- PREFLY — Prebuilt Lists (shared across all users)
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query)
-- =====================================================================

create table if not exists public.prebuilt_lists (
  id text primary key,
  name text not null,
  description text default '',
  format text default '',
  items jsonb not null default '[]'::jsonb,
  item_attributes jsonb default '{}'::jsonb,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Everyone can read lists
alter table public.prebuilt_lists enable row level security;

create policy "Anyone can view prebuilt lists"
  on public.prebuilt_lists for select
  using (true);

-- Allow inserts/updates/deletes via anon key (admin PIN is client-side)
create policy "Anyone can insert prebuilt lists"
  on public.prebuilt_lists for insert
  with check (true);

create policy "Anyone can update prebuilt lists"
  on public.prebuilt_lists for update
  using (true)
  with check (true);

create policy "Anyone can delete prebuilt lists"
  on public.prebuilt_lists for delete
  using (true);

-- Index for ordering
create index if not exists idx_prebuilt_lists_sort on public.prebuilt_lists(sort_order, created_at);
