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

Der Reader liest bei jedem Vorfall die Session-Uhr des Spiels und schickt sie mit. Das Replay von Le Mans Ultimate nutzt dieselbe Uhr. Bei jedem Vorfall, Hinweis und jeder Strafe steht deshalb „LMU-Replay ab 1:23:37“ (8 Sekunden vor dem Ereignis). Läuft die Replay-Uhr bei dir anders, trägst du im Event unter *Einstellungen* einmal den Unterschied in Sekunden ein (normal 0).

**Knopf „▶ Im Spiel anspringen“** (Admin und Rennleitung): Die Website legt einen Befehl an, der Reader am Rennrechner holt ihn alle 1,5 Sekunden ab und springt über die lokale Schnittstelle des Spiels (Port 6397) im Replay an die Zeit. Das Ergebnis steht neben dem Knopf. Voraussetzungen: Reader läuft, Spiel läuft, Replay ist im Spiel geöffnet.

Wichtig: LMU dokumentiert keinen Replay-Sprung. Der Reader sucht selbst nach einem passenden Endpunkt. Klappt das nicht, steht am Knopf „Kein Replay-Sprung im Spiel gefunden“. Dann:
1. Spiel starten, im Ordner `reader` ausführen: `py lmu_reader.py --replay-endpoints`. Das listet alle Replay-Endpunkte des Spiels und speichert `lmu-api.json`.
2. Den richtigen Endpunkt in `config.json` eintragen, z. B. `"replay_jump": {"path": "/rest/replay/seek", "method": "POST", "param": "time", "where": "query", "scale": 1}`. (`scale` 1000, wenn das Spiel Millisekunden will.)
3. Oder die Ausgabe von Schritt 1 schicken, dann wird es fest eingebaut.

**Auf das Auto im Hinweis wechseln:** Der Sprung nimmt die Startnummer und den Namen des ersten beteiligten Fahrers mit. Der Reader sucht das Auto im Spiel (Startnummer, sonst Name) und stellt die Replay-Kamera darauf. Klappt der Wechsel nicht, springt das Replay trotzdem, und neben dem Knopf steht ein Hinweis. Dann den passenden Endpunkt aus `--replay-endpoints` in `config.json` eintragen, z. B. `"replay_focus": {"path": "/rest/watch/focus", "method": "POST", "param": "slotID", "where": "query", "by": "slot"}` (`by`: `slot`, `number` oder `name`).

**Fahrzeug im Spiel anwählen und zurück zu Live:**
- Im Reiter *Live* auf eine Zeile klicken: Der Reader stellt die Spiel-Kamera auf dieses Auto (`PUT /rest/watch/focus/{slotid}`). Das geht im Replay und im Live-Bild. Das dürfen Admin, Rennleitung und Übertragung.
- „↩ Zurück zu Live“ (oben im Reiter *Live*) beendet das Replay im Spiel.
- „▶ Im Spiel anspringen“ öffnet das Replay selbst, wenn das Spiel gerade das Live-Bild zeigt.

## Anmeldung zum Event (Fahrer und Teams)

**Sichtbarkeit:** Fahrer sehen nur Übersicht (Infos und Anmeldeliste) und Strafen. Die Übertragung (Kommentator) sieht alles außer den Auto-Hinweisen (Übersicht, Live, Vorfälle, Strafen, Fahrer, Overlays), darf aber nichts bearbeiten: keine Strafen, keine Vorfälle, keine Fahrer ändern. Erlaubt sind das Live-Dashboard, der Klick auf ein Auto (Kamera im Spiel) und „Zurück zu Live“. Rennleitung und Admin sehen und bearbeiten alles. Ein Teamkapitän sieht zusätzlich „Mein Team“. Die Adresse der Seite öffnet direkt das Anmelde-Fenster.

**Admin:** Beim Anlegen des Events die Klassen wählen (Hypercar, LMP2, LMGT3 …, eigene möglich) und ggf. „Team-Event“ ankreuzen. Beides ist später unter *Einstellungen* änderbar.

**Einzelfahrer:** Event-Code eingeben, „Weiter“. Der In-Game-Name kommt automatisch aus dem Konto (sonst einmal eintragen), dazu Klasse aus der Liste und Startnummer (1 bis 999, pro Event einmalig).

