-- Profile cover photo: a banner behind the avatar on the profile page. Set by
-- POST /api/profile/cover (Cloudinary URL, never client-supplied) and removed
-- by PATCH /api/profile with cover_url = null.
alter table public.user_profiles add column if not exists cover_url text;
