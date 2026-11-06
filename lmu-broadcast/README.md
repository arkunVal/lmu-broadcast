# LMU Rennleitung: Desktop-App (NEU, ersetzt Schritt 2 "Vercel")

Die Website läuft jetzt **in einer Windows-App** (Electron). Auf GitHub liegt nur noch der Quellcode, später eine Vertriebsseite.
Die Server-Teile (Reader-Eingang, Befehle, Fahrer-Feed, Streckenkarten) laufen als **Supabase Edge Function `api`**, kostenlos.
Vercel brauchst du nicht mehr (Projekt dort kannst du löschen).

**Einmal einrichten (ca. 15 Minuten):**
1. **GitHub-Repo mit ALLEN Ordnern** (`web`, `reader`, `desktop`, `supabase`, `.github`). Früher nur `web`, jetzt alles.
2. **Funktion hochladen:** Supabase > Account > Access Tokens > neuen Token erzeugen. In GitHub: Repo > Settings > Secrets and variables > Actions, zwei Secrets anlegen: `SUPABASE_ACCESS_TOKEN` (der Token) und `SUPABASE_PROJECT_REF` (Supabase > Project Settings > General > Reference ID). Dann Actions > **Deploy Supabase Function** > Run workflow. Grün = fertig.
3. **Installer bauen:** zwei weitere Secrets: `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase > Project Settings > API). Dann Actions > **Build Desktop App** > Run workflow. Nach ca. 10 Minuten unter *Artifacts* die **FLM-Broadcast-Setup.exe** laden und installieren.
4. **Login freigeben:** Supabase > Authentication > URL Configuration: *Site URL* = `http://127.0.0.1:47821`, und bei *Redirect URLs* `http://127.0.0.1:47821/**` hinzufügen. (Discord-Login geht weiter über denselben Weg.)
5. **Reader-Key neu kopieren:** Der Key enthält jetzt die neue Server-Adresse. Im Event unter Session ein neuer Key (alter Key aus Vercel-Zeit zeigt noch auf die alte Adresse).

**Benutzen:**
- App starten. Fester lokaler Link für OBS: `http://127.0.0.1:47821/overlay/...` (die Links in den Controls zeigen ihn schon richtig an). Die App muss dafür laufen.
- Rennrechner: Session-Tab > **Reader in der App > Reader starten**. Kein extra Fenster, kein Key einfügen. Der Reader steckt in der App.
- SimHub Fahrer-Overlay: gleicher Link `http://127.0.0.1:47821/overlay/me?...`, die App läuft beim Fahrer.
- Alte Links mit `lmu-broadcast.vercel.app` gehen nicht mehr.

**Was neu liegt wo:**
- `desktop/`: Electron (Fenster, lokaler Server mit festem Port 47821, Reader-Start).
- `supabase/functions/api/`: Server-Funktion (früher `web/app/api`).
- `web/`: jetzt statischer Export (`npm run build` erzeugt `web/out`). Event-Seite heißt jetzt `/events/view?id=...`.
- Entwickeln: `cd web && npm run build`, dann `cd desktop && npm install && npm start`.

---

# LMU Rennleitung: Schnellstart (Teile davon sind alt, oben zuerst lesen)

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

## Sicherheit (Stand Prüfung)
- **API-Routen** (`/api/ingest`, `/api/commands`, `/api/tracks`, `/api/driver-feed`): gemeinsamer Helfer `web/lib/server.ts`. Token-Format wird geprüft, 30 falsche Versuche pro Minute und IP sperren (429), Anfragen sind pro IP begrenzt, JSON hat eine Größengrenze, Antworten sind `no-store`. Der Service-Key liegt nur auf dem Server (Vercel-Variable).
- **Header** (`web/next.config.ts`): Content-Security-Policy, kein Einbetten in fremde Seiten, nosniff, kein Referrer, HSTS, Mikrofon nur für die eigene Seite.
- **Datenbank:** Fehlversuche bei Event-Code und Key werden um 1,5 s verzögert, neue Event-Codes sind länger (48 Bit). Dafür `supabase/repair.sql` einmal ausführen. Alle Funktionen setzen `search_path`, Zugriff nur über RLS (116 Prüfungen laufen grün).
- **Reader:** sendet den geheimen Token nur über https (sonst Abbruch mit Meldung).
- **Bewusst offen:** Der Funk-Signalkanal ist öffentlich, geschützt nur dadurch, dass die Event-ID nicht erratbar ist. Das Limit ist pro Server-Instanz (Vercel). Event-Codes können Admins jederzeit neu erzeugen.

