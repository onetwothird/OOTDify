-- Photo try-on: a job's wearer is the user's own photo or a preset model, and
-- the result records which kind of picture it was (the app labels AI-made
-- bodies). The backend writes both with the service role; users still only
-- read their own rows through the existing policies.
alter table public.try_on_jobs
  add column if not exists model_preset text,
  add column if not exists photo_kind text;

alter table public.try_on_jobs
  drop constraint if exists try_on_jobs_photo_kind_check;
alter table public.try_on_jobs
  add constraint try_on_jobs_photo_kind_check
  check (photo_kind is null or photo_kind in ('whole_body', 'face_only', 'preset'));
