-- ============================================================================
-- OOTDify — Supabase schema (tables, storage buckets, RLS, seed catalog)
--
-- How to apply:
--   1. Open your Supabase project → SQL Editor → New query → paste the whole file.
--   2. Run. Everything is idempotent (safe to re-run).
--   3. Storage buckets are also created here; the Flask backend verifies/creates
--      them at startup as well.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ============================================================================
-- 1. CLOTHING CATALOG (shared catalog of browsable clothing)
-- ============================================================================
create table if not exists public.clothing (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  category      text not null,             -- Tops | Bottoms | Shoes | Outerwear | Dresses | Bags | Accessories
  subcategory   text,                      -- T-Shirts | Shirts | Blouses | Hoodies | Jeans | Trousers | Shorts | Skirts | Sneakers ...
  gender        text not null default 'unisex',  -- men | women | unisex
  color         text[] not null default '{}',
  sizes         text[] not null default '{}',
  style         text,                      -- Minimalist | Streetwear | Casual | Formal ...
  brand         text,
  occasion      text[] not null default '{}',   -- Casual | School | Office | Interview | Date | Formal | Party | Travel | Gym | Beach
  price         numeric,
  currency      text not null default 'USD',
  image_url     text not null,
  thumbnail_url text,
  mask_url      text,                      -- reserved for future AI segmentation masks
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists clothing_category_idx      on public.clothing (category);
create index if not exists clothing_subcategory_idx   on public.clothing (subcategory);
create index if not exists clothing_style_idx         on public.clothing (style);
create index if not exists clothing_brand_idx         on public.clothing (brand);
create index if not exists clothing_created_idx       on public.clothing (created_at desc);

-- ----------------------------------------------------------------------------
-- 2. USER WARDROBE ITEMS (items the user captured / owns)
-- ----------------------------------------------------------------------------
create table if not exists public.clothing_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  clothing_id uuid references public.clothing (id) on delete set null, -- optional catalog link
  name        text,
  category    text,
  color       text,
  size        text,                      -- free-form size label (S, M, 32, 42, One size…)
  style       text,
  brand       text,
  season      text,                      -- Spring | Summer | Fall | Winter | All-season
  occasion    text[] not null default '{}', -- Casual | Party | Office | …
  image_url   text,                      -- PRIVATE storage path in `wardrobe` bucket (wardrobe/<uid>/<uuid>.jpg) or external URL; never leaks other users' paths
  tags        text[] not null default '{}',
  wear_count  int not null default 0,
  last_worn   timestamptz,
  created_at  timestamptz not null default now()
);

-- Idempotent migration for projects that created clothing_items before these
-- columns existed (safe to run repeatedly).
alter table public.clothing_items add column if not exists size text;
alter table public.clothing_items add column if not exists season text;
alter table public.clothing_items add column if not exists occasion text[] not null default '{}';

create index if not exists clothing_items_user_idx on public.clothing_items (user_id);

-- ----------------------------------------------------------------------------
-- 3. USER FASHION PROFILES (one row per user)
-- ----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users (id) on delete cascade,
  display_name          text,
  avatar_url            text,
  body_photo_url        text,               -- current/latest saved body photo URL
  preferred_styles      text[] not null default '{}',
  preferred_colors      text[] not null default '{}',
  sizes                 text[] not null default '{}',  -- e.g. {'tops:M','bottoms:32','shoes:42'}
  preferred_categories  text[] not null default '{}',
  preferred_occasions   text[] not null default '{}',
  updated_at            timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. BODY PHOTOS (full-body photos uploaded through the Scan flow)
-- ----------------------------------------------------------------------------
create table if not exists public.body_photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  storage_path  text not null,             -- PRIVATE storage path in `users` bucket, e.g. users/<uid>/<uuid>.jpg (never a public URL)
  detection     jsonb not null default '{}',  -- {personFound, personConfidence, detections:[...]}
  pose          jsonb not null default '{}',  -- {keypoints:[...], personDetected}
  segmentation  jsonb not null default '{}',  -- {masks: n, personDetected}
  created_at    timestamptz not null default now()
);

