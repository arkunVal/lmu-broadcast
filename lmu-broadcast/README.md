# LMU Broadcast – Phase 1: Live-Daten auf die Website

Ziel dieser Phase: Du siehst auf einer Website live, was Le Mans Ultimate (LMU) meldet.
Das ist der Beweis, dass die Kette funktioniert:

    Le Mans Ultimate  →  Reader (Python, dein PC)  →  Supabase Realtime  →  Website (Vercel)

Ordner:
- `reader/`  Python-Programm für deinen Rennrechner (nur Standardbibliothek, nichts zu installieren außer Python)
- `web/`     Website (Next.js) für Vercel

---------------------------------------------------------------------

## Schritt 1: Python installieren (einmalig)

1. https://www.python.org/downloads/ → aktuelle Version herunterladen.
2. Im Installer unten **„Add python.exe to PATH“ anhaken**, dann „Install Now“.
3. Test: Windows-Taste, `cmd` eingeben, Enter, dann `py --version`. Es muss eine Version erscheinen.

## Schritt 2: Le Mans Ultimate vorbereiten

1. In LMU: **Settings → Gameplay → „Enable Plugins“ einschalten**.
2. LMU hat inzwischen eine eigene Shared-Memory-Schnittstelle. Der Reader nutzt genau diese,
   du brauchst dafür **kein** zusätzliches rF2-Plugin. Wenn TinyPedal bei dir schon läuft, ist
   alles Nötige da.
3. Bitte **Spiel zuerst starten, dann den Reader** (der Reader verbindet sich ohnehin selbst neu).

## Schritt 3: Supabase einrichten (ca. 5 Minuten)

Ich empfehle ein **neues, eigenes Projekt** (Free-Plan erlaubt mehrere), damit sich dein anderes Projekt nicht mit diesem vermischt.

1. https://supabase.com/dashboard → **New project** (Name z. B. `lmu-broadcast`, Region Europa).
2. Wenn das Projekt bereit ist: **Project Settings → API** (oder „API Keys“) öffnen und zwei Dinge notieren:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon / public key** (der öffentliche Schlüssel, **nicht** der `service_role`-Schlüssel!)
3. Tabellen brauchst du in Phase 1 **nicht**. Es wird nur der Realtime-Broadcast genutzt.
4. Falls später keine Daten ankommen: im Dashboard unter **Realtime → Settings** prüfen, dass
   **„Allow public access“** eingeschaltet ist.

## Schritt 4: Reader einrichten und mit Demo-Daten testen

1. Im Ordner `reader` die Datei `config.example.json` kopieren und die Kopie in **`config.json`** umbenennen.
2. `config.json` mit dem Editor öffnen und ausfüllen:
   ```json
   {
     "supabase_url": "https://xxxx.supabase.co",
     "anon_key": "dein-anon-key",
     "room": "irgendein-langer-geheimer-code",
     "rate_hz": 5
   }
   ```
   - `room` ist ein frei gewählter Code. Reader und Website müssen **denselben** Code benutzen. Nimm etwas Langes, Zufälliges (z. B. `lmu-k7x9q2m4`).
3. **`start_demo.bat`** doppelklicken. Es erscheint eine Konsole mit Zeilen wie  
   `[LIVE] Demo Circuit | Autos: 8 | ... | Netz: OK 80 ms`.  
   Bei „Netz: OK“ kommen die Daten bei Supabase an. Steht dort ein Fehler (z. B. `HTTP 401`), stimmen URL oder Key nicht.

## Schritt 5: Website auf GitHub und Vercel bringen

1. GitHub: **New repository** (z. B. `lmu-broadcast`, gern privat).
2. Den gesamten Inhalt dieses Ordners hochladen (GitHub-Seite → „uploading an existing file“, Dateien reinziehen; `config.json` bitte **nicht** hochladen, sie ist per `.gitignore` ausgeschlossen, wenn du Git benutzt).
3. Vercel: **Add New → Project** → das Repository auswählen.
4. **Wichtig:** Bei **Root Directory** auf **`web`** stellen.
5. Unter **Environment Variables** zwei Variablen anlegen:
   - `NEXT_PUBLIC_SUPABASE_URL` = deine Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = dein anon key
