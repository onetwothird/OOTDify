-- OOTDify database schema — canonical bootstrap file.
--
-- Workflow: supabase/migrations/20261020120000_initial_ootdify.sql mirrors
-- this file byte-for-byte so `supabase db push` and "paste into the SQL
-- Editor" both work; when you change one, change the other in the same commit.
--
-- Policy conventions (kept Supabase-Advisor-clean on purpose):
--   * every app-facing policy targets `to authenticated` explicitly — anon is
--     covered by no policy at all instead of by a role-string check;
--   * `auth.uid()` is always evaluated once per statement via a subselect
--     (`(select auth.uid()) = user_id`) so RLS predicates don't re-plan the
--     auth lookup for every row;
--   * policies are (re)created with drop-then-create so re-running this file
--     CONVERGES a live database to the definitions below — a tightened
--     predicate actually replaces the old policy instead of being skipped.
create extension if not exists pgcrypto;

create table if not exists public.clothing (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,
  subcategory text,
  gender text not null default 'unisex',
  color text[] not null default '{}',
  sizes text[] not null default '{}',
  style text,
  brand text,
  occasion text[] not null default '{}',
  price numeric,
  currency text not null default 'USD',
  image_url text not null,
  thumbnail_url text,
  mask_url text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clothing_category_idx on public.clothing (category);
create index if not exists clothing_subcategory_idx on public.clothing (subcategory);
create index if not exists clothing_style_idx on public.clothing (style);
create index if not exists clothing_brand_idx on public.clothing (brand);
create index if not exists clothing_created_idx on public.clothing (created_at desc);

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clothing_items'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clothing_items'
      and column_name in ('clothing_id', 'name', 'wear_count')
  ) then
    if exists (select 1 from public.clothing_items) then
      raise exception 'Legacy public.clothing_items has rows but no OOTDify shape; resolve it manually before re-running this schema.';
    end if;
    drop table public.clothing_items;
  end if;
end $$;

create table if not exists public.clothing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  clothing_id uuid references public.clothing (id) on delete set null,
  name text,
  category text,
  color text,
  size text,
  style text,
  brand text,
  season text,
  occasion text[] not null default '{}',
  image_url text,
  tags text[] not null default '{}',
  wear_count int not null default 0,
  last_worn timestamptz,
  created_at timestamptz not null default now()
);

alter table public.clothing_items add column if not exists size text;
alter table public.clothing_items add column if not exists season text;
alter table public.clothing_items add column if not exists occasion text[] not null default '{}';

create index if not exists clothing_items_user_idx on public.clothing_items (user_id);
-- FK column: without this the Performance Advisor flags unindexed foreign keys
-- (parent-side deletes/joins would scan the whole wardrobe).
create index if not exists clothing_items_clothing_id_idx on public.clothing_items (clothing_id);

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text,
  first_name text,
  last_name text,
  gender text,
  avatar_url text,
  body_photo_url text,
  preferred_styles text[] not null default '{}',
  preferred_colors text[] not null default '{}',
  sizes text[] not null default '{}',
  preferred_categories text[] not null default '{}',
  preferred_occasions text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Newer profile fields, added idempotently for databases that already ran this file.
alter table public.user_profiles add column if not exists first_name text;
alter table public.user_profiles add column if not exists last_name text;
alter table public.user_profiles add column if not exists gender text;

create table if not exists public.body_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  detection jsonb not null default '{}',
  pose jsonb not null default '{}',
  segmentation jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists body_photos_user_idx on public.body_photos (user_id, created_at desc);

create table if not exists public.try_on_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body_photo_id uuid references public.body_photos (id) on delete set null,
  clothing_ids jsonb not null default '[]',
  status text not null default 'uploading',
  result_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists try_on_jobs_user_idx on public.try_on_jobs (user_id, created_at desc);
create index if not exists try_on_jobs_body_photo_id_idx on public.try_on_jobs (body_photo_id);

create table if not exists public.saved_outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  occasion text,
  clothing_ids jsonb not null default '[]',
  try_on_id uuid references public.try_on_jobs (id) on delete set null,
  result_url text,
  scheduled_date date,
  created_at timestamptz not null default now()
);
alter table public.saved_outfits add column if not exists scheduled_date date;

create index if not exists saved_outfits_user_idx on public.saved_outfits (user_id, created_at desc);
create index if not exists saved_outfits_try_on_id_idx on public.saved_outfits (try_on_id);

