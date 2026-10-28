# LMU Rennleitung: Schnellstart

Drei Teile arbeiten zusammen:

1. **Reader** (Python, auf dem Rennrechner): liest die Daten aus Le Mans Ultimate und schickt sie ins Netz.
2. **Website** (Vercel): zeigt Live-Daten, liefert OBS-Overlays, verwaltet Vorfälle und Strafen.
3. **Datenbank** (Supabase): Konten, Rollen, Events, Strecken.

Alles läuft kostenlos auf Supabase, GitHub und Vercel.

## 1. Supabase einrichten

1. Neues Projekt anlegen (am besten ein eigenes, nicht das alte).
2. **SQL Editor, New query**: Inhalt von `supabase/schema.sql` einfügen, Run.
   Kommst du von Phase 3 oder Phase 4 (erste Version)? Erst `supabase/reset.sql` ausführen (löscht die alten LMU-Tabellen), dann `schema.sql`. Die Reihenfolge ist richtig so.
   **Rennleitungs-Seite zeigt nur „Lade …“ oder Fehler nach dem Neuaufbau?** Dann `supabase/repair.sql` ausführen (gefahrlos, löscht nichts). Danach neu laden und bei der Rollenwahl den Admin-Key eingeben.
3. **Project Settings, API**: kopiere *Project URL*, *anon public key* und *service_role key*.
4. **Authentication, Providers**: E-Mail ist an. Für Discord: Provider einschalten, Client-ID und Secret aus dem Discord Developer Portal eintragen. Unter *URL Configuration* die Vercel-Adresse als Site URL und Redirect eintragen.

## 2. Website auf GitHub und Vercel

1. Den Ordner `web` in ein GitHub-Repository hochladen.
2. Bei Vercel: *Add New Project*, das Repository wählen, Root Directory `web`.
3. Unter *Environment Variables* drei Einträge anlegen:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (geheim, nie mit `NEXT_PUBLIC_` davor)
4. Deploy. Danach die Vercel-Adresse bei Supabase (Schritt 1.4) eintragen.

## 3. Erster Admin

1. Die Website-Adresse öffnen: du landest direkt im Anmelde-Fenster. **Konto erstellen** wählen.
2. In Supabase, SQL Editor: `select code from public.access_codes where role = 'admin';` Den Key kopieren.
3. Auf der Website bei der Rollenwahl **Admin** wählen, Key und deinen In-Game-Namen eintragen.

## Rollen und Codes (so einfach wie möglich)

Beim ersten Anmelden wählt jeder seine Rolle und gibt einen Code ein:

| Rolle | Code | Woher |
|---|---|---|
| Fahrer | **Event-Code** (z. B. `EVT-7K3F-92AB`) | Admin sieht ihn im Event unter *Übersicht* |
| Broadcast | Broadcast-Key (`BRC-…`) | Admin, Reiter *Admin, Keys* |
| Rennleitung | Steward-Key (`STW-…`) | Admin, Reiter *Admin, Keys* |
| Admin | Admin-Key (`ADM-…`) | Admin, Reiter *Admin, Keys* |

- Pro Rolle gibt es **einen** Key für alle Events. Mit „Neu erzeugen“ wird er ausgetauscht.
- Fahrer geben den Event-Code **einmal pro Event** ein. Danach melden sie sich normal an. Weitere Events: *Events, Event beitreten*.
- Fahrer sehen nur Events, denen sie beigetreten sind, und dort nur abgeschlossene Vorfälle und Strafen.
- Der In-Game-Name ist Pflicht und nur einmal vergebbar.

## 4. Event anlegen (Admin)

*Events, Neues Event*: Name, Strecke aus der Liste der schon aufgezeichneten Strecken (oder „Andere Strecke“), Start. Der Event-Code entsteht automatisch. Es gibt keinen Raumcode mehr zum Eintippen: der Live-Kanal wird intern verwaltet.

## 5. Reader einrichten

1. Python installieren (python.org, Haken bei „Add to PATH“).
2. Im Spiel: *Settings, Gameplay, Enable Plugins* an. Kein rFactor-Plugin nötig.
3. Im Event: *Einstellungen, Reader-Key, Key kopieren*.
4. `reader/start_reader.bat` starten und den Key einfügen (Rechtsklick). Er wird in `config.json` gemerkt.
5. Ohne Spiel testen: `reader/start_demo.bat`.

## 6. Overlays in OBS

