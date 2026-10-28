-- Photos in chats.
--
--   messages.image_ref  'chat/<conversation>/<sender>/<file>.jpg' in the private
--                       'chat' bucket, or null for a text message. The message
--                       body still holds text (a caption, or a short label), so
--                       previews and notifications need no special case.
--
-- Only people in a conversation can upload to or read from its folder, and a
-- message may only point at a photo in its own conversation and sender folder.

alter table public.messages add column if not exists image_ref text;

create or replace function private.check_message_photo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.image_ref is not null
     and new.image_ref not like 'chat/' || new.conversation_id::text || '/' || new.sender_id::text || '/%' then
    raise exception 'A chat photo must be uploaded to this conversation' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_check_photo on public.messages;
create trigger messages_check_photo
  before insert on public.messages
  for each row execute function private.check_message_photo();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 10 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The first folder is the conversation id; the second is the uploader.
drop policy if exists chat_insert_ootdify on storage.objects;
create policy chat_insert_ootdify on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.is_conversation_participant(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists chat_select_ootdify on storage.objects;
create policy chat_select_ootdify on storage.objects for select to authenticated
  using (
    bucket_id = 'chat'
    and private.is_conversation_participant(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists chat_delete_ootdify on storage.objects;
create policy chat_delete_ootdify on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and owner_id = (select auth.uid())::text);
