/**
 * Medienpool 3.0 – Overlay Media Picker
 * Uses FriendsOfREDAXO/api REST addon for data.
 * Image thumbnails via REDAXO Media Manager (same pattern as MediaNeo).
 */
(function () {
    'use strict';

    var API_BASE = '/api/backend/';

    // ---- State ----
    var overlay, sidebar, grid, gridWrap, searchInput, statusBar, breadcrumb, detailPanel, multiFooter;
    var currentCat = 0;
    var onSelect = null;
    var onMultiSelect = null;  // callback for multi-select mode: receives array of filenames
    var multiMode = false;     // true when opened with multiple: true
    var multiSelected = {};    // filename → true (selected files in multi mode)
    var built = false;
    var catCache = {};     // id → { name, hasChildren, parent_id, children: [...], loaded: bool }
    var catPath = [];      // breadcrumb path: [{ id, name }, ...]
    var lastLoadedFiles = [];  // raw API result for client-side filter/sort
    var currentFilter = 'all'; // all | images | videos | audio | documents | other
    var currentSort = 'date_desc'; // date_desc | date_asc | filename_asc | filename_desc | title_asc | title_desc
    var selectedFile = null; // currently selected filename for detail view
    var viewMode = 'grid'; // grid | list

    // ---- Helpers ----
    function qs(sel, ctx) {
        return (ctx || document).querySelector(sel);
    }

    function qsa(sel, ctx) {
        return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
    }

    function formatBytes(b) {
        b = parseInt(b, 10) || 0;
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(1) + ' MB';
    }

    function isImage(filename) {
        return /\.(jpe?g|png|gif|webp|svg|avif|bmp|ico)$/i.test(filename || '');
    }

    function isVideo(filename) {
        return /\.(mp4|webm|ogv|ogg|mov)$/i.test(filename || '');
    }

    function isAudio(filename) {
        return /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(filename || '');
    }

    function fileIcon(filename) {
        var ext = (filename || '').split('.').pop().toLowerCase();
        var icons = {
            pdf: 'fa-file-pdf',
            doc: 'fa-file-word', docx: 'fa-file-word',
            xls: 'fa-file-excel', xlsx: 'fa-file-excel',
            ppt: 'fa-file-powerpoint', pptx: 'fa-file-powerpoint',
            zip: 'fa-file-zipper', rar: 'fa-file-zipper', gz: 'fa-file-zipper',
            mp3: 'fa-file-audio', wav: 'fa-file-audio', ogg: 'fa-file-audio', flac: 'fa-file-audio',
            mp4: 'fa-file-video', avi: 'fa-file-video', mov: 'fa-file-video', webm: 'fa-file-video',
            txt: 'fa-file-lines', csv: 'fa-file-csv', log: 'fa-file-lines',
            html: 'fa-file-code', css: 'fa-file-code', js: 'fa-file-code',
            json: 'fa-file-code', xml: 'fa-file-code', php: 'fa-file-code'
        };
        return 'fa-solid ' + (icons[ext] || 'fa-file');
    }

    function escAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function formatDate(v) {
        if (!v) return '–';
        var d = (typeof v === 'number' || /^\d{9,}$/.test(String(v)))
            ? new Date(Number(v) * 1000)
            : new Date(v);
        if (isNaN(d.getTime())) return String(v);
        var pad = function (n) { return n < 10 ? '0' + n : n; };
        return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    // ---- Filter / Sort ----
    var FILTER_MAP = {
        all: null,
        images: function (f) { return /^image\//i.test(f.filetype); },
        videos: function (f) { return /^video\//i.test(f.filetype); },
        audio: function (f) { return /^audio\//i.test(f.filetype); },
        documents: function (f) { return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|txt|csv|rtf)$/i.test(f.filename); },
        other: function (f) {
            return !/^image\//i.test(f.filetype) &&
                   !/^video\//i.test(f.filetype) &&
                   !/^audio\//i.test(f.filetype) &&
                   !/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|txt|csv|rtf)$/i.test(f.filename);
        }
    };

    function applyFilterSort(files) {
        var result = files.slice();

        // Filter
        var filterFn = FILTER_MAP[currentFilter];
        if (filterFn) {
            result = result.filter(filterFn);
        }

        // Sort
        result.sort(function (a, b) {
            switch (currentSort) {
                case 'date_desc':
                    return (b.createdate || '').localeCompare(a.createdate || '');
                case 'date_asc':
                    return (a.createdate || '').localeCompare(b.createdate || '');
                case 'filename_asc':
                    return (a.filename || '').localeCompare(b.filename || '', 'de', { sensitivity: 'base' });
                case 'filename_desc':
                    return (b.filename || '').localeCompare(a.filename || '', 'de', { sensitivity: 'base' });
                case 'title_asc':
                    return (a.title || a.filename || '').localeCompare(b.title || b.filename || '', 'de', { sensitivity: 'base' });
                case 'title_desc':
                    return (b.title || b.filename || '').localeCompare(a.title || a.filename || '', 'de', { sensitivity: 'base' });
                default:
                    return 0;
            }
        });

        return result;
    }

    /**
     * Re-render files from the cached lastLoadedFiles with current filter/sort.
     */
    function refreshDisplay() {
        var filtered = applyFilterSort(lastLoadedFiles);
        // Also apply search text if present
        var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
        if (q) {
            filtered = filtered.filter(function (f) {
                return (f.filename || '').toLowerCase().indexOf(q) !== -1;
            });
        }
        renderFiles(filtered);
        updateFilterCounts();
    }

    function updateFilterCounts() {
        if (!overlay) return;
        var btns = qsa('.mp3-filter-btn', overlay);
        btns.forEach(function (btn) {
            var type = btn.getAttribute('data-filter');
            var filterFn = FILTER_MAP[type];
            var count = filterFn ? lastLoadedFiles.filter(filterFn).length : lastLoadedFiles.length;
            var badge = btn.querySelector('.mp3-filter-count');
            if (badge) badge.textContent = count;
        });
    }

    // ---- API ----
    function apiFetch(endpoint) {
        return fetch(API_BASE + endpoint, {
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (json) {
            return json.data || json;
        });
    }

    function apiUpload(file, catId) {
        var fd = new FormData();
        fd.append('file', file);
        fd.append('category_id', catId || 0);
        return fetch(API_BASE + 'media', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function apiUpdate(filename, data) {
        return fetch(API_BASE + 'media/' + encodeURIComponent(filename) + '/update', {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function apiDelete(filename) {
        return fetch(API_BASE + 'media/' + encodeURIComponent(filename) + '/delete', {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        }).then(function (r) {
            if (!r.ok) {
                return r.json().then(function (body) {
                    throw new Error(body.error || 'HTTP ' + r.status);
                });
            }
            return r.json();
        });
    }

    function apiCreateCategory(name, parentId) {
        return fetch(API_BASE + 'media/category', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ name: name, parent_id: parentId || 0 })
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    // ---- Detail Panel ----
    // ---- Editable Fields Config ----
    // Each field defines: key (from API info), label, type (input|textarea|select), options (for select)
    // Add new entries here when the API delivers more editable fields.
    var EDITABLE_FIELDS = [
        { key: 'title', label: 'Titel', type: 'input' }
        // Example future fields:
        // { key: 'med_description', label: 'Beschreibung', type: 'textarea' },
        // { key: 'med_copyright', label: 'Copyright', type: 'input' },
        // { key: 'category_id', label: 'Kategorie', type: 'select', options: function(info) { return [...]; } },
    ];

    // Track original values for dirty detection
    var detailOriginalValues = {};

    function renderEditableField(field, value) {
        var id = 'mp3-edit-' + field.key;
        var displayVal = value || '';
        var placeholder = displayVal ? '' : '(' + field.label + ' setzen)';
        var html = '<div class="mp3-edit-field" data-field-key="' + field.key + '">';
        html += '<label class="mp3-edit-label">' + escAttr(field.label) + '</label>';

        // Display mode: clickable text
        html += '<div class="mp3-edit-display" data-edit-id="' + id + '" title="Klicken zum Bearbeiten">';
        html += '<span class="mp3-edit-text">' + (displayVal ? escAttr(displayVal) : '<em class="mp3-edit-placeholder">' + escAttr(placeholder) + '</em>') + '</span>';
        html += '<i class="fa-solid fa-pen mp3-edit-pen"></i>';
        html += '</div>';

        // Edit mode: hidden by default
        html += '<div class="mp3-edit-input-wrap" style="display:none">';
        if (field.type === 'textarea') {
            html += '<textarea class="mp3-edit-input" id="' + id + '" name="' + field.key + '" rows="3">' +
                escAttr(value || '') + '</textarea>';
        } else if (field.type === 'select' && field.options) {
            var opts = typeof field.options === 'function' ? field.options() : field.options;
            html += '<select class="mp3-edit-input" id="' + id + '" name="' + field.key + '">';
            for (var i = 0; i < opts.length; i++) {
                var sel = (String(opts[i].value) === String(value)) ? ' selected' : '';
                html += '<option value="' + escAttr(opts[i].value) + '"' + sel + '>' +
                    escAttr(opts[i].label) + '</option>';
            }
            html += '</select>';
        } else {
            html += '<input class="mp3-edit-input" type="text" id="' + id + '" name="' + field.key + '" value="' +
                escAttr(value || '') + '">';
        }
        html += '</div>';
        html += '</div>';
        return html;
    }

    function activateEditField(fieldEl) {
        if (!fieldEl || fieldEl.classList.contains('mp3-edit-active')) return;
        fieldEl.classList.add('mp3-edit-active');
        var display = fieldEl.querySelector('.mp3-edit-display');
        var inputWrap = fieldEl.querySelector('.mp3-edit-input-wrap');
        if (display) display.style.display = 'none';
        if (inputWrap) inputWrap.style.display = '';
        var input = fieldEl.querySelector('.mp3-edit-input');
        if (input) {
            input.focus();
            if (input.select) input.select();
        }
        // Show save button if exists
        var saveBtn = detailPanel.querySelector('.mp3-detail-save-btn');
        if (saveBtn) saveBtn.style.display = '';
    }

    function deactivateEditField(fieldEl, cancel) {
        if (!fieldEl || !fieldEl.classList.contains('mp3-edit-active')) return;
        var key = fieldEl.getAttribute('data-field-key');
        var input = fieldEl.querySelector('.mp3-edit-input');
        var display = fieldEl.querySelector('.mp3-edit-display');
        var inputWrap = fieldEl.querySelector('.mp3-edit-input-wrap');
        var textEl = display ? display.querySelector('.mp3-edit-text') : null;

        if (cancel && input) {
            input.value = detailOriginalValues[key] || '';
        }

        // Update display text
        if (textEl && input) {
            var val = input.value;
            if (val) {
                textEl.innerHTML = escAttr(val);
            } else {
                var field = null;
                for (var i = 0; i < EDITABLE_FIELDS.length; i++) {
                    if (EDITABLE_FIELDS[i].key === key) { field = EDITABLE_FIELDS[i]; break; }
                }
                textEl.innerHTML = '<em class="mp3-edit-placeholder">(' + escAttr(field ? field.label : key) + ' setzen)</em>';
            }
        }

        fieldEl.classList.remove('mp3-edit-active');
        if (display) display.style.display = '';
        if (inputWrap) inputWrap.style.display = 'none';

        // Hide save button if no changes
        if (!hasEditChanges()) {
            var saveBtn = detailPanel.querySelector('.mp3-detail-save-btn');
            if (saveBtn) saveBtn.style.display = 'none';
        }
    }

    function getEditableValues() {
        var data = {};
        if (!detailPanel) return data;
        EDITABLE_FIELDS.forEach(function (field) {
            var el = detailPanel.querySelector('#mp3-edit-' + field.key);
            if (el) data[field.key] = el.value;
        });
        return data;
    }

    function hasEditChanges() {
        var current = getEditableValues();
        for (var key in current) {
            if (current[key] !== (detailOriginalValues[key] || '')) return true;
        }
        return false;
    }

    function saveDetail() {
        if (!selectedFile) return;
        var data = getEditableValues();
        var changes = {};
        var hasChanges = false;
        for (var key in data) {
            if (data[key] !== (detailOriginalValues[key] || '')) {
                changes[key] = data[key];
                hasChanges = true;
            }
        }
        if (!hasChanges) return;

        var saveBtn = detailPanel.querySelector('.mp3-detail-save-btn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichern…';
        }

        apiUpdate(selectedFile, changes)
            .then(function () {
                // Update original values & deactivate edit fields
                for (var k in changes) {
                    detailOriginalValues[k] = changes[k];
                }
                // Deactivate all open edit fields
                qsa('.mp3-edit-field.mp3-edit-active', detailPanel).forEach(function (f) {
                    deactivateEditField(f, false);
                });

                // Update the title display in the grid card/row
                if (changes.title !== undefined) {
                    var card = grid.querySelector('.mp3-card[data-filename="' + selectedFile + '"]');
                    if (card) {
                        var nameEl = card.querySelector('.mp3-card-name');
                        if (nameEl) nameEl.textContent = changes.title || selectedFile;
                        // Show/hide filename subtitle
                        var fnameEl = card.querySelector('.mp3-fname');
                        if (changes.title) {
                            if (!fnameEl) {
                                fnameEl = document.createElement('span');
                                fnameEl.className = 'mp3-fname';
                                fnameEl.title = selectedFile;
                                fnameEl.textContent = selectedFile;
                                var infoEl = card.querySelector('.mp3-info');
                                if (infoEl) infoEl.insertBefore(fnameEl, infoEl.querySelector('.mp3-fmeta'));
                            }
                        } else if (fnameEl) {
                            fnameEl.remove();
                        }
                    }
                    var row = grid.querySelector('.mp3-list-row[data-filename="' + selectedFile + '"]');
                    if (row) {
                        var nameCell = row.querySelector('.mp3-list-cell-name');
                        if (nameCell) {
                            nameCell.textContent = changes.title || selectedFile;
                            nameCell.title = changes.title ? selectedFile : '';
                        }
                    }
                    // Update cached file data
                    for (var i = 0; i < lastLoadedFiles.length; i++) {
                        if (lastLoadedFiles[i].filename === selectedFile) {
                            lastLoadedFiles[i].title = changes.title;
                            break;
                        }
                    }
                }

                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Gespeichert';
                    saveBtn.classList.add('mp3-detail-save-success');
                    setTimeout(function () {
                        if (saveBtn) {
                            saveBtn.disabled = false;
                            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Speichern';
                            saveBtn.classList.remove('mp3-detail-save-success');
                            saveBtn.style.display = 'none';
                        }
                    }, 1500);
                }
            })
            .catch(function (err) {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Fehler!';
                    saveBtn.classList.add('mp3-detail-save-error');
                    setTimeout(function () {
                        if (saveBtn) {
                            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Speichern';
                            saveBtn.classList.remove('mp3-detail-save-error');
                        }
                    }, 2000);
                }
            });
    }

    function showDetail(filename) {
        selectedFile = filename;
        if (!detailPanel) return;

        // Highlight selected card or row
        qsa('.mp3-card', grid).forEach(function (c) {
            c.classList.toggle('mp3-card-selected', c.getAttribute('data-filename') === filename);
        });
        qsa('.mp3-list-row', grid).forEach(function (r) {
            r.classList.toggle('mp3-list-row-selected', r.getAttribute('data-filename') === filename);
        });

        // Show loading state
        detailPanel.classList.add('mp3-detail-open');
        detailPanel.innerHTML =
            '<div class="mp3-detail-loading">' +
                '<i class="fa-solid fa-spinner fa-spin"></i> Lade Details…' +
            '</div>';

        apiFetch('media/' + encodeURIComponent(filename) + '/info')
            .then(function (info) {
                renderDetail(info);
            })
            .catch(function (err) {
                detailPanel.innerHTML =
                    '<div class="mp3-detail-error">' +
                        '<i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message) +
                    '</div>';
            });
    }

    function hideDetail() {
        selectedFile = null;
        if (detailPanel) {
            detailPanel.classList.remove('mp3-detail-open');
            detailPanel.innerHTML = '';
        }
        qsa('.mp3-card', grid).forEach(function (c) {
            c.classList.remove('mp3-card-selected');
        });
        qsa('.mp3-list-row', grid).forEach(function (r) {
            r.classList.remove('mp3-list-row-selected');
        });
    }

    function renderDetail(info) {
        var html = '<div class="mp3-detail-inner">';

        // Close button
        html += '<button class="mp3-detail-close" title="Schließen"><i class="fa-solid fa-xmark"></i></button>';

        // Preview
        if (info.is_image) {
            var src = 'index.php?rex_media_type=rex_media_medium&rex_media_file=' +
                encodeURIComponent(info.filename);
            html += '<div class="mp3-detail-preview">' +
                '<img src="' + escAttr(src) + '" alt="' + escAttr(info.title || info.filename) + '">' +
            '</div>';
        } else if (isVideo(info.filename)) {
            var vidSrc = '/media/' + encodeURIComponent(info.filename);
            html += '<div class="mp3-detail-preview mp3-detail-preview-video">' +
                '<video controls preload="metadata" playsinline>' +
                '<source src="' + escAttr(vidSrc) + '" type="' + escAttr(info.filetype || 'video/mp4') + '">' +
                '</video>' +
            '</div>';
        } else if (isAudio(info.filename)) {
            var audSrc = '/media/' + encodeURIComponent(info.filename);
            html += '<div class="mp3-detail-preview mp3-detail-preview-audio">' +
                '<i class="' + fileIcon(info.filename) + '"></i>' +
                '<audio controls preload="metadata">' +
                '<source src="' + escAttr(audSrc) + '" type="' + escAttr(info.filetype || 'audio/mpeg') + '">' +
                '</audio>' +
            '</div>';
        } else {
            html += '<div class="mp3-detail-preview mp3-detail-preview-icon">' +
                '<i class="' + fileIcon(info.filename) + '"></i>' +
            '</div>';
        }

        // Filename as small subtitle
        html += '<div class="mp3-detail-filename">' + escAttr(info.filename) + '</div>';

        // ---- Editable Fields ----
        detailOriginalValues = {};
        var editableHtml = '';
        EDITABLE_FIELDS.forEach(function (field) {
            if (info[field.key] !== undefined || field.key === 'title') {
                var val = info[field.key] || '';
                detailOriginalValues[field.key] = String(val);
                editableHtml += renderEditableField(field, val);
            }
        });
        if (editableHtml) {
            html += '<div class="mp3-edit-section">';
            html += editableHtml;
            html += '<button type="button" class="mp3-detail-save-btn" style="display:none" title="Änderungen speichern">' +
                '<i class="fa-solid fa-floppy-disk"></i> Speichern</button>';
            html += '</div>';
        }

        // Meta table (read-only info)
        html += '<table class="mp3-detail-table">';
        html += '<tr><td>Dateiname</td><td>' + escAttr(info.filename) + '</td></tr>';
        if (info.originalname && info.originalname !== info.filename) {
            html += '<tr><td>Original</td><td>' + escAttr(info.originalname) + '</td></tr>';
        }
        html += '<tr><td>Typ</td><td>' + escAttr(info.filetype) + '</td></tr>';
        html += '<tr><td>Größe</td><td>' + formatBytes(info.filesize) + '</td></tr>';
        if (info.width && info.height) {
            html += '<tr><td>Maße</td><td>' + info.width + ' × ' + info.height + ' px</td></tr>';
        }
        html += '<tr><td>Erstellt</td><td>' + formatDate(info.createdate) + '<br><small>' + escAttr(info.createuser) + '</small></td></tr>';
        html += '<tr><td>Aktualisiert</td><td>' + formatDate(info.updatedate) + '<br><small>' + escAttr(info.updateuser) + '</small></td></tr>';
        html += '<tr><td>Datei vorhanden</td><td>' + (info.file_exists ? '<span class="mp3-badge-yes">✓ Ja</span>' : '<span class="mp3-badge-no">✗ Nein</span>') + '</td></tr>';
        html += '<tr><td>In Verwendung</td><td>' + (info.is_in_use ? '<span class="mp3-badge-yes">✓ Ja</span>' : '<span class="mp3-badge-no">✗ Nein</span>') + '</td></tr>';
        html += '</table>';

        // Action buttons
        html += '<div class="mp3-detail-actions">';

        // Select button – only when a callback is registered
        if (onSelect || onMultiSelect) {
            html += '<button class="mp3-detail-select-btn" data-filename="' + escAttr(info.filename) + '">' +
                '<i class="fa-solid fa-check"></i> Auswählen</button>';
        }

        // Download button – always visible
        html += '<a class="mp3-detail-download-btn" href="' + escAttr(API_BASE + 'media/' + encodeURIComponent(info.filename) + '/file') + '" ' +
            'download="' + escAttr(info.filename) + '" title="Datei herunterladen">' +
            '<i class="fa-solid fa-download"></i></a>';

        // Delete button – always visible, with safety check
        html += '<button class="mp3-detail-delete-btn" data-filename="' + escAttr(info.filename) + '" ' +
            'data-in-use="' + (info.is_in_use ? '1' : '0') + '" title="Datei löschen">' +
            '<i class="fa-solid fa-trash-can"></i></button>';

        html += '</div>';

        html += '</div>';
        detailPanel.innerHTML = html;
    }

    // ---- Rendering ----

    /**
     * Build preview HTML for a single media file.
     * Uses the REDAXO Media Manager URL (same as MediaNeo) for thumbnails.
     */
    function previewHtml(file) {
        if (isImage(file.filename)) {
            // Use Media Manager for thumbnail – same URL pattern as MediaNeo
            var src = 'index.php?rex_media_type=rex_media_small&rex_media_file=' +
                encodeURIComponent(file.filename);
            return '<img src="' + escAttr(src) + '" alt="' + escAttr(file.title || file.filename) + '">';
        }
        return '<div class="mp3-icon"><i class="' + fileIcon(file.filename) + '"></i></div>';
    }

    function renderFiles(files) {
        if (!files || !files.length) {
            grid.innerHTML = '<div style="padding:40px;text-align:center;color:#6c757d;">' +
                '<i class="fa-solid fa-box-open" style="font-size:2em;display:block;margin-bottom:10px;"></i>' +
                'Keine Dateien vorhanden</div>';
            updateStatus(0);
            return;
        }

        if (viewMode === 'list') {
            renderFilesList(files);
        } else {
            renderFilesGrid(files);
        }
        updateStatus(files.length);
    }

    function renderFilesGrid(files) {
        var html = '';
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var isMultiSel = multiMode && multiSelected[f.filename];
            var displayName = f.title || f.filename;
            html += '<div class="mp3-card' + (isMultiSel ? ' mp3-card-multi-selected' : '') + '" draggable="false" data-filename="' + escAttr(f.filename) + '">' +
                (multiMode ? '<div class="mp3-card-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></div>' : '') +
                previewHtml(f) +
                '<div class="mp3-info">' +
                    '<span class="mp3-card-name" title="' + escAttr(f.filename) + '">' + escAttr(displayName) + '</span>' +
                    (f.title ? '<span class="mp3-fname" title="' + escAttr(f.filename) + '">' + escAttr(f.filename) + '</span>' : '') +
                    '<span class="mp3-fmeta">' + formatBytes(f.filesize) + '</span>' +
                '</div>' +
            '</div>';
        }
        grid.className = 'mp3-grid';
        grid.innerHTML = html;
    }

    function renderFilesList(files) {
        var html = '<table class="mp3-list-table">';
        html += '<thead><tr>' +
            (multiMode ? '<th class="mp3-list-th-check"></th>' : '') +
            '<th class="mp3-list-th-preview"></th>' +
            '<th>Name</th>' +
            '<th>Typ</th>' +
            '<th>Größe</th>' +
            '<th>Datum</th>' +
        '</tr></thead><tbody>';
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var sel = (selectedFile === f.filename) ? ' mp3-list-row-selected' : '';
            var isMultiSel = multiMode && multiSelected[f.filename];
            if (isMultiSel) sel += ' mp3-list-row-multi-selected';
            html += '<tr class="mp3-list-row' + sel + '" data-filename="' + escAttr(f.filename) + '">';
            if (multiMode) {
                html += '<td class="mp3-list-cell-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></td>';
            }
            html += '<td class="mp3-list-cell-preview">';
            if (isImage(f.filename)) {
                var src = 'index.php?rex_media_type=rex_media_small&rex_media_file=' + encodeURIComponent(f.filename);
                html += '<img src="' + escAttr(src) + '" alt="">';
            } else {
                html += '<i class="' + fileIcon(f.filename) + '"></i>';
            }
            html += '</td>';
            var listLabel = f.title ? escAttr(f.title) : escAttr(f.filename);
            var listTooltip = f.title ? escAttr(f.filename) : '';
            html += '<td class="mp3-list-cell-name"' + (listTooltip ? ' title="' + listTooltip + '"' : '') + '>' + listLabel + '</td>';
            html += '<td class="mp3-list-cell-type">' + escAttr(f.filetype || '') + '</td>';
            html += '<td class="mp3-list-cell-size">' + formatBytes(f.filesize) + '</td>';
            html += '<td class="mp3-list-cell-date">' + formatDate(f.createdate) + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        grid.className = 'mp3-grid mp3-view-list';
        grid.innerHTML = html;
    }

    function renderCategories(cats) {
        // Build root-level category tree item HTML
        var html = '<div class="mp3-cat-tree">';
        // "Alle Medien" button
        html += '<div class="mp3-cat-header">';
        html += '<a class="mp3-cat' + (currentCat === -1 ? ' mp3-cat-active' : '') + '" data-cat="-1">' +
            '<i class="fa-solid fa-layer-group"></i> Alle Medien</a>';
        html += '</div>';
        // Root category
        html += '<div class="mp3-cat-header">';
        html += '<a class="mp3-cat' + (currentCat === 0 ? ' mp3-cat-active' : '') + '" data-cat="0">' +
            '<i class="fa-solid fa-house"></i> Medienpool</a>';
        html += '<button class="mp3-cat-add-btn" data-add-parent="0" title="Neue Kategorie">' +
            '<i class="fa-solid fa-folder-plus"></i></button>';
        html += '</div>';

        if (cats && cats.length) {
            html += renderCatChildren(cats, 0);
        }
        html += '</div>';
        sidebar.innerHTML = html;
    }

    /**
     * Render a list of category items at a given depth, with toggle arrows for expandable items.
     */
    function renderCatChildren(cats, depth) {
        var html = '<div class="mp3-cat-children" data-depth="' + depth + '">';
        for (var i = 0; i < cats.length; i++) {
            var c = cats[i];
            var id = parseInt(c.id, 10);
            var name = c.name || ('Kategorie ' + id);
            var hasKids = c.hasChildren;
            var isOpen = catCache[id] && catCache[id].open;
            var indent = (depth + 1) * 16;

            html += '<div class="mp3-cat-node" data-cat-id="' + id + '">';
            html += '<div class="mp3-cat-row">';
            html += '<a class="mp3-cat' + (currentCat === id ? ' mp3-cat-active' : '') + '" data-cat="' + id + '" style="padding-left:' + indent + 'px;">';

            if (hasKids) {
                html += '<i class="fa-solid ' + (isOpen ? 'fa-chevron-down' : 'fa-chevron-right') + ' mp3-cat-toggle" data-toggle-cat="' + id + '"></i> ';
            } else {
                html += '<i class="fa-solid fa-folder mp3-cat-folder-icon"></i> ';
            }
            html += escAttr(name) + '</a>';
            html += '<button class="mp3-cat-add-btn mp3-cat-add-sub" data-add-parent="' + id + '" title="Unterkategorie erstellen">' +
                '<i class="fa-solid fa-plus"></i></button>';
            html += '</div>';

            // Render loaded children if node is open
            if (hasKids && isOpen && catCache[id] && catCache[id].children) {
                html += renderCatChildren(catCache[id].children, depth + 1);
            }

            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    /**
     * Rebuild the sidebar from cached root categories.
     */
    function rerenderSidebar() {
        var rootCats = catCache._root || [];
        renderCategories(rootCats);
    }

    /**
     * Show an inline input field in the sidebar to create a new category.
     */
    function showCategoryInput(parentId) {
        // Remove any existing input first
        var existing = qs('.mp3-cat-new-wrap', sidebar);
        if (existing) existing.remove();

        // Build the inline input
        var wrap = document.createElement('div');
        wrap.className = 'mp3-cat-new-wrap';

        var indent = 12;
        if (parentId > 0) {
            // Calculate depth based on catPath or simple nesting
            var depth = 0;
            var pid = parentId;
            while (pid > 0 && catCache[pid]) {
                depth++;
                pid = catCache[pid].parent_id || 0;
            }
            indent = (depth + 1) * 16;
        }

        wrap.innerHTML =
            '<div class="mp3-cat-new-input-row" style="padding-left:' + indent + 'px;">' +
                '<i class="fa-solid fa-folder-plus mp3-cat-new-icon"></i>' +
                '<input type="text" class="mp3-cat-new-input" data-parent="' + parentId + '" ' +
                    'placeholder="Kategoriename…" autocomplete="off">' +
            '</div>';

        // Insert at the right position
        if (parentId === 0) {
            // After root "Medienpool" entry, before first child list
            var tree = qs('.mp3-cat-tree', sidebar);
            if (tree) {
                var firstChildren = qs('.mp3-cat-children', tree);
                if (firstChildren) {
                    tree.insertBefore(wrap, firstChildren);
                } else {
                    tree.appendChild(wrap);
                }
            }
        } else {
            // After the parent category node
            var parentNode = qs('.mp3-cat-node[data-cat-id="' + parentId + '"]', sidebar);
            if (parentNode) {
                // Insert after the parent node's <a> and before children
                parentNode.appendChild(wrap);
            }
        }

        // Focus the input
        var input = qs('.mp3-cat-new-input', wrap);
        if (input) {
            setTimeout(function () { input.focus(); }, 50);
        }
    }

    /**
     * Build the breadcrumb path from catCache by walking parent_id up.
     */
    function buildBreadcrumb(catId) {
        catPath = [];
        var id = catId;
        while (id > 0 && catCache[id]) {
            catPath.unshift({ id: id, name: catCache[id].name });
            id = catCache[id].parent_id || 0;
        }
        renderBreadcrumb();
    }

    function renderBreadcrumb() {
        if (!breadcrumb) return;
        var html = '<a class="mp3-bc-item" data-cat="0"><i class="fa-solid fa-house"></i></a>';
        for (var i = 0; i < catPath.length; i++) {
            html += ' <i class="fa-solid fa-chevron-right mp3-bc-sep"></i> ';
            html += '<a class="mp3-bc-item" data-cat="' + catPath[i].id + '">' + escAttr(catPath[i].name) + '</a>';
        }
        breadcrumb.innerHTML = html;
    }

    function updateStatus(count) {
        if (statusBar) {
            statusBar.textContent = count + ' Datei' + (count !== 1 ? 'en' : '');
        }
        updateHeaderInfo(count);
    }

    /**
     * Update the header info bar: shows current category and file count.
     */
    function updateHeaderInfo(count) {
        var el = document.getElementById('mp3-header-info');
        if (!el) return;

        var catName = '';
        if (currentCat === -1) {
            catName = 'Alle Medien';
        } else if (currentCat === 0) {
            catName = 'Keine Kategorie';
        } else if (catCache[currentCat]) {
            catName = catCache[currentCat].name;
        }

        var parts = [];
        if (catName) {
            parts.push('<i class="fa-solid fa-folder-open mp3-hi-icon"></i> ' + escAttr(catName));
        }
        if (typeof count === 'number') {
            parts.push('<i class="fa-solid fa-images mp3-hi-icon"></i> ' + count);
        }

        el.innerHTML = parts.join('<span class="mp3-hi-sep">|</span>');
    }

    // ---- Data Loading ----
    function loadFiles(catId) {
        currentCat = catId;
        var endpoint = 'media?per_page=1000';
        // catId -1 = alle Medien (kein Kategorie-Filter)
        if (currentCat >= 0) {
            endpoint += '&filter[category_id]=' + currentCat;
        }

        grid.innerHTML = '<div style="padding:40px;text-align:center;">' +
            '<i class="fa-solid fa-spinner fa-spin" style="font-size:2em;color:#3c4d60;"></i></div>';

        apiFetch(endpoint)
            .then(function (files) {
                lastLoadedFiles = Array.isArray(files) ? files : [];
                refreshDisplay();
            })
            .catch(function (err) {
                lastLoadedFiles = [];
                grid.innerHTML = '<div style="padding:40px;text-align:center;color:#c9302c;">' +
                    '<i class="fa-solid fa-triangle-exclamation"></i> API-Fehler: ' + escAttr(err.message) +
                    '<br><small style="color:#6c757d;">Ist das API-Addon installiert und aktiviert?</small></div>';
                console.error('MP3 loadFiles error:', err);
            });
    }

    function loadCategories() {
        apiFetch('media/category')
            .then(function (cats) {
                var list = Array.isArray(cats) ? cats : [];
                // Cache root categories
                catCache._root = list;
                for (var i = 0; i < list.length; i++) {
                    var c = list[i];
                    catCache[c.id] = {
                        name: c.name,
                        hasChildren: c.hasChildren,
                        parent_id: c.parent_id || 0,
                        children: null,
                        loaded: false,
                        open: false
                    };
                }
                rerenderSidebar();
            })
            .catch(function (err) {
                console.error('MP3 loadCategories error:', err);
                renderCategories([]);
            });
    }

    /**
     * Load children of a category and toggle its expanded state.
     */
    function toggleCategory(catId) {
        var cached = catCache[catId];
        if (!cached) return;

        // If already loaded, just toggle open/closed
        if (cached.loaded) {
            cached.open = !cached.open;
            rerenderSidebar();
            return;
        }

        // Load children from API
        apiFetch('media/category?filter[category_id]=' + catId)
            .then(function (cats) {
                var list = Array.isArray(cats) ? cats : [];
                cached.children = list;
                cached.loaded = true;
                cached.open = true;

                // Cache each child too
                for (var i = 0; i < list.length; i++) {
                    var c = list[i];
                    if (!catCache[c.id]) {
                        catCache[c.id] = {
                            name: c.name,
                            hasChildren: c.hasChildren,
                            parent_id: c.parent_id || 0,
                            children: null,
                            loaded: false,
                            open: false
                        };
                    }
                }
                rerenderSidebar();
            })
            .catch(function (err) {
                console.error('MP3 loadChildren error:', err);
            });
    }

    // ---- Upload ----
    function doUpload(fileList) {
        if (!fileList || !fileList.length) return;

        var files = Array.prototype.slice.call(fileList);
        var total = files.length;
        var done = 0;
        var failed = 0;

        // Build upload tracker UI
        var html = '<div class="mp3-upload-tracker">';
        html += '<div class="mp3-upload-header">' +
            '<i class="fa-solid fa-cloud-arrow-up"></i> ' +
            '<span class="mp3-upload-title">' + total + ' Datei' + (total !== 1 ? 'en' : '') + ' hochladen</span>' +
            '</div>';
        html += '<div class="mp3-upload-progress-bar"><div class="mp3-upload-progress-fill" id="mp3-progress-fill"></div></div>';
        html += '<div class="mp3-upload-list" id="mp3-upload-list">';
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var icon = isImage(f.name) ? 'fa-image' : fileIcon(f.name).replace('fa-solid ', '');
            html += '<div class="mp3-upload-item" id="mp3-upl-' + i + '">' +
                '<i class="fa-solid ' + icon + ' mp3-upload-item-icon"></i>' +
                '<span class="mp3-upload-item-name">' + escAttr(f.name) + '</span>' +
                '<span class="mp3-upload-item-size">' + formatBytes(f.size) + '</span>' +
                '<span class="mp3-upload-item-status"><i class="fa-solid fa-clock mp3-upload-pending"></i></span>' +
            '</div>';
        }
        html += '</div>';
        html += '<div class="mp3-upload-summary" id="mp3-upload-summary"></div>';
        html += '</div>';
        grid.innerHTML = html;

        // Upload one at a time sequentially
        function uploadNext(idx) {
            if (idx >= files.length) {
                // All done
                var summaryEl = document.getElementById('mp3-upload-summary');
                if (summaryEl) {
                    var msg = done + ' von ' + total + ' erfolgreich';
                    if (failed > 0) msg += ', ' + failed + ' fehlgeschlagen';
                    summaryEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#28a745;"></i> ' + msg;
                }
                // Reload after short delay
                setTimeout(function () { loadFiles(currentCat); }, 1500);
                return;
            }

            var itemEl = document.getElementById('mp3-upl-' + idx);
            if (itemEl) {
                var statusEl = itemEl.querySelector('.mp3-upload-item-status');
                statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mp3-upload-spinning"></i>';
                itemEl.classList.add('mp3-upload-active');
            }

            apiUpload(files[idx], currentCat)
                .then(function () {
                    done++;
                    if (itemEl) {
                        var st = itemEl.querySelector('.mp3-upload-item-status');
                        st.innerHTML = '<i class="fa-solid fa-circle-check mp3-upload-ok"></i>';
                        itemEl.classList.remove('mp3-upload-active');
                        itemEl.classList.add('mp3-upload-done');
                    }
                })
                .catch(function (err) {
                    failed++;
                    console.error('MP3 upload failed:', files[idx].name, err);
                    if (itemEl) {
                        var st = itemEl.querySelector('.mp3-upload-item-status');
                        st.innerHTML = '<i class="fa-solid fa-circle-xmark mp3-upload-fail"></i>';
                        itemEl.classList.remove('mp3-upload-active');
                        itemEl.classList.add('mp3-upload-failed');
                    }
                })
                .then(function () {
                    // Update progress bar
                    var pct = Math.round(((done + failed) / total) * 100);
                    var fillEl = document.getElementById('mp3-progress-fill');
                    if (fillEl) fillEl.style.width = pct + '%';
                    uploadNext(idx + 1);
                });
        }

        uploadNext(0);
    }

    // ---- Build Overlay DOM ----
    function build() {
        if (built) return;
        built = true;

        var root = document.getElementById('mp3-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'mp3-root';
            document.body.appendChild(root);
        }

        root.innerHTML =
            '<div id="mp3-overlay">' +
                '<div class="mp3-modal">' +
                    '<div class="mp3-header">' +
                        '<span class="mp3-title"><i class="fa-solid fa-photo-film"></i> Medienpool</span>' +
                        '<span class="mp3-header-info" id="mp3-header-info"></span>' +
                        '<div class="mp3-header-tools">' +
                            '<button class="mp3-mobile-cat-btn" title="Kategorien"><i class="fa-solid fa-folder-tree"></i></button>' +
                            '<div class="mp3-search-wrap">' +
                                '<i class="fa-solid fa-magnifying-glass"></i>' +
                                '<input type="text" class="mp3-search" placeholder="Suchen…">' +
                            '</div>' +
                            '<select class="mp3-sort-select" title="Sortierung">' +
                                '<option value="date_desc">Neueste zuerst</option>' +
                                '<option value="date_asc">Älteste zuerst</option>' +
                                '<option value="filename_asc">Dateiname A–Z</option>' +
                                '<option value="filename_desc">Dateiname Z–A</option>' +
                                '<option value="title_asc">Titel A–Z</option>' +
                                '<option value="title_desc">Titel Z–A</option>' +
                            '</select>' +
                            '<div class="mp3-view-toggle">' +
                                '<button class="mp3-view-btn mp3-view-active" data-view="grid" title="Kacheln"><i class="fa-solid fa-table-cells"></i></button>' +
                                '<button class="mp3-view-btn" data-view="list" title="Liste"><i class="fa-solid fa-list"></i></button>' +
                            '</div>' +
                            '<label class="mp3-upload-btn" title="Dateien hochladen">' +
                                '<i class="fa-solid fa-cloud-arrow-up"></i>' +
                                '<span class="mp3-upload-label">Hochladen</span>' +
                                '<input type="file" multiple style="display:none">' +
                            '</label>' +
                        '</div>' +
                        '<button type="button" class="mp3-close" title="Schließen"><i class="fa-solid fa-xmark"></i></button>' +
                    '</div>' +
                    '<div class="mp3-body">' +
                        '<div class="mp3-sidebar" id="mp3-sidebar"></div>' +
                        '<div class="mp3-sidebar-backdrop" id="mp3-sidebar-backdrop"></div>' +
                        '<div class="mp3-content">' +
                            '<div class="mp3-filter-bar">' +
                                '<button class="mp3-filter-btn mp3-filter-active" data-filter="all">' +
                                    'Alle <span class="mp3-filter-count">0</span></button>' +
                                '<button class="mp3-filter-btn" data-filter="images">' +
                                    '<i class="fa-solid fa-image"></i> Bilder <span class="mp3-filter-count">0</span></button>' +
                                '<button class="mp3-filter-btn" data-filter="videos">' +
                                    '<i class="fa-solid fa-film"></i> Videos <span class="mp3-filter-count">0</span></button>' +
                                '<button class="mp3-filter-btn" data-filter="audio">' +
                                    '<i class="fa-solid fa-music"></i> Audio <span class="mp3-filter-count">0</span></button>' +
                                '<button class="mp3-filter-btn" data-filter="documents">' +
                                    '<i class="fa-solid fa-file-lines"></i> Dokumente <span class="mp3-filter-count">0</span></button>' +
                                '<button class="mp3-filter-btn" data-filter="other">' +
                                    '<i class="fa-solid fa-ellipsis"></i> Sonstige <span class="mp3-filter-count">0</span></button>' +
                            '</div>' +
                            '<div class="mp3-breadcrumb" id="mp3-breadcrumb"></div>' +
                            '<div class="mp3-status" id="mp3-status"></div>' +
                            '<div class="mp3-grid-wrap" id="mp3-grid-wrap">' +
                                '<div class="mp3-grid" id="mp3-grid"></div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="mp3-detail" id="mp3-detail"></div>' +
                    '</div>' +
                    '<div class="mp3-resize-handle" id="mp3-resize-handle"></div>' +
                    '<div class="mp3-multi-footer" id="mp3-multi-footer" style="display:none">' +
                        '<div class="mp3-multi-left">' +
                            '<button class="mp3-multi-select-all"><i class="fa-solid fa-square-check"></i> Alle auswählen</button>' +
                            '<span class="mp3-multi-count">0 Dateien ausgewählt</span>' +
                        '</div>' +
                        '<button class="mp3-multi-confirm"><i class="fa-solid fa-check"></i> Übernehmen</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        overlay   = qs('#mp3-overlay');
        sidebar   = qs('#mp3-sidebar');
        grid      = qs('#mp3-grid');
        gridWrap  = qs('#mp3-grid-wrap');
        searchInput = qs('.mp3-search', overlay);
        statusBar = qs('#mp3-status');
        breadcrumb = qs('#mp3-breadcrumb');
        detailPanel = qs('#mp3-detail');
        multiFooter = qs('#mp3-multi-footer');

        // ---- Drag-Move & Resize ----
        var interacting = false; // true during drag/resize – suppress backdrop close
        (function initDragResize() {
            var modal = qs('.mp3-modal', overlay);
            var header = qs('.mp3-header', overlay);
            var handle = qs('#mp3-resize-handle');
            var dragging = false, resizing = false;
            var startX, startY, startW, startH, startLeft, startTop;

            function isMobile() { return window.innerWidth <= 768; }

            // ---- Drag move via header ----
            header.addEventListener('mousedown', function (e) {
                if (isMobile()) return;
                if (e.target.closest('.mp3-close, .mp3-header-tools, input, select, button, label')) return;
                dragging = true;
                interacting = true;
                var rect = modal.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                startLeft = rect.left;
                startTop = rect.top;
                e.preventDefault();
            });

            // ---- Resize via handle ----
            handle.addEventListener('mousedown', function (e) {
                if (isMobile()) return;
                resizing = true;
                interacting = true;
                var rect = modal.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                startW = rect.width;
                startH = rect.height;
                startLeft = rect.left;
                startTop = rect.top;
                e.preventDefault();
            });

            document.addEventListener('mousemove', function (e) {
                if (dragging) {
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;
                    var newLeft = startLeft + dx;
                    var newTop = startTop + dy;
                    // Constrain to viewport
                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 100));
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
                    modal.style.position = 'fixed';
                    modal.style.left = newLeft + 'px';
                    modal.style.top = newTop + 'px';
                    modal.style.margin = '0';
                    modal.style.transform = 'none';
                }
                if (resizing) {
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;
                    var newW = Math.max(480, startW + dx);
                    var newH = Math.max(320, startH + dy);
                    // Don't exceed viewport
                    newW = Math.min(newW, window.innerWidth - startLeft);
                    newH = Math.min(newH, window.innerHeight - startTop);
                    modal.style.width = newW + 'px';
                    modal.style.maxWidth = 'none';
                    modal.style.height = newH + 'px';
                }
            });

            document.addEventListener('mouseup', function () {
                if (dragging || resizing) {
                    dragging = false;
                    resizing = false;
                    // Delay clearing interacting so the backdrop click handler doesn't fire
                    setTimeout(function () { interacting = false; }, 0);
                }
            });

            // Double-click header to reset size/position
            header.addEventListener('dblclick', function (e) {
                if (isMobile()) return;
                if (e.target.closest('.mp3-close')) return;
                modal.style.position = '';
                modal.style.left = '';
                modal.style.top = '';
                modal.style.margin = '';
                modal.style.transform = '';
                modal.style.width = '';
                modal.style.maxWidth = '';
                modal.style.height = '';
            });
        })();

        // ---- Events ----

        // Close button
        qs('.mp3-close', overlay).addEventListener('click', close);

        // Click backdrop to close (but not after drag/resize)
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay && !interacting) close();
        });

        // ESC to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('mp3-open')) {
                close();
            }
        });

        // Add category button (event delegation)
        sidebar.addEventListener('click', function (e) {
            var addBtn = e.target.closest('.mp3-cat-add-btn');
            if (addBtn) {
                e.preventDefault();
                e.stopPropagation();
                var parentId = parseInt(addBtn.getAttribute('data-add-parent'), 10) || 0;
                showCategoryInput(parentId);
                return;
            }
        });

        // Category input confirm/cancel (event delegation)
        sidebar.addEventListener('keydown', function (e) {
            var input = e.target.closest('.mp3-cat-new-input');
            if (!input) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                var name = input.value.trim();
                if (!name) return;
                var parentId = parseInt(input.getAttribute('data-parent'), 10) || 0;
                input.disabled = true;
                apiCreateCategory(name, parentId)
                    .then(function () {
                        // Reset cache and reload categories
                        catCache = {};
                        catPath = [];
                        loadCategories();
                    })
                    .catch(function (err) {
                        console.error('MP3 createCategory error:', err);
                        alert('Fehler beim Erstellen: ' + err.message);
                        input.disabled = false;
                        input.focus();
                    });
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                rerenderSidebar();
            }
        });

        sidebar.addEventListener('focusout', function (e) {
            var input = e.target.closest('.mp3-cat-new-input');
            if (!input || input.disabled) return;
            // Small delay to allow Enter to fire first
            setTimeout(function () {
                if (document.activeElement !== input) {
                    rerenderSidebar();
                }
            }, 150);
        });

        // Category clicks (event delegation)
        sidebar.addEventListener('click', function (e) {
            e.preventDefault();

            // Toggle arrow click: expand/collapse subcategories
            var toggleIcon = e.target.closest('.mp3-cat-toggle');
            if (toggleIcon) {
                e.stopPropagation();
                var toggleId = parseInt(toggleIcon.getAttribute('data-toggle-cat'), 10);
                toggleCategory(toggleId);
                return;
            }

            // Category name click: navigate to that category
            var cat = e.target.closest('.mp3-cat');
            if (!cat) return;
            var catId = parseInt(cat.getAttribute('data-cat'), 10);
            currentCat = catId;

            // Mark active in sidebar
            qsa('.mp3-cat', sidebar).forEach(function (c) {
                c.classList.remove('mp3-cat-active');
            });
            cat.classList.add('mp3-cat-active');

            // Auto-expand if has children and not yet open
            if (catId > 0 && catCache[catId] && catCache[catId].hasChildren && !catCache[catId].open) {
                toggleCategory(catId);
            }

            // Update breadcrumb and load files
            buildBreadcrumb(catId);
            loadFiles(catId);
        });

        // Breadcrumb clicks (event delegation)
        breadcrumb.addEventListener('click', function (e) {
            var item = e.target.closest('.mp3-bc-item');
            if (!item) return;
            e.preventDefault();
            var catId = parseInt(item.getAttribute('data-cat'), 10);
            currentCat = catId;
            buildBreadcrumb(catId);
            rerenderSidebar();
            loadFiles(catId);
        });

        // Card/row clicks (event delegation) — show detail panel or toggle multi-select
        grid.addEventListener('click', function (e) {
            var card = e.target.closest('.mp3-card') || e.target.closest('.mp3-list-row');
            if (!card) return;
            var filename = card.getAttribute('data-filename');
            if (!filename) return;

            if (multiMode) {
                // Toggle selection
                if (multiSelected[filename]) {
                    delete multiSelected[filename];
                } else {
                    multiSelected[filename] = true;
                }
                updateMultiUI();
                return;
            }

            showDetail(filename);
        });

        // Detail panel events (event delegation)
        overlay.addEventListener('click', function (e) {
            // Multi-select: Select All toggle
            var selAllBtn = e.target.closest('.mp3-multi-select-all');
            if (selAllBtn) {
                toggleSelectAll();
                return;
            }

            // Multi-select confirm button
            var confirmBtn = e.target.closest('.mp3-multi-confirm');
            if (confirmBtn) {
                if (onMultiSelect) {
                    var selected = Object.keys(multiSelected);
                    onMultiSelect(selected);
                }
                close();
                return;
            }

            // Select button in detail panel
            var selectBtn = e.target.closest('.mp3-detail-select-btn');
            if (selectBtn) {
                var fn = selectBtn.getAttribute('data-filename');
                if (multiMode) {
                    // In multi mode, "Auswählen" in detail toggles selection
                    if (multiSelected[fn]) {
                        delete multiSelected[fn];
                    } else {
                        multiSelected[fn] = true;
                    }
                    updateMultiUI();
                    hideDetail();
                } else if (onSelect && fn) {
                    onSelect(fn);
                    close();
                }
                return;
            }
            // Delete button in detail panel
            var deleteBtn = e.target.closest('.mp3-detail-delete-btn');
            if (deleteBtn) {
                var delFilename = deleteBtn.getAttribute('data-filename');
                var inUse = deleteBtn.getAttribute('data-in-use') === '1';
                if (inUse) {
                    alert('Diese Datei wird noch verwendet und kann nicht gelöscht werden.');
                    return;
                }
                if (!confirm('Datei \u201E' + delFilename + '\u201C wirklich löschen?')) return;
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                apiDelete(delFilename)
                    .then(function () {
                        lastLoadedFiles = lastLoadedFiles.filter(function (f) {
                            return f.filename !== delFilename;
                        });
                        delete multiSelected[delFilename];
                        hideDetail();
                        refreshDisplay();
                        if (multiMode) updateMultiUI();
                    })
                    .catch(function (err) {
                        alert('Fehler beim Löschen: ' + err.message);
                        deleteBtn.disabled = false;
                        deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                    });
                return;
            }

            // Close button in detail panel
            var closeBtn = e.target.closest('.mp3-detail-close');
            if (closeBtn) {
                hideDetail();
                return;
            }

            // Save button in detail panel
            var saveBtn = e.target.closest('.mp3-detail-save-btn');
            if (saveBtn) {
                saveDetail();
                return;
            }

            // Inline edit: click on display text to activate edit mode
            var editDisplay = e.target.closest('.mp3-edit-display');
            if (editDisplay) {
                var fieldEl = editDisplay.closest('.mp3-edit-field');
                activateEditField(fieldEl);
                return;
            }
        });

        // Inline edit: Escape cancels, Enter saves, blur deactivates
        overlay.addEventListener('keydown', function (e) {
            var editField = e.target.closest('.mp3-edit-field');
            if (editField) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    deactivateEditField(editField, true);
                    return;
                }
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    deactivateEditField(editField, false);
                    if (hasEditChanges()) saveDetail();
                    return;
                }
            }
            // Ctrl+Enter / Cmd+Enter to save from textarea
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                if (e.target.closest('.mp3-edit-field') && hasEditChanges()) {
                    e.preventDefault();
                    saveDetail();
                }
            }
        });

        // Blur on edit input: deactivate field (with delay for save-btn click)
        overlay.addEventListener('focusout', function (e) {
            if (!e.target.closest('.mp3-edit-input-wrap')) return;
            var fieldEl = e.target.closest('.mp3-edit-field');
            if (!fieldEl) return;
            setTimeout(function () {
                var active = document.activeElement;
                if (active && (active.closest('.mp3-detail-save-btn') || active.closest('.mp3-edit-input-wrap'))) return;
                deactivateEditField(fieldEl, false);
            }, 150);
        });

        // Search (client-side filter, combined with type filter/sort)
        var searchTimer;
        searchInput.addEventListener('input', function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                refreshDisplay();
            }, 200);
        });

        // Sort dropdown
        var sortSelect = qs('.mp3-sort-select', overlay);
        sortSelect.addEventListener('change', function () {
            currentSort = sortSelect.value;
            refreshDisplay();
        });

        // View toggle (grid / list)
        var viewToggle = qs('.mp3-view-toggle', overlay);
        viewToggle.addEventListener('click', function (e) {
            var btn = e.target.closest('.mp3-view-btn');
            if (!btn) return;
            var mode = btn.getAttribute('data-view');
            if (mode === viewMode) return;
            viewMode = mode;
            qsa('.mp3-view-btn', viewToggle).forEach(function (b) {
                b.classList.toggle('mp3-view-active', b.getAttribute('data-view') === mode);
            });
            refreshDisplay();
        });

        // Mobile category offcanvas
        var mobileCatBtn = qs('.mp3-mobile-cat-btn', overlay);
        var sidebarBackdrop = qs('#mp3-sidebar-backdrop');

        function openSidebar() {
            sidebar.classList.add('mp3-sidebar-open');
            if (sidebarBackdrop) sidebarBackdrop.classList.add('mp3-backdrop-open');
        }

        function closeSidebar() {
            sidebar.classList.remove('mp3-sidebar-open');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('mp3-backdrop-open');
        }

        mobileCatBtn.addEventListener('click', function () {
            if (sidebar.classList.contains('mp3-sidebar-open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        // Close sidebar on category select (mobile)
        sidebar.addEventListener('click', function (e) {
            if (e.target.closest('.mp3-cat') && window.innerWidth <= 768) {
                closeSidebar();
            }
        });

        // Sidebar backdrop click to close
        if (sidebarBackdrop) {
            sidebarBackdrop.addEventListener('click', function () {
                closeSidebar();
            });
        }

        // Filter buttons (event delegation on filter bar)
        var filterBar = qs('.mp3-filter-bar', overlay);
        filterBar.addEventListener('click', function (e) {
            var btn = e.target.closest('.mp3-filter-btn');
            if (!btn) return;
            currentFilter = btn.getAttribute('data-filter') || 'all';
            qsa('.mp3-filter-btn', filterBar).forEach(function (b) {
                b.classList.remove('mp3-filter-active');
            });
            btn.classList.add('mp3-filter-active');
            refreshDisplay();
        });

        // Upload via button
        var uploadInput = qs('.mp3-upload-btn input[type="file"]', overlay);
        uploadInput.addEventListener('change', function (e) {
            if (e.target.files && e.target.files.length) {
                doUpload(e.target.files);
            }
            e.target.value = '';
        });

        // Drag & Drop — only external files, ignore internal card drags
        function hasExternalFiles(dt) {
            if (!dt || !dt.types) return false;
            var hasFiles = false;
            for (var i = 0; i < dt.types.length; i++) {
                if (dt.types[i] === 'Files') hasFiles = true;
                // Internal drags (e.g. card images) set text/html or text/plain
                if (dt.types[i] === 'text/html' || dt.types[i] === 'text/plain') return false;
            }
            return hasFiles;
        }

        gridWrap.addEventListener('dragover', function (e) {
            if (!hasExternalFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            gridWrap.classList.add('mp3-dragover');
        });

        gridWrap.addEventListener('dragleave', function (e) {
            e.preventDefault();
            e.stopPropagation();
            gridWrap.classList.remove('mp3-dragover');
        });

        gridWrap.addEventListener('drop', function (e) {
            gridWrap.classList.remove('mp3-dragover');
            if (!hasExternalFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.dataTransfer.files && e.dataTransfer.files.length) {
                doUpload(e.dataTransfer.files);
            }
        });
    }

    // ---- Multi-Select Helpers ----
    function getVisibleFilenames() {
        var filenames = [];
        qsa('.mp3-card, .mp3-list-row', grid).forEach(function (el) {
            var fn = el.getAttribute('data-filename');
            if (fn) filenames.push(fn);
        });
        return filenames;
    }

    function toggleSelectAll() {
        var visible = getVisibleFilenames();
        // If all visible are selected → deselect all, otherwise select all
        var allSelected = visible.length > 0 && visible.every(function (fn) { return !!multiSelected[fn]; });
        if (allSelected) {
            // Deselect all visible
            visible.forEach(function (fn) { delete multiSelected[fn]; });
        } else {
            // Select all visible
            visible.forEach(function (fn) { multiSelected[fn] = true; });
        }
        updateMultiUI();
    }

    function updateMultiUI() {
        var keys = Object.keys(multiSelected);
        var count = keys.length;
        var visible = getVisibleFilenames();
        var allSelected = visible.length > 0 && visible.every(function (fn) { return !!multiSelected[fn]; });

        // Update select-all button text
        var selAllBtn = qs('.mp3-multi-select-all', multiFooter);
        if (selAllBtn) {
            selAllBtn.innerHTML = '<i class="fa-solid ' + (allSelected ? 'fa-square' : 'fa-square-check') + '"></i> ' +
                (allSelected ? 'Alle abwählen' : 'Alle auswählen');
        }

        // Update footer
        if (multiFooter) {
            var countEl = qs('.mp3-multi-count', multiFooter);
            if (countEl) {
                countEl.textContent = count + ' Datei' + (count !== 1 ? 'en' : '') + ' ausgewählt';
            }
        }

        // Update card checkboxes
        qsa('.mp3-card', grid).forEach(function (c) {
            var fn = c.getAttribute('data-filename');
            var isSel = !!multiSelected[fn];
            c.classList.toggle('mp3-card-multi-selected', isSel);
            var chk = qs('.mp3-card-check i', c);
            if (chk) {
                chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
            }
        });

        // Update list row checkboxes
        qsa('.mp3-list-row', grid).forEach(function (r) {
            var fn = r.getAttribute('data-filename');
            var isSel = !!multiSelected[fn];
            r.classList.toggle('mp3-list-row-multi-selected', isSel);
            var chk = qs('.mp3-list-cell-check i', r);
            if (chk) {
                chk.className = 'fa-solid ' + (isSel ? 'fa-square-check' : 'fa-square');
            }
        });
    }

    // ---- Open / Close ----
    function open(callbackOrOpts, opts) {
        build();

        // Support both: MP3.open(cb) and MP3.open(cb, { multiple: true })
        // and MP3.open({ multiple: true, onSelect: cb })
        var callback, options;
        if (typeof callbackOrOpts === 'function') {
            callback = callbackOrOpts;
            options = opts || {};
        } else if (typeof callbackOrOpts === 'object' && callbackOrOpts) {
            options = callbackOrOpts;
            callback = options.onSelect || null;
        } else {
            callback = null;
            options = {};
        }

        multiMode = !!options.multiple;
        multiSelected = {};
        onSelect = (!multiMode && typeof callback === 'function') ? callback : null;
        onMultiSelect = (multiMode && typeof callback === 'function') ? callback : null;

        // Reset modal position/size on open
        var modal = qs('.mp3-modal', overlay);
        if (modal) {
            modal.style.position = '';
            modal.style.left = '';
            modal.style.top = '';
            modal.style.margin = '';
            modal.style.transform = '';
            modal.style.width = '';
            modal.style.maxWidth = '';
            modal.style.height = '';
        }

        overlay.classList.add('mp3-open');
        overlay.classList.toggle('mp3-multi-mode', multiMode);
        document.body.style.overflow = 'hidden';
        searchInput.value = '';
        currentCat = 0;
        catCache = {};
        catPath = [];
        lastLoadedFiles = [];
        currentFilter = 'all';
        currentSort = 'date_desc';
        viewMode = 'grid';

        // Show/hide multi footer
        if (multiFooter) {
            multiFooter.style.display = multiMode ? '' : 'none';
            var countEl = qs('.mp3-multi-count', multiFooter);
            if (countEl) countEl.textContent = '0 Dateien ausgewählt';
        }

        // Reset filter UI
        qsa('.mp3-filter-btn', overlay).forEach(function (b) {
            b.classList.toggle('mp3-filter-active', b.getAttribute('data-filter') === 'all');
        });
        qsa('.mp3-view-btn', overlay).forEach(function (b) {
            b.classList.toggle('mp3-view-active', b.getAttribute('data-view') === 'grid');
        });
        var sortSel = qs('.mp3-sort-select', overlay);
        if (sortSel) sortSel.value = 'date_desc';
        // Reset mobile states
        if (sidebar) sidebar.classList.remove('mp3-sidebar-open');
        var bd = qs('#mp3-sidebar-backdrop');
        if (bd) bd.classList.remove('mp3-backdrop-open');
        renderBreadcrumb();
        loadCategories();
        loadFiles(currentCat);
    }

    function close() {
        if (overlay) {
            overlay.classList.remove('mp3-open');
            overlay.classList.remove('mp3-multi-mode');
            document.body.style.overflow = '';
        }
        multiMode = false;
        multiSelected = {};
        onSelect = null;
        onMultiSelect = null;
    }

    // ---- Public API ----
    window.MP3 = {
        open: open,
        close: close
    };

})();
