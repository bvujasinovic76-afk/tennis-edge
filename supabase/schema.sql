-- EDGE Tenis — Supabase schema (profiles + bets, per-user, RLS enforced)

-- Profile: one row per auth user, holds bankroll settings.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  currency text not null default 'RSD',
  starting_bankroll numeric not null default 10000,
  kelly_multiplier numeric not null default 0.25,
  created_at timestamptz not null default now()
);

-- Bets: per-user ledger.
create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  placed_at timestamptz not null default now(),
  match_label text not null,
  pick text not null,
  odds numeric not null,
  stake numeric not null,
  model_prob numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','won','lost','void')),
  settled_at timestamptz
);

create index if not exists bets_user_idx on public.bets (user_id, placed_at desc);

-- Row Level Security: each user sees/edits only their own rows.
alter table public.profiles enable row level security;
alter table public.bets enable row level security;

drop policy if exists "profiles self select" on public.profiles;
drop policy if exists "profiles self upsert" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self select" on public.profiles for select using (auth.uid() = id);
create policy "profiles self upsert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);

drop policy if exists "bets self select" on public.bets;
drop policy if exists "bets self insert" on public.bets;
drop policy if exists "bets self update" on public.bets;
drop policy if exists "bets self delete" on public.bets;
create policy "bets self select" on public.bets for select using (auth.uid() = user_id);
create policy "bets self insert" on public.bets for insert with check (auth.uid() = user_id);
create policy "bets self update" on public.bets for update using (auth.uid() = user_id);
create policy "bets self delete" on public.bets for delete using (auth.uid() = user_id);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Arhiva AI analiza (konzilijum + istraživanje) — keš da se isti meč ne plaća dvaput.
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('council','research')),
  player_a text not null,
  player_b text not null,
  surface text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists analyses_lookup_idx on public.analyses (kind, player_a, player_b, surface, created_at desc);
create index if not exists analyses_user_idx on public.analyses (user_id, created_at desc);
alter table public.analyses enable row level security;
create policy "analyses self select" on public.analyses for select using (auth.uid() = user_id);
create policy "analyses self insert" on public.analyses for insert with check (auth.uid() = user_id);
