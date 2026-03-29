-- =====================================================================
-- PREFLY — Community Brackets (Tournois Communautaires)
-- =====================================================================

-- 1. Community Brackets table
create table if not exists public.community_brackets (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  list_name text,
  list_id text,
  items jsonb not null,                  -- original item list
  format text,                           -- e.g. 'discography'
  round_duration_hours integer not null default 24,
  current_round integer not null default 0,
  total_rounds integer not null,
  status text not null default 'active' check (status in ('active', 'finished', 'cancelled')),
  champion text,                         -- winner item name when finished
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cb_creator on public.community_brackets(creator_id);
create index if not exists idx_cb_status on public.community_brackets(status);
create index if not exists idx_cb_created on public.community_brackets(created_at desc);

-- 2. Matches table — all matches for all rounds
create table if not exists public.community_bracket_matches (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.community_brackets(id) on delete cascade,
  round integer not null,
  match_index integer not null,          -- position within the round
  item_a text,                           -- null = BYE
  item_b text,                           -- null = BYE
  votes_a integer not null default 0,
  votes_b integer not null default 0,
  winner text,                           -- set when round closes
  is_bye boolean not null default false,
  voting_ends_at timestamptz,            -- when voting closes for this match
  created_at timestamptz default now(),
  unique(bracket_id, round, match_index)
);

create index if not exists idx_cbm_bracket on public.community_bracket_matches(bracket_id);
create index if not exists idx_cbm_round on public.community_bracket_matches(bracket_id, round);

-- 3. Votes table — one vote per user per match
create table if not exists public.community_bracket_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.community_bracket_matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  voted_for text not null,               -- 'a' or 'b'
  created_at timestamptz default now(),
  unique(match_id, user_id)
);

create index if not exists idx_cbv_match on public.community_bracket_votes(match_id);
create index if not exists idx_cbv_user on public.community_bracket_votes(user_id);

-- 4. Row Level Security

-- Community brackets: anyone can read, creators can manage
alter table public.community_brackets enable row level security;

create policy "Anyone can view community brackets"
  on public.community_brackets for select
  using (true);

create policy "Authenticated users can create brackets"
  on public.community_brackets for insert
  with check (auth.uid() = creator_id);

create policy "Creators can update own brackets"
  on public.community_brackets for update
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

create policy "Creators can delete own brackets"
  on public.community_brackets for delete
  using (auth.uid() = creator_id);

-- Matches: anyone can read, system updates via creator
alter table public.community_bracket_matches enable row level security;

create policy "Anyone can view matches"
  on public.community_bracket_matches for select
  using (true);

create policy "Bracket creators can insert matches"
  on public.community_bracket_matches for insert
  with check (
    exists (
      select 1 from public.community_brackets
      where id = bracket_id and creator_id = auth.uid()
    )
  );

create policy "Bracket creators can update matches"
  on public.community_bracket_matches for update
  using (
    exists (
      select 1 from public.community_brackets
      where id = bracket_id and creator_id = auth.uid()
    )
  );

-- Votes: anyone can read, authenticated users can vote
alter table public.community_bracket_votes enable row level security;

create policy "Anyone can view votes"
  on public.community_bracket_votes for select
  using (true);

create policy "Authenticated users can vote"
  on public.community_bracket_votes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own votes"
  on public.community_bracket_votes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Function to atomically cast/change a vote and update match counts
create or replace function public.cast_community_vote(
  p_match_id uuid,
  p_user_id uuid,
  p_voted_for text
)
returns void
language plpgsql
security definer
as $$
declare
  v_old_vote text;
  v_match_bracket_id uuid;
  v_match_round integer;
  v_bracket_current_round integer;
  v_bracket_status text;
  v_voting_ends timestamptz;
begin
  -- Validate vote
  if p_voted_for not in ('a', 'b') then
    raise exception 'voted_for must be a or b';
  end if;

  -- Check match exists and is votable
  select m.bracket_id, m.round, m.voting_ends_at, b.current_round, b.status
  into v_match_bracket_id, v_match_round, v_voting_ends, v_bracket_current_round, v_bracket_status
  from public.community_bracket_matches m
  join public.community_brackets b on b.id = m.bracket_id
  where m.id = p_match_id;

  if not found then
    raise exception 'Match not found';
  end if;

  if v_bracket_status != 'active' then
    raise exception 'Tournament is not active';
  end if;

  if v_match_round != v_bracket_current_round then
    raise exception 'This round is not currently active';
  end if;

  if v_voting_ends is not null and now() > v_voting_ends then
    raise exception 'Voting has ended for this match';
  end if;

  -- Check for existing vote
  select voted_for into v_old_vote
  from public.community_bracket_votes
  where match_id = p_match_id and user_id = p_user_id;

  if found then
    -- Change vote
    if v_old_vote = p_voted_for then
      return; -- same vote, no-op
    end if;

    update public.community_bracket_votes
    set voted_for = p_voted_for
    where match_id = p_match_id and user_id = p_user_id;

    -- Decrement old, increment new
    if v_old_vote = 'a' then
      update public.community_bracket_matches set votes_a = votes_a - 1, votes_b = votes_b + 1 where id = p_match_id;
    else
      update public.community_bracket_matches set votes_a = votes_a + 1, votes_b = votes_b - 1 where id = p_match_id;
    end if;
  else
    -- New vote
    insert into public.community_bracket_votes (match_id, user_id, voted_for)
    values (p_match_id, p_user_id, p_voted_for);

    if p_voted_for = 'a' then
      update public.community_bracket_matches set votes_a = votes_a + 1 where id = p_match_id;
    else
      update public.community_bracket_matches set votes_b = votes_b + 1 where id = p_match_id;
    end if;
  end if;
end;
$$;