create index if not exists body_photos_user_idx on public.body_photos (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 5. TRY-ON JOBS (async AI generation jobs)
-- ----------------------------------------------------------------------------
create table if not exists public.try_on_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  body_photo_id uuid references public.body_photos (id) on delete set null,
  clothing_ids  jsonb not null default '[]',   -- array of clothing / clothing_items ids
  status        text not null default 'uploading', -- uploading|queued|processing|completed|failed
  result_url    text,                          -- PRIVATE storage path in `tryons` bucket (tryons/<uid>/<uuid>.jpg)
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists try_on_jobs_user_idx on public.try_on_jobs (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 6. SAVED OUTFITS
-- ----------------------------------------------------------------------------
create table if not exists public.saved_outfits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text,
  occasion      text,
  clothing_ids  jsonb not null default '[]',
  try_on_id     uuid references public.try_on_jobs (id) on delete set null,
  result_url    text,                  -- PRIVATE storage path in `tryons` bucket (shared from the try-on result)
  created_at    timestamptz not null default now()
);

create index if not exists saved_outfits_user_idx on public.saved_outfits (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 7. FAVORITES (catalog clothing OR user wardrobe items)
-- ----------------------------------------------------------------------------
create table if not exists public.favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('clothing', 'item')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

create index if not exists favorites_user_idx on public.favorites (user_id);

-- ----------------------------------------------------------------------------
-- 8. RECENTLY VIEWED (catalog browsing history)
-- ----------------------------------------------------------------------------
create table if not exists public.recently_viewed (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  clothing_id uuid not null references public.clothing (id) on delete cascade,
  viewed_at   timestamptz not null default now(),
  unique (user_id, clothing_id)
);

create index if not exists recently_viewed_user_idx on public.recently_viewed (user_id, viewed_at desc);

-- ============================================================================
-- 9. STORAGE BUCKETS
--
-- PRIVACY: every user-owned bucket is PRIVATE. Only `clothing` (admin-managed
-- catalog imagery) is public. Private objects are never served as public URLs;
-- the app/backend resolves them with short-lived signed URLs
-- (backend/services/storage_service.py). Bucket-level size/MIME limits are
-- enforced by Supabase on every upload.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('users',    'users',    false, 10 * 1024 * 1024, array['image/jpeg','image/png','image/webp']),
  ('wardrobe', 'wardrobe', false, 10 * 1024 * 1024, array['image/jpeg','image/png','image/webp']),
  ('clothing', 'clothing', true,  10 * 1024 * 1024, array['image/jpeg','image/png','image/webp']),
  ('tryons',   'tryons',   false, 20 * 1024 * 1024, array['image/jpeg','image/png','image/webp']),
  ('avatars',  'avatars',  false,  5 * 1024 * 1024, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ============================================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================================
-- Helper: enable RLS idempotently.
do $$ begin
  alter table public.clothing       enable row level security;
  alter table public.clothing_items enable row level security;
  alter table public.user_profiles  enable row level security;
  alter table public.body_photos    enable row level security;
  alter table public.try_on_jobs    enable row level security;
  alter table public.saved_outfits  enable row level security;
  alter table public.favorites      enable row level security;
  alter table public.recently_viewed enable row level security;
end $$;

-- Helper: create a policy only if it does not already exist.
create or replace function public._ensure_policy(
  p_policy text, p_table regclass, p_command text, p_using text, p_check text default null
) returns void language plpgsql as $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and policyname = p_policy and tablename = p_table::text
  ) then
    execute format('create policy %I on %s for %s using (%s)' ||
                   case when p_check is not null then ' with check (' || p_check || ')' else '' end,
                   p_policy, p_table::text, upper(p_command), p_using, p_check);
  end if;
end $$;

-- clothing catalog: any authenticated user may read
select public._ensure_policy('clothing_select', 'public.clothing', 'select', 'auth.role() = ''authenticated''');

-- clothing_items: owner only
select public._ensure_policy('clothing_items_select', 'public.clothing_items', 'select', 'auth.uid() = user_id');
select public._ensure_policy('clothing_items_insert', 'public.clothing_items', 'insert', 'auth.uid() = user_id', 'auth.uid() = user_id');
select public._ensure_policy('clothing_items_update', 'public.clothing_items', 'update', 'auth.uid() = user_id');
select public._ensure_policy('clothing_items_delete', 'public.clothing_items', 'delete', 'auth.uid() = user_id');

-- user_profiles: owner only
select public._ensure_policy('user_profiles_select', 'public.user_profiles', 'select', 'auth.uid() = user_id');
select public._ensure_policy('user_profiles_insert', 'public.user_profiles', 'insert', 'auth.uid() = user_id', 'auth.uid() = user_id');
select public._ensure_policy('user_profiles_update', 'public.user_profiles', 'update', 'auth.uid() = user_id');

-- body_photos: owner only
select public._ensure_policy('body_photos_select', 'public.body_photos', 'select', 'auth.uid() = user_id');
select public._ensure_policy('body_photos_insert', 'public.body_photos', 'insert', 'auth.uid() = user_id', 'auth.uid() = user_id');
select public._ensure_policy('body_photos_delete', 'public.body_photos', 'delete', 'auth.uid() = user_id');

-- try_on_jobs: owner only
select public._ensure_policy('try_on_jobs_select', 'public.try_on_jobs', 'select', 'auth.uid() = user_id');
select public._ensure_policy('try_on_jobs_insert', 'public.try_on_jobs', 'insert', 'auth.uid() = user_id', 'auth.uid() = user_id');
select public._ensure_policy('try_on_jobs_update', 'public.try_on_jobs', 'update', 'auth.uid() = user_id');
select public._ensure_policy('try_on_jobs_delete', 'public.try_on_jobs', 'delete', 'auth.uid() = user_id');

-- saved_outfits: owner only
select public._ensure_policy('saved_outfits_select', 'public.saved_outfits', 'select', 'auth.uid() = user_id');
select public._ensure_policy('saved_outfits_insert', 'public.saved_outfits', 'insert', 'auth.uid() = user_id', 'auth.uid() = user_id');
select public._ensure_policy('saved_outfits_update', 'public.saved_outfits', 'update', 'auth.uid() = user_id');
select public._ensure_policy('saved_outfits_delete', 'public.saved_outfits', 'delete', 'auth.uid() = user_id');

-- favorites: owner only
select public._ensure_policy('favorites_select', 'public.favorites', 'select', 'auth.uid() = user_id');
select public._ensure_policy('favorites_insert', 'public.favorites', 'insert', 'auth.uid() = user_id', 'auth.uid() = user_id');
select public._ensure_policy('favorites_delete', 'public.favorites', 'delete', 'auth.uid() = user_id');

-- recently_viewed: owner only
select public._ensure_policy('recently_viewed_select', 'public.recently_viewed', 'select', 'auth.uid() = user_id');
select public._ensure_policy('recently_viewed_insert', 'public.recently_viewed', 'insert', 'auth.uid() = user_id', 'auth.uid() = user_id');
select public._ensure_policy('recently_viewed_update', 'public.recently_viewed', 'update', 'auth.uid() = user_id');
select public._ensure_policy('recently_viewed_delete', 'public.recently_viewed', 'delete', 'auth.uid() = user_id');

-- itinerary_plans (existing table used by the planner): owner-only policies
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='itinerary_plans') then
    alter table public.itinerary_plans enable row level security;
  end if;
end $$;
select public._ensure_policy('itinerary_plans_select', 'public.itinerary_plans', 'select', 'auth.uid() = user_id');
select public._ensure_policy('itinerary_plans_insert', 'public.itinerary_plans', 'insert', 'auth.uid() = user_id', 'auth.uid() = user_id');
select public._ensure_policy('itinerary_plans_update', 'public.itinerary_plans', 'update', 'auth.uid() = user_id');
select public._ensure_policy('itinerary_plans_delete', 'public.itinerary_plans', 'delete', 'auth.uid() = user_id');

-- Storage object policies:
--  * `clothing` is public-read (catalog imagery, admin-managed).
--  * All user-owned buckets are PRIVATE: only the owner (auth.uid() = owner_id)
--    can select/insert/update/delete. The Flask backend acts as service_role,
--    which bypasses RLS, and hands out short-lived signed URLs.
-- Uploads from the app go straight to storage *as the authenticated user*, so
-- the owner (uploader) == auth.uid() holds for every object.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='catalog_public_read_ootdify') then
    create policy catalog_public_read_ootdify on storage.objects for select
      using (bucket_id = 'clothing');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='user_storage_select_ootdify') then
    create policy user_storage_select_ootdify on storage.objects for select
      using (bucket_id in ('users','wardrobe','tryons','avatars') and auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='user_storage_insert_ootdify') then
    create policy user_storage_insert_ootdify on storage.objects for insert
      with check (bucket_id in ('users','wardrobe','tryons','avatars') and auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='user_storage_update_ootdify') then
    create policy user_storage_update_ootdify on storage.objects for update
      using (bucket_id in ('users','wardrobe','tryons','avatars') and auth.uid() = owner_id)
      with check (bucket_id in ('users','wardrobe','tryons','avatars') and auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='user_storage_delete_ootdify') then
    create policy user_storage_delete_ootdify on storage.objects for delete
      using (bucket_id in ('users','wardrobe','tryons','avatars') and auth.uid() = owner_id);
  end if;
