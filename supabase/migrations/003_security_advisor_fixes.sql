-- =============================================================================
-- Fixes for two warnings of the Supabase security advisor (dev, 2026-11-01).
-- -----------------------------------------------------------------------------
-- Safe to run more than once. Apply to dev first, then prod (after 001 and 002).
--
-- 1. set_updated_at: fixed search_path, like the other functions.
-- 2. rls_auto_enable: Supabase's helper that turns RLS on for new tables. It
--    runs by itself on every CREATE TABLE; nobody should call it from the web.
-- =============================================================================

begin;

alter function public.set_updated_at() set search_path = '';

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

commit;