6. **Deploy**. Danach die Vercel-Adresse öffnen.

## Schritt 6: Testen

1. Website öffnen und oben im Feld deinen **Raumcode** eintragen → „Verbinden“ (oder direkt `https://deine-seite.vercel.app/?room=DEIN-CODE`).
2. Reader im **Demo-Modus** laufen lassen: Es erscheinen 8 Fake-Autos live.  
   Die Statusleiste oben zeigt „Mit Supabase verbunden“, „Demo-Daten“ und das Alter des letzten Pakets.
3. Demo beenden, **LMU starten und eine Session laden** (Rennen, oder ein Offline-Test mit KI), dann **`start_reader.bat`**.  
   Jetzt erscheinen echte Daten: Position, Fahrer, Geschwindigkeit, Strecken-Position, Rundenzeit, Sektoren, Reifen, Box, Gelb.

## Was die Anzeige bedeutet

| Spalte | Quelle / Bedeutung |
|---|---|
| Strecke | Anteil der Rundenlänge, 0–100 % |
| Aktuell / Letzte / Beste | aktuelle Rundenzeit, letzte, beste |
| S1 / S2 / S3 | Sektorzeiten der **letzten** Runde |
| Reifen | Mischung (Soft/Medium/Hard/Wet), falls das Spiel sie liefert |
| BOX | Auto befindet sich zwischen Boxeneinfahrt und -ausfahrt |
| GELB | Auto steht auf der Strecke, während im Spiel eine lokale Gelbphase aktiv ist |

## Bekannte Unsicherheiten (bitte beim ersten echten Test prüfen)

Ich konnte das Spiel hier nicht laufen lassen. Alles Folgende ist deshalb gegen die Datenstruktur geprüft, aber **nicht gegen echte Rennen**:

- **Fahrzeugnummer:** Das Spiel hat kein eigenes Nummernfeld. Der Reader liest die Nummer aus dem Fahrzeugnamen (`#8`). Steht in der Spalte „Nr“ nur „–“, schick mir bitte einen Rohdaten-Ausschnitt (Knopf „Rohdaten anzeigen“), dann passe ich das an.
- **Reifen anderer Autos:** Reifendaten stammen aus dem Telemetrie-Block. Für fremde Autos im Multiplayer sind sie ggf. leer („–“).
- **Gelb-Auslöser:** Das Spiel sagt nur „in Sektor X gibt es Gelb“, nicht „welches Auto“. Der Reader schätzt: lokale Gelbphase aktiv + Auto praktisch stehend (< 30 km/h) + nicht in der Box. Das verfeinern wir mit echten Daten.
- **Supabase-Free-Limits:** laut Dokumentation 200 gleichzeitige Verbindungen, 100 Nachrichten/s, 256 KB pro Nachricht. Ein Monatskontingent an Nachrichten konnte ich nicht bestätigen: beobachte die Nutzung im Supabase-Dashboard. Mit 5 Paketen/s und wenigen Zuschauern bist du sehr sparsam unterwegs; höhere Werte in `rate_hz` erhöhen den Verbrauch.
- **Sicherheit:** In Phase 1 ist der Raumcode der einzige Schutz. Wer Key und Code kennt, könnte Daten einspeisen. Mit Accounts und Rollen (Phase 3) stellen wir auf private Kanäle um.

## Fehlersuche

| Problem | Lösung |
|---|---|
| `py` wird nicht gefunden | Python neu installieren, „Add to PATH“ anhaken |
| Reader: `Netz: HTTP 401/403` | URL oder anon key falsch / falscher Schlüssel (anon, nicht service_role) |
| Reader: „wartet auf Spiel“ | Spiel noch nicht in einer Session; „Enable Plugins“ prüfen; Spiel starten, dann Reader neu starten |
| Website: „Verbunden, aber keine Daten“ | Raumcode in Reader und Website identisch? Demo-Modus testen; „Allow public access“ im Supabase-Realtime-Settings prüfen |
| Website: „Konfiguration fehlt“ | Die beiden Environment Variables in Vercel setzen und neu deployen |

