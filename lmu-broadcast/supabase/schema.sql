-- =====================================================================
-- LMU Broadcast: Datenbank (Phase 4)
-- Supabase-Dashboard: SQL Editor -> New query -> alles einfügen -> Run.
-- Update von Phase 3? Erst reset.sql ausführen, dann diese Datei.
-- =====================================================================

create type public.app_role as enum ('admin', 'steward', 'driver', 'broadcaster');
create type public.incident_kind as enum ('offtrack', 'track_limits', 'contact', 'spin', 'impact', 'other');
create type public.incident_status as enum ('open', 'reviewing', 'closed');
create type public.penalty_kind as enum (
  'warning', 'time', 'drive_through', 'stop_go', 'grid', 'dq', 'race_ban', 'quali_ban'
);
create type public.penalty_status as enum ('issued', 'served', 'revoked');

-- Zufälliger, gut tippbarer Code, z. B. EVT-7K3F-92AB
create function public.gen_code(prefix text, groups int, size int) returns text
language plpgsql volatile as $$
declare
  out text := prefix;
  g int;
begin
  for g in 1..groups loop
    out := out || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, size));
  end loop;
  return out;
end $$;

-- ---------------------------------------------------------------- Profile
-- role ist NULL, bis jemand beim Anmelden eine Rolle mit Code/Key bestätigt hat.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  ingame_name  text,
  role         public.app_role,
  created_at   timestamptz not null default now()
);
create unique index profiles_ingame_name_uniq on public.profiles (lower(ingame_name)) where ingame_name is not null;

create function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'steward'), false)
$$;

create function public.role_rank(r public.app_role) returns int
language sql immutable as $$
  select case r when 'admin' then 4 when 'steward' then 3 when 'broadcaster' then 2 when 'driver' then 1 else 0 end
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rollen ändert nur ein Admin oder eine Datenbankfunktion (redeem_access) / der SQL Editor.
-- Bewusst KEIN security definer: current_user ist hier die Rolle des Aufrufers.
create function public.protect_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated', 'anon')
     and not public.is_admin() then
    raise exception 'Nur Admins dürfen Rollen ändern';
  end if;
  return new;
end $$;

create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_role();

-- ------------------------------------------------- Zugangs-Keys (je Rolle einer)
create table public.access_codes (
  role text primary key check (role in ('admin', 'steward', 'broadcaster')),
  code text not null unique
);
insert into public.access_codes (role, code) values
  ('admin',       public.gen_code('ADM', 4, 4)),
  ('steward',     public.gen_code('STW', 4, 4)),
  ('broadcaster', public.gen_code('BRC', 4, 4));

-- ----------------------------------------------------------------- Strecken
-- Wird vom Reader automatisch befüllt (Streckenkarte, einmal aufgezeichnet).
create table public.tracks (
  slug       text primary key,
  name       text not null,
  length     double precision,
  coverage   double precision not null default 0,
  points     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- Events
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  track      text,
  track_slug text,
  code       text not null unique default public.gen_code('EVT', 2, 4),   -- Fahrer-Beitrittscode
  room       text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), -- intern, Live-Kanal
  starts_at  timestamptz,
  status     text not null default 'planned' check (status in ('planned', 'live', 'finished')),
  replay_url    text,                      -- Link zum Replay/VOD (YouTube, Twitch ...)
  replay_offset int not null default 0,    -- Sekunden im Video, bei denen die Session-Zeit 0 liegt
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.event_secrets (
  event_id     uuid primary key references public.events (id) on delete cascade,
  ingest_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);

create function public.create_event_secret() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_secrets (event_id) values (new.id);
  return new;
end $$;

create trigger events_create_secret after insert on public.events
  for each row execute function public.create_event_secret();