**Team-Event:**
1. Der Teamkapitän wählt „Neues Team anmelden“: Teamname, Klasse, Startnummer und die In-Game-Namen der Teammitglieder (eine pro Zeile). Er ist automatisch Fahrer.
2. Die Teammitglieder geben nur den Event-Code ein und wählen „Ich bin Teammitglied“. Sie werden über ihren In-Game-Namen dem Team zugeordnet, Klasse und Nummer gelten fürs ganze Team.
3. Der Kapitän pflegt sein Team später im Reiter *Fahrer* („Mein Team“: Mitglieder hinzufügen oder entfernen). Admin und Rennleitung können alles ändern.
Die Übersicht zeigt alle Fahrer mit Klasse, Team und Status („angemeldet“ oder „noch nicht beigetreten“).

## Auto-Hinweise und Vorfälle

Ein Auto-Hinweis ist **kein** Vorfall. Er erscheint in der Live-Seite (links unter der Karte) und oben im Reiter *Vorfälle*. Die Rennleitung klickt:
- **Ist Vorfall**: Der Hinweis wird zum Vorfall mit Status *In Bearbeitung*.
- **Kein Vorfall**: Der Hinweis wird gelöscht.

## Kopfleiste, Kamera und Strafen-Bestätigung

- Oben auf jeder Event-Seite steht die Statusleiste: Reader, Session, Restzeit, Luft- und Streckentemperatur, Wetter, Kamera (beobachtetes Auto) und Flaggenstatus.
- Reiter *Live*: „◀ Voriges Auto“, „Nächstes Auto ▶“ und „↩ Zurück zu Live“ steuern die Kamera im Spiel. Ein Klick auf ein Auto stellt die Kamera darauf. Dafür `supabase/repair.sql` erneut ausführen und den Reader-Ordner ersetzen.
- Strafen: Das Formular steht links immer offen. „Führung“ trägt die Runde des Führenden ein, „Jetzt“ die aktuelle Session-Zeit. Vor dem Verhängen erscheint ein Bestätigungsfenster.
- `py lmu_reader.py --replay-endpoints` zeigt jetzt auch die erlaubten Werte der Replay-Befehle (z. B. für Play, Pause, Zeitlupe).

## Streckenkarte löschen und neu aufnehmen

Admin: *Admin → Strecken → „Löschen / neu aufnehmen“* oder im Event unter *Einstellungen → Streckenkarte*. Der Reader fragt alle 20 Sekunden nach, ob die Karte noch da ist. Fehlt sie, nimmt er sie in der nächsten Runde neu auf und lädt sie hoch. Dafür muss jemand mit laufendem Reader eine vollständige Runde fahren.

## Event löschen

Admins: im Event unter *Einstellungen, Event löschen* oder in der Event-Liste *Löschen*. Es gibt eine Rückfrage. Gelöscht werden Vorfälle, Strafen, Fahrer und Reader-Key des Events.

## Update von einer älteren Version

Einmal `supabase/repair.sql` im SQL Editor ausführen (gefahrlos, löscht nichts). Sonst funktionieren Hinweis-Löschen und der Replay-Knopf nicht.

## Bedienung der Website

Kopf, Titel und Reiter bleiben immer an derselben Stelle. Die Seite selbst scrollt nicht, es scrollen nur die Boxen (Hinweise, Tabellen, Details). Auf Handy und kleinen Fenstern scrollt die Seite normal.

## Live-Seite

Links schmal die Streckenkarte (Autos, die Gelb auslösen, pulsieren gelb) mit den Auto-Hinweisen, rechts über die volle Breite das Live-Timing, ganz rechts die aktuelle Geschwindigkeit. Sektorzeiten erscheinen, sobald ein Auto den Sektor beendet hat (hell), ältere Zeiten der letzten Runde sind gedimmt.

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

- Reader: im Ordner `reader` `python -m unittest discover tests` (36 Tests).
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

## Neue Navigation (Event)

Im Event gibt es keine Seitenleiste mehr. Oben links steht „← Zurück“ (verlässt das Event), darunter die Tab-Leiste:
**Live Timings** (Tabelle, Klick auf eine Zeile stellt die Spielkamera), **Controls** (Kamera, Sprechfunk, OBS-Overlays), **Track Map** (Karte groß),
**Replay** (Auto-Hinweise und Vorfälle, Zahl = offen), **Penalties**, **Session** (Event-Infos, Anmeldungen, Einstellungen für Admins), **Account**.
Fahrer sehen nur Penalties, Session und Account.