-- Style calendar: one planned look per day (owner-only). The app upserts by
-- (user_id, plan_date) so re-picking an outfit for a day replaces the plan.
create table if not exists public.outfit_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date date not null,
  outfit_id uuid references public.saved_outfits (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create index if not exists outfit_plans_user_date_idx on public.outfit_plans (user_id, plan_date);
create index if not exists outfit_plans_outfit_id_idx on public.outfit_plans (outfit_id);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('clothing', 'item')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

create index if not exists favorites_user_idx on public.favorites (user_id);

create table if not exists public.recently_viewed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  clothing_id uuid not null references public.clothing (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, clothing_id)
);

create index if not exists recently_viewed_user_idx on public.recently_viewed (user_id, viewed_at desc);
create index if not exists recently_viewed_clothing_id_idx on public.recently_viewed (clothing_id);

-- Policy helper: (RE)creates a policy so re-running this file always converges
-- the live policy set to the definitions below — a tightened predicate
-- replaces the old policy instead of being skipped as "already present".
-- Every policy is scoped `to authenticated`; anon matches nothing anywhere.
-- Dropped at the end of the file so it never remains callable.
create or replace function public._apply_policy(
  p_policy text, p_table regclass, p_command text, p_using text, p_check text default null
) returns void language plpgsql set search_path = public as $$
begin
  execute format('drop policy if exists %I on %s', p_policy, p_table::text);
  case upper(p_command)
    when 'SELECT' then
      execute format('create policy %I on %s for select to authenticated using (%s)', p_policy, p_table::text, p_using);
    when 'DELETE' then
      execute format('create policy %I on %s for delete to authenticated using (%s)', p_policy, p_table::text, p_using);
    when 'INSERT' then
      execute format('create policy %I on %s for insert to authenticated with check (%s)', p_policy, p_table::text, coalesce(p_check, p_using));
    when 'UPDATE' then
      execute format('create policy %I on %s for update to authenticated using (%s) with check (%s)', p_policy, p_table::text, p_using, coalesce(p_check, p_using));
    else
      raise exception 'Unsupported policy command: %', upper(p_command);
  end case;
end $$;

