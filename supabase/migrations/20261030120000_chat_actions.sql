-- Chat actions and conversation settings.
--
-- Messages:
--   reply_to    the message this one answers (same conversation; kept as null
--               if that message is ever deleted outright)
--   edited_at   set when the sender edits a text message (15 minute window)
--   unsent_at   set when the sender unsends for everyone: the body and photo
--               are wiped here, so the text no longer exists for anyone
--
-- message_reactions  one reaction per person per message. Removing a reaction
--                    sets emoji to null instead of deleting the row, so every
--                    change is an INSERT or UPDATE that realtime can filter by
--                    conversation.
-- message_hidden     "remove for you": rows only their owner can see.
--
-- Conversations:
--   chat_theme                         a key from CHAT_THEMES (chatSettings.ts)
--   conversation_participants.muted_until  no message notifications until then
--
-- Rooms: participants can see who the admins are, admins can remove members
-- (never the creator), and the creator grants or revokes admin through
-- set_room_admin().

-- ---------------------------------------------------------------- messages

alter table public.messages add column if not exists reply_to uuid references public.messages (id) on delete set null;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists unsent_at timestamptz;

create or replace function private.check_message_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from public.messages m
    where m.id = new.reply_to and m.conversation_id = new.conversation_id
  ) then
    raise exception 'A reply must answer a message in the same chat' using errcode = '42501';
  end if;
  -- A new message is never born edited or unsent.
  new.edited_at := null;
  new.unsent_at := null;
  return new;
end;
$$;

drop trigger if exists messages_check_reply on public.messages;
create trigger messages_check_reply
  before insert on public.messages
  for each row execute function private.check_message_reply();

-- The only two updates a sender may make: edit a recent text message, or
-- unsend. Everything else about a message is fixed once sent.
create or replace function private.guard_message_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at
     or new.reply_to is distinct from old.reply_to then
    raise exception 'A sent message can only be edited or unsent' using errcode = '42501';
  end if;

  if old.unsent_at is not null then
    raise exception 'This message was unsent' using errcode = '42501';
  end if;

  if new.unsent_at is not null then
    new.unsent_at := now();
    new.body := '';
    new.image_ref := null;
    new.edited_at := old.edited_at;
    return new;
  end if;

  if new.body is distinct from old.body then
    if old.image_ref is not null then
      raise exception 'Photo messages can''t be edited' using errcode = '42501';
    end if;
    if now() - old.created_at > interval '15 minutes' then
      raise exception 'Messages can only be edited for 15 minutes' using errcode = '42501';
    end if;
    new.body := btrim(new.body);
    if new.body = '' then
      raise exception 'Message cannot be empty' using errcode = '23514';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  if new.image_ref is distinct from old.image_ref then
    raise exception 'A sent photo can only be unsent' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_update on public.messages;
create trigger messages_guard_update
  before update on public.messages
  for each row execute function private.guard_message_update();

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (sender_id = (select auth.uid()) and private.is_conversation_participant(conversation_id))
  with check (sender_id = (select auth.uid()));

-- Unsending also clears its reactions and the unread notifications that still
-- quote it. (A push notification already delivered can't be recalled.)
create or replace function private.on_message_unsent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.unsent_at is null and new.unsent_at is not null then
    delete from public.message_reactions where message_id = new.id;
    delete from public.notifications n
    where n.type = 'message'
      and n.conversation_id = new.conversation_id
      and n.actor_id = new.sender_id
      and n.read_at is null
      and n.created_at >= old.created_at
      and n.preview = left(old.body, 140);
  end if;
  return new;
end;
$$;

revoke execute on function private.on_message_unsent() from public, anon, authenticated;

-- ------------------------------------------------------------- reactions

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  emoji text check (emoji is null or char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_reactions_conversation_idx on public.message_reactions (conversation_id);

alter table public.message_reactions enable row level security;

-- conversation_id is copied from the message, and unsent messages take no reactions.
create or replace function private.check_message_reaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  conv uuid;
  gone timestamptz;
begin
  select m.conversation_id, m.unsent_at into conv, gone from public.messages m where m.id = new.message_id;
  if conv is null then
    raise exception 'Message not found' using errcode = '23503';
  end if;
  if gone is not null and new.emoji is not null then
    raise exception 'This message was unsent' using errcode = '42501';
  end if;
  new.conversation_id := conv;
  if tg_op = 'UPDATE' then
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists message_reactions_check on public.message_reactions;
create trigger message_reactions_check
  before insert or update on public.message_reactions
  for each row execute function private.check_message_reaction();

drop policy if exists message_reactions_select on public.message_reactions;
create policy message_reactions_select on public.message_reactions for select to authenticated
  using (private.is_conversation_participant(conversation_id));

drop policy if exists message_reactions_insert on public.message_reactions;
create policy message_reactions_insert on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.messages m where m.id = message_id and private.is_conversation_participant(m.conversation_id))
  );