## Überholmanöver und Zusammenfassen

Der Reader meldet ein **Überholmanöver**, wenn zwei nahe Autos die Reihenfolge tauschen (`hints` in config.json: `overtake_radius_m` 20, `overtake_min_kmh` 40).
Es ist nur zum Ansehen („Angucken“ springt im Replay hin, „Erledigt“ blendet aus). Hinweise am selben Fahrer innerhalb von 20 s werden zu einer Zeile
zusammengefasst, z. B. „2x Kontakt & 1x Überholmanöver“. „Ist Vorfall“ macht daraus einen Vorfall (der Rest wird gelöscht), „Kein Vorfall“ löscht alle.
**Wichtig:** `supabase/repair.sql` erneut ausführen (neue Art „overtake“). Die Schwellen sind noch nicht mit echten Rennen kalibriert.

## Sprechfunk (kostenlos)

Rennleitung (Admin/Steward) spricht unter **Controls → Sprechfunk** an: alle, eine Klasse, ein Team oder einen Fahrer (Knopf halten oder Taste V).
Fahrer klicken oben im Event auf „Funk beitreten“ (ein Klick nötig, sonst blockiert der Browser den Ton) und hören nur Durchsagen.
Technik: WebRTC (Audio direkt zwischen Browsern, Stern um die Rennleitung), Verbindungsaufbau über Supabase Realtime. Kein Server, keine Kosten.
Team-Gespräche bleiben in Discord/TeamSpeak. Grenzen: kein Schutz gegen Mithören durch Event-Teilnehmer, etwa 30–40 Fahrer, hinter strengen
Firmen-/Mobilnetzen kann ein TURN-Server nötig sein (optional: `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USER`, `NEXT_PUBLIC_TURN_PASS` in Vercel, z. B. Cloudflare Realtime TURN).
Die Rennleitung muss den Tab offen lassen. Mikrofon-Freigabe im Browser erlauben.

## Replay-Steuerung, Funk-Auswahl, Überholmanöver nur im Rennen

- Controls → „Replay-Steuerung“: Zurück, Pause, Play, Zeitlupe, Vor. Der Reader probiert mehrere Schreibweisen der Spielbefehle und merkt sich die, die klappt.
  Klappt ein Knopf nicht: `py lmu_reader.py --replay-probe` (Spiel im Replay) und die Ausgabe schicken, oder in config.json `replay_transport` eintragen.
- Sprechfunk: erst Empfänger wählen (alle, Klasse, Team, Fahrer), erst dann ist der Sprechen-Knopf aktiv.
- Überholmanöver-Hinweise gibt es nur im Rennen, nicht in Training/Quali.
- **Wichtig:** `supabase/repair.sql` erneut ausführen (neue Befehlsart „transport“).

## Replay-Knöpfe finden

Das Spiel antwortet auf jeden Namen mit „HTTP 200“, auch auf falsche. Darum liest der Reader die erlaubten Befehle jetzt selbst aus dem Schema des Spiels.
Klappt ein Knopf trotzdem nicht: `py lmu_reader.py --replay-commands` (Spiel läuft) und die Ausgabe schicken.
Funk: Empfänger werden als Auswahl-Knöpfe gezeigt (Alle, Klasse, Team, Fahrer), erst danach „Sprechen“.

## Fahrer-Overlay (SimHub)