-- Only the file's own role (postgres/supabase_admin) may call this; it drops
-- and recreates policies, so no client role gets it — not even authenticated.
revoke execute on function public._apply_policy(text, regclass, text, text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- COMMUNITY — public outfit posts, a social graph, and 1:1 chat.
-- Unlike every other table here, community content is intentionally readable by
-- ALL authenticated users (that is the point of a feed). Writes remain strictly
-- owner-scoped. Apply this whole block to your Supabase project before using
-- the Community tab; until then the screens surface a clear "not available"
-- state rather than showing fake data.
-- ---------------------------------------------------------------------------

-- A post shares an outfit (optionally linked to one of the author's saved
-- outfits) with the community. image_urls holds the resolved, publicly readable
-- catalog image URLs for the shared pieces.
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  saved_outfit_id uuid references public.saved_outfits (id) on delete set null,
  title text,
  caption text,
  image_urls jsonb not null default '[]',
  like_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists community_posts_created_idx on public.community_posts (created_at desc);
create index if not exists community_posts_user_idx on public.community_posts (user_id);
create index if not exists community_posts_saved_outfit_id_idx on public.community_posts (saved_outfit_id);

create table if not exists public.community_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists community_likes_post_idx on public.community_likes (post_id);
create index if not exists community_likes_user_id_idx on public.community_likes (user_id);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists community_comments_post_idx on public.community_comments (post_id, created_at);
create index if not exists community_comments_user_id_idx on public.community_comments (user_id);

create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index if not exists follows_followee_idx on public.follows (followee_id);

-- 1:1 chat. A conversation is just a container; created_by records who started
-- it (so they may add the other participant), and the participants row decides
-- who may read it. last_read_at powers unread badges.
--
-- The same table also holds PUBLIC GROUP ROOMS: when is_public is true the row
-- carries a title + category and any signed-in user may discover it and join by
-- inserting their own participant row. 1:1 DMs leave those columns null and set
-- is_public = false, so their membership rule (above) is unchanged.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations add column if not exists created_by uuid not null references auth.users (id) on delete cascade default auth.uid();
-- Group-room metadata. All nullable/false for 1:1 DMs, so existing rows and the
-- DM flow are untouched by these additions.
alter table public.conversations add column if not exists title text;
alter table public.conversations add column if not exists category text;
alter table public.conversations add column if not exists is_public boolean not null default false;

create index if not exists conversations_created_by_idx on public.conversations (created_by);
-- Discovery index: the rooms list filters on is_public and orders by recency.
create index if not exists conversations_public_idx on public.conversations (is_public, updated_at desc);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_idx on public.conversation_participants (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_sender_id_idx on public.messages (sender_id);

do $$ begin
  alter table public.community_posts             enable row level security;
  alter table public.community_likes             enable row level security;
  alter table public.community_comments          enable row level security;
  alter table public.follows                     enable row level security;
  alter table public.conversations               enable row level security;
  alter table public.conversation_participants  enable row level security;
  alter table public.messages                    enable row level security;
end $$;

-- Helper: is the current user a participant of a conversation?
create or replace function public.is_conversation_participant(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conv and user_id = (select auth.uid())
  );
$$;

-- Helper: is the current user the CREATOR of this conversation? SECURITY
-- DEFINER so the policy can read conversations.created_by without inheriting
-- that table's own participant-only SELECT policy (which would recurse).
create or replace function public._is_conv_creator(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations
    where id = conv and created_by = (select auth.uid())
  );
$$;

-- Helper: how many participants a conversation already has. SECURITY DEFINER
-- because a policy on conversation_participants may not query that same table
-- through its own policies — Postgres would raise infinite recursion.
create or replace function public._conv_participant_count(conv uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from public.conversation_participants
  where conversation_id = conv;
$$;

-- Helper: is this a PUBLIC GROUP ROOM (discoverable, anyone may join)?
-- SECURITY DEFINER for the same reason as _is_conv_creator: the policy that
-- calls it lives on conversations, so reading conversations through that
-- table's own SELECT policy would recurse.
create or replace function public._is_public_conversation(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations
    where id = conv and is_public
  );
$$;

-- Denormalized counts on community_posts. Clients have NO update policy on
-- posts, so these are maintained only by these triggers (owner = postgres).
create or replace function public._sync_post_counts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.community_posts set
    like_count = (select count(*) from public.community_likes where post_id = coalesce(new.post_id, old.post_id)),
    comment_count = (select count(*) from public.community_comments where post_id = coalesce(new.post_id, old.post_id))
  where id = coalesce(new.post_id, old.post_id);
  return null;
end $$;

drop trigger if exists community_likes_count_trg on public.community_likes;
create trigger community_likes_count_trg
  after insert or delete on public.community_likes
  for each row execute function public._sync_post_counts();

drop trigger if exists community_comments_count_trg on public.community_comments;
create trigger community_comments_count_trg
  after insert or delete on public.community_comments
  for each row execute function public._sync_post_counts();

-- Keep conversations.updated_at fresh so the chat list sorts by last activity.
create or replace function public._touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists messages_touch_conversation_trg on public.messages;
create trigger messages_touch_conversation_trg
  after insert on public.messages
  for each row execute function public._touch_conversation();

-- These helpers exist FOR the policies below: each one reads a table whose own
-- RLS would hide the row being checked (which would recurse), hence SECURITY
-- DEFINER. Restrict execution to the role that actually evaluates the
-- policies (authenticated); anon and every other role get nothing. Trigger
-- functions never run as invokers — no role needs to call them.
revoke execute on function public.is_conversation_participant(uuid) from public, anon;
grant  execute on function public.is_conversation_participant(uuid) to authenticated;
revoke execute on function public._is_conv_creator(uuid) from public, anon;
grant  execute on function public._is_conv_creator(uuid) to authenticated;
revoke execute on function public._conv_participant_count(uuid) from public, anon;
grant  execute on function public._conv_participant_count(uuid) to authenticated;
revoke execute on function public._is_public_conversation(uuid) from public, anon;
grant  execute on function public._is_public_conversation(uuid) to authenticated;
revoke execute on function public._sync_post_counts() from public, anon, authenticated;
revoke execute on function public._touch_conversation() from public, anon, authenticated;

-- Feed: every authenticated user can read posts; only the author writes.
select public._apply_policy('community_posts_select', 'public.community_posts', 'select', 'true');
select public._apply_policy('community_posts_insert', 'public.community_posts', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('community_posts_delete', 'public.community_posts', 'delete', '(select auth.uid()) = user_id');

select public._apply_policy('community_likes_select', 'public.community_likes', 'select', 'true');
select public._apply_policy('community_likes_insert', 'public.community_likes', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('community_likes_delete', 'public.community_likes', 'delete', '(select auth.uid()) = user_id');

select public._apply_policy('community_comments_select', 'public.community_comments', 'select', 'true');
select public._apply_policy('community_comments_insert', 'public.community_comments', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('community_comments_delete', 'public.community_comments', 'delete', '(select auth.uid()) = user_id');

-- Follows are readable by anyone signed in; you only create/drop your own.
select public._apply_policy('follows_select', 'public.follows', 'select', 'true');
select public._apply_policy('follows_insert', 'public.follows', 'insert', '(select auth.uid()) = follower_id');
select public._apply_policy('follows_delete', 'public.follows', 'delete', '(select auth.uid()) = follower_id');

-- Conversations: participants can read the container. PUBLIC rooms are readable
-- by everyone (that is how they are discoverable); the creator may insert it.
select public._apply_policy('conversations_select', 'public.conversations', 'select', 'public.is_conversation_participant(id) or is_public');
select public._apply_policy('conversations_insert', 'public.conversations', 'insert', '(select auth.uid()) = created_by');
select public._apply_policy('conversations_update', 'public.conversations', 'update', 'public.is_conversation_participant(id)');
-- A room's creator may delete their own room (cascades to its messages).
select public._apply_policy('conversations_delete', 'public.conversations', 'delete', '(select auth.uid()) = created_by');

-- You may add yourself to any PUBLIC room (that is how everyone-can-join works)
-- or to the fixed shared room; the conversation's creator may add their own row
-- and, for a 1:1, the other person's row: _conv_participant_count < 2 is read at
-- statement start and the client inserts the two rows as sequential statements,
-- so the second insert sees the first. Result: a private conversation can never
-- exceed two people, and nobody can inject themselves into a private
-- conversation they weren't invited to.
select public._apply_policy('conversation_participants_select', 'public.conversation_participants', 'select', 'public.is_conversation_participant(conversation_id)');
select public._apply_policy('conversation_participants_insert', 'public.conversation_participants', 'insert',
  '(user_id = (select auth.uid()) and conversation_id = ''4f544444-0000-4000-8000-00000000c0de''::uuid)
   or (user_id = (select auth.uid()) and public._is_public_conversation(conversation_id))
   or (public._is_conv_creator(conversation_id) and public._conv_participant_count(conversation_id) < 2)');
select public._apply_policy('conversation_participants_update', 'public.conversation_participants', 'update', 'user_id = (select auth.uid())');
select public._apply_policy('conversation_participants_delete', 'public.conversation_participants', 'delete', 'user_id = (select auth.uid()) or exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = (select auth.uid()))');

-- Minimal public directory so feed/chat can show a real name + avatar next to
-- posts and messages. This replaces the old SECURITY DEFINER view (flagged by
-- the Security Advisor) with a narrow mirror table:
--
--   * user_profiles keeps its owner-only RLS and is NOT readable cross-user;
--   * user_directory holds only the four public columns (no preferences, no
--     body photos) and is readable by any authenticated user via its own RLS
--     policy — anon has no policy and no grant;
--   * the view over it is security_invoker, so it inherits those plain grants
--     and policies instead of running with definer rights;
--   * only triggers/backfill write it — there are no INSERT/UPDATE/DELETE
--     policies, so clients cannot write the mirror even for their own row
--     (their own profile row still syncs through the trigger below).
create table if not exists public.user_directory (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  first_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.user_directory enable row level security;

select public._apply_policy('user_directory_select', 'public.user_directory', 'select', 'true');
-- Defence in depth: even though RLS already denies everything without a
-- policy, take away the default table grants for the client roles too — the
-- mirror is read-only for them by design.
revoke insert, update, delete on public.user_directory from anon, authenticated, service_role;

-- Mirror sync: SECURITY DEFINER so it can write the mirror regardless of which
-- role performed the user_profiles change (client upsert or backend service
-- role). search_path pinned so no object lookup can be hijacked.
create or replace function public._sync_user_directory() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.user_directory where user_id = old.user_id;
    return old;
  end if;
  insert into public.user_directory (user_id, display_name, first_name, avatar_url, updated_at)
  values (new.user_id, new.display_name, new.first_name, new.avatar_url, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        first_name   = excluded.first_name,
        avatar_url   = excluded.avatar_url,
        updated_at   = now();
  return new;
end $$;

-- Trigger functions never run as invokers — no client role needs EXECUTE.
revoke execute on function public._sync_user_directory() from public, anon, authenticated, service_role;

drop trigger if exists user_profiles_directory_sync_trg on public.user_profiles;
create trigger user_profiles_directory_sync_trg
  after insert or update or delete on public.user_profiles
  for each row execute function public._sync_user_directory();

-- Backfill (idempotent: on conflict refreshes from the source of truth, so
-- re-running this file also repairs any historical drift).
insert into public.user_directory (user_id, display_name, first_name, avatar_url)
select user_id, display_name, first_name, avatar_url
from public.user_profiles
on conflict (user_id) do update
  set display_name = excluded.display_name,
      first_name   = excluded.first_name,
      avatar_url   = excluded.avatar_url,
      updated_at   = now();

-- security_invoker: access is decided by the caller's own rights on
-- user_directory (authenticated: select allowed; anon: nothing) — verified
-- against both roles in the local-stack test.
drop view if exists public.community_directory;
create view public.community_directory with (security_invoker = true) as
  select user_id, display_name, first_name, avatar_url
  from public.user_directory;

revoke all on public.community_directory from anon;
grant select on public.community_directory to authenticated;

-- Messages: only participants can read; only participants can send.
select public._apply_policy('messages_select', 'public.messages', 'select', 'public.is_conversation_participant(conversation_id)');
select public._apply_policy('messages_insert', 'public.messages', 'insert', 'public.is_conversation_participant(conversation_id) and (select auth.uid()) = sender_id');

-- Enable realtime for live chat + feed updates.
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.community_posts;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.community_comments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.community_likes;
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('users',     'users',     false, 10 * 1024 * 1024, array['image/jpeg','image/png','image/webp']),
  ('wardrobe',  'wardrobe',  false, 10 * 1024 * 1024, array['image/jpeg','image/png','image/webp']),
  ('clothing',  'clothing',  true,  10 * 1024 * 1024, array['image/jpeg','image/png','image/webp']),
  ('tryons',    'tryons',    false, 20 * 1024 * 1024, array['image/jpeg','image/png','image/webp']),
  ('avatars',   'avatars',   false,  5 * 1024 * 1024, array['image/jpeg','image/png','image/webp']),
  -- Public copies of images the author has explicitly shared to the Community
  -- feed. Sharing copies bytes here so other users can view them without ever
  -- getting access to the private wardrobe/avatars buckets.
  ('community', 'community', true,  10 * 1024 * 1024, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

do $$ begin
  alter table public.clothing       enable row level security;
  alter table public.clothing_items enable row level security;
  alter table public.user_profiles  enable row level security;
  alter table public.body_photos    enable row level security;
  alter table public.try_on_jobs    enable row level security;
  alter table public.saved_outfits  enable row level security;
  alter table public.outfit_plans   enable row level security;
  alter table public.favorites      enable row level security;
  alter table public.recently_viewed enable row level security;
end $$;

select public._apply_policy('clothing_select', 'public.clothing', 'select', 'true');

select public._apply_policy('clothing_items_select', 'public.clothing_items', 'select', '(select auth.uid()) = user_id');
select public._apply_policy('clothing_items_insert', 'public.clothing_items', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('clothing_items_update', 'public.clothing_items', 'update', '(select auth.uid()) = user_id');
select public._apply_policy('clothing_items_delete', 'public.clothing_items', 'delete', '(select auth.uid()) = user_id');

select public._apply_policy('user_profiles_select', 'public.user_profiles', 'select', '(select auth.uid()) = user_id');
select public._apply_policy('user_profiles_insert', 'public.user_profiles', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('user_profiles_update', 'public.user_profiles', 'update', '(select auth.uid()) = user_id');

select public._apply_policy('body_photos_select', 'public.body_photos', 'select', '(select auth.uid()) = user_id');
select public._apply_policy('body_photos_insert', 'public.body_photos', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('body_photos_delete', 'public.body_photos', 'delete', '(select auth.uid()) = user_id');

select public._apply_policy('try_on_jobs_select', 'public.try_on_jobs', 'select', '(select auth.uid()) = user_id');
select public._apply_policy('try_on_jobs_insert', 'public.try_on_jobs', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('try_on_jobs_update', 'public.try_on_jobs', 'update', '(select auth.uid()) = user_id');
select public._apply_policy('try_on_jobs_delete', 'public.try_on_jobs', 'delete', '(select auth.uid()) = user_id');

select public._apply_policy('saved_outfits_select', 'public.saved_outfits', 'select', '(select auth.uid()) = user_id');
select public._apply_policy('saved_outfits_insert', 'public.saved_outfits', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('saved_outfits_update', 'public.saved_outfits', 'update', '(select auth.uid()) = user_id');
select public._apply_policy('saved_outfits_delete', 'public.saved_outfits', 'delete', '(select auth.uid()) = user_id');

select public._apply_policy('outfit_plans_select', 'public.outfit_plans', 'select', '(select auth.uid()) = user_id');
select public._apply_policy('outfit_plans_insert', 'public.outfit_plans', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('outfit_plans_update', 'public.outfit_plans', 'update', '(select auth.uid()) = user_id');
select public._apply_policy('outfit_plans_delete', 'public.outfit_plans', 'delete', '(select auth.uid()) = user_id');

select public._apply_policy('favorites_select', 'public.favorites', 'select', '(select auth.uid()) = user_id');
select public._apply_policy('favorites_insert', 'public.favorites', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('favorites_delete', 'public.favorites', 'delete', '(select auth.uid()) = user_id');

select public._apply_policy('recently_viewed_select', 'public.recently_viewed', 'select', '(select auth.uid()) = user_id');
select public._apply_policy('recently_viewed_insert', 'public.recently_viewed', 'insert', '(select auth.uid()) = user_id');
select public._apply_policy('recently_viewed_update', 'public.recently_viewed', 'update', '(select auth.uid()) = user_id');
select public._apply_policy('recently_viewed_delete', 'public.recently_viewed', 'delete', '(select auth.uid()) = user_id');

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='itinerary_plans'
  ) then
    alter table public.itinerary_plans enable row level security;
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='itinerary_plans' and column_name='user_id'
    ) then
      perform public._apply_policy('itinerary_plans_select', 'public.itinerary_plans', 'select', '(select auth.uid()) = user_id');
      perform public._apply_policy('itinerary_plans_insert', 'public.itinerary_plans', 'insert', '(select auth.uid()) = user_id');
      perform public._apply_policy('itinerary_plans_update', 'public.itinerary_plans', 'update', '(select auth.uid()) = user_id');
      perform public._apply_policy('itinerary_plans_delete', 'public.itinerary_plans', 'delete', '(select auth.uid()) = user_id');
    end if;
  end if;
end $$;

-- Storage policies, recreated drop-then-create so re-running this file
-- converges them exactly like the table policies above (the old
-- if-not-exists guards silently kept stale definitions). Reads of the two
-- PUBLIC buckets ('clothing', 'community') need no policy at all for their
-- public URLs; the policies below only gate the API/signed-URL path.
select public._apply_policy('catalog_public_read_ootdify', 'storage.objects', 'select', 'bucket_id = ''clothing''');
select public._apply_policy('community_read_ootdify', 'storage.objects', 'select', 'bucket_id = ''community''');
select public._apply_policy('community_insert_ootdify', 'storage.objects', 'insert', 'bucket_id = ''community'' and (select auth.uid())::text = owner_id');
select public._apply_policy('community_delete_ootdify', 'storage.objects', 'delete', 'bucket_id = ''community'' and (select auth.uid())::text = owner_id');
select public._apply_policy('user_storage_select_ootdify', 'storage.objects', 'select', 'bucket_id in (''users'',''wardrobe'',''tryons'',''avatars'') and (select auth.uid())::text = owner_id');
select public._apply_policy('user_storage_insert_ootdify', 'storage.objects', 'insert', 'bucket_id in (''users'',''wardrobe'',''tryons'',''avatars'') and (select auth.uid())::text = owner_id');
select public._apply_policy('user_storage_update_ootdify', 'storage.objects', 'update', 'bucket_id in (''users'',''wardrobe'',''tryons'',''avatars'') and (select auth.uid())::text = owner_id');
select public._apply_policy('user_storage_delete_ootdify', 'storage.objects', 'delete', 'bucket_id in (''users'',''wardrobe'',''tryons'',''avatars'') and (select auth.uid())::text = owner_id');
-- Profile photos are deliberately shared: any signed-in user may READ avatar
-- objects so chat and the feed can show real photos (the directory view
-- already exposes each avatar ref). Writes stay owner-only and anon stays
-- locked out — the bucket itself remains private (no public URLs).
select public._apply_policy('avatars_read_ootdify', 'storage.objects', 'select', 'bucket_id = ''avatars''');

-- Clean up the policy helper (both names: this file's current one and the
-- legacy one older checkouts still call) so neither remains executable.
drop function if exists public._apply_policy(text, regclass, text, text, text);
drop function if exists public._ensure_policy(text, regclass, text, text, text);

-- Seed catalog. Guarded so re-running this file never duplicates seed rows:
-- `on conflict do nothing` alone cannot help because each row gets a random
-- generated id, so there is no key to conflict on. Skip the whole block when
-- seed rows already exist (HF-ingested rows carry metadata.source='huggingface'
-- and are unaffected).
do $$
begin
  if not exists (select 1 from public.clothing where metadata->>'source' = 'seed') then
    insert into public.clothing
      (name, description, category, subcategory, gender, color, sizes, style, brand, occasion, price, currency, image_url, thumbnail_url, metadata)
    values
  ('Classic White T-Shirt', 'Essential crew-neck tee in heavyweight cotton.', 'Tops', 'T-Shirts', 'unisex',
   array['white'], array['S','M','L','XL'], 'Minimalist', 'Essentials', array['Casual','School','Beach'], 19.99, 'USD',
   'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Oversized Graphic Hoodie', 'Relaxed-fit hoodie with a subtle front print.', 'Tops', 'Hoodies', 'unisex',
   array['black'], array['S','M','L','XL'], 'Streetwear', 'Urban Co', array['Casual','School','Travel'], 49.99, 'USD',
   'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Linen Button-Up Shirt', 'Breathable linen shirt for warm days.', 'Tops', 'Shirts', 'men',
   array['beige'], array['S','M','L','XL'], 'Smart Casual', 'Coastal', array['Office','Interview','Date'], 39.99, 'USD',
   'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Wide-Leg Cargo Pants', 'Oversized cargos with utility pockets.', 'Bottoms', 'Trousers', 'unisex',
   array['olive'], array['S','M','L','XL'], 'Streetwear', 'Street Lab', array['Casual','Travel'], 54.99, 'USD',
   'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Slim-Fit Black Jeans', 'Classic slim jeans with a bit of stretch.', 'Bottoms', 'Jeans', 'men',
   array['black'], array['29','30','31','32','33'], 'Minimalist', 'Denim Co', array['Casual','Date','Party'], 64.99, 'USD',
   'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Pleated Midi Skirt', 'Elegant pleated skirt with a smooth waistband.', 'Bottoms', 'Skirts', 'women',
   array['navy'], array['XS','S','M','L'], 'Elegant', 'Editorial', array['Office','Date','Formal'], 44.99, 'USD',
   'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Clean White Sneakers', 'Minimal leather low-top sneakers.', 'Shoes', 'Sneakers', 'unisex',
   array['white'], array['39','40','41','42','43','44'], 'Minimalist', 'KickLab', array['Casual','School','Travel'], 79.99, 'USD',
   'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Crossbody Mini Bag', 'Compact crossbody for essentials on the go.', 'Bags', 'Crossbody', 'unisex',
   array['brown'], array['One Size'], 'Casual', 'Wander', array['Casual','Travel','Party'], 59.99, 'USD',
   'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Trench Coat', 'Timeless double-breasted trench.', 'Outerwear', 'Coats', 'women',
   array['khaki'], array['S','M','L'], 'Elegant', 'Editorial', array['Formal','Office','Interview'], 129.99, 'USD',
   'https://images.unsplash.com/photo-1520975954732-35dd22299614?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1520975954732-35dd22299614?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Little Black Dress', 'The classic LBD for evenings out.', 'Dresses', 'Mini Dresses', 'women',
   array['black'], array['XS','S','M','L'], 'Elegant', 'Noir', array['Party','Date','Formal'], 89.99, 'USD',
   'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed'))
    on conflict do nothing;
  end if;
end $$;