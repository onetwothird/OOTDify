-- Notes: one short line (like a status) that sits above your circle in Community
-- for 24 hours. You and your friends can read it; nobody else can.
--
-- One note per person. Writing a new one replaces the old; the server's clock
-- sets when it was written and when it disappears.

create table if not exists public.friend_notes (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 60),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

alter table public.friend_notes enable row level security;

create or replace function private.stamp_friend_note()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  return new;
end;
$$;

drop trigger if exists friend_notes_stamp on public.friend_notes;
create trigger friend_notes_stamp
  before insert or update on public.friend_notes
  for each row execute function private.stamp_friend_note();

drop policy if exists friend_notes_select on public.friend_notes;
create policy friend_notes_select on public.friend_notes for select to authenticated
  using (user_id = (select auth.uid()) or (expires_at > now() and private.is_friend(user_id)));

drop policy if exists friend_notes_insert on public.friend_notes;
create policy friend_notes_insert on public.friend_notes for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists friend_notes_update on public.friend_notes;
create policy friend_notes_update on public.friend_notes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists friend_notes_delete on public.friend_notes;
create policy friend_notes_delete on public.friend_notes for delete to authenticated
  using (user_id = (select auth.uid()));
