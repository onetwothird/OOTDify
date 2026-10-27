-- Notifications: an in-app inbox plus phone push, for everything that
-- deserves one.
--
--   notifications          one row per thing to tell a user. Only triggers
--                          write it (SECURITY DEFINER), never clients; a user
--                          reads, marks read and deletes their own rows.
--   notification_settings  per-user switches for each kind, quiet hours, and
--                          the language and UTC offset push text is written in.
--   user_presence.status   online / idle / do not disturb, picked by the user.
--   push_tokens            Expo push tokens for the user's devices, registered
--                          through register_push_token() so a phone that
--                          changes account stops notifying the old one.
--
-- Push is sent from the database with pg_net to Expo's push service, right
-- after a notification row is written, so no server has to poll. Messages in
-- the same chat within two minutes are collapsed into one push, nothing is
-- pushed during quiet hours (the inbox still gets it), and the shared
-- everyone-room never notifies (it would be constant).
--
-- Kinds:
--   message          new direct or community message      (messages, group_chats)
--   friend_request   someone wants to be friends           (friends)
--   friend_accepted  your request was accepted             (friends)
--   post_like        someone liked your post               (posts)
--   post_comment     someone commented on your post        (posts)
--   comment_thread   someone commented after you           (posts)
--   my_day           a friend added to their My Day        (my_day)
--   room_join        someone joined a community you made   (communities)
--   my_day_like      someone hearted your My Day           (my_day)
--   my_day_comment   someone commented on your My Day      (my_day)

create extension if not exists pg_net with schema extensions;

-- The status a user picks for themselves. Friends see it as the dot's colour
-- while the user is around; 'dnd' also holds back phone push (the inbox
-- still fills).
alter table public.user_presence add column if not exists status text not null default 'online';
alter table public.user_presence drop constraint if exists user_presence_status_check;
alter table public.user_presence add constraint user_presence_status_check
  check (status in ('online', 'idle', 'dnd'));

-- ---------------------------------------------------------------------------
-- My Day hearts and comments
--
-- A heart or comment on a post is between the commenter and the post's owner:
-- the owner sees them all, everyone else only their own. You can only react
-- to a post you are allowed to see, and never to your own.
-- ---------------------------------------------------------------------------
create table if not exists public.my_day_reactions (
  post_id uuid not null references public.my_day_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists my_day_reactions_user_idx on public.my_day_reactions (user_id);

create table if not exists public.my_day_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.my_day_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists my_day_comments_post_idx on public.my_day_comments (post_id, created_at);
create index if not exists my_day_comments_user_idx on public.my_day_comments (user_id);

alter table public.my_day_reactions enable row level security;
alter table public.my_day_comments enable row level security;

drop policy if exists my_day_reactions_select on public.my_day_reactions;
create policy my_day_reactions_select on public.my_day_reactions for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.my_day_posts p where p.id = post_id and p.user_id = (select auth.uid()))
  );

drop policy if exists my_day_reactions_insert on public.my_day_reactions;
create policy my_day_reactions_insert on public.my_day_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.my_day_posts p where p.id = post_id and p.user_id <> (select auth.uid()))
  );

drop policy if exists my_day_reactions_delete on public.my_day_reactions;
create policy my_day_reactions_delete on public.my_day_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists my_day_comments_select on public.my_day_comments;
create policy my_day_comments_select on public.my_day_comments for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.my_day_posts p where p.id = post_id and p.user_id = (select auth.uid()))
  );

drop policy if exists my_day_comments_insert on public.my_day_comments;
create policy my_day_comments_insert on public.my_day_comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.my_day_posts p where p.id = post_id and p.user_id <> (select auth.uid()))
  );

-- The commenter and the post's owner can both remove a comment.
drop policy if exists my_day_comments_delete on public.my_day_comments;
create policy my_day_comments_delete on public.my_day_comments for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.my_day_posts p where p.id = post_id and p.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete cascade,
  type text not null check (type in (
    'message', 'friend_request', 'friend_accepted', 'post_like',
    'post_comment', 'comment_thread', 'my_day', 'room_join',
    'my_day_like', 'my_day_comment'
  )),
  conversation_id uuid references public.conversations (id) on delete cascade,
  post_id uuid references public.community_posts (id) on delete cascade,
  my_day_post_id uuid references public.my_day_posts (id) on delete cascade,
  preview text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_actor_idx on public.notifications (actor_id);
create index if not exists notifications_conversation_idx on public.notifications (conversation_id);
create index if not exists notifications_post_idx on public.notifications (post_id);
create index if not exists notifications_my_day_post_idx on public.notifications (my_day_post_id);

