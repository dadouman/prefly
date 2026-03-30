-- =====================================================================
-- PREFLY — Admin Role & Secure RLS for prebuilt_lists
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query)
-- =====================================================================

-- 1. Add role column to profiles (default 'user')
alter table public.profiles
  add column if not exists role text not null default 'user';

-- 2. Drop the old permissive policies on prebuilt_lists
drop policy if exists "Anyone can insert prebuilt lists" on public.prebuilt_lists;
drop policy if exists "Anyone can update prebuilt lists" on public.prebuilt_lists;
drop policy if exists "Anyone can delete prebuilt lists" on public.prebuilt_lists;

-- 3. Create admin-only RLS policies for prebuilt_lists
create policy "Admins can insert prebuilt lists"
  on public.prebuilt_lists for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can update prebuilt lists"
  on public.prebuilt_lists for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can delete prebuilt lists"
  on public.prebuilt_lists for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 4. Allow users to read their own role (needed for admin check in app)
-- The existing "Users can view own profile" policy already covers this.

-- 5. Index for role lookups
create index if not exists idx_profiles_role on public.profiles(role);