Jeder Fahrer hat im Event unter **Session** einen persönlichen Link (`/overlay/me?k=…&e=…`). Der Schlüssel `k` gehört nur ihm, nicht weitergeben.
In SimHub: Dash Studio → Overlay → „Web page view“ → Link einfügen, „Click through“ an, Größe etwa 480 × 300.
Angezeigt wird: **neue Strafe** (25 s groß, danach in „Offene Strafen“), **Vorfall in Bearbeitung** (nur wenn der Fahrer beteiligt ist),
**„Rennleitung spricht“** (steht „nur zu dir“, wenn nur dieser Fahrer angesprochen wird, andere Fahrer sehen nichts) und **Kurznachrichten**
der Rennleitung (Controls → Sprechfunk, Empfänger wählen, Text, Senden; 15 s sichtbar). Optionen: `scale=1.2`, `always=1` (zeigt „Alles ruhig“), `demo=1` (Vorschau).
Technik: Der Overlay-Link holt alle 3 s Strafen/Vorfälle vom Server (`/api/driver-feed`, nur eigene Daten) und hört auf den Funkkanal. Ton kommt weiter über die Website („Funk beitreten“).
Die Rennleitung sieht Fahrer, die nur das Overlay offen haben, im Sprechfunk als „nur Overlay“.
Hinweis: Ob SimHub den transparenten Hintergrund der Webseite durchlässt, hängt von der SimHub-Version ab. Sonst bleibt ein dunkler Kasten.
**Wichtig:** `supabase/repair.sql` erneut ausführen (Overlay-Schlüssel).

## Fahrer-Overlay im Spiel-Stil und Funk-Tab

- Das Overlay (`/overlay/me`) sieht aus wie die Einblendung im Spiel ("RACE DIRECTOR"). **Alle Fahrer** sehen jede neue Strafe (25 s): Zeile 1 Fahrer/Team, 2 Runde, 3 Strafe, 4 Grund.
  Wird ein Vorfall geprüft, fehlt der Grund und unten steht **UNDER REVIEW**. Wird er ohne Strafe abgeschlossen, steht 90 s **NO FURTHER ACTION** da.
- Die Entscheidung „Rennunfall, keine Strafe“ heißt jetzt „No further action“ (alte Einträge „Rennunfall, keine Strafe“/„Kein Vergehen“ zählen auch als solche).
- Fahrer haben einen eigenen Tab **Funk** (zwischen Session und Account): großer Kasten (aus / wartet / verbunden / **RENNLEITUNG SPRICHT**), Lautstärke, Testton,
  Signalton beim Sprechbeginn, Punkt am Tab bei Durchsage.

## Funk-Anzeige und Anmeldeliste

- Das Overlay zeigt „Speaking to you only“ nur, wenn die Rennleitung genau einen Fahrer wählt. Bei „Alle Fahrer“, Klasse oder Team steht „Speaking“ (auch wenn nur ein Fahrer im Funk ist).
- Anmeldeliste (Session): Teams als Zeilen mit Startnummer, Klasse und „x/y angemeldet“. Klick auf ein Team zeigt die Fahrer. Die doppelte Tabelle ist weg.

## Overlay-Zeiten

- „Penalty applied“, „Under review“ und „No further action“ stehen je **20 s** im Bild (Ablaufbalken unten). Wer das Overlay erst später öffnet, sieht Älteres nicht.
- Die eigene Strafe bleibt stehen („Penalty · to serve“), bis die Rennleitung sie auf „Abgesessen“ setzt. Gilt für Zeitstrafe, Drive-Through, Stop-and-Go.
- Nur 20 s: alles, was nicht im Rennen abzusitzen ist (Verwarnung, Plätze zurück, DQ, Rennsperre, Qualisperre) und Zeitstrafen mit dem Häkchen **„Wird nach dem Rennen zur Zeit addiert“** (neu im Strafformular).
- **Wichtig:** `supabase/repair.sql` erneut ausführen (neue Spalte `after_race`).

## Strafe schliesst Vorfall
Wenn im Penalties-Tab eine Strafe vergeben wird, geht der passende Vorfall mit Status "In Bearbeitung" (oder der gewählte Vorfall) automatisch auf "Abgeschlossen" und bekommt die Strafe als Entscheidung. Im Replay-Tab erscheint er dann als abgeschlossen.

## Einheitlicher Stil
Website und alle Overlays (Tower, Fahrer, Status, Karte) nutzen denselben Stil wie das Fahrer-Overlay: dunkle Glas-Karten, gelber Akzentstreifen, Großbuchstaben-Labels.

## Startseite, schmale Fenster, Replay-Hervorhebung
- Link öffnen (lmu-broadcast.vercel.app) zeigt immer die Startseite/Anmeldung. Wer angemeldet ist, sieht "Zu den Events". Weiterleitung nur direkt nach dem Login.
- Tabellen brechen in schmalen Fenstern um, die Seite scrollt nicht mehr seitwärts (nur die Live-Tabelle scrollt in sich).
- "Im Spiel anspringen" / "Angucken": keine grüne Meldung mehr. Die Zeile des Hinweises, Vorfalls oder der Strafe wird gelb hervorgehoben.

