-- ============================================================================
-- ONE PHOTO / DAY — database schema
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run more than once.
--
-- What it creates:
--   profiles        one row per signed-in person
--   albums          one row per album
--   album_members   who is in which album
--   photos          one row per posted photo
--
--   user_stats      VIEW: every user, their album count, current + best streak
--   album_stats     VIEW: every album, how many people are in it, and who
--
-- The two views are what you asked for: open them in Supabase's Table Editor
-- and you can read them like spreadsheets.
-- ============================================================================


-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- A person. `id` matches the id Supabase Auth hands out at sign-in, so this
-- row IS the user — however they signed in (Google, email, whatever).
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null,
  accent      text not null default 'pink',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.albums (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  accent       text not null default 'yellow',
  invite_code  text not null unique,
  owner_id     uuid not null references public.profiles on delete cascade,
  cover_url    text,
  -- A ~360px copy of the cover, for the album cards on the home screen. Null
  -- for albums whose cover predates thumbnails; the full size is used then.
  cover_thumb_url text,
  created_at   timestamptz not null default now()
);

-- Membership is its own table because it is many-to-many: a person is in many
-- albums, an album has many people. This is what makes "number of users in an
-- album" a variable number rather than a fixed column.
create table if not exists public.album_members (
  album_id   uuid not null references public.albums on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (album_id, user_id)
);

create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references public.albums on delete cascade,
  author_id   uuid not null references public.profiles on delete cascade,
  day         date not null,
  posted_at   timestamptz not null default now(),
  caption     text,
  image_path  text not null,
  -- A ~512px copy, which is what every grid tile actually draws. Null for
  -- photos posted before thumbnails existed; those fall back to image_path.
  thumb_path  text,

  -- ⭐ THE RULE. One photo per person, per album, per day.
  -- The database itself refuses a second row. No app, no script and no
  -- hand-crafted request can get around it.
  constraint one_photo_per_day unique (album_id, author_id, day)
);

create index if not exists photos_album_day_idx on public.photos (album_id, day desc);
create index if not exists photos_author_day_idx on public.photos (author_id, day);
create index if not exists album_members_user_idx on public.album_members (user_id);


-- ============================================================================
-- 2. HELPERS
--
-- These run with elevated rights (`security definer`) purely so the security
-- rules below can ask "is this person a member?" without the rule needing to
-- read the very table it is protecting — which would loop forever.
-- ============================================================================

create or replace function public.is_member(target_album uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from album_members
    where album_id = target_album and user_id = auth.uid()
  );
$$;

-- True when you and this other person share at least one album. Used so people
-- can see the names of their album-mates — and nobody else's.
create or replace function public.shares_album_with(other_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from album_members mine
    join album_members theirs on theirs.album_id = mine.album_id
    where mine.user_id = auth.uid() and theirs.user_id = other_user
  );
$$;


-- ============================================================================
-- 3. JOINING BY INVITE CODE
--
-- Someone holding a code is not a member yet, so the rules below would hide
-- the album from them and they could never join. This function does the
-- lookup on their behalf and adds them, and is the only way in.
-- ============================================================================

create or replace function public.join_album_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found_album uuid;
begin
  select id into found_album
  from albums
  -- Compare loosely: dashes and case shouldn't matter when typing a code.
  where upper(replace(invite_code, '-', '')) = upper(replace(code, '-', ''));

  if found_album is null then
    raise exception 'no album with that code';
  end if;

  insert into album_members (album_id, user_id)
  values (found_album, auth.uid())
  on conflict do nothing;

  return found_album;
end;
$$;


