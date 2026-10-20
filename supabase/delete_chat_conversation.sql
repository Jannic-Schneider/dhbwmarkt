-- Permanently delete one conversation for both participants.
-- Run once in Supabase Dashboard -> SQL Editor.

create or replace function public.delete_chat_conversation(
  p_listing_id text,
  p_partner_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id text;
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  v_user_id := auth.uid()::text;

  if p_partner_id is null or p_partner_id = v_user_id then
    raise exception 'Ungültiger Gesprächspartner';
  end if;

  delete from public.nachrichten
  where anzeige_id::text = p_listing_id
    and (
      (sender_id::text = v_user_id and recipient_id::text = p_partner_id)
      or
      (sender_id::text = p_partner_id and recipient_id::text = v_user_id)
    );

  return found;
end;
$$;

revoke all on function public.delete_chat_conversation(text, text) from public;
revoke all on function public.delete_chat_conversation(text, text) from anon;
grant execute on function public.delete_chat_conversation(text, text) to authenticated;
