# Sony EXIF Viewer

Kleines Fullstack-Projekt mit Python-Backend und React-Frontend, um Bilddateien per Upload oder Drag-and-Drop an den Server zu senden und die erkannten EXIF-Metadaten im Browser anzuzeigen.

## Features

- Drag-and-Drop oder klassischer Bild-Upload im Frontend
- Bildvorschau direkt nach der Auswahl im Browser
- Anzeige von Datei-Infos, Zusammenfassung und allen gefundenen EXIF-Tags
- Gruppierung der EXIF-Tags nach Bereichen wie `Image`, `EXIF`, `GPS` oder `MakerNote`
- Suche ueber Tag-Namen und Tag-Werte sowie Gruppenfilter im Frontend
- Thumbnail- und Preview-Binaerdaten werden ausgeblendet, damit die Ansicht lesbar bleibt
- Sony-Highlights wie Kamera, Objektiv und sofern verfuegbar Ausloesungen werden separat hervorgehoben

## Backend starten

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Das Backend ist danach unter `http://localhost:8000` erreichbar.

Im Projekt ist bereits eine lokale ExifTool-Kopie hinterlegt. Dadurch koennen Sony-MakerNotes wie `ShutterCount`, `ReleaseMode2` oder `AFAreaModeSetting` deutlich besser dekodiert werden als mit reinem ExifRead.

## Frontend starten

```bash
cd frontend
npm install
npm run dev
```

Das Frontend ist danach unter `http://localhost:5173` erreichbar.

## API

- `GET /health` fuer einen einfachen Healthcheck
- `POST /api/exif` mit Form-Field `file` fuer den Bild-Upload