## Lokal testen (optional, braucht Node.js)

    cd web
    copy .env.example .env.local   (Werte eintragen)
    npm install
    npm run dev                    (öffnet http://localhost:3000)

## Entwickler-Test der Datenauswertung

    cd reader
    python -m unittest discover tests

Die Dateien in `reader/pylmu/` stammen unverändert von https://github.com/TinyPedal/pyLMUSharedMemory (MIT-Lizenz).

---------------------------------------------------------------------

# Phase 2: OBS-Overlays

Die Overlays sind eigene Seiten mit **transparentem Hintergrund**. Sie nutzen dieselbe Datenleitung wie der Livetest
(Reader → Supabase → Website), du brauchst also keine neue Einrichtung. Nach dem Hochladen der neuen Dateien baut Vercel automatisch neu.

## In OBS einbinden

1. Auf deiner Vercel-Seite **`/overlays`** öffnen (Link „OBS-Overlays →“ oben auf der Startseite).
2. Raumcode eintragen. Die fertigen URLs erscheinen mit „Kopieren“-Knopf.
3. In OBS: **Quelle hinzufügen → Browser** → URL einfügen → Breite und Höhe wie auf der Seite angegeben → OK.
4. Die Overlays zeigen **nichts**, solange keine frischen Spieldaten ankommen (älter als 5 s). Zum Einrichten `&debug=1` an die URL hängen.

Zum Testen ohne Spiel: `start_demo.bat` laufen lassen, dann zeigen alle Overlays die Demo-Autos.

## Die Overlays

| Overlay | Pfad | Optionen (an die URL anhängen) |
|---|---|---|
| Timing-Tower | `/overlay/tower` | `max=10` Zeilen je Klasse, `cls=hyper` nur eine Klasse, `gap=interval` (Abstand zum Auto davor statt zum Klassenführenden), `names=short/full/tla`, `scale=1.2` |
| Fahrerkarte | `/overlay/driver` | `car=8` (Startnummer), `follow=leader`, `scale` |
| Status / Flaggen | `/overlay/status` | `always=1` (auch bei Grün), `scale` |
| Streckenkarte | `/overlay/map` | `labels=0` (ohne Nummern), `scale` |

Verhalten des Towers:
- **Immer klassenweise** sortiert (Hypercar, LMP2, LMP3, GT3, GTE, Rest).
- **Rennen:** Reihenfolge nach Position, Abstand zum Klassenführenden bzw. zum Auto davor, „+1L“ bei Überrundung.
- **Training/Quali:** Sortierung nach schnellster Runde, oben im Kopf die schnellste Rundenzeit der ganzen Session, je Klasse die Klassenbestzeit.
- Die Session-Art (Training, Quali, Rennen) kommt aus den Spieldaten.

Streckenkarte: Der Streckenverlauf wird aus den Positionen der Autos gelernt. Nach etwa einer Runde ist er komplett und wird pro Strecke im Browser (auch in OBS) gespeichert.

## Noch nicht umgesetzt (vorgemerkt)

- **Abrufraten:** Der Reader liest jetzt 10-mal pro Sekunde (`read_hz`) und sendet 5-mal pro Sekunde (`rate_hz`). Die feinere Trennung „Tempo, Rundenzeit, Streckenposition schnell, alles andere nur sekündlich“ ist noch offen.
- **Offen bis zum echten Test:** Klassennamen aus dem Spiel (die Erkennung sucht nach „hyper“, „lmp2“, „gt3“ usw.), Startnummern und Reifen fremder Autos (siehe „Bekannte Unsicherheiten“ oben).

## Streckenkarten fest hinterlegen

Das Spiel liefert **keine fertige Streckenzeichnung**. Es meldet nur die x/z-Position jedes Autos. Der Streckenverlauf entsteht, wenn man diese Positionen entlang der Runde aneinanderreiht. Damit das nicht jedes Mal neu „gelernt“ werden muss, nimmst du jede Strecke **einmal** auf und hinterlegst sie als Datei:

1. LMU starten, Training/Testtag auf der Strecke laden.
2. Im Ordner `reader`: `py lmu_reader.py --record-track`
3. **Eine komplette Runde fahren** (ruhig, auch mit KI-Gegnern ok). Die Konsole zeigt den Fortschritt in Prozent.
4. Bei 97 % speichert der Reader automatisch `web/public/tracks/<strecke>.json`.
5. Datei auf GitHub hochladen, Vercel baut neu. Ab dann nutzt die Streckenkarte diese Datei sofort.

Gibt es für eine Strecke noch keine Datei, lernt die Karte den Verlauf wie bisher live. `demo-circuit.json` gehört zum Demo-Modus. Karten, die du aufnimmst, kannst du auch mit anderen Ligen teilen.

---------------------------------------------------------------------

# Phase 3: Rennleitung (Accounts, Rollen, Vorfälle, Strafen)

Die Rennleitungs-Seiten liegen in derselben Website: `/login`, `/events`, `/events/<id>`, `/admin`, `/profil`.

## Was es kann

- **Login** per Discord **oder** E-Mail/Passwort. Beim ersten Login ist der **In-Game-Name Pflicht** (damit Fahrer im Spiel ihrem Konto zugeordnet werden; jeder Name nur einmal).
- **Rollen:** Admin (alles, Rollen, Events), Rennleiter/Steward (Vorfälle prüfen, Strafen vergeben, Fahrerliste), Fahrer (eigene Strafen, abgeschlossene Vorfälle), Kommentator/Broadcaster (zusätzlich Live-Ansicht).
- **Events** mit Fahrerliste (einzeln oder als Liste einfügen), Live-Tabelle klassenweise und Auto-Hinweis-Feed.
- **Vorfälle:** automatisch vom Reader erkannt **oder** manuell gemeldet. Rennleitung prüft, trägt Beteiligte und Entscheidung ein und schließt ab. **Fahrer sehen einen Vorfall erst, wenn er abgeschlossen ist.**
- **Strafen:** Verwarnung, Zeitstrafe, Drive-Through, Stop-and-Go, Positions-/Startplatzstrafe, Disqualifikation, Rennsperre, Qualisperre. Status: verhängt, abgesessen, zurückgenommen.

**Wichtig:** Strafen sind hier **Protokoll und Veröffentlichung**. Le Mans Ultimate lässt sich über das Shared Memory nicht steuern. Zeit- oder Positionsstrafen musst du also im Ergebnis bzw. im Server-Setup selbst anwenden.

## Einrichtung (einmalig)

1. **Datenbank:** Supabase → **SQL Editor → New query** → kompletten Inhalt von `supabase/schema.sql` einfügen → **Run**. (Legt Tabellen, Rollen-Regeln und Live-Updates an. Nur einmal ausführen.)
2. **Website-Adresse eintragen:** Supabase → **Authentication → URL Configuration**: *Site URL* = deine Vercel-Adresse; unter *Redirect URLs* zusätzlich `https://DEINE-SEITE.vercel.app/**`.
3. **Discord-Login (optional, aber empfohlen):**
   - https://discord.com/developers/applications → *New Application* → **OAuth2**: Client ID und Client Secret notieren.
   - Bei Discord unter *Redirects* die Callback-URL von Supabase eintragen (steht in Supabase unter **Authentication → Providers → Discord**, Form `https://xxxx.supabase.co/auth/v1/callback`).
   - In Supabase den Discord-Provider **einschalten** und Client ID/Secret einfügen.
   - E-Mail/Passwort funktioniert ohne diesen Schritt. Bei E-Mail-Registrierung schickt Supabase eine Bestätigungs-Mail.
4. **Service-Schlüssel für den Reader-Eingang:** Supabase → **Project Settings → API** → `service_role`-Schlüssel kopieren. In Vercel unter **Environment Variables** als `SUPABASE_SERVICE_ROLE_KEY` eintragen (**ohne** `NEXT_PUBLIC_`!) und neu deployen. Dieser Schlüssel ist geheim, er umgeht alle Zugriffsregeln. Niemals ins Reader-Config, nie auf GitHub.
5. **Ersten Admin festlegen:** Auf der Website registrieren/anmelden (In-Game-Namen eintragen). Dann im Supabase **SQL Editor** ausführen (E-Mail anpassen):

       update public.profiles set role = 'admin'
       where id = (select id from auth.users where email = 'DEINE@EMAIL.DE');

   Danach weitere Rollen auf der Seite **/admin** vergeben.
6. **Event anlegen:** `/events` → *Neues Event* (Admin). Im Event unter *Event-Einstellungen* den **Raumcode** des Readers setzen (für die Live-Ansicht) und **„Reader-Zugang anzeigen“**: das sind `site_url` und `ingest_token`. Beide Zeilen in die `config.json` des Readers kopieren (Vorlage: `config.example.json`).
7. Reader normal starten (`start_reader.bat`). Die Konsole zeigt „Rennleitungs-Hinweise: AN“ und „Hinweise: n erkannt, m gespeichert“.

## Automatische Hinweise: was erkannt wird

| Hinweis | Erkennung | Sicherheit |
|---|---|---|
| Track Limits | Das Spiel zählt selbst einen Verstoß (nur Autos mit Telemetrie) | hoch |
| Streckenverlassen | alle 4 Reifen auf Gras/Kies/Dreck (Autos mit Telemetrie), sonst Position jenseits der Streckenkante | mittel / niedrig |
| Kontakt | Aufprallmeldung des Spiels (Telemetrie) bzw. Schleuderwinkel oder starke Beschleunigung mit anderem Auto in der Nähe | mittel / niedrig |
| Dreher / Aufprall | starker Schlupfwinkel bzw. Aufprall ohne anderes Auto in der Nähe | niedrig |

**Ehrlich dazu:** Diese Erkennung ist **nicht an echten Rennen kalibriert**. Alle Schwellen stehen in `config.json` unter `"hints"`. Mit `py lmu_reader.py --hints-debug` druckt der Reader jede Erkennung samt Messwerten. Fahr eine Testsession, sieh dir die Ausgabe an und stelle die Werte ein (bei zu vielen Fehlalarmen: Schwellen erhöhen). Es sind **Hinweise**, keine Urteile: die Rennleitung entscheidet.

Zum Testen der Kette ohne Spiel: `py lmu_reader.py --demo --demo-hints` (schickt alle 30 s einen Fake-Hinweis; die Zeile `config.json` mit `site_url`/`ingest_token` muss gesetzt sein).

## Sicherheit und Grenzen

- **Zugriffsregeln** sitzen in der Datenbank (nicht nur in der Oberfläche) und sind gegen ein lokales Postgres geprüft: Fahrer sehen keine offenen Vorfälle, nur Admins sehen den Reader-Token, Rollen kann nur ein Admin ändern, Fahrer können keine Strafen vergeben.
- **In-Game-Namen:** Jeder Name kann nur einmal einem Konto gehören. Wer sich einen fremden Namen zuerst sichert, blockiert ihn; ein Admin kann das auf `/admin` bzw. in der Datenbank korrigieren.
- Der Reader-Token gilt für ein Event. Über „Token neu erzeugen“ wird er ungültig gemacht.
- **Noch nicht enthalten:** Einsprüche von Fahrern, automatische Punkte/Meisterschaftswertung, Anwenden von Strafen im Spiel.
- **Nicht getestet:** Login mit echtem Supabase/Discord und die Seiten mit echten Daten. Geprüft sind Datenbank-Regeln (lokales Postgres), die Reader-Schnittstelle (Testserver) und die Oberfläche mit simulierten Daten (Admin- und Fahrer-Ansicht).
