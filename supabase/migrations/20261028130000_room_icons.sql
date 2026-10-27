-- Community room icons: a photo (Cloudinary URL) or one of the app's preset
-- icons, instead of only the title's initials.
--
--   icon_url    set only by POST /api/community/rooms/<id>/icon (service role),
--               never client-supplied; a client may only clear it.
--   icon_preset a key from ROOM_ICON_PRESETS in
--               src/features/community/types.ts; unknown keys render initials.
--
-- Any participant may update a conversation (it keeps updated_at fresh), so the
-- icon is guarded by a trigger rather than a policy: only the room's creator
-- can change it.
alter table public.conversations add column if not exists icon_url text;
alter table public.conversations add column if not exists icon_preset text;

alter table public.conversations drop constraint if exists conversations_icon_preset_format;
alter table public.conversations add constraint conversations_icon_preset_format
  check (icon_preset is null or icon_preset ~ '^[a-z0-9-]{1,40}$');

-- SECURITY INVOKER on purpose: current_user is the caller's role
-- (authenticated, or service_role for the backend).
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
          or new.icon_preset is distinct from old.icon_preset)
     and old.created_by is distinct from (select auth.uid()) then
    raise exception 'Only the room''s creator can change its icon'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_guard_icon on public.conversations;
create trigger conversations_guard_icon
  before insert or update on public.conversations
  for each row execute function private.guard_conversation_icon();
