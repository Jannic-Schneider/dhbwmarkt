-- Return only public profile fields needed for names and avatars in chats.
-- Run once in Supabase Dashboard -> SQL Editor.
create or replace function public.get_public_profiles(p_user_ids uuid[])
returns table (id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.display_name, p.avatar_url
  from public.profiles p
  where p.id = any(p_user_ids);
$$;

revoke all on function public.get_public_profiles(uuid[]) from public;
revoke all on function public.get_public_profiles(uuid[]) from anon;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;
