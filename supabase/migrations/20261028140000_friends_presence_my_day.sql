-- Friends, online status and My Day.
--
--   friendships   a request from requester to addressee; the addressee accepts
--                 it (status 'accepted') or either side deletes it (decline,
--                 cancel, unfriend). One row per pair, whichever way it went.
--   user_presence one row per user: when the app last checked in, and whether
--                 they share that at all. Friends only, and only when shown.
--   my_day_posts  a photo plus an optional caption that friends can see for
--                 24 hours. The photo lives in the private 'myday' bucket.
--   my_day_views  who has seen a My Day post. Only the post's owner can list
--                 the viewers; a viewer only ever sees their own rows.
--
-- Every timestamp a client could fake (last seen, expiry) is set by a trigger.

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  requester_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- One row per pair: a second request in the other direction is refused (the
-- app accepts the waiting one instead).
create unique index if not exists friendships_pair_uq
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;

-- SECURITY INVOKER: it only reads pairs that include the caller, which the
-- caller's own select policy already allows.
create or replace function private.is_friend(other uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = (select auth.uid()) and f.addressee_id = other)
        or (f.addressee_id = (select auth.uid()) and f.requester_id = other))
  );
$$;

revoke execute on function private.is_friend(uuid) from public, anon;
grant execute on function private.is_friend(uuid) to authenticated;

-- Accepting may only flip the status; the pair and its history stay put.
create or replace function private.guard_friendship()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the request''s status can change' using errcode = '42501';
  end if;
  new.responded_at := now();
  return new;
end;
$$;

drop trigger if exists friendships_guard on public.friendships;
create trigger friendships_guard
  before update on public.friendships
  for each row execute function private.guard_friendship();

drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending' and responded_at is null);

-- Only the person who received the request can accept it.
drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

-- Either side can decline, cancel or unfriend.
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- ---------------------------------------------------------------------------
-- Online status
-- ---------------------------------------------------------------------------
create table if not exists public.user_presence (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  show_status boolean not null default true
);

alter table public.user_presence enable row level security;

-- The server's clock decides "last seen", so nobody can pin themselves online.
create or replace function private.stamp_presence()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.last_seen_at := now();
  return new;
end;
$$;

drop trigger if exists user_presence_stamp on public.user_presence;
create trigger user_presence_stamp
  before insert or update on public.user_presence
  for each row execute function private.stamp_presence();

drop policy if exists user_presence_select on public.user_presence;
create policy user_presence_select on public.user_presence for select to authenticated
  using (user_id = (select auth.uid()) or (show_status and private.is_friend(user_id)));

drop policy if exists user_presence_insert on public.user_presence;
create policy user_presence_insert on public.user_presence for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_presence_update on public.user_presence;
create policy user_presence_update on public.user_presence for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- My Day
-- ---------------------------------------------------------------------------
create table if not exists public.my_day_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  image_ref text not null,
  caption text check (caption is null or char_length(caption) <= 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index if not exists my_day_posts_user_idx on public.my_day_posts (user_id, created_at desc);
create index if not exists my_day_posts_expires_idx on public.my_day_posts (expires_at);

alter table public.my_day_posts enable row level security;

-- A post lasts exactly 24 hours from when the server received it, and its
-- photo must sit in the poster's own folder of the 'myday' bucket.
create or replace function private.stamp_my_day()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  if new.image_ref not like 'myday/' || new.user_id::text || '/%' then
    raise exception 'My Day photos must be uploaded to your own folder' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists my_day_posts_stamp on public.my_day_posts;
create trigger my_day_posts_stamp
  before insert on public.my_day_posts
  for each row execute function private.stamp_my_day();

drop policy if exists my_day_posts_select on public.my_day_posts;
create policy my_day_posts_select on public.my_day_posts for select to authenticated
  using (user_id = (select auth.uid()) or (expires_at > now() and private.is_friend(user_id)));

drop policy if exists my_day_posts_insert on public.my_day_posts;
create policy my_day_posts_insert on public.my_day_posts for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists my_day_posts_delete on public.my_day_posts;
create policy my_day_posts_delete on public.my_day_posts for delete to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.my_day_views (
  post_id uuid not null references public.my_day_posts (id) on delete cascade,
  viewer_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id)
);

create index if not exists my_day_views_viewer_idx on public.my_day_views (viewer_id);

alter table public.my_day_views enable row level security;

-- The poster sees everyone who viewed; a viewer sees only their own marks.
drop policy if exists my_day_views_select on public.my_day_views;
create policy my_day_views_select on public.my_day_views for select to authenticated
  using (
    viewer_id = (select auth.uid())
    or exists (
      select 1 from public.my_day_posts p
      where p.id = post_id and p.user_id = (select auth.uid())
    )
  );

-- You can only mark a post you are allowed to see (the posts policy applies
-- inside this check), and never your own.
drop policy if exists my_day_views_insert on public.my_day_views;
create policy my_day_views_insert on public.my_day_views for insert to authenticated
  with check (
    viewer_id = (select auth.uid())
    and exists (
      select 1 from public.my_day_posts p
      where p.id = post_id and p.user_id <> (select auth.uid())
    )
  );

-- Private bucket: photos are read through signed URLs, and only while a post
-- that uses them is still visible to the reader.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('myday', 'myday', false, 10 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists myday_insert_ootdify on storage.objects;
create policy myday_insert_ootdify on storage.objects for insert to authenticated
  with check (
    bucket_id = 'myday'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists myday_select_ootdify on storage.objects;
create policy myday_select_ootdify on storage.objects for select to authenticated
  using (
    bucket_id = 'myday'
    and (
      owner_id = (select auth.uid())::text
      or exists (
        select 1 from public.my_day_posts p
        where p.image_ref = 'myday/' || name and p.expires_at > now()
      )
    )
  );

drop policy if exists myday_delete_ootdify on storage.objects;
create policy myday_delete_ootdify on storage.objects for delete to authenticated
  using (bucket_id = 'myday' and owner_id = (select auth.uid())::text);