Im Event den Reiter **Overlays** öffnen. Die Links sind schon fertig (richtiger Kanal). In OBS: Quelle, *Browser*, Link einfügen, Größe wie angegeben. Hintergrund ist transparent.

## Replay in Le Mans Ultimate

Der Reader liest bei jedem Vorfall die Session-Uhr des Spiels und schickt sie mit. Das Replay von Le Mans Ultimate nutzt dieselbe Uhr. Bei jedem Vorfall und jeder Strafe steht deshalb „LMU-Replay ab 1:23:37“ (8 Sekunden vor dem Ereignis) mit Knopf *Kopieren*. Im Spiel: Replay öffnen, diese Zeit anspringen. Läuft die Replay-Uhr bei dir anders, trägst du im Event unter *Einstellungen* einmal den Unterschied in Sekunden ein (normal 0). Das beim ersten echten Test prüfen. Nur wer von Phase 4 (frühe Version) kommt, führt `supabase/repair.sql` einmal aus.

## Live-Seite

Links die Streckenkarte (Autos, die Gelb auslösen, pulsieren gelb), rechts das Live-Timing. Sektorzeiten erscheinen, sobald ein Auto den Sektor beendet hat (hell), ältere Zeiten der letzten Runde sind gedimmt.

## Reifen

Alle vier Reifen werden einzeln gezeigt (oben vorne links/rechts, unten hinten links/rechts), im Tower, auf der Fahrerkarte und in der Live-Tabelle. Mischbereifung (links Medium, rechts Soft) ist erkennbar. Buchstaben: S Soft, M Medium, H Hard, W Wet.

## Streckenkarten: so funktioniert es

Das Spiel liefert keine Streckenzeichnung. Der Reader baut sie aus den Positionen eines fahrenden Autos.

1. Der Reader fragt die Website: „Kennst du diese Strecke?“
2. Nein: er nimmt **automatisch im Hintergrund** auf, während du fährst (ca. eine ganze Runde, nicht in der Box).
3. Ist die Runde komplett, lädt er die Karte hoch. Sie wird **gespeichert** und gilt für alle künftigen Events und das Karten-Overlay.
4. Ja: nichts zu tun.

Unter *Admin, Strecken* siehst du alle gespeicherten Karten und kannst eine löschen (sie wird dann neu aufgenommen). Beim Event-Erstellen erscheinen sie in der Streckenauswahl.

## Vorfälle und Strafen

Rennleitung und Admins sehen im Event die Reiter *Live*, *Vorfälle*, *Strafen*. Der Reader erkennt Streckenverlassen, Track Limits, Dreher und Kontakte automatisch und legt **Hinweise** an, die ein Mensch prüft. Strafen sind Einträge und Veröffentlichungen, das Spiel wird nicht gesteuert.

## Tests (Entwickler, optional)

- Reader: im Ordner `reader` `python -m unittest discover tests` (30 Tests).
- Website: im Ordner `web` `npm install`, dann `npx tsc --noEmit` und `npm run build`.

## Bekannte Unsicherheiten (beim ersten echten Test prüfen)

- Startnummer kommt aus dem Fahrzeugnamen (`#8`). Fehlt sie dort, zeigt die Seite „–“.
- Reifen fremder Autos können im Multiplayer fehlen (dann „–“).
- Klassennamen (Hypercar, LMP2, GT3 …) werden am Namen erkannt.
- Die Schwellen der Auto-Hinweise sind geschätzt. Mit `--hints-debug` Rohwerte ansehen und in `config.json` unter `hints` anpassen.
- Echtes Supabase/Discord und das echte Spiel wurden hier nicht getestet, nur mit Nachbauten.

## Fehlersuche

- *Reader: „Key stimmt nicht“*: Key komplett kopieren (beginnt mit `LMU1.`). Neu: `config.json` löschen und neu starten.
- *Website zeigt „Warte auf Live-Daten“*: Läuft der Reader, ist das Spiel in einer Session? Key aus genau diesem Event?
- *„Event-Code unbekannt“*: Code wurde evtl. neu erzeugt, beim Admin nachfragen.
- *Strecke wird nicht aufgenommen*: Eine Runde ohne Box fahren. Konsole zeigt „Streckenkarte: …“.
- *Upload abgelehnt (401)*: `SUPABASE_SERVICE_ROLE_KEY` in Vercel gesetzt? Reader-Key aus dem richtigen Event?