## Fahrer-Nachricht und Interview (neu)
- **Nachricht an die Rennleitung:** Fahrer im Tab „Funk“ (nach „Funk beitreten“) → Feld „Nachricht an die Rennleitung“. Erscheint bei Admin, Steward und Broadcaster in **Controls → Nachrichten der Fahrer** (mit „Erledigt“). Der Fahrer sieht „Angekommen“. Geht nur, solange Rennleitung oder Broadcaster im Funk ist (Broadcaster: Controls → „Mitlesen starten“).
- **Interview:** Rennleitung wählt Fahrer/Team/Klasse, Thema eintippen, „ins Interview bitten“. Der Fahrer sieht im Funk-Tab „Annehmen / Ablehnen“. Nach Annehmen sprechen beide frei miteinander (Mikrofon). Im **Fahrer-Overlay** erscheint die Karte „Race Control · Interview“ nur bei den Gerufenen. „Interview beenden“ schließt alles.
- Kein neues SQL nötig. Der Ton läuft wie der Sprechfunk direkt im Browser.
- Lila ist jetzt dunkler und bläulicher (#3F51C7 / #7B8CD8).

## Broadcast-Overlay live umschalten (neu)
- Controls → FLM Broadcast: **ein Link** (`view=live`), eine OBS-Quelle. Die Knöpfe (Tower, Fahrerkarte, Head to Head, Battle, Telemetry, Energy, Replay-Marke) schalten Ansichten sofort an und aus. Grün = sichtbar.
- Die Controls-Seite muss offen sein. Wird OBS neu geladen, behält das Overlay den letzten Stand. Wer feste Links will: Haken „Fester Link“.
- Fahrer-Overlay (`/overlay/me`) ist jetzt komplett unsichtbar, wenn nichts angezeigt wird (kein Hintergrundeffekt mehr). Das gilt für alle Overlays.
- Interview-Anfrage erscheint im Fahrer-Overlay nur bei den Gerufenen (Karte „Race Control · Interview“).

## Anhörung, Sprache, Funk-Ton (neu)
- „Interview“ heißt jetzt **Anhörung** (Englisch: Hearing). Die Rennleitung wählt alle Fahrer, eine Klasse, ein Team oder mehrere Fahrer (Mehrfachauswahl). Der Gerufene sieht, wen es betrifft: „Alle Fahrer …“, „Du wirst …“, „Du und Lena Vogt …“, „Dein Team (Alpha) …“. Wer nicht gerufen wird, sieht nichts.
- **Sprache Deutsch / English:** Umschalter auf der Login-Seite und unter Account. Wird im Browser gemerkt. Die Übersetzung steht in `web/lib/i18n-en.ts` (Deutsch → Englisch). Fehlt ein Text, bleibt er Deutsch: dort einfach eine Zeile ergänzen.
- Fahrer-Overlay ist englisch. Deutsch mit `&lang=de` am Link.
- Funk-Signalton: zwei weiche Töne statt einem schrillen Piepton.

## Broadcast-Fokus und Startnummern (neu)
- **Fokus:** Das Broadcast-Overlay folgt dem Auto, das du im Spiel anschaust, nicht deinem eigenen. Der Reader fragt dafür das Spiel (REST) und merkt sich Kamerawechsel von der Website (Klick in Live Timings). Beim Start schreibt der Reader `[Fokus] Quelle: game / command / memory` (game = vom Spiel gemeldet, command = per Website gewählt, memory = nur dein eigenes Auto). Steht dort „memory“, dann klick einmal ein Auto in Live Timings an. Mit `car=NUM` am Link kannst du es immer festlegen.
- **Startnummern sind Text:** 7, 07 und 007 sind verschiedene Autos (Reader, Datenbank, Website, Overlays). Anmeldung: 1 bis 3 Ziffern.
- **Wichtig: `supabase/repair.sql` einmal neu ausführen** (stellt die Nummern-Spalten auf Text um, vorhandene Einträge bleiben). Reader bitte durch die neue Version ersetzen (alte Reader schicken Zahlen, das geht noch, aber ohne Nullen).

## Neue Seite „Broadcast“, Instant Replay, Overlay-Animationen (neu)
- Der Tab „Live Timings“ heißt jetzt **Broadcast** und ist die Schaltzentrale: Standings (nach Klasse filterbar, Klick = Kamera im Spiel), **Event Feed** (CON, IMP, SPN, OFF, OVT, PIT, FL), Track Map, Driver Focus, Cars Around, und rechts die **Overlay-Schalter** (Tower, Fahrerkarte, Head to Head, Battle, Telemetry, Energy).
- **Instant Replay:** Knöpfe „Instant Replay“ (7 s), −15 s, −30 s, −60 s springen im Spiel-Replay zurück, auf das Auto im Bild. „● Live“ geht zurück zum Live-Bild. Klick auf einen Eintrag im Event Feed springt ca. 7 Sekunden vor das Ereignis. **PIT-Einträge** zeigen dagegen kein Replay: die Kamera geht aufs Auto, Live-Bild.
- **Overlay bei Replay:** Sobald ein Replay startet, blendet das FLM-Broadcast-Overlay (Link mit `view=live`) alles aus und zeigt nur das REPLAY-Banner. Bei „Live“ kommt alles wieder. Sicherheitsnetz: nach 60 s endet die Blende von selbst.
- **Animationen:** Jede Ansicht fährt beim Ein- und Ausblenden animiert ein und aus (Tower von links, Fahrerkarte als Wisch, Telemetry/Battle von unten oder oben).
- Pit- und Fastest-Lap-Einträge erkennt die Seite live aus den Daten, solange sie offen ist. Kontakte, Dreher usw. kommen aus den Auto-Hinweisen.

## Replay/Live-Animation, Meldungen im Broadcast, Kamera Swingarm

- **Animation zuerst, dann das Spiel:** Bei Replay und bei Live läuft erst ein Wischer über das ganze Overlay (REPLAY / LIVE). Erst wenn er das Bild verdeckt (ca. 0,65 s), geht der Befehl ans Spiel. Der Sprung ist so nicht zu sehen. Dafür muss die Event-Seite (Tab Broadcast) beim Rennleiter/Caster offen bleiben.
- **Meldungen im Broadcast-Overlay** (rechts oben, Link mit `view=live`): Strafen, "Incident – Under review", "No further action", Funk ("Speaking"), Nachricht und Anhörung. Sie kommen vom Browser der Rennleitung (Admin/Steward muss die Event-Seite offen haben). Beim Laden schon vorhandene Strafen werden nicht noch einmal gezeigt.
- (ENTFÄLLT, siehe unten „Nur Shared Memory“) **Kamera "Swingarm" beim Replay:** Der Reader springt erst an die Stelle, setzt dann das Auto und dann die Kamera. Anderer Name: `"replay_camera_name": "…"` in der Reader-Config. Findet der Reader den Kamera-Befehl nicht, `lmu_reader.py --replay-endpoints` ausführen und die Zeilen "Kamera" schicken.
- Der Navy-Fleck im OBS kam von weichgezeichneten Animationen (blur). Entfernt.

## Spiel-Befehle wieder da (lokale Schnittstelle), Stand 4. November 2026

Studio 397 hat im Discord bestätigt: Alles Lokale ist erlaubt, solange nichts an deren Dienste (RaceControl) geschickt wird. Darum sind Replay-Sprung, Kamera und Auto wählen zurück. Der Abschnitt „Nur Shared Memory“ oben gilt nicht mehr, so ist es jetzt:

- **Daten** kommen weiter nur aus dem Shared Memory.
- **Befehle** (Sprung, Kamera, Auto, Live) gehen vom Reader nur an `127.0.0.1:6397` auf deinem PC. Kein Steam, kein Token, kein Studio-397-Server. Befehle laufen nur auf Knopfdruck, der Zustand (Fokus/Replay) wird alle 3 s lokal gelesen.
- **Aus:** `"game_rest": false` in `config.json` stellt alles ab (dann nur Shared Memory).
- **Sprung:** Replay öffnen (falls nötig) → an die Zeit springen → Auto wählen → erst danach Kamera **„Swingarm“** (andere Kamera: `"replay_camera_name": "…"`).
- **Animation zuerst:** Bei Replay und Live läuft erst der Wischer im Overlay, dann geht der Befehl ans Spiel.
- **Endpunkte nicht offiziell:** Der Reader sucht sie im Schema des Spiels. Klappt Sprung oder Kamera nicht: `py lmu_reader.py --game-endpoints` ausführen und die Ausgabe schicken, oder `replay_jump` / `replay_camera` in `config.json` eintragen (Beispiele oben in `reader/game_rest.py`).
- **Auto im Overlay:** Klick auf eine Zeile in „Broadcast“ stellt Spiel-Kamera und Overlay auf dieses Auto. „Auto: Spiel“ geht zurück zum Auto aus den Spieldaten.
- Nicht zurückgekommen: die Replay-Knöpfe Play/Pause/Zeitlupe.

## Kamera-Leiste (Tab Broadcast, ganz unten)

- Ein Knopf pro Kamera (Standard: Cockpit, Bonnet, Splitter, Chase, TV, Hood, Dash Far, Hood Right, Hood Left, F. Splitter, R. Splitter, Rearwing, Rearwing Far). Links steht das Auto, das du gerade anschaust. Die aktive Kamera ist rot mit „LIVE“.
- Klick oder Hotkey schickt den Namen an den Reader, der ihn über die lokale Spiel-Schnittstelle setzt (`setCameraByName`). Der Name muss genau so heißen wie im Spiel.
- **Hotkeys einstellen:** Zahnrad rechts in der Leiste. Auf die Taste neben dem Kameranamen klicken und die Kombination drücken (Esc bricht ab, Entf löscht). Kameras lassen sich umbenennen, hinzufügen, entfernen. Alles wird in diesem Browser gespeichert.
- Hotkeys gelten nur, solange der Reiter „Broadcast“ offen ist und nicht in einem Eingabefeld getippt wird. Browser-eigene Kombinationen (z. B. Strg+F5) fängt die Seite ab, so gut es geht. Klappt eine nicht, eine andere Kombination wählen.
- Ob die Kameras im Live-Bild genauso heißen wie im Replay, ist ungeprüft. Wenn eine nicht greift: Namen im Spiel nachsehen und hier anpassen, oder `py lmu_reader.py --game-endpoints` laufen lassen.

## Neues Design und Live-Seite (Broadcast)

- **Look wie die Studium-App:** ruhiges Dunkel, abgerundete Karten, Amber nur als Akzent. Dazu Standards für gute Bedienung: sichtbarer Fokus-Rahmen, Cursor auf Knöpfen, weniger Animation, wenn das System das wünscht, größere Tippflächen auf Touch-Geräten.
- **Broadcast-Seite:** Die Leiste „FLM Broadcast Overlay“ (Tower, Fahrerkarte, Head to Head …) sitzt jetzt oben unter Instant Replay, gebaut wie die Kamera-Leiste. Grün = im Overlay an. Die Standings sind niedriger, Track Map, Driver Focus und Cars Around unten größer.
- **Driver Focus:** Platz gesamt, Name, Nummer, Team, Klasse mit Platz, Letzte/Beste Runde, Schnitt der letzten 3 Runden (nur Runden, die die Seite seit dem Öffnen gesehen hat), Klassenplatz, Tank (neu vom Reader, in %), und alle vier Reifen einzeln. Delta, Predicted und Pace vs Class fehlen mit Absicht. Die Standings zeigen die vier Reifen auch einzeln.
- Der Reader liefert jetzt `fuel` (Tankinhalt in Prozent der Tankgröße). Dafür Reader ersetzen.

## Version, Overlay-Leiste, Wischer (05.11.)
- Links unten in der Seitenleiste steht ein Versions-Stempel (`v2026-11-05.3-slim-overlay`). Steht da etwas anderes, laeuft noch alter Code: alle Dateien kopieren (auch `app/globals.css`), pushen, Vercel-Deploy abwarten, Strg+F5.
- OBS: Browser-Quelle -> "Cache der aktuellen Seite aktualisieren". `/overlay/*` wird jetzt ohne Cache ausgeliefert.
- Das grosse REPLAY-Banner ist weg. Es gibt nur noch den Wischer plus kleine REPLAY-Marke.
- Overlay-Leiste ist so schmal wie die Kamera-Leiste (max 64px).

## Overlay im Website-Look, eine Karte unten (06.11.)
- FLM Broadcast Overlay hat jetzt den gleichen Stil wie die Website: ruhiges Dunkel (#13151a), runde Karten, Amber als Akzent (Fokus-Auto in der Tabelle = Amber, Gegner = hellgrau).
- Unten im Bild ist Platz fuer EINE Ansicht: Fahrerkarte, Head to Head, Onboard Battle, Onboard Telemetry. Wer eingeschaltet wird, schaltet die anderen aus (Stream und Leiste auf der Broadcast-Seite). Tower und Virtual Energy bleiben frei schaltbar.
- Test (Playwright, 1920x1080): kein Teil des Overlays ueberlappt ein anderes, auch mit 4 Meldungen rechts.
- Dateien neu/geaendert: `web/lib/bcSwitch.ts`, `web/app/overlay/broadcast/{page.tsx,broadcast.css}`, `web/lib/version.ts`.