-- ============================================================================
-- 3b. CREATING AN ALBUM
--
-- Also one privileged step, for a subtler reason than joining. Doing it as
-- two plain inserts deadlocks: album_members deliberately has no INSERT
-- policy (one allowing `user_id = auth.uid()` would let anyone holding an
-- album's id add themselves and skip the invite code entirely), and
-- albums_read requires membership, so the creator couldn't even read back the
-- row they just wrote. The album would exist, invisible to everyone, forever.
-- ============================================================================

create or replace function public.create_album(
  p_name   text,
  p_accent text,
  p_code   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'must be signed in to create an album';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'an album needs a name';
  end if;

  insert into albums (name, accent, invite_code, owner_id)
  values (trim(p_name), coalesce(p_accent, 'yellow'), p_code, me)
  returning id into new_id;

  insert into album_members (album_id, user_id) values (new_id, me);

  return new_id;
end;
$$;


-- ============================================================================
-- 4. SECURITY RULES (Row Level Security)
--
-- Without these, anyone could read everyone's photos. With them, the database
-- filters every query by who is asking — even if the app has a bug.
-- ============================================================================

alter table public.profiles      enable row level security;
alter table public.albums        enable row level security;
alter table public.album_members enable row level security;
alter table public.photos        enable row level security;

-- --- profiles ---
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.shares_album_with(id));

drop policy if exists profiles_write_own on public.profiles;
create policy profiles_write_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert
  with check (id = auth.uid());

-- --- albums ---
drop policy if exists albums_read on public.albums;
create policy albums_read on public.albums for select
  using (public.is_member(id));

drop policy if exists albums_create on public.albums;
create policy albums_create on public.albums for insert
  with check (owner_id = auth.uid());

drop policy if exists albums_update on public.albums;
create policy albums_update on public.albums for update
  using (public.is_member(id));

drop policy if exists albums_delete on public.albums;
create policy albums_delete on public.albums for delete
  using (owner_id = auth.uid());

-- --- album_members ---
drop policy if exists members_read on public.album_members;
create policy members_read on public.album_members for select
  using (public.is_member(album_id));

drop policy if exists members_leave on public.album_members;
create policy members_leave on public.album_members for delete
  using (user_id = auth.uid());

-- --- photos ---
drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select
  using (public.is_member(album_id));

-- You may only post as yourself, and only into an album you're in.
-- (The one-per-day limit is the table constraint above, not a policy.)
drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos for insert
  with check (author_id = auth.uid() and public.is_member(album_id));

drop policy if exists photos_delete_own on public.photos;
create policy photos_delete_own on public.photos for delete
  using (author_id = auth.uid());


-- ============================================================================
-- 5. THE TABLES YOU ASKED TO SEE
--
-- Streaks aren't stored — they're worked out from the photos on demand, so
-- they can never drift out of sync with reality.
--
-- How the streak maths works, in one line: number the days a person posted,
-- in order, then subtract that number from the date. Every day in an unbroken
-- run lands on the same value, so grouping by it gives you each run and how
-- long it was. (The classic "gaps and islands" trick.)
--
-- `security_invoker = on` means these views obey the rules above: signed in
-- through the app you see only your own people, while you as the owner see
-- everything in the Supabase dashboard.
-- ============================================================================

-- Every signed-in user: how many albums they're in, their current streak and
-- their best streak ever.
drop view if exists public.user_stats;
create view public.user_stats
with (security_invoker = on)
as
with posting_days as (
  -- One row per person per day they posted anywhere.
  select distinct author_id, day from public.photos
),
numbered as (
  select
    author_id,
    day,
    day - (row_number() over (partition by author_id order by day))::int as run_key
  from posting_days
),
runs as (
  select author_id, run_key, count(*) as length, max(day) as last_day
  from numbered
  group by author_id, run_key
)
select
  p.id                                                        as user_id,
  p.name,
  (select count(*) from public.album_members m
    where m.user_id = p.id)                                   as albums,
  coalesce((
    -- A run only counts as "current" if it reaches today or yesterday —
    -- you still have until midnight to keep it alive.
    select r.length from runs r
    where r.author_id = p.id and r.last_day >= current_date - 1
    order by r.last_day desc limit 1
  ), 0)                                                       as current_streak,
  coalesce((select max(r.length) from runs r
    where r.author_id = p.id), 0)                             as best_streak,
  (select count(*) from public.photos ph
    where ph.author_id = p.id)                                as photos,
  (select max(ph.day) from public.photos ph
    where ph.author_id = p.id)                                as last_posted,
  p.created_at                                                as signed_up
from public.profiles p;


-- Every album: how many people are in it, and exactly who.
drop view if exists public.album_stats;
create view public.album_stats
with (security_invoker = on)
as
select
  a.id                                                        as album_id,
  a.name,
  a.invite_code,
  (select count(*) from public.album_members m
    where m.album_id = a.id)                                  as member_count,
  (select string_agg(p.name, ', ' order by p.name)
     from public.album_members m
     join public.profiles p on p.id = m.user_id
    where m.album_id = a.id)                                  as members,
  owner.name                                                  as owner,
  (select count(*) from public.photos ph
    where ph.album_id = a.id)                                 as photos,
  (select count(distinct ph.day) from public.photos ph
    where ph.album_id = a.id)                                 as days_kept,
  (select max(ph.day) from public.photos ph
    where ph.album_id = a.id)                                 as last_photo_day,
  a.created_at
from public.albums a
join public.profiles owner on owner.id = a.owner_id;


-- ============================================================================
-- 6. NEW SIGN-UPS
--
-- When someone signs in with Google for the first time, Supabase creates the
-- account but not their profile row. This fills it in automatically, using
-- the name Google gives us.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      'Someone'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 6b. LOCKING DOWN THE HELPERS
--
-- Supabase auto-exposes every function in `public` as a REST endpoint
-- (`/rest/v1/rpc/<name>`) and grants anon + authenticated EXECUTE on it by
-- default — a separate, explicit grant, not just the generic Postgres
-- "PUBLIC" fallback, so revoking from PUBLIC alone does not remove it.
--
-- None of these leak real data to an anonymous caller today (each keys off
-- auth.uid(), which is null for anon), but there's no reason to leave them
-- directly callable by anyone who isn't supposed to use them:
--
--   handle_new_user      trigger-only — no direct caller, ever
--   is_member             used inside RLS policies by signed-in queries
--   shares_album_with     same
--   join_album_by_code    the one meant to be called directly — but only
--                          once someone is signed in
--
-- Verified with a rollback-wrapped insert into auth.users that revoking these
-- does not stop the sign-up trigger from firing.
-- ============================================================================

-- Revoke from `public` too (plain Postgres grants EXECUTE to it on every new
-- function by default) — not only anon/authenticated. Supabase projects
-- already strip that grant, so this is redundant there, but it keeps the
-- file correct if it's ever run somewhere that doesn't.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_member(uuid) from public, anon, authenticated;
revoke execute on function public.shares_album_with(uuid) from public, anon, authenticated;
revoke execute on function public.join_album_by_code(text) from public, anon, authenticated;
revoke execute on function public.create_album(text, text, text) from public, anon, authenticated;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.create_album(text, text, text) to authenticated;
grant execute on function public.shares_album_with(uuid) to authenticated;
grant execute on function public.join_album_by_code(text) to authenticated;


-- ============================================================================
-- 7. PHOTO STORAGE
--
-- The picture files live in a storage bucket, not in the database. Only
-- members of an album can see or add photos belonging to it. Files are stored
-- as: <album_id>/<photo_id>.jpg — the folder name IS the album id, which is
-- how the rules below can tell who's allowed in.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Album photos live at <album id>/<photo id>.jpg — the folder name IS the
-- album id, which is how these rules know who's allowed in. Avatars share the
-- bucket under avatars/<user id>/, so both rules exclude that prefix: casting
-- the literal 'avatars' to uuid would throw.
drop policy if exists photos_bucket_read on storage.objects;
create policy photos_bucket_read on storage.objects for select
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] <> 'avatars'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists photos_bucket_write on storage.objects;
create policy photos_bucket_write on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] <> 'avatars'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists photos_bucket_delete_own on storage.objects;
create policy photos_bucket_delete_own on storage.objects for delete
  to authenticated
  using (bucket_id = 'photos' and owner = auth.uid());

-- Avatars: anyone signed in may look at one (you need to see the faces of
-- people in your albums), but you may only write into your own folder.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'avatars');

drop policy if exists avatars_write_own on storage.objects;
create policy avatars_write_own on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
