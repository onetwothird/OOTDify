-- Comments in Discover.
--
--   piece_comments                  comments on public closet pieces; anyone
--                                   who can see the piece can read and write.
--   clothing_items.comment_count    kept by a trigger, shown on piece cards.
--   community_comments delete       the post's author may now also remove
--                                   comments on their own post, as a piece's
--                                   owner can on their piece.

create table if not exists public.piece_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.clothing_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists piece_comments_item_idx on public.piece_comments (item_id, created_at);
create index if not exists piece_comments_user_idx on public.piece_comments (user_id);

alter table public.piece_comments enable row level security;

-- Visible while the piece is (clothing_items' own policy decides that).
drop policy if exists piece_comments_select on public.piece_comments;
create policy piece_comments_select on public.piece_comments for select to authenticated
  using (exists (select 1 from public.clothing_items ci where ci.id = item_id));

drop policy if exists piece_comments_insert on public.piece_comments;
create policy piece_comments_insert on public.piece_comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.clothing_items ci where ci.id = item_id and ci.is_public)
  );

drop policy if exists piece_comments_delete on public.piece_comments;
create policy piece_comments_delete on public.piece_comments for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.clothing_items ci where ci.id = item_id and ci.user_id = (select auth.uid()))
  );

alter table public.clothing_items add column if not exists comment_count int not null default 0;

create or replace function private.sync_piece_comment_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.clothing_items set comment_count = comment_count + 1 where id = new.item_id;
    return new;
  end if;
  update public.clothing_items set comment_count = greatest(comment_count - 1, 0) where id = old.item_id;
  return old;
end;
$$;

drop trigger if exists piece_comments_count on public.piece_comments;
create trigger piece_comments_count
  after insert or delete on public.piece_comments
  for each row execute function private.sync_piece_comment_count();

drop policy if exists community_comments_delete on public.community_comments;
create policy community_comments_delete on public.community_comments for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.community_posts p
      where p.id = post_id and p.user_id = (select auth.uid())
    )
  );
