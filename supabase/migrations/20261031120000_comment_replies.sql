-- Replies to comments in Discover, on looks (community_comments) and on
-- pieces (piece_comments). One level deep: a reply points at a top-level
-- comment on the same look or piece. Deleting a comment deletes its replies
-- (the count triggers fire per row, so counts stay right).

alter table public.community_comments
  add column if not exists parent_id uuid references public.community_comments (id) on delete cascade;
create index if not exists community_comments_parent_idx on public.community_comments (parent_id);

alter table public.piece_comments
  add column if not exists parent_id uuid references public.piece_comments (id) on delete cascade;
create index if not exists piece_comments_parent_idx on public.piece_comments (parent_id);

-- A reply must answer a top-level comment on the same look or piece.
create or replace function private.check_comment_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ok boolean;
begin
  if new.parent_id is null then
    return new;
  end if;
  if tg_table_name = 'community_comments' then
    select exists (
      select 1 from public.community_comments p
      where p.id = new.parent_id and p.post_id = new.post_id and p.parent_id is null
    ) into ok;
  else
    select exists (
      select 1 from public.piece_comments p
      where p.id = new.parent_id and p.item_id = new.item_id and p.parent_id is null
    ) into ok;
  end if;
  if not ok then
    raise exception 'reply must answer a top-level comment on the same post or piece'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists community_comments_parent_check on public.community_comments;
create trigger community_comments_parent_check
  before insert or update of parent_id on public.community_comments
  for each row execute function private.check_comment_parent();

drop trigger if exists piece_comments_parent_check on public.piece_comments;
create trigger piece_comments_parent_check
  before insert or update of parent_id on public.piece_comments
  for each row execute function private.check_comment_parent();
