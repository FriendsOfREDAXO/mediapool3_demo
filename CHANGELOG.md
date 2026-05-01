# Changelog

## Version 1.3.0 – 2026-05-01

### Neu
- Mehrfachzuordnung zu Sammlungen im **Normalmodus**: Markieren mit Cmd/Ctrl+Klick und gemeinsames Drag-and-Drop auf Sammlung
- Upload im Sammlungsmodus mit Kategorieauswahl-Dialog und automatischer Übernahme in die aktive Sammlung
- Kompaktes Drag-Preview (inkl. Badge bei Mehrfach-Drag) für bessere Treffsicherheit auf Sammlungen

### Geändert
- Demo-Seite verwendet keine hardcodierten Testdateien mehr, sondern belegt Beispiele dynamisch mit vorhandenen Medien aus der Datenbank
- README erweitert: klare Trennung zwischen Picker-Multi-Select und Sammlungs-Batch-Drag, plus aktualisierte Feature-Beschreibung

### Fixes
- ParseError in `pages/demo.php` behoben
- Upload-404 im Sammlungsmodus behoben (interner Moduswert `-1` wird nicht mehr als Kategorie gesendet)
- Scroll-Sprung beim Öffnen des Overlays im be_style-Backend verhindert

## Version 1.2.0 – 2026-05-01

### Neu
- Neuer Masonry-View als Ersatz für Coverflow
- Sammlungen und Kategorien im Sidebar-Modus klar getrennt (entweder Kategorie oder Sammlung aktiv)
- Sammlungen werden beim Öffnen sofort geladen und in der Sidebar angezeigt

### Geändert
- Sammlungszuordnung im Detailpanel entfernt (Zuordnung via Drag-and-Drop im Sidebar-Bereich)
- Detailansicht zeigt am Ende der Metadaten jetzt read-only an, in welchen Sammlungen ein Medium liegt
- System-Tags blenden `collection:*` aus; Collection-Tags bleiben beim Speichern intern erhalten

### Fixes
- Leerer Zustand nach Moduswechsel Sammlung/Kategorie behoben (korrekter Reload)
- Masonry-Interaktion stabilisiert (Klick/Drag Delegation, Safari-Columns Verhalten)

## Version 1.1.0 – 2026-04-17

### Neu
- Dateien per **Cmd+V / Ctrl+V** direkt in die aktuelle Medienkategorie einfügen (Paste-Upload)
- Unterstützt Screenshots, kopierte Bilder aus Browser und Bildbearbeitungsprogrammen sowie Dateien aus Finder/Explorer
- Letzte Ansicht (Grid/Liste), Sortierung und Kategorie werden per `localStorage` gespeichert und beim nächsten Öffnen wiederhergestellt

## Version 1.0.0

- Erstveröffentlichung
