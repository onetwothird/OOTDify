-- Private chats are for friends only.
--
-- Before, the creator of a conversation could add anyone as the second
-- participant. Now the second person must be an accepted friend (or the
-- creator themself, which is how a room's creator joins their own room).
-- Joining the shared everyone room or a public room is unchanged.
--
-- Chats that already exist keep working; only starting a new private chat with
-- someone who is not a friend is refused.

drop policy if exists conversation_participants_insert on public.conversation_participants;
create policy conversation_participants_insert on public.conversation_participants for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and conversation_id = '4f544444-0000-4000-8000-00000000c0de'::uuid)
    or (user_id = (select auth.uid()) and private._is_public_conversation(conversation_id))
    or (
      private._is_conv_creator(conversation_id)
      and private._conv_participant_count(conversation_id) < 2
      and (user_id = (select auth.uid()) or private.is_friend(user_id))
    )
  );
