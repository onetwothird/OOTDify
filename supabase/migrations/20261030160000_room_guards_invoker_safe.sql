-- The room name/icon and chat theme guards run as the caller (SECURITY
-- INVOKER, so current_user tells the backend apart from the app). They called
-- private.is_room_admin(), but `authenticated` has no USAGE on the private
-- schema: policies can reference private functions because they are stored
-- resolved, while plpgsql looks the name up at run time and fails with
-- "permission denied for schema private" (42501). Every theme change and
-- every admin rename/icon change was refused.
--
-- The private schema stays closed. The admin check is inlined against what
-- the caller can already read: the row being updated (its created_by) and
-- their own conversation_admins row (that table's policy shows only those).

create or replace function private.guard_conversation_icon()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.icon_url is not null
     and (tg_op = 'INSERT' or new.icon_url is distinct from old.icon_url) then
    raise exception 'Room photos are set through the app''s upload'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and (new.icon_url is distinct from old.icon_url
          or new.icon_preset is distinct from old.icon_preset
          or new.title is distinct from old.title)
     and old.created_by is distinct from (select auth.uid())
     and not exists (
       select 1 from public.conversation_admins a
       where a.conversation_id = old.id and a.user_id = (select auth.uid())
     ) then
    raise exception 'Only a room admin can change its name or icon'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- In a community only admins pick the theme; in a DM either person can.
create or replace function private.guard_conversation_theme()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if new.chat_theme is distinct from old.chat_theme
     and (old.is_public or old.title is not null or old.id = '4f544444-0000-4000-8000-00000000c0de'::uuid)
     and old.created_by is distinct from (select auth.uid())
     and not exists (
       select 1 from public.conversation_admins a
       where a.conversation_id = old.id and a.user_id = (select auth.uid())
     ) then
    raise exception 'Only a community admin can change its theme' using errcode = '42501';
  end if;
  return new;
end;
$$;
