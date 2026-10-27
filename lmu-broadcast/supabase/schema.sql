-- =====================================================================
-- LMU Broadcast: Rennleitung (Phase 3)
-- Im Supabase-Dashboard: SQL Editor -> New query -> alles einfügen -> Run.
-- Ist idempotent genug für einen ersten Lauf; bei Wiederholung erst die
-- Tabellen löschen (siehe README).
-- =====================================================================

create type public.app_role as enum ('admin', 'steward', 'driver', 'broadcaster');
create type public.incident_kind as enum ('offtrack', 'track_limits', 'contact', 'spin', 'impact', 'other');
create type public.incident_status as enum ('open', 'reviewing', 'closed');
create type public.penalty_kind as enum (
  'warning',        -- Verwarnung
  'time',           -- Zeitstrafe, amount = Sekunden
  'drive_through',  -- Drive-Through
  'stop_go',        -- Stop-and-Go, amount = Sekunden Standzeit
  'grid',           -- Positions-/Startplatzstrafe, amount = Plätze
  'dq',             -- Disqualifikation
  'race_ban',       -- Rennsperre, amount = Anzahl Rennen
  'quali_ban'       -- Qualisperre, amount = Anzahl Qualis
);
create type public.penalty_status as enum ('issued', 'served', 'revoked');

-- ---------------------------------------------------------------- Profile
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  ingame_name  text,
  role         public.app_role not null default 'driver',
  created_at   timestamptz not null default now()
);
-- Der In-Game-Name darf nur einmal vergeben sein (Groß/Kleinschreibung egal)
create unique index profiles_ingame_name_uniq on public.profiles (lower(ingame_name)) where ingame_name is not null;

-- ------------------------------------------------------------ Hilfsfunktionen
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

-- Neues Konto -> Profil anlegen (Name aus Discord/E-Mail)
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

-- Nur Admins dürfen Rollen ändern (RLS kann keine einzelnen Spalten schützen)
create function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() ist leer bei direktem Zugriff (SQL Editor, Service-Key): dort erlaubt.
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Nur Admins dürfen Rollen ändern';
  end if;
  return new;
end $$;

create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_role();

-- ----------------------------------------------------------------- Events
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  track      text,
  room       text,                       -- Raumcode des Readers (für die Live-Ansicht)
  starts_at  timestamptz,
  status     text not null default 'planned' check (status in ('planned', 'live', 'finished')),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Reader-Token getrennt, damit nur Admins ihn sehen
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
  hint_key     text,                       -- Dedupe-Schlüssel der Reader-Hinweise
  kind         public.incident_kind not null default 'other',
  confidence   text check (confidence in ('low', 'medium', 'high')),
  status       public.incident_status not null default 'open',
  session_type int,
  session_time double precision,
  lap          int,
  lap_dist     double precision,
  description  text not null default '',
  details      jsonb not null default '{}'::jsonb,
  decision     text,                       -- Begründung der Rennleitung
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);
-- Kein Teilindex, damit der Reader-Import per ON CONFLICT Doppelte überspringen kann.
-- Handgemachte Vorfälle haben hint_key = NULL und kollidieren nie.
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
  amount      int,                         -- Sekunden / Plätze / Rennen, je nach Art
  reason      text not null default '',
  status      public.penalty_status not null default 'issued',
  issued_by   uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index penalties_event_idx on public.penalties (event_id, created_at desc);

-- ============================== Zugriffsregeln (RLS) ==============================
alter table public.profiles         enable row level security;
alter table public.events           enable row level security;
alter table public.event_secrets    enable row level security;
alter table public.event_drivers    enable row level security;
alter table public.incidents        enable row level security;
alter table public.incident_drivers enable row level security;
alter table public.penalties        enable row level security;

-- Profile: Angemeldete sehen Namen/Rollen; jeder ändert nur sich selbst, Admins alle
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Events: alle Angemeldeten lesen; Admin legt an/löscht; Admin+Steward ändern
create policy events_select on public.events for select to authenticated using (true);
create policy events_insert on public.events for insert to authenticated with check (public.is_admin());
create policy events_update on public.events for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy events_delete on public.events for delete to authenticated using (public.is_admin());

-- Reader-Token: nur Admins
create policy secrets_select on public.event_secrets for select to authenticated using (public.is_admin());
create policy secrets_update on public.event_secrets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Event-Fahrer: alle lesen, Rennleitung pflegt
create policy event_drivers_select on public.event_drivers for select to authenticated using (true);
create policy event_drivers_write on public.event_drivers for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Vorfälle: Rennleitung sieht alle, alle anderen nur abgeschlossene (veröffentlichte)
create policy incidents_select on public.incidents for select to authenticated
  using (public.is_staff() or status = 'closed');
create policy incidents_insert on public.incidents for insert to authenticated with check (public.is_staff());
create policy incidents_update on public.incidents for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy incidents_delete on public.incidents for delete to authenticated using (public.is_admin());

-- Beteiligte: sichtbar genau dann, wenn der Vorfall sichtbar ist
create policy incident_drivers_select on public.incident_drivers for select to authenticated
  using (exists (select 1 from public.incidents i where i.id = incident_id));
create policy incident_drivers_write on public.incident_drivers for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Strafen: Rennleitung sieht alle, andere nur nicht zurückgenommene
create policy penalties_select on public.penalties for select to authenticated
  using (public.is_staff() or status <> 'revoked');
create policy penalties_insert on public.penalties for insert to authenticated with check (public.is_staff());
create policy penalties_update on public.penalties for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy penalties_delete on public.penalties for delete to authenticated using (public.is_admin());

-- Live-Updates im Browser (Realtime) für Vorfälle und Strafen
alter publication supabase_realtime add table public.incidents, public.penalties;

-- ============================ Ersten Admin festlegen =============================
-- 1) Auf der Website einmal registrieren (E-Mail oder Discord).
-- 2) Dann hier deine E-Mail eintragen und diese Zeile einzeln ausführen:
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'DEINE@EMAIL.DE');
