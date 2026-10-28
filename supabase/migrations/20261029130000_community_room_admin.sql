-- Community admins: the room's creator can rename it and change its icon.
--
-- 1. Renaming joins the icon under the creator-only guard. Any participant may
--    update a conversation (it keeps updated_at fresh), so the title is guarded
--    by the same trigger rather than by a policy.
-- 2. terdehhhh@gmail.com becomes the admin (creator) of the Open Community
--    chat. The room is created if nobody has opened it yet. This does nothing
--    until that account exists, so re-run it after the account signs up.

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
     and old.created_by is distinct from (select auth.uid()) then
    raise exception 'Only the room''s creator can change its name or icon'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

insert into public.conversations (id, created_by)
select '4f544444-0000-4000-8000-00000000c0de'::uuid, u.id
from auth.users u
where lower(u.email) = 'terdehhhh@gmail.com'
on conflict (id) do update set created_by = excluded.created_by;