end $$;

drop function if exists public._ensure_policy(text, regclass, text, text, text);

-- ============================================================================
-- 11. SEED CATALOG (sample real catalog data — replace/extend with your products)
-- ============================================================================
insert into public.clothing
  (name, description, category, subcategory, gender, color, sizes, style, brand, occasion, price, currency, image_url, thumbnail_url, metadata)
values
  ('Classic White T-Shirt', 'Essential crew-neck tee in heavyweight cotton.', 'Tops', 'T-Shirts', 'unisex',
   array['white'], array['S','M','L','XL'], 'Minimalist', 'Essentials', array['Casual','School','Beach'], 19.99, 'USD',
   'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Oversized Graphic Hoodie', 'Relaxed-fit hoodie with a subtle front print.', 'Tops', 'Hoodies', 'unisex',
   array['black'], array['S','M','L','XL'], 'Streetwear', 'Urban Co', array['Casual','School','Travel'], 49.99, 'USD',
   'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Linen Button-Up Shirt', 'Breathable linen shirt for warm days.', 'Tops', 'Shirts', 'men',
   array['beige'], array['S','M','L','XL'], 'Smart Casual', 'Coastal', array['Office','Interview','Date'], 39.99, 'USD',
   'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Wide-Leg Cargo Pants', 'Oversized cargos with utility pockets.', 'Bottoms', 'Trousers', 'unisex',
   array['olive'], array['S','M','L','XL'], 'Streetwear', 'Street Lab', array['Casual','Travel'], 54.99, 'USD',
   'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Slim-Fit Black Jeans', 'Classic slim jeans with a bit of stretch.', 'Bottoms', 'Jeans', 'men',
   array['black'], array['29','30','31','32','33'], 'Minimalist', 'Denim Co', array['Casual','Date','Party'], 64.99, 'USD',
   'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Pleated Midi Skirt', 'Elegant pleated skirt with a smooth waistband.', 'Bottoms', 'Skirts', 'women',
   array['navy'], array['XS','S','M','L'], 'Elegant', 'Editorial', array['Office','Date','Formal'], 44.99, 'USD',
   'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Clean White Sneakers', 'Minimal leather low-top sneakers.', 'Shoes', 'Sneakers', 'unisex',
   array['white'], array['39','40','41','42','43','44'], 'Minimalist', 'KickLab', array['Casual','School','Travel'], 79.99, 'USD',
   'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Crossbody Mini Bag', 'Compact crossbody for essentials on the go.', 'Bags', 'Crossbody', 'unisex',
   array['brown'], array['One Size'], 'Casual', 'Wander', array['Casual','Travel','Party'], 59.99, 'USD',
   'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Trench Coat', 'Timeless double-breasted trench.', 'Outerwear', 'Coats', 'women',
   array['khaki'], array['S','M','L'], 'Elegant', 'Editorial', array['Formal','Office','Interview'], 129.99, 'USD',
   'https://images.unsplash.com/photo-1520975954732-35dd22299614?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1520975954732-35dd22299614?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed')),
  ('Little Black Dress', 'The classic LBD for evenings out.', 'Dresses', 'Mini Dresses', 'women',
   array['black'], array['XS','S','M','L'], 'Elegant', 'Noir', array['Party','Date','Formal'], 89.99, 'USD',
   'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80',
   'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=400&q=60',
   jsonb_build_object('source','seed'))
on conflict do nothing;