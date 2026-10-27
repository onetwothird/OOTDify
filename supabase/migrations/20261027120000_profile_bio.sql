-- Short intro shown on the profile page ("bio"), editable by its owner through
-- PATCH /api/profile. The backend trims it and enforces the same 160-character
-- limit; the check keeps the database honest if anything else writes it.
alter table public.user_profiles add column if not exists bio text;

alter table public.user_profiles drop constraint if exists user_profiles_bio_length;
alter table public.user_profiles
  add constraint user_profiles_bio_length check (bio is null or char_length(bio) <= 160);
