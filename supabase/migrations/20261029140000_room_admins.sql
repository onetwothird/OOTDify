-- More than one admin per community.
--
-- A room's creator is always its admin. conversation_admins lists anyone else
-- who may rename the room and change its icon. Clients can only read their own
-- rows; admins are added here, in a migration, never from the app.
--
-- terdehhhh@gmail.com and jhusttine@gmail.com administer the Open Community
-- chat. Each is added only once their account exists, so re-run this file
-- after either signs up.

create table if not exists public.conversation_admins (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_admins enable row level security;

drop policy if exists conversation_admins_select on public.conversation_admins;
create policy conversation_admins_select on public.conversation_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- SECURITY DEFINER so the guard can read the list whoever is editing.
create or replace function private.is_room_admin(conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv and c.created_by = (select auth.uid())
  ) or exists (
    select 1 from public.conversation_admins a
    where a.conversation_id = conv and a.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_room_admin(uuid) from public, anon;
grant execute on function private.is_room_admin(uuid) to authenticated;

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
     and not private.is_room_admin(old.id) then
    raise exception 'Only a room admin can change its name or icon'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- The Open Community chat exists, owned by the first of the two who has an account.
insert into public.conversations (id, created_by)
select '4f544444-0000-4000-8000-00000000c0de'::uuid, u.id
from auth.users u
where lower(u.email) in ('terdehhhh@gmail.com', 'jhusttine@gmail.com')
order by (lower(u.email) = 'terdehhhh@gmail.com') desc
limit 1
on conflict (id) do nothing;

insert into public.conversation_admins (conversation_id, user_id)
select '4f544444-0000-4000-8000-00000000c0de'::uuid, u.id
from auth.users u
where lower(u.email) in ('terdehhhh@gmail.com', 'jhusttine@gmail.com')
  and exists (select 1 from public.conversations where id = '4f544444-0000-4000-8000-00000000c0de'::uuid)
on conflict do nothing;
