-- Public closet pieces in Discover.
--
--   clothing_items.is_public  the owner chose "Show in Discover". Defaults to
--                             false, so everything captured before this stays
--                             private; the app turns it on for new captures
--                             only while the capture switch is on.
--   clothing_items.like_count kept by a trigger on piece_likes.
--   piece_likes               hearts on public pieces.
--   saved_pieces              pieces someone saved from Discover (own-only).
--   saved_outfits.source_*    a look saved from someone's post, shown as
--                             "Saved from <name>" and opening that post.
--
-- Reading public pieces widens clothing_items' select policy, so every
-- "my closet" query must filter by user_id itself (fetchMyCloset does).

alter table public.clothing_items add column if not exists is_public boolean not null default false;
alter table public.clothing_items add column if not exists like_count int not null default 0;

create index if not exists clothing_items_public_idx
  on public.clothing_items (created_at desc) where is_public;
create index if not exists clothing_items_public_image_idx
  on public.clothing_items (image_url) where is_public;

drop policy if exists clothing_items_select on public.clothing_items;
create policy clothing_items_select on public.clothing_items for select to authenticated
  using ((select auth.uid()) = user_id or is_public);

-- A public piece's photo is readable by anyone signed in, and only while the
-- piece is public. Refs are stored as "wardrobe/<object name>".
drop policy if exists wardrobe_public_read on storage.objects;
create policy wardrobe_public_read on storage.objects for select to authenticated
  using (
    bucket_id = 'wardrobe'
    and exists (
      select 1 from public.clothing_items ci
      where ci.is_public and ci.image_url = 'wardrobe/' || name
    )
  );

-- ------------------------------------------------------------------ hearts

create table if not exists public.piece_likes (
  item_id uuid not null references public.clothing_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists piece_likes_user_idx on public.piece_likes (user_id);

alter table public.piece_likes enable row level security;

-- Visible when the piece is (clothing_items' own policy decides that).
drop policy if exists piece_likes_select on public.piece_likes;
create policy piece_likes_select on public.piece_likes for select to authenticated
  using (exists (select 1 from public.clothing_items ci where ci.id = item_id));

drop policy if exists piece_likes_insert on public.piece_likes;
create policy piece_likes_insert on public.piece_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.clothing_items ci where ci.id = item_id and ci.is_public)
  );

drop policy if exists piece_likes_delete on public.piece_likes;
create policy piece_likes_delete on public.piece_likes for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.sync_piece_like_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.clothing_items set like_count = like_count + 1 where id = new.item_id;
    return new;
  end if;
  update public.clothing_items set like_count = greatest(like_count - 1, 0) where id = old.item_id;
  return old;
end;
$$;

drop trigger if exists piece_likes_count on public.piece_likes;
create trigger piece_likes_count
  after insert or delete on public.piece_likes
  for each row execute function private.sync_piece_like_count();

-- ------------------------------------------------------------------ saves

create table if not exists public.saved_pieces (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.clothing_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.saved_pieces enable row level security;

drop policy if exists saved_pieces_select on public.saved_pieces;
create policy saved_pieces_select on public.saved_pieces for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists saved_pieces_insert on public.saved_pieces;
create policy saved_pieces_insert on public.saved_pieces for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.clothing_items ci where ci.id = item_id and ci.is_public)
  );

drop policy if exists saved_pieces_delete on public.saved_pieces;
create policy saved_pieces_delete on public.saved_pieces for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.saved_outfits
  add column if not exists source_post_id uuid references public.community_posts (id) on delete set null;
alter table public.saved_outfits
  add column if not exists source_user_id uuid references auth.users (id) on delete set null;
create unique index if not exists saved_outfits_source_post_uniq
  on public.saved_outfits (user_id, source_post_id) where source_post_id is not null;
