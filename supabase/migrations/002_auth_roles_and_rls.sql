-- =============================================================================
-- Sign-in with Supabase Auth (Google first): roles, RLS policies and grants.
-- -----------------------------------------------------------------------------
-- Safe to run more than once. Apply to dev first, test, then prod.
--
-- 1. Same grants in dev and prod: new tables are not exposed automatically and
--    existing tables only get the minimum (dev still had everything open).
-- 2. handle_new_user: fixed search_path (security advisor) and, when sign-up
--    does not say the role (Google cannot send it), it creates nothing.
-- 3. set_initial_role(): the web calls it after the first Google sign-in with
--    the role of the button that was clicked ("young person" or "company").
--    Works only once per user, so nobody can switch role later.
-- 4. get_my_role(): tells the web whether the user is 'talent', 'company' or
--    has no role yet.
-- 5. RLS policies: each user reads and edits only their own profile/company.
--
-- Roles in the database: 'talent' (young person) and 'company'. The web calls
-- them 'young' and 'company'; src/auth/supabaseAuth.ts translates.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Grants
-- ---------------------------------------------------------------------------

-- New tables, functions and sequences are not reachable from the web unless a
-- migration grants it on purpose. (Prod already has this; dev did not.)
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- Start from zero on existing tables, then grant the minimum.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Public catalogs: anyone can read (still filtered by RLS policies).
grant select on public.training_resources, public.technologies, public.soft_skills,
  public.simulator_questions, public.educational_resources
  to anon, authenticated;

-- Personal data: only signed-in users (RLS limits them to their own rows).
grant select, insert, update, delete on public.profiles, public.companies,
  public.company_requests, public.company_request_technologies,
  public.company_request_soft_skills, public.diagnostics,
  public.diagnostic_technologies, public.action_plans, public.search_checklists,
  public.simulator_answers, public.mentor_consultations
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Create the profile or company row at sign-up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_user_meta_data->>'initial_role';
  v_name text := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    split_part(new.email, '@', 1),
    'Nuevo usuario'
  );
begin
  -- Google sign-up does not carry the role: the web sets it right after with
  -- set_initial_role(). Nothing to create yet.
  if v_role is null then
    return new;
  end if;

  if v_role = 'company' then
    insert into public.companies (id, company_name)
    values (new.id, v_name);
  else
    insert into public.profiles (id, first_name, avatar_url)
    values (new.id, v_name, new.raw_user_meta_data->>'avatar_url');
  end if;

  return new;
end;
$$;

-- Only the trigger on auth.users runs it; nobody calls it from the web.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Choose the role once, after the first Google sign-in
-- ---------------------------------------------------------------------------

create or replace function public.set_initial_role(p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_meta jsonb;
  v_email text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if p_role not in ('talent', 'company') then
    raise exception 'Invalid role: %', p_role using errcode = '22023';
  end if;

  -- Already has a role: keep it and tell the caller which one.
  if exists (select 1 from public.profiles where id = v_uid) then
    return 'talent';
  end if;
  if exists (select 1 from public.companies where id = v_uid) then
    return 'company';
  end if;

  select raw_user_meta_data, email into v_meta, v_email
  from auth.users where id = v_uid;

  v_name := coalesce(
    nullif(v_meta->>'full_name', ''),
    nullif(v_meta->>'name', ''),
    split_part(v_email, '@', 1),
    'Nuevo usuario'
  );

  if p_role = 'company' then
    insert into public.companies (id, company_name) values (v_uid, v_name);
  else
    insert into public.profiles (id, first_name, avatar_url)
    values (v_uid, v_name, v_meta->>'avatar_url');
  end if;

  return p_role;
end;
$$;

revoke execute on function public.set_initial_role(text) from public, anon;
grant execute on function public.set_initial_role(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Which role does the signed-in user have? (null = none yet)
-- ---------------------------------------------------------------------------

-- security invoker: it reads through the RLS policies below, so it can only
-- ever see the caller's own rows.
create or replace function public.get_my_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when exists (select 1 from public.profiles  where id = (select auth.uid())) then 'talent'
    when exists (select 1 from public.companies where id = (select auth.uid())) then 'company'
  end;
$$;

revoke execute on function public.get_my_role() from public, anon;
grant execute on function public.get_my_role() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RLS policies: own row only. No insert policy (rows are created by the
--    functions above) and no delete policy (account deletion comes later).
-- ---------------------------------------------------------------------------

drop policy if exists "Cada joven ve su perfil" on public.profiles;
create policy "Cada joven ve su perfil"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Cada joven edita su perfil" on public.profiles;
create policy "Cada joven edita su perfil"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Cada empresa ve su ficha" on public.companies;
create policy "Cada empresa ve su ficha"
  on public.companies for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Cada empresa edita su ficha" on public.companies;
create policy "Cada empresa edita su ficha"
  on public.companies for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

commit;
