-- Wardrobe items can carry a short description (typed by the user or suggested
-- by the garment scan). The capture flow already sends it on insert.
alter table public.clothing_items add column if not exists description text;