-- Wer hat sich per Event-Code einem Event angeschlossen
create table public.event_members (
  event_id   uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create function public.is_member(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_members where event_id = e and profile_id = auth.uid())
$$;

-- Team (Admin, Steward, Broadcaster) sieht alle Events, Fahrer nur ihre beigetretenen
create function public.can_see_event(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() in ('admin', 'steward', 'broadcaster') then true
    when public.my_role() = 'driver' then public.is_member(e)
    else false
  end
$$;

-- ---------------------------------------------------------- Event-Fahrer
create table public.event_drivers (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  ingame_name text not null,
  car_number  int,
  car_class   text,
  team        text,
  created_at  timestamptz not null default now()
);
create unique index event_drivers_uniq on public.event_drivers (event_id, lower(ingame_name));

-- --------------------------------------------------------------- Vorfälle
create table public.incidents (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  source       text not null default 'manual' check (source in ('manual', 'auto')),
  hint_key     text,
  kind         public.incident_kind not null default 'other',
  confidence   text check (confidence in ('low', 'medium', 'high')),
  status       public.incident_status not null default 'open',
  session_type int,
  session_time double precision,
  lap          int,
  lap_dist     double precision,
  description  text not null default '',
  details      jsonb not null default '{}'::jsonb,
  decision     text,
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);
-- Kein Teilindex (ON CONFLICT braucht einen normalen). NULL kollidiert nie.
create unique index incidents_hint_uniq on public.incidents (event_id, hint_key);
create index incidents_event_idx on public.incidents (event_id, created_at desc);

create table public.incident_drivers (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  ingame_name text not null,
  car_number  int,
  role        text not null default 'involved' check (role in ('involved', 'possible'))
);
create index incident_drivers_idx on public.incident_drivers (incident_id);

-- ---------------------------------------------------------------- Strafen
create table public.penalties (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  incident_id uuid references public.incidents (id) on delete set null,
  ingame_name text not null,
  car_number  int,
  kind        public.penalty_kind not null,
  amount      int,
  reason      text not null default '',
  lap         int,
  session_time double precision,
  status      public.penalty_status not null default 'issued',
  issued_by   uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index penalties_event_idx on public.penalties (event_id, created_at desc);

-- ============================== Funktionen für die Website ==============================

-- Anmeldung abschließen: Rolle wählen + Code/Key + In-Game-Name.
-- Fahrer: Event-Code. Admin/Steward/Broadcaster: der Key der Rolle.
create function public.redeem_access(p_role text, p_code text, p_ingame_name text, p_display_name text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_name text := trim(coalesce(p_ingame_name, ''));
  target public.app_role;
  ev uuid;
  cur public.app_role;
begin
  if uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_name = '' then raise exception 'Bitte deinen In-Game-Namen eintragen'; end if;
  if p_role not in ('driver', 'admin', 'steward', 'broadcaster') then raise exception 'Unbekannte Rolle'; end if;
  target := p_role::public.app_role;

  if target = 'driver' then
    select id into ev from public.events where code = v_code;
    if ev is null then raise exception 'Event-Code unbekannt. Frag die Rennleitung nach dem Code.'; end if;
  else
    if not exists (select 1 from public.access_codes a where a.role = p_role and a.code = v_code) then
      raise exception 'Key stimmt nicht';
    end if;
  end if;

  select role into cur from public.profiles where id = uid;
  begin
    update public.profiles
       set ingame_name  = v_name,
           display_name = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), display_name),
           role         = case when cur is null or public.role_rank(target) > public.role_rank(cur) then target else cur end
     where id = uid;
  exception when unique_violation then
    raise exception 'Dieser In-Game-Name ist schon vergeben';
  end;

  if target = 'driver' then
    insert into public.event_members (event_id, profile_id) values (ev, uid) on conflict do nothing;
  end if;

  return (select role::text from public.profiles where id = uid);
end $$;

-- Einem weiteren Event per Event-Code beitreten (Fahrer)
create function public.join_event(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ev uuid;
begin
  if uid is null then raise exception 'Nicht angemeldet'; end if;
  if public.my_role() is null then raise exception 'Bitte zuerst die Anmeldung abschließen'; end if;
  select id into ev from public.events where code = upper(trim(coalesce(p_code, '')));
  if ev is null then raise exception 'Event-Code unbekannt'; end if;
  insert into public.event_members (event_id, profile_id) values (ev, uid) on conflict do nothing;
  return ev;
end $$;

create function public.regenerate_access_code(p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c text;
begin
  if not public.is_admin() then raise exception 'Nur Admins'; end if;
  c := public.gen_code(case p_role when 'admin' then 'ADM' when 'steward' then 'STW' else 'BRC' end, 4, 4);
  update public.access_codes set code = c where role = p_role;
  if not found then raise exception 'Unbekannte Rolle'; end if;
  return c;
end $$;

create function public.regenerate_event_code(p_event uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c text := public.gen_code('EVT', 2, 4);
begin
  if not public.is_admin() then raise exception 'Nur Admins'; end if;
  update public.events set code = c where id = p_event;
  if not found then raise exception 'Event nicht gefunden'; end if;
  return c;
end $$;

revoke execute on function public.redeem_access(text, text, text, text) from public, anon;
revoke execute on function public.join_event(text) from public, anon;
revoke execute on function public.regenerate_access_code(text) from public, anon;
revoke execute on function public.regenerate_event_code(uuid) from public, anon;
grant execute on function public.redeem_access(text, text, text, text) to authenticated;
grant execute on function public.join_event(text) to authenticated;
grant execute on function public.regenerate_access_code(text) to authenticated;
grant execute on function public.regenerate_event_code(uuid) to authenticated;

-- ============================== Zugriffsregeln (RLS) ==============================
alter table public.profiles         enable row level security;
alter table public.access_codes     enable row level security;
alter table public.tracks           enable row level security;
alter table public.events           enable row level security;
alter table public.event_secrets    enable row level security;
alter table public.event_members    enable row level security;
alter table public.event_drivers    enable row level security;
alter table public.incidents        enable row level security;
alter table public.incident_drivers enable row level security;
alter table public.penalties        enable row level security;

-- Profile: eigenes immer; andere nur, wenn man selbst eine Rolle hat
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() is not null);
-- Fehlt ein Profil (z. B. Konto vor dem Einrichten angelegt), legt die Website es selbst an. Rolle bleibt leer.
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and role is null);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Keys: nur Admins lesen (ändern nur über regenerate_access_code)
create policy access_codes_select on public.access_codes for select to authenticated using (public.is_admin());

-- Strecken: öffentlich lesbar (Overlays laufen ohne Login), löschen nur Admin.
-- Schreiben macht die Website serverseitig (Service-Key) auf Anfrage des Readers.
create policy tracks_select on public.tracks for select to anon, authenticated using (true);
create policy tracks_delete on public.tracks for delete to authenticated using (public.is_admin());

-- Events
create policy events_select on public.events for select to authenticated using (public.can_see_event(id));
create policy events_insert on public.events for insert to authenticated with check (public.is_admin());
create policy events_update on public.events for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy events_delete on public.events for delete to authenticated using (public.is_admin());

create policy secrets_select on public.event_secrets for select to authenticated using (public.is_admin());
create policy secrets_update on public.event_secrets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy members_select on public.event_members for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
create policy members_delete on public.event_members for delete to authenticated using (public.is_staff());

create policy event_drivers_select on public.event_drivers for select to authenticated using (public.can_see_event(event_id));
create policy event_drivers_write on public.event_drivers for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy incidents_select on public.incidents for select to authenticated
  using (public.is_staff() or (status = 'closed' and public.can_see_event(event_id)));
create policy incidents_insert on public.incidents for insert to authenticated with check (public.is_staff());
create policy incidents_update on public.incidents for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy incidents_delete on public.incidents for delete to authenticated using (public.is_admin());

create policy incident_drivers_select on public.incident_drivers for select to authenticated
  using (exists (select 1 from public.incidents i where i.id = incident_id));
create policy incident_drivers_write on public.incident_drivers for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy penalties_select on public.penalties for select to authenticated
  using (public.is_staff() or (status <> 'revoked' and public.can_see_event(event_id)));
create policy penalties_insert on public.penalties for insert to authenticated with check (public.is_staff());
create policy penalties_update on public.penalties for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy penalties_delete on public.penalties for delete to authenticated using (public.is_admin());

alter publication supabase_realtime add table public.incidents, public.penalties;

-- Schon vorhandene Konten (vor diesem Skript registriert) bekommen ein Profil ohne Rolle
insert into public.profiles (id, display_name)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
on conflict (id) do nothing;

-- ============================ Ersten Admin festlegen =============================
-- 1) Auf der Website registrieren (E-Mail oder Discord).
-- 2) Hier den Admin-Key holen:   select code from public.access_codes where role = 'admin';
-- 3) Auf der Website bei der Rollenwahl "Admin" + diesen Key eingeben.
-- Alternativ direkt per SQL:
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'DEINE@EMAIL.DE');
