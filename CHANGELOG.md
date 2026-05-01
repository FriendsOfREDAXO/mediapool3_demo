# Changelog

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
