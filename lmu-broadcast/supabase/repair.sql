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

-- Kontrolle: du solltest hier dein Konto sehen (role leer = noch keine Rolle gewählt)
select u.email, p.role from auth.users u left join public.profiles p on p.id = u.id;
