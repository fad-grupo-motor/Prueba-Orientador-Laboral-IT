-- SQL Editor: 004 · Eliminar la propia cuenta
-- =============================================================================
-- "Eliminar mi cuenta" (pestaña "Mi cuenta" de la web).
-- -----------------------------------------------------------------------------
-- Safe to run more than once. Apply to dev first, test, then prod (after 001-003).
--
-- delete_my_account() deletes the signed-in user from auth.users. The foreign keys
-- created in 001 (on delete cascade) remove the profile or company row and
-- everything that hangs from it (diagnostics, plans, answers, requests...).
-- Each person can only delete their own account: the function uses auth.uid().
-- =============================================================================

begin;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
