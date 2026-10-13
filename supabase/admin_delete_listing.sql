-- Secure administrative deletion for DHBWMarkt listings.
-- Run this script once in Supabase Dashboard -> SQL Editor.
-- Authorization is checked inside the database; the browser cannot bypass it.

create or replace function public.admin_delete_listing(p_listing_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Nur Administratoren dürfen Anzeigen löschen'
      using errcode = '42501';
  end if;

  -- Remove dependent records first so foreign-key constraints do not block deletion.
  delete from public.favoriten
  where anzeige_id::text = p_listing_id;

  delete from public.nachrichten
  where anzeige_id::text = p_listing_id;

  delete from public.bewertungen
  where anzeige_id::text = p_listing_id;

  delete from public.anzeigen
  where id::text = p_listing_id;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.admin_delete_listing(text) from public;
revoke all on function public.admin_delete_listing(text) from anon;
grant execute on function public.admin_delete_listing(text) to authenticated;
