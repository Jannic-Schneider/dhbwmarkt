-- Secure administrative deletion of any DHBWMarkt review.
-- Run once in Supabase Dashboard -> SQL Editor.
-- The admin role is checked inside the database, not trusted from the browser.

create or replace function public.admin_delete_review(p_review_id text)
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
    raise exception 'Nur Administratoren dürfen Bewertungen anderer Nutzer löschen'
      using errcode = '42501';
  end if;

  delete from public.bewertungen
  where id::text = p_review_id;

  return found;
end;
$$;

revoke all on function public.admin_delete_review(text) from public;
revoke all on function public.admin_delete_review(text) from anon;
grant execute on function public.admin_delete_review(text) to authenticated;
