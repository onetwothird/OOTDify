-- A friend's profile page. user_profiles stays owner-only, and the shared
-- directory only holds name + photo, so the bio and cover photo are handed out
-- by this function alone, and only to the person themselves or an accepted
-- friend. Anyone else gets an error, never a partial row.
create or replace function public.get_friend_profile(target uuid)
returns table (
  user_id uuid,
  display_name text,
  first_name text,
  avatar_url text,
  bio text,
  cover_url text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if target is distinct from (select auth.uid()) and not private.is_friend(target) then
    raise exception 'You can only view the profile of a friend.' using errcode = '42501';
  end if;
  return query
    select p.user_id, p.display_name, p.first_name, p.avatar_url, p.bio, p.cover_url
    from public.user_profiles p
    where p.user_id = target;
end $$;

revoke execute on function public.get_friend_profile(uuid) from public, anon;
grant execute on function public.get_friend_profile(uuid) to authenticated;
