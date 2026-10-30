-- Sharing posts: reshare to the feed, send in a chat, save, hide.
--
--   community_posts.reshared_from  the post this one reshares (always the
--                                  original, never a reshare of a reshare;
--                                  null again if the original is deleted)
--   community_posts.reshare_count  kept by a trigger, like like_count
--   messages.shared_post_id        a post sent in a chat, shown as a card
--   saved_posts                    my bookmarks (only I can see them)
--   hidden_posts                   posts I hid from my feed (only mine)

-- ------------------------------------------------------------- reshares

alter table public.community_posts add column if not exists reshared_from uuid
  references public.community_posts (id) on delete set null;
alter table public.community_posts add column if not exists reshare_count int not null default 0;

create index if not exists community_posts_reshared_from_idx on public.community_posts (reshared_from);

-- A reshare points at the original post, and a reshare of a reshare is
-- pointed at that original too, so chains stay one level deep.
create or replace function private.check_post_reshare()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  root uuid;
begin
  if new.reshared_from is null then
    return new;
  end if;
  select coalesce(p.reshared_from, p.id) into root
  from public.community_posts p where p.id = new.reshared_from;
  if root is null then
    raise exception 'That post no longer exists' using errcode = '23503';
  end if;
  new.reshared_from := root;
  new.reshare_count := 0;
  return new;
end;
$$;

revoke execute on function private.check_post_reshare() from public, anon, authenticated;

drop trigger if exists community_posts_check_reshare on public.community_posts;
create trigger community_posts_check_reshare
  before insert on public.community_posts
  for each row execute function private.check_post_reshare();

create or replace function private.sync_reshare_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.reshared_from, old.reshared_from);
begin
  if target is not null then
    update public.community_posts
    set reshare_count = (select count(*) from public.community_posts r where r.reshared_from = target)
    where id = target;
  end if;
  return null;
end;
$$;

revoke execute on function private.sync_reshare_count() from public, anon, authenticated;

drop trigger if exists community_posts_reshare_count on public.community_posts;
create trigger community_posts_reshare_count
  after insert or delete on public.community_posts
  for each row execute function private.sync_reshare_count();

-- ------------------------------------------------------- posts in chats

alter table public.messages add column if not exists shared_post_id uuid
  references public.community_posts (id) on delete set null;

-- Unsending a message also drops the post it carried.
create or replace function private.guard_message_shared_post()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if new.unsent_at is not null and old.unsent_at is null then
    new.shared_post_id := null;
  elsif new.shared_post_id is distinct from old.shared_post_id then
    raise exception 'A sent post can only be unsent' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_shared_post on public.messages;
create trigger messages_guard_shared_post
  before update on public.messages
  for each row execute function private.guard_message_shared_post();

-- ------------------------------------------------------- saved / hidden

create table if not exists public.saved_posts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id uuid not null references public.community_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists saved_posts_user_idx on public.saved_posts (user_id, created_at desc);

alter table public.saved_posts enable row level security;

drop policy if exists saved_posts_select on public.saved_posts;
create policy saved_posts_select on public.saved_posts for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists saved_posts_insert on public.saved_posts;
create policy saved_posts_insert on public.saved_posts for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists saved_posts_delete on public.saved_posts;
create policy saved_posts_delete on public.saved_posts for delete to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.hidden_posts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id uuid not null references public.community_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.hidden_posts enable row level security;

drop policy if exists hidden_posts_select on public.hidden_posts;
create policy hidden_posts_select on public.hidden_posts for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists hidden_posts_insert on public.hidden_posts;
create policy hidden_posts_insert on public.hidden_posts for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists hidden_posts_delete on public.hidden_posts;
create policy hidden_posts_delete on public.hidden_posts for delete to authenticated
  using (user_id = (select auth.uid()));
