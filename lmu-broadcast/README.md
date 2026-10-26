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