## FLM Broadcast Overlay (neu)
Link: `/overlay/broadcast?room=CODE&view=tower,driver` (Controls > OBS-Overlays > "FLM Broadcast" baut den Link per Ankreuzen). OBS-Größe 1920×1080, transparent.
- `view`: tower, driver, h2h (Head to Head), battle (Onboard Battle mit Rundenzeiten), telemetry (Tempo, Energie, Sektor-Karten), energy (Tower zeigt Virtual Energy), replay (REPLAY-Marke).
- `car=NR` Auto festlegen (sonst das im Spiel angeschaute Auto), `vs=NR` Gegner festlegen (sonst automatisch der Nachbar mit dem kleineren Abstand), `cars=7,94,35` Karten festlegen.
- Alle Abstände kommen vom Reader (`reader/broadcast.py`): Klassenplatz, Abstand zum Führenden und zum Auto davor. Rennen: jede Sekunde neu. Quali/Training: nur wenn jemand über Start/Ziel fährt.
- Head to Head unten (S1/S2/S3): Der Reader schickt je Auto die Durchfahrtszeiten an S1, S2, Start/Ziel der letzten Runden. Daraus rechnet die Website den Abstand für JEDES beliebige Paar.
- Onboard Battle: Rundenzeit letzte und davor (`prevLap`) beider Autos, ebenfalls für jedes Paar.
- Rundentimer: läuft glatt in der Website, startet neu bei jeder Start/Ziel-Überfahrt und synchronisiert sich mit dem Reader-Wert.
- Virtual Energy: Reader liest `mVirtualEnergy` aus dem Telemetry-Block. Ob LMU den Wert auch für fremde Autos liefert, muss im echten Spiel geprüft werden (sonst steht "–").
- Kamera-Fokus: Reader liest `playerVehicleIdx`. Wenn das im Zuschauermodus nicht das angeschaute Auto ist, `car=NR` nutzen.
- Neuer Reader nötig (`reader/` ersetzen), `supabase/repair.sql` nicht.

## Website: Sidebar und Look
Feste linke Sidebar: oben globale Navigation (Alle Events, Admin, Profil), darunter das Event-Menü. Rennleitung/Admin sehen die Gruppe "Rennleitung" (Live Timings, Controls, Track Map, Replay), Fahrer nur "Event" (Penalties, Session, Funk, Account). Dunkles neutrales Design, Farbe nur für Status (Gelb/FCY, Rot/Strafen, Grün/ok). Tabellen brechen nie um, Strafen: Formular oben, Tabelle breit darunter.

## App installieren, Reader als .exe, Palette
- **Web-App:** In Chrome die Seite öffnen, rechts in der Adressleiste das Installieren-Symbol (oder Menü > "FLM Broadcast installieren"). Danach eigenes Fenster und Startmenü-Eintrag. Manifest, Icons und Service Worker sind dabei (`web/public/icons`, `web/public/sw.js`).
- **Reader .exe:** `reader\build_exe.bat` doppelklicken (braucht einmal Python + Internet), Ergebnis `reader\dist\FLM-Reader.exe`. Oder bei GitHub: `.github/workflows/build-reader.yml` (Actions > "Build Reader EXE" > Run, dann Artifact laden). `config.json` liegt beim ersten Start neben der .exe. Start: Doppelklick, Demo: Verknüpfung mit `--demo`.
- **Palette:** #1A1A1F, #2D2B55, #6A5ACD, #A678B9, #F0D9B5, #F4A62A (Orange = Hauptknöpfe/Auswahl). Status-Farben (Gelb/FCY, Rot, Grün) bleiben. Neue Anmeldeseite mit Glas-Karte.
- **Alte "Livetest"-Seite:** `web/app/page.tsx` ersetzt die alte Startseite. Falls im GitHub-Repo noch alte Ordner aus Phase 1/2 liegen (z. B. `web/app/obs`, `web/app/rennleitung`), dort löschen.
- **Logo:** gelbes FLM mit Linien + weißes BROADCAST (App-Icon aus deinem Bild: `web/public/icons`, `reader/flm.ico`).
