-- =====================================================================
-- REPARATUR: Wenn die Rennleitungs-Seite "Lade ..." zeigt oder Fehler bringt,
-- nachdem du reset.sql und schema.sql ausgeführt hast.
-- Ursache: Konten, die vor dem Neuaufbau existierten, haben kein Profil mehr.
-- Hier einfügen und Run. Gefahrlos mehrfach ausführbar. Löscht nichts.
-- =====================================================================
insert into public.profiles (id, display_name)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
on conflict (id) do nothing;

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and role is null);

alter table public.penalties add column if not exists lap int;
alter table public.penalties add column if not exists session_time double precision;

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

-- Kontrolle: du solltest hier dein Konto sehen (role leer = noch keine Rolle gewählt)
select u.email, p.role from auth.users u left join public.profiles p on p.id = u.id;
