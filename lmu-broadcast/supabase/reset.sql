-- =====================================================================
-- ACHTUNG: Löscht alle LMU-Broadcast-Tabellen (Phase 3 und 4) samt Daten.
-- Nur ausführen, wenn du bei Null neu anfangen willst (z. B. beim Update
-- von Phase 3 auf Phase 4). Danach schema.sql ausführen.
-- Deine Konten (auth.users) bleiben bestehen.
-- =====================================================================
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.penalties cascade;
drop table if exists public.incident_drivers cascade;
drop table if exists public.incidents cascade;
drop table if exists public.event_drivers cascade;
drop table if exists public.event_members cascade;
drop table if exists public.event_secrets cascade;
drop table if exists public.events cascade;
drop table if exists public.tracks cascade;
drop table if exists public.access_codes cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.protect_role() cascade;
drop function if exists public.create_event_secret() cascade;
drop function if exists public.redeem_access(text, text, text, text) cascade;
drop function if exists public.join_event(text) cascade;
drop function if exists public.regenerate_access_code(text) cascade;
drop function if exists public.regenerate_event_code(uuid) cascade;
drop function if exists public.can_see_event(uuid) cascade;
drop function if exists public.is_member(uuid) cascade;
drop function if exists public.role_rank(public.app_role) cascade;
drop function if exists public.gen_code(text, int, int) cascade;
drop function if exists public.is_staff() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.my_role() cascade;

drop type if exists public.penalty_status;
drop type if exists public.penalty_kind;
drop type if exists public.incident_status;
drop type if exists public.incident_kind;
drop type if exists public.app_role;