alter table public.notifications enable row level security;

create table if not exists public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  messages boolean not null default true,
  group_chats boolean not null default true,
  friends boolean not null default true,
  posts boolean not null default true,
  my_day boolean not null default true,
  communities boolean not null default true,
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end smallint check (quiet_end between 0 and 23),
  utc_offset_minutes integer not null default 0 check (utc_offset_minutes between -840 and 840),
  language text not null default 'en' check (language in ('en', 'fil')),
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

create table if not exists public.push_tokens (
  token text primary key check (char_length(token) between 10 and 300),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Marking read is the only change a user may make to a notification.
create or replace function private.guard_notification_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Only read_at can change on a notification' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_guard_update on public.notifications;
create trigger notifications_guard_update
  before update on public.notifications
  for each row execute function private.guard_notification_update();

drop policy if exists notification_settings_select on public.notification_settings;
create policy notification_settings_select on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notification_settings_insert on public.notification_settings;
create policy notification_settings_insert on public.notification_settings for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists notification_settings_update on public.notification_settings;
create policy notification_settings_update on public.notification_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Tokens are readable and removable by their owner; they are only ever
-- written through register_push_token().
drop policy if exists push_tokens_select on public.push_tokens;
create policy push_tokens_select on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists push_tokens_delete on public.push_tokens;
create policy push_tokens_delete on public.push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- A device's token belongs to whoever signed in on it last: registering it
-- moves it away from any previous account.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, me, p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Writing notifications
-- ---------------------------------------------------------------------------

-- Adds one notification unless it is about the recipient's own action or
-- they have switched that kind off.
create or replace function private.notify(
  p_recipient uuid, p_actor uuid, p_type text,
  p_conversation uuid default null, p_post uuid default null, p_preview text default null,
  p_my_day_post uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.notification_settings;
  is_group boolean := false;
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;

  select * into s from public.notification_settings where user_id = p_recipient;

  if p_type = 'message' and p_conversation is not null then
    select (c.is_public or c.title is not null) into is_group
    from public.conversations c where c.id = p_conversation;
  end if;

  if s.user_id is not null and not (
    case
      when p_type = 'message' then s.messages and (not coalesce(is_group, false) or s.group_chats)
      when p_type in ('friend_request', 'friend_accepted') then s.friends
      when p_type in ('post_like', 'post_comment', 'comment_thread') then s.posts
      when p_type in ('my_day', 'my_day_like', 'my_day_comment') then s.my_day
      when p_type = 'room_join' then s.communities
      else true
    end
  ) then
    return;
  end if;

  insert into public.notifications (user_id, actor_id, type, conversation_id, post_id, preview, my_day_post_id)
  values (p_recipient, p_actor, p_type, p_conversation, p_post, left(p_preview, 140), p_my_day_post);
end;
$$;

revoke execute on function private.notify(uuid, uuid, text, uuid, uuid, text, uuid) from public, anon, authenticated;

create or replace function private.on_message_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p record;
begin
  -- The shared everyone-room would notify everyone about everything.
  if new.conversation_id = '4f544444-0000-4000-8000-00000000c0de'::uuid then
    return new;
  end if;
  for p in
    select user_id from public.conversation_participants
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    perform private.notify(p.user_id, new.sender_id, 'message', new.conversation_id, null, new.body);
  end loop;
  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function private.on_message_notify();

create or replace function private.on_friendship_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify(new.addressee_id, new.requester_id, 'friend_request');
  elsif old.status = 'pending' and new.status = 'accepted' then
    perform private.notify(new.requester_id, new.addressee_id, 'friend_accepted');
    -- The request has been answered; it no longer needs attention.
    update public.notifications set read_at = coalesce(read_at, now())
    where user_id = new.addressee_id and actor_id = new.requester_id and type = 'friend_request';
  end if;
  return new;
end;
$$;

drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify
  after insert or update on public.friendships
  for each row execute function private.on_friendship_notify();

create or replace function private.on_like_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify(
    (select user_id from public.community_posts where id = new.post_id),
    new.user_id, 'post_like', null, new.post_id
  );
  return new;
end;
$$;

drop trigger if exists community_likes_notify on public.community_likes;
create trigger community_likes_notify
  after insert on public.community_likes
  for each row execute function private.on_like_notify();

create or replace function private.on_comment_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  other record;
begin
  select user_id into owner_id from public.community_posts where id = new.post_id;
  perform private.notify(owner_id, new.user_id, 'post_comment', null, new.post_id, new.body);
  -- Everyone else in the thread hears about it too, once each.
  for other in
    select distinct user_id from public.community_comments
    where post_id = new.post_id and user_id <> new.user_id and user_id is distinct from owner_id
  loop
    perform private.notify(other.user_id, new.user_id, 'comment_thread', null, new.post_id, new.body);
  end loop;
  return new;
end;
$$;

drop trigger if exists community_comments_notify on public.community_comments;
create trigger community_comments_notify
  after insert on public.community_comments
  for each row execute function private.on_comment_notify();

create or replace function private.on_my_day_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  f record;
begin
  -- One heads-up per friend per day is enough, however many posts follow.
  if exists (
    select 1 from public.my_day_posts
    where user_id = new.user_id and id <> new.id and created_at > now() - interval '24 hours'
  ) then
    return new;
  end if;
  for f in
    select case when requester_id = new.user_id then addressee_id else requester_id end as friend_id
    from public.friendships
    where status = 'accepted' and new.user_id in (requester_id, addressee_id)
  loop
    perform private.notify(f.friend_id, new.user_id, 'my_day');
  end loop;
  return new;
end;
$$;

drop trigger if exists my_day_posts_notify on public.my_day_posts;
create trigger my_day_posts_notify
  after insert on public.my_day_posts
  for each row execute function private.on_my_day_notify();

create or replace function private.on_my_day_reaction_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify(
    (select user_id from public.my_day_posts where id = new.post_id),
    new.user_id, 'my_day_like', null, null, null, new.post_id
  );
  return new;
end;
$$;

drop trigger if exists my_day_reactions_notify on public.my_day_reactions;
create trigger my_day_reactions_notify
  after insert on public.my_day_reactions
  for each row execute function private.on_my_day_reaction_notify();

create or replace function private.on_my_day_comment_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify(
    (select user_id from public.my_day_posts where id = new.post_id),
    new.user_id, 'my_day_comment', null, null, new.body, new.post_id
  );
  return new;
end;
$$;

drop trigger if exists my_day_comments_notify on public.my_day_comments;
create trigger my_day_comments_notify
  after insert on public.my_day_comments
  for each row execute function private.on_my_day_comment_notify();

create or replace function private.on_room_join_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  room public.conversations;
begin
  select * into room from public.conversations where id = new.conversation_id;
  if room.is_public then
    perform private.notify(room.created_by, new.user_id, 'room_join', room.id);
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_participants_notify on public.conversation_participants;
create trigger conversation_participants_notify
  after insert on public.conversation_participants
  for each row execute function private.on_room_join_notify();

-- ---------------------------------------------------------------------------
-- Phone push
-- ---------------------------------------------------------------------------
create or replace function private.push_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.notification_settings;
  lang text := 'en';
  local_hour integer;
  actor text;
  room_title text;
  is_group boolean := false;
  title text;
  body text;
  unread integer;
  messages jsonb;
begin
  -- Do not disturb: the inbox gets it, the phone stays quiet.
  if exists (select 1 from public.user_presence where user_id = new.user_id and status = 'dnd') then
    return new;
  end if;

  select * into s from public.notification_settings where user_id = new.user_id;
  if s.user_id is not null then
    lang := s.language;
    -- Quiet hours, in the user's own time: the inbox still gets it.
    if s.quiet_start is not null and s.quiet_end is not null and s.quiet_start <> s.quiet_end then
      local_hour := extract(hour from (now() at time zone 'utc') + make_interval(mins => s.utc_offset_minutes))::integer;
      if (s.quiet_start < s.quiet_end and local_hour >= s.quiet_start and local_hour < s.quiet_end)
         or (s.quiet_start > s.quiet_end and (local_hour >= s.quiet_start or local_hour < s.quiet_end)) then
        return new;
      end if;
    end if;
  end if;

  -- A burst of messages in one chat is one push, not ten.
  if new.type = 'message' and exists (
    select 1 from public.notifications n
    where n.user_id = new.user_id and n.conversation_id = new.conversation_id
      and n.type = 'message' and n.id <> new.id and n.read_at is null
      and n.created_at > now() - interval '2 minutes'
  ) then
    return new;
  end if;

  select coalesce(nullif(d.display_name, ''), nullif(d.first_name, ''), case when lang = 'fil' then 'May isang tao' else 'Someone' end)
    into actor from public.user_directory d where d.user_id = new.actor_id;
  actor := coalesce(actor, case when lang = 'fil' then 'May isang tao' else 'Someone' end);

  if new.conversation_id is not null then
    select c.title, (c.is_public or c.title is not null) into room_title, is_group
    from public.conversations c where c.id = new.conversation_id;
  end if;

  if new.type = 'message' then
    title := case when is_group then coalesce(room_title, actor) else actor end;
    body := case when is_group then actor || ': ' || coalesce(new.preview, '') else coalesce(new.preview, '') end;
  elsif lang = 'fil' then
    title := case new.type
      when 'friend_request' then 'Friend request'
      when 'friend_accepted' then 'Bagong kaibigan'
      when 'post_like' then 'Bagong like'
      when 'post_comment' then 'Bagong comment'
      when 'comment_thread' then 'Bagong comment'
      when 'my_day' then 'My Day'
      when 'room_join' then coalesce(room_title, 'Community')
      when 'my_day_like' then 'My Day'
      when 'my_day_comment' then 'My Day'
    end;
    body := case new.type
      when 'friend_request' then actor || ' ay gustong makipagkaibigan'
      when 'friend_accepted' then 'Tinanggap ni ' || actor || ' ang friend request mo'
      when 'post_like' then 'Ni-like ni ' || actor || ' ang post mo'
      when 'post_comment' then 'Nag-comment si ' || actor || ': ' || coalesce(new.preview, '')
      when 'comment_thread' then 'Nag-comment din si ' || actor || ': ' || coalesce(new.preview, '')
      when 'my_day' then 'May bagong My Day si ' || actor
      when 'room_join' then 'Sumali si ' || actor || ' sa community mo'
      when 'my_day_like' then 'Hinartan ni ' || actor || ' ang My Day mo'
      when 'my_day_comment' then 'Nag-comment si ' || actor || ' sa My Day mo: ' || coalesce(new.preview, '')
    end;
  else
    title := case new.type
      when 'friend_request' then 'Friend request'
      when 'friend_accepted' then 'New friend'
      when 'post_like' then 'New like'
      when 'post_comment' then 'New comment'
      when 'comment_thread' then 'New comment'
      when 'my_day' then 'My Day'
      when 'room_join' then coalesce(room_title, 'Community')
      when 'my_day_like' then 'My Day'
      when 'my_day_comment' then 'My Day'
    end;
    body := case new.type
      when 'friend_request' then actor || ' wants to be friends'
      when 'friend_accepted' then actor || ' accepted your friend request'
      when 'post_like' then actor || ' liked your post'
      when 'post_comment' then actor || ' commented: ' || coalesce(new.preview, '')
      when 'comment_thread' then actor || ' also commented: ' || coalesce(new.preview, '')
      when 'my_day' then actor || ' added to their My Day'
      when 'room_join' then actor || ' joined your community'
      when 'my_day_like' then actor || ' hearted your My Day'
      when 'my_day_comment' then actor || ' commented on your My Day: ' || coalesce(new.preview, '')
    end;
  end if;

  select count(*) into unread from public.notifications where user_id = new.user_id and read_at is null;

  select jsonb_agg(jsonb_build_object(
      'to', t.token,
      'title', title,
      'body', left(body, 180),
      'sound', 'default',
      'priority', 'high',
      'channelId', 'default',
      'badge', unread,
      'data', jsonb_build_object(
        'notificationId', new.id,
        'type', new.type,
        'actorId', new.actor_id,
        'conversationId', new.conversation_id,
        'postId', new.post_id,
        'myDayPostId', new.my_day_post_id
      )
    ))
    into messages
  from public.push_tokens t where t.user_id = new.user_id;

  if messages is null then
    return new;
  end if;

  -- Fire and forget: a failed push never blocks the action that caused it.
  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := messages,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke execute on function private.push_notification() from public, anon, authenticated;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function private.push_notification();

-- Trigger functions never run as invokers; no client role needs EXECUTE.
revoke execute on function private.on_message_notify() from public, anon, authenticated;
revoke execute on function private.on_friendship_notify() from public, anon, authenticated;
revoke execute on function private.on_like_notify() from public, anon, authenticated;
revoke execute on function private.on_comment_notify() from public, anon, authenticated;
revoke execute on function private.on_my_day_notify() from public, anon, authenticated;
revoke execute on function private.on_room_join_notify() from public, anon, authenticated;
revoke execute on function private.on_my_day_reaction_notify() from public, anon, authenticated;
revoke execute on function private.on_my_day_comment_notify() from public, anon, authenticated;

-- Live inbox: the app hears new rows the moment they are written.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
