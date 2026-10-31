-- =====================================================================
-- REPARATUR: Wenn die Rennleitungs-Seite "Lade ..." zeigt oder Fehler bringt,
-- nachdem du reset.sql und schema.sql ausgeführt hast.
-- Ursache: Konten, die vor dem Neuaufbau existierten, haben kein Profil mehr.
-- Hier einfügen und Run. Gefahrlos mehrfach ausführbar. Löscht nichts.
-- =====================================================================
alter type public.incident_kind add value if not exists 'overtake';

insert into public.profiles (id, display_name)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
on conflict (id) do nothing;

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and role is null);

alter table public.penalties add column if not exists lap int;
alter table public.penalties add column if not exists session_time double precision;
alter table public.penalties add column if not exists after_race boolean not null default false;

alter table public.events add column if not exists replay_url text;
alter table public.events add column if not exists replay_offset int not null default 0;

-- Auto-Hinweise, die niemand als Vorfall bestätigt, darf die Rennleitung wieder löschen
drop policy if exists incidents_delete_hint on public.incidents;
create policy incidents_delete_hint on public.incidents for delete to authenticated
  using (public.is_staff() and source = 'auto' and status = 'open');

-- Befehle von der Website an den Reader (z. B. "im Spiel-Replay zu dieser Zeit springen")
create table if not exists public.replay_commands (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  target_time double precision not null,
  status      text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  message     text,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists replay_commands_event_idx on public.replay_commands (event_id, created_at desc);
alter table public.replay_commands enable row level security;
drop policy if exists replay_commands_select on public.replay_commands;
create policy replay_commands_select on public.replay_commands for select to authenticated
  using (public.is_staff() and public.can_see_event(event_id));
drop policy if exists replay_commands_insert on public.replay_commands;
create policy replay_commands_insert on public.replay_commands for insert to authenticated
  with check (public.is_staff() and public.can_see_event(event_id));

-- ============== Fahrer- und Team-Anmeldung (Klassen, Startnummern, Team-Events) ==============
alter table public.events add column if not exists classes text[] not null default '{}';
alter table public.events add column if not exists is_team_event boolean not null default false;

create table if not exists public.event_teams (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null,
  car_class   text,
  car_number  int,
  captain_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists event_teams_name_uniq on public.event_teams (event_id, lower(name));
create unique index if not exists event_teams_num_uniq on public.event_teams (event_id, car_number) where car_number is not null;

alter table public.event_drivers add column if not exists team_id uuid references public.event_teams (id) on delete set null;
alter table public.event_drivers add column if not exists profile_id uuid references public.profiles (id) on delete set null;
alter table public.event_drivers add column if not exists is_captain boolean not null default false;

alter table public.replay_commands add column if not exists car_number int;
alter table public.replay_commands add column if not exists driver text;

alter table public.event_teams enable row level security;
drop policy if exists event_teams_select on public.event_teams;
create policy event_teams_select on public.event_teams for select to authenticated using (public.can_see_event(event_id));
drop policy if exists event_teams_write on public.event_teams;
create policy event_teams_write on public.event_teams for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Event per Code nachschlagen (Name, Klassen, Team-Event?), damit das Anmeldeformular passt
create or replace function public.event_info(p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  e public.events%rowtype;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into e from public.events where code = upper(trim(coalesce(p_code, '')));
  if e.id is null then raise exception 'Event-Code unbekannt. Frag die Rennleitung nach dem Code.'; end if;
  return json_build_object(
    'id', e.id, 'name', e.name, 'track', e.track,
    'classes', to_json(e.classes), 'is_team_event', e.is_team_event,
    'teams', coalesce((select json_agg(json_build_object('name', t.name, 'car_class', t.car_class, 'car_number', t.car_number) order by t.name)
                       from public.event_teams t where t.event_id = e.id), '[]'::json)
  );
end $$;

-- Anmeldung für ein Event in einem Schritt: Konto-Rolle (Fahrer), In-Game-Name, Klasse, Startnummer, bei Team-Events Team.
--  Solo-Event:  Klasse + Startnummer.
--  Team-Event:  p_team_name gesetzt = Team neu anlegen (Kapitän trägt Klasse, Nummer und Teammitglieder ein).
--               p_team_name leer   = Teammitglied: wird dem Team zugeordnet, in das ihn der Kapitän mit seinem In-Game-Namen eingetragen hat.
create or replace function public.register_for_event(
  p_code text, p_ingame_name text default null, p_class text default null, p_number int default null,
  p_team_name text default null, p_members text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e public.events%rowtype;
  me public.profiles%rowtype;
  v_name text;
  v_class text;
  v_team text := trim(coalesce(p_team_name, ''));
  v_team_id uuid;
  m text;
  v_seen text[] := '{}';
begin
  if uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into e from public.events where code = upper(trim(coalesce(p_code, '')));
  if e.id is null then raise exception 'Event-Code unbekannt. Frag die Rennleitung nach dem Code.'; end if;
  select * into me from public.profiles where id = uid;
  if me.id is null then raise exception 'Profil fehlt. Bitte neu anmelden.'; end if;

  v_name := trim(coalesce(nullif(trim(coalesce(p_ingame_name, '')), ''), me.ingame_name, ''));
  if v_name = '' then raise exception 'Bitte deinen In-Game-Namen eintragen'; end if;
  if me.ingame_name is distinct from v_name then
    begin
      update public.profiles set ingame_name = v_name where id = uid;
    exception when unique_violation then
      raise exception 'Dieser In-Game-Name ist schon vergeben';
    end;
  end if;
  if me.role is null then update public.profiles set role = 'driver' where id = uid; end if;

  if exists (select 1 from public.event_drivers d where d.event_id = e.id and d.profile_id = uid) then
    raise exception 'Du bist für dieses Event schon angemeldet';
  end if;

  -- Teammitglied: vom Kapitän eingetragen
  if e.is_team_event and v_team = '' then
    update public.event_drivers set profile_id = uid
     where event_id = e.id and lower(ingame_name) = lower(v_name) and team_id is not null and profile_id is null;
    if not found then
      raise exception 'Du stehst in keinem Team dieses Events. Lege ein Team an oder lass dich vom Teamkapitän mit deinem In-Game-Namen eintragen.';
    end if;
    insert into public.event_members (event_id, profile_id) values (e.id, uid) on conflict do nothing;
    return e.id;
  end if;

  v_class := nullif(trim(coalesce(p_class, '')), '');
  if coalesce(array_length(e.classes, 1), 0) > 0 then
    select c into v_class from unnest(e.classes) c where lower(c) = lower(coalesce(v_class, '')) limit 1;
    if v_class is null then raise exception 'Bitte eine Klasse wählen'; end if;
  end if;
  if p_number is null or p_number < 1 or p_number > 999 then
    raise exception 'Bitte eine Startnummer zwischen 1 und 999 eintragen';
  end if;
  if exists (select 1 from public.event_drivers d where d.event_id = e.id and d.car_number = p_number and lower(d.ingame_name) <> lower(v_name)) then
    raise exception 'Die Startnummer % ist in diesem Event schon vergeben', p_number;
  end if;

  if e.is_team_event then
    if exists (select 1 from public.event_teams t where t.event_id = e.id and lower(t.name) = lower(v_team)) then
      raise exception 'Ein Team mit diesem Namen gibt es schon';
    end if;
    insert into public.event_teams (event_id, name, car_class, car_number, captain_id)
      values (e.id, v_team, v_class, p_number, uid) returning id into v_team_id;
    update public.event_drivers
       set car_number = p_number, car_class = v_class, team = v_team, team_id = v_team_id, profile_id = uid, is_captain = true
     where event_id = e.id and lower(ingame_name) = lower(v_name);
    if not found then
      insert into public.event_drivers (event_id, ingame_name, car_number, car_class, team, team_id, profile_id, is_captain)
        values (e.id, v_name, p_number, v_class, v_team, v_team_id, uid, true);
    end if;
    foreach m in array coalesce(p_members, '{}') loop
      m := trim(coalesce(m, ''));
      continue when m = '' or lower(m) = lower(v_name) or lower(m) = any (v_seen);
      v_seen := v_seen || lower(m);
      if exists (select 1 from public.event_drivers d where d.event_id = e.id and lower(d.ingame_name) = lower(m)) then
        raise exception '% ist in diesem Event schon eingetragen', m;
      end if;
      insert into public.event_drivers (event_id, ingame_name, car_number, car_class, team, team_id)
        values (e.id, m, p_number, v_class, v_team, v_team_id);
    end loop;
  else
    update public.event_drivers set car_number = p_number, car_class = v_class, profile_id = uid
     where event_id = e.id and lower(ingame_name) = lower(v_name);
    if not found then
      insert into public.event_drivers (event_id, ingame_name, car_number, car_class, profile_id)
        values (e.id, v_name, p_number, v_class, uid);
    end if;
  end if;

  insert into public.event_members (event_id, profile_id) values (e.id, uid) on conflict do nothing;
  return e.id;
end $$;

-- Teamkapitän (oder Rennleitung) trägt ein weiteres Teammitglied ein
create or replace function public.team_add_member(p_team uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t public.event_teams%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  new_id uuid;
begin
  select * into t from public.event_teams where id = p_team;
  if t.id is null then raise exception 'Team nicht gefunden'; end if;
  if not (t.captain_id = auth.uid() or public.is_staff()) then raise exception 'Nur der Teamkapitän oder die Rennleitung darf das'; end if;
  if v_name = '' then raise exception 'Bitte einen In-Game-Namen eintragen'; end if;
  if exists (select 1 from public.event_drivers d where d.event_id = t.event_id and lower(d.ingame_name) = lower(v_name)) then
    raise exception '% ist in diesem Event schon eingetragen', v_name;
  end if;
  insert into public.event_drivers (event_id, ingame_name, car_number, car_class, team, team_id)
    values (t.event_id, v_name, t.car_number, t.car_class, t.name, t.id) returning id into new_id;
  return new_id;
end $$;

create or replace function public.team_remove_member(p_driver uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.event_drivers%rowtype;
  t public.event_teams%rowtype;
begin
  select * into d from public.event_drivers where id = p_driver;
  if d.id is null or d.team_id is null then raise exception 'Teammitglied nicht gefunden'; end if;
  select * into t from public.event_teams where id = d.team_id;
  if not (t.captain_id = auth.uid() or public.is_staff()) then raise exception 'Nur der Teamkapitän oder die Rennleitung darf das'; end if;
  if d.is_captain then raise exception 'Der Teamkapitän kann nicht entfernt werden'; end if;
  delete from public.event_drivers where id = p_driver;
end $$;

revoke execute on function public.event_info(text) from public, anon;
revoke execute on function public.register_for_event(text, text, text, int, text, text[]) from public, anon;
revoke execute on function public.team_add_member(uuid, text) from public, anon;
revoke execute on function public.team_remove_member(uuid) from public, anon;
grant execute on function public.event_info(text) to authenticated;
grant execute on function public.register_for_event(text, text, text, int, text, text[]) to authenticated;
grant execute on function public.team_add_member(uuid, text) to authenticated;
grant execute on function public.team_remove_member(uuid) to authenticated;

-- ============== Befehle: Sprung, Auto anwaehlen, zurueck zu Live; Vorfaelle nur fuer Rennleitung ==============
alter table public.replay_commands add column if not exists kind text not null default 'jump';
alter table public.replay_commands drop constraint if exists replay_commands_kind_check;
alter table public.replay_commands add constraint replay_commands_kind_check check (kind in ('jump', 'focus', 'live', 'next', 'prev', 'transport'));

-- Replay-Knoepfe (Play, Pause ...): Befehlsart "transport" mit Namen in "command"
alter table public.replay_commands add column if not exists command text;
alter table public.replay_commands drop constraint if exists replay_commands_kind_check;
alter table public.replay_commands add constraint replay_commands_kind_check check (kind in ('jump', 'focus', 'live', 'next', 'prev', 'transport'));
alter table public.replay_commands alter column target_time drop not null;

drop policy if exists replay_commands_select on public.replay_commands;
create policy replay_commands_select on public.replay_commands for select to authenticated
  using (public.my_role() in ('admin', 'steward', 'broadcaster') and public.can_see_event(event_id));
drop policy if exists replay_commands_insert on public.replay_commands;
create policy replay_commands_insert on public.replay_commands for insert to authenticated
  with check (public.my_role() in ('admin', 'steward', 'broadcaster') and public.can_see_event(event_id));

drop policy if exists incidents_select on public.incidents;
create policy incidents_select on public.incidents for select to authenticated
  using (
    public.is_staff()
    or (public.my_role() = 'broadcaster' and not (source = 'auto' and status = 'open') and public.can_see_event(event_id))
  );


-- ============== Fahrer-Overlay (SimHub): persoenlicher Schluessel ==============
create table if not exists public.driver_overlay_keys (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  key        text not null unique default replace(gen_random_uuid()::text, '-', '')
);
alter table public.driver_overlay_keys enable row level security;
-- Keine Policies: nur die Funktion unten (und der Server mit Service-Key) kommt dran.

create or replace function public.my_overlay_key() returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  insert into public.driver_overlay_keys (profile_id) values (auth.uid()) on conflict do nothing;
  select key into k from public.driver_overlay_keys where profile_id = auth.uid();
  return k;
end $$;
grant execute on function public.my_overlay_key() to authenticated;

-- Kontrolle: du solltest hier dein Konto sehen (role leer = noch keine Rolle gewählt)
select u.email, p.role from auth.users u left join public.profiles p on p.id = u.id;
