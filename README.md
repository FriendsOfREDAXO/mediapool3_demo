# Medienpool 3.0 – Demo AddOn

> ⚠️ **Dieses AddOn ist eine Demo / ein Proof-of-Concept.** Es dient als Technologie-Vorschau für einen modernen Medienpool-Ersatz im REDAXO CMS Backend. Es ist **nicht** für den Produktiveinsatz gedacht, kann aber als Basis für eine eigene Implementierung genutzt werden.

![REDAXO](https://img.shields.io/badge/REDAXO-%3E%3D5.10-red) ![PHP](https://img.shields.io/badge/PHP-%3E%3D7.4-blue) ![API](https://img.shields.io/badge/API_AddOn-%3E%3D1.0-green)

## Was ist das?

Ein modernes Medienpool-Overlay für das REDAXO Backend, das die REST-API des [FriendsOfREDAXO/api](https://github.com/FriendsOfREDAXO/api)-Addons nutzt. Es besteht aus zwei Teilen:

1. **Overlay-Picker** (`MP3.open()`) – Vollbild-Overlay zur Medienauswahl
2. **Input-Widget** (`<input class="mp3-widget">`) – Ersetzt ein Input-Feld durch eine visuelle Medienauswahl mit Vorschau

## Features

### Overlay-Picker
- 📁 **Kategorie-Baum** – Aufklappbare Sidebar mit allen Medienkategorien
- 🔍 **Suche** – Client-seitige Dateinamen-Suche in Echtzeit
- 🏷️ **Typ-Filter** – Filter-Pills für Bilder, Videos, Audio, Dokumente, Sonstige (mit Anzahl-Badges)
- ↕️ **Sortierung** – 6 Sortieroptionen (Datum, Dateiname, Titel – jeweils auf-/absteigend)
- 🖼️ **Grid & Listenansicht** – Umschaltbar zwischen Kachel- und Tabellenansicht
- 📄 **Detail-Panel** – Slide-in Panel mit Vorschau, Metadaten, Verwendungsstatus
- ☁️ **Drag & Drop Upload** – Dateien per Drag & Drop oder Button hochladen, sequenzieller Upload mit Fortschrittsanzeige
- 📂 **Kategorie erstellen** – Inline-Erstellung neuer Medienkategorien
- 🌐 **Alle Medien** – Kategorieübergreifende Ansicht aller Medien
- 🍞 **Breadcrumb** – Navigation mit Pfadanzeige
- 📱 **Mobile-optimiert** – Offcanvas-Sidebar, Bottom-Sheet Detail-Panel
- 🌙 **Dark Mode** – Vollständige Unterstützung für Light, Dark und Auto-Modus

### Multi-Select
- ☑️ **Mehrfachauswahl** – Dateien per Klick an-/abwählen (Checkbox auf jeder Karte)
- ✅ **Alle auswählen / abwählen** – Toggle-Button in der Footer-Leiste
- 📊 **Zähler** – Anzeige der Anzahl ausgewählter Dateien
- 📤 **Übernehmen** – Bestätigungs-Button gibt Array aller gewählten Dateinamen zurück

### Input-Widget
- 🖼️ **Vorschau** – Thumbnails für Bilder, Icons für andere Dateitypen
- ➕ **Hinzufügen** – Öffnet den Overlay-Picker zur Auswahl
- ❌ **Entfernen** – Einzelne Medien per X-Button entfernen
- 🔀 **Drag & Drop Sortierung** – Reihenfolge per Drag & Drop ändern (Multi)
- 🔄 **Auto-Init** – Automatische Initialisierung via `rex:ready` (kompatibel mit MBlock etc.)

## Voraussetzungen

### 1. API AddOn installieren

Das [FriendsOfREDAXO/api](https://github.com/FriendsOfREDAXO/api) AddOn muss installiert und aktiviert sein (Version ≥ 1.0).

### 2. API Endpunkte aktivieren

Im REDAXO Backend unter **API → Konfiguration** müssen folgende Backend-Endpunkte aktiviert sein:

| Endpunkt | Methode | Beschreibung |
|---|---|---|
| `backend/media/list` | GET | Medienliste laden (mit Filter & Paginierung) |
| `backend/media/get` | GET | Detail-Informationen zu einer Datei |
| `backend/media/upload` | POST | Dateien hochladen |
| `backend/media/category/list` | GET | Kategorien laden |
| `backend/media/category/create` | POST | Neue Kategorie erstellen |

> **Wichtig:** Es werden die `backend/`-Endpunkte verwendet (Session-basierte Authentifizierung), nicht die Token-basierten Endpunkte.

## Installation

1. AddOn in `redaxo/src/addons/mediapool3_demo/` ablegen
2. Im Backend unter **AddOns** installieren und aktivieren
3. API AddOn installieren und die benötigten Endpunkte aktivieren
4. Im Menü erscheint **Medienpool 3.0** mit den Seiten **Demo** und **Debug**

## Verwendung

### JavaScript API

#### Einzelauswahl

```javascript
MP3.open(function(filename) {
    console.log('Gewählt:', filename);
});
```

#### Mehrfachauswahl

```javascript
MP3.open(function(filenames) {
    console.log('Gewählt:', filenames); // ["bild1.jpg", "bild2.png"]
}, { multiple: true });
```

#### Overlay schließen

```javascript
MP3.close();
```

### Input-Widget

#### Einzelmedium

```html
<input class="mp3-widget" name="bild" value="">
```

Klick auf ➕ öffnet den Picker (Einzelauswahl). Der gewählte Dateiname wird als `value` gespeichert.

#### Mehrfachauswahl (Galerie)

```html
<input class="mp3-widget" name="galerie" data-mp3-multiple="true" value="">
```

Klick auf ➕ öffnet den Picker im Multi-Select-Modus. Dateinamen werden **kommasepariert** gespeichert (z.B. `bild1.jpg,bild2.png,dokument.pdf`).

#### Widget-Attribute

| Attribut | Beschreibung | Beispiel |
|---|---|---|
| `class="mp3-widget"` | Aktiviert das Widget | `<input class="mp3-widget">` |
| `data-mp3-multiple="true"` | Mehrfachauswahl mit Drag & Drop-Sortierung | `<input class="mp3-widget" data-mp3-multiple="true">` |
| `value="datei.jpg"` | Vorauswahl (bei Multi kommasepariert) | `value="a.jpg,b.png"` |

#### Dynamische Inhalte (MBlock, etc.)

Nach dem dynamischen Einfügen neuer Input-Felder:

```javascript
MP3Widget.init(); // Re-initialisiert alle neuen mp3-widget Inputs
```

### In REDAXO Modulen

#### Modul-Eingabe

```html
<!-- Einzelbild -->
<div class="form-group">
    <label>Titelbild</label>
    <input class="mp3-widget" name="REX_INPUT_VALUE[1]" value="REX_VALUE[1]">
</div>

<!-- Galerie -->
<div class="form-group">
    <label>Bildergalerie</label>
    <input class="mp3-widget" name="REX_INPUT_VALUE[2]"
           data-mp3-multiple="true" value="REX_VALUE[2]">
</div>
```

#### Modul-Ausgabe

```php
// Einzelbild
$image = 'REX_VALUE[1]';
if ($image !== '') {
    echo '<img src="' . rex_url::media($image) . '" alt="">';
}

// Galerie
$gallery = array_filter(explode(',', 'REX_VALUE[2]'));
foreach ($gallery as $file) {
    echo '<img src="' . rex_url::media(trim($file)) . '" alt="">';
}
```

## Dateistruktur

```
mediapool3_demo/
├── package.yml                  # AddOn-Manifest
├── boot.php                     # Lädt Assets, injiziert Root-Element
├── install.php                  # Installations-Logik
├── uninstall.php                # Deinstallations-Logik
├── assets/
│   ├── mediapool3.js            # Overlay-Picker (~1200 Zeilen IIFE)
│   ├── mediapool3.css           # Overlay-Styles (~1750 Zeilen, inkl. Dark Mode)
│   ├── mediapool3_widget.js     # Input-Widget Auto-Init
│   └── mediapool3_widget.css    # Widget-Styles (inkl. Dark Mode)
└── pages/
    ├── index.php                # Subpage-Router
    ├── demo.php                 # Demo-Seite mit Beispielen
    └── debug.php                # Admin-Debug-Seite (API-Tests, DB-Stats)
```

## Technische Details

### Architektur

- **Kein Framework / Build-Step** – Vanilla JS (ES5-kompatibel), reines CSS
- **IIFE-Pattern** – Globaler Namespace: `window.MP3` (Picker) und `window.MP3Widget` (Widget)
- **REST API** – Alle Daten via `fetch()` über die FriendsOfREDAXO/api Endpunkte
- **Session Auth** – Nutzt die REDAXO Backend-Session (`credentials: 'same-origin'`)
- **Thumbnails** – REDAXO Media Manager Typen `rex_media_small` und `rex_media_medium`
- **CSS Scoping** – Alle Overlay-Selektoren unter `#mp3-overlay` (ID-Spezifität) mit `!important` gegen Bootstrap 3

### API-Kommunikation

```
GET  /api/backend/media?per_page=1000                        → Alle Medien
GET  /api/backend/media?per_page=1000&filter[category_id]=4  → Medien in Kategorie 4
GET  /api/backend/media/{filename}/info                      → Detail-Info (inkl. is_in_use)
POST /api/backend/media                                      → Upload (FormData: file + category_id)
GET  /api/backend/media/category                             → Root-Kategorien
GET  /api/backend/media/category?filter[category_id]=4       → Unterkategorien
POST /api/backend/media/category                             → Kategorie erstellen (JSON: name + parent_id)
```

### Dark Mode

Das AddOn unterstützt alle drei REDAXO-Theme-Modi:

- **Light**: Standard-Styles
- **Dark** (`body.rex-theme-dark`): Expliziter Dark Mode
- **Auto** (`@media (prefers-color-scheme: dark)` + `body.rex-has-theme:not(.rex-theme-light)`): System-Präferenz

### Debug-Seite

Unter **Medienpool 3.0 → Debug** (nur für Admins) gibt es:

- Datenbank-Übersicht (Anzahl Medien, Kategorien, Verteilung)
- Medien pro Kategorie
- Kategorie-Baum
- API-Endpunkt-Referenz mit erwarteten Werten
- **Live API-Tests** – Buttons, die Endpunkte abfragen und die JSON-Antwort anzeigen

## Bekannte Einschränkungen

- **Demo / Proof-of-Concept** – Nicht für den Produktiveinsatz optimiert
- **Kein Pagination** – Lädt bis zu 1000 Dateien pro Kategorie auf einmal
- **Client-seitige Suche** – Suche und Filter nur über bereits geladene Dateien
- **Kein YForm-Value** – Nur als HTML-Input-Widget, nicht als eigener YForm-Feldtyp

## Weiterentwicklung

Ideen für eine produktionsreife Version:

- [x] Medien bearbeiten (Titel)
- [ ] Medien bearbeiten (Kategorie, Medienfelder)
- [x] Medien löschen
- [ ] Server-seitige Suche und Paginierung
- [ ] YForm-Value-Typ `mp3_media` / `mp3_medialist`
- [ ] Rechteprüfung für Medienkategorien
- [ ] Chunked Upload für große Dateien
- [ ] Bildbearbeitung (Crop, Resize) im Detail-Panel
- [ ] Keyboard-Navigation (Pfeiltasten, Enter, Space)

## Lizenz

MIT

## Credits

- [FriendsOfREDAXO](https://github.com/FriendsOfREDAXO)
- Inspiriert von [MediaNeo](https://github.com/FriendsOfREDAXO/medianeo) und dem nativen REDAXO Medienpool
- Nutzt die [FriendsOfREDAXO/api](https://github.com/FriendsOfREDAXO/api) REST-Schnittstelle
