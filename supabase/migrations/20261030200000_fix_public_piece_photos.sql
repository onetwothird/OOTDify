-- Public piece photos never loaded in Discover. In wardrobe_public_read the
-- unqualified `name` inside the subquery resolved to clothing_items.name (the
-- piece's own name), not the storage object's name, so no photo ever matched.
-- Qualify it as the storage row's column.

drop policy if exists wardrobe_public_read on storage.objects;
create policy wardrobe_public_read on storage.objects for select to authenticated
  using (
    bucket_id = 'wardrobe'
    and exists (
      select 1 from public.clothing_items ci
      where ci.is_public and ci.image_url = 'wardrobe/' || objects.name
    )
  );