drop policy if exists message_reactions_update on public.message_reactions;
create policy message_reactions_update on public.message_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists message_reactions_delete on public.message_reactions;
create policy message_reactions_delete on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Created after message_reactions exists, since the function deletes from it.
drop trigger if exists messages_on_unsent on public.messages;
create trigger messages_on_unsent
  after update on public.messages
  for each row execute function private.on_message_unsent();

-- --------------------------------------------------------- remove for you

create table if not exists public.message_hidden (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_hidden enable row level security;

drop policy if exists message_hidden_select on public.message_hidden;
create policy message_hidden_select on public.message_hidden for select to authenticated
  using (user_id = (select auth.uid()));

-- The messages policy already limits the subquery to chats I'm in.
drop policy if exists message_hidden_insert on public.message_hidden;
create policy message_hidden_insert on public.message_hidden for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.messages m where m.id = message_id));

drop policy if exists message_hidden_delete on public.message_hidden;
create policy message_hidden_delete on public.message_hidden for delete to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------------------------- theme, mute, members

alter table public.conversations add column if not exists chat_theme text;
alter table public.conversations drop constraint if exists conversations_chat_theme_format;
alter table public.conversations add constraint conversations_chat_theme_format
  check (chat_theme is null or chat_theme ~ '^[a-z]{1,20}$');

-- In a community only admins pick the theme; in a DM either person can.
create or replace function private.guard_conversation_theme()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if new.chat_theme is distinct from old.chat_theme
     and (old.is_public or old.title is not null or old.id = '4f544444-0000-4000-8000-00000000c0de'::uuid)
     and not private.is_room_admin(old.id) then
    raise exception 'Only a community admin can change its theme' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_guard_theme on public.conversations;
create trigger conversations_guard_theme
  before update on public.conversations
  for each row execute function private.guard_conversation_theme();

alter table public.conversation_participants add column if not exists muted_until timestamptz;

-- Same as the notifications migration, but muted participants are skipped.
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
    where conversation_id = new.conversation_id
      and user_id <> new.sender_id
      and (muted_until is null or muted_until <= now())
  loop
    perform private.notify(p.user_id, new.sender_id, 'message', new.conversation_id, null, new.body);
  end loop;
  return new;
end;
$$;

revoke execute on function private.on_message_notify() from public, anon, authenticated;

-- Everyone in a room can see who its admins are (for the members list).
drop policy if exists conversation_admins_select on public.conversation_admins;
create policy conversation_admins_select on public.conversation_admins for select to authenticated
  using (user_id = (select auth.uid()) or private.is_conversation_participant(conversation_id));

-- Leave, or be removed by an admin. Nobody removes the creator.
drop policy if exists conversation_participants_delete on public.conversation_participants;
create policy conversation_participants_delete on public.conversation_participants for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (
      private.is_room_admin(conversation_id)
      and not exists (
        select 1 from public.conversations c
        where c.id = conversation_id and c.created_by = user_id
      )
    )
  );

-- The creator grants or revokes admin. The member must be in the room.
create or replace function public.set_room_admin(p_conversation uuid, p_user uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation and c.created_by = (select auth.uid())
  ) then
    raise exception 'Only the community''s creator can change its admins' using errcode = '42501';
  end if;
  if p_admin then
    if not exists (
      select 1 from public.conversation_participants
      where conversation_id = p_conversation and user_id = p_user
    ) then
      raise exception 'That person isn''t in this community' using errcode = '42501';
    end if;
    insert into public.conversation_admins (conversation_id, user_id)
    values (p_conversation, p_user)
    on conflict do nothing;
  else
    delete from public.conversation_admins where conversation_id = p_conversation and user_id = p_user;
  end if;
end;
$$;

revoke execute on function public.set_room_admin(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_room_admin(uuid, uuid, boolean) to authenticated;

-- Removed members stop being admins too.
create or replace function private.on_participant_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.conversation_admins
  where conversation_id = old.conversation_id and user_id = old.user_id;
  return old;
end;
$$;

revoke execute on function private.on_participant_removed() from public, anon, authenticated;

drop trigger if exists conversation_participants_removed on public.conversation_participants;
create trigger conversation_participants_removed
  after delete on public.conversation_participants
  for each row execute function private.on_participant_removed();

-- --------------------------------------------------------------- realtime

do $$ begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null; end $$;
