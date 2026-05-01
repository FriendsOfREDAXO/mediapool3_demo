/**
 * Medienpool 3.0 – Overlay Media Picker
 * Uses FriendsOfREDAXO/api REST addon for data.
 * Image thumbnails via REDAXO Media Manager (same pattern as MediaNeo).
 */
(function () {
    'use strict';

    var API_BASE = '/api/backend/';
    var DEFAULT_MEDIA_PER_PAGE = 30;
    var MEDIA_PER_PAGE_OPTIONS = [30, 50, 100, 250];

    // ---- State ----
    var overlay, sidebar, grid, gridWrap, searchInput, statusBar, breadcrumb, detailPanel, multiFooter;
    var lightboxLayer, lightboxImage, lightboxCaption;
    var currentCat = 0;
    var onSelect = null;
    var onMultiSelect = null;  // callback for multi-select mode: receives array of filenames
    var multiMode = false;     // true when opened with multiple: true
    var multiSelected = {};    // filename → true (selected files in multi mode)
    var collectionDragSelected = {}; // filename -> true (normal mode batch selection for drag to collection)
    var built = false;
    var catCache = {};     // id → { name, hasChildren, parent_id, children: [...], loaded: bool }
    var catPath = [];      // breadcrumb path: [{ id, name }, ...]
    var lastLoadedFiles = [];  // raw API result for client-side filter/sort
    var currentFilter = 'all'; // all | images | videos | audio | documents | other
    var currentTagFilters = {}; // tagName -> true
    var currentTagCatalog = []; // [{name,color}]
    var currentSort = 'date_desc'; // date_desc | date_asc | filename_asc | filename_desc | title_asc | title_desc
    var mediaPage = 1;
    var mediaPerPage = DEFAULT_MEDIA_PER_PAGE;
    var mediaTotal = 0;
    var mediaHasMore = false;
    var mediaLoading = false;
    var mediaQuery = '';
    var mediaForceCacheTokens = {}; // filename -> token for forced cache bust after replace
    var selectedFile = null; // currently selected filename for detail view
    var viewMode = 'grid'; // grid | list | masonry
    var COLLECTION_TAG_PREFIX = 'collection:';
    var activeCollectionId = null;
    var darkModeEnabled = false; // true = dark mode, false = light mode
    var mediaLinkPickFieldKey = null; // active media_link field key while picking from file grid
    var detailTinyEditorIds = []; // TinyMCE editor ids initialized by the detail panel
    var fullscreenMode = false;
    var lightboxOpen = false;
    // Editor canvas state
    var editorCanvasOpen = false;
    var editorCanvasTinyId = null;  // TinyMCE editor id in canvas
    var editorCanvasFieldKey = null; // field key being edited
    var editorCanvasClangId = null;  // clang id (null = no translation)

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

    function getFilenameExtension(filename) {
        var name = String(filename || '');
        var pos = name.lastIndexOf('.');
        if (pos < 0 || pos === name.length - 1) return '';
        return name.substring(pos + 1).toLowerCase();
    }

    // Global setDarkMode function (must be accessible from click handlers)
    function setDarkMode(enabled) {
        darkModeEnabled = !!enabled;
        if (overlay) {
            overlay.classList.toggle('mp3-dark-mode', darkModeEnabled);
        }
        localStorage.setItem('mp3_dark_mode', darkModeEnabled ? '1' : '0');
        var darkToggleBtn = overlay ? qs('.mp3-dark-mode-toggle', overlay) : null;
        if (darkToggleBtn) {
            darkToggleBtn.classList.toggle('mp3-dark-mode-active', darkModeEnabled);
        }
    }

    function normalizeReplacementExtension(ext) {
        ext = String(ext || '').toLowerCase();
        if (ext === 'jpeg' || ext === 'jpe') return 'jpg';
        return ext;
    }

    function normalizeMediaPerPage(value) {
        var parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            return DEFAULT_MEDIA_PER_PAGE;
        }

        if (MEDIA_PER_PAGE_OPTIONS.indexOf(parsed) < 0) {
            return DEFAULT_MEDIA_PER_PAGE;
        }

        return parsed;
    }

    function sanitizeCollectionName(name) {
        var next = String(name || '').trim();
        if (!next) return '';
        next = next.replace(/^collection\s*:\s*/i, '');
        return next.slice(0, 60);
    }

    function collectionNameToTag(name) {
        var clean = sanitizeCollectionName(name);
        if (!clean) return '';
        return COLLECTION_TAG_PREFIX + clean;
    }

    function collectionTagToName(tagName) {
        var raw = String(tagName || '');
        if (raw.toLowerCase().indexOf(COLLECTION_TAG_PREFIX) !== 0) {
            return '';
        }
        return sanitizeCollectionName(raw.substring(COLLECTION_TAG_PREFIX.length));
    }

    function normalizeSystemTags(tags) {
        var list = Array.isArray(tags) ? tags : [];
        var byName = {};
        for (var i = 0; i < list.length; i++) {
            var t = list[i] || {};
            var name = String(t.name || '').trim();
            if (!name) continue;
            if (!byName[name]) {
                byName[name] = {
                    name: name,
                    color: /^#[0-9a-fA-F]{6}$/.test(String(t.color || '')) ? String(t.color).toLowerCase() : '#4a90d9'
                };
            }
        }
        return Object.keys(byName).map(function (k) { return byName[k]; });
    }

    function isCollectionTagName(tagName) {
        return String(tagName || '').toLowerCase().indexOf(COLLECTION_TAG_PREFIX) === 0;
    }

    function splitSystemTags(tags) {
        var normalized = normalizeSystemTags(tags);
        var normal = [];
        var collections = [];
        for (var i = 0; i < normalized.length; i++) {
            if (isCollectionTagName(normalized[i].name)) {
                collections.push(normalized[i]);
            } else {
                normal.push(normalized[i]);
            }
        }
        return { normal: normal, collections: collections };
    }

    function mergeUniqueSystemTags(tagsA, tagsB) {
        return normalizeSystemTags((Array.isArray(tagsA) ? tagsA : []).concat(Array.isArray(tagsB) ? tagsB : []));
    }

    function getCollectionTagColor(name) {
        var targetTag = collectionNameToTag(name);
        if (!targetTag) return '#4a90d9';
        for (var i = 0; i < currentTagCatalog.length; i++) {
            var item = currentTagCatalog[i] || {};
            if (String(item.name || '') === targetTag && /^#[0-9a-fA-F]{6}$/.test(String(item.color || ''))) {
                return String(item.color).toLowerCase();
            }
        }
        return '#4a90d9';
    }

    function getCollectionsForCurrentCategory() {
        var map = {};

        for (var i = 0; i < currentTagCatalog.length; i++) {
            var tagItem = currentTagCatalog[i] || {};
            var name = collectionTagToName(tagItem.name || '');
            if (!name) continue;
            if (!map[name]) {
                map[name] = {
                    id: name,
                    name: name,
                    color: /^#[0-9a-fA-F]{6}$/.test(String(tagItem.color || '')) ? String(tagItem.color).toLowerCase() : '#4a90d9',
                    filesCount: 0
                };
            }
        }

        for (var j = 0; j < lastLoadedFiles.length; j++) {
            var tags = normalizeSystemTags(lastLoadedFiles[j].system_tags || []);
            for (var k = 0; k < tags.length; k++) {
                var collName = collectionTagToName(tags[k].name);
                if (!collName) continue;
                if (!map[collName]) {
                    map[collName] = {
                        id: collName,
                        name: collName,
                        color: /^#[0-9a-fA-F]{6}$/.test(String(tags[k].color || '')) ? String(tags[k].color).toLowerCase() : '#4a90d9',
                        filesCount: 0
                    };
                }
                map[collName].filesCount += 1;
            }
        }

        if (activeCollectionId && !map[activeCollectionId]) {
            map[activeCollectionId] = {
                id: activeCollectionId,
                name: activeCollectionId,
                color: '#4a90d9',
                filesCount: 0
            };
        }

        return Object.keys(map)
            .map(function (key) { return map[key]; })
            .sort(function (a, b) {
                return String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' });
            });
    }

    function getLoadedFilesForCollection(name) {
        var tag = collectionNameToTag(name);
        if (!tag) return [];
        return lastLoadedFiles.filter(function (f) {
            var tags = normalizeSystemTags(f.system_tags || []);
            for (var i = 0; i < tags.length; i++) {
                if (tags[i].name === tag) return true;
            }
            return false;
        });
    }

    function updateCachedFileSystemTags(filename, tags) {
        var normalized = normalizeSystemTags(tags);
        for (var i = 0; i < lastLoadedFiles.length; i++) {
            if (String(lastLoadedFiles[i].filename || '') === String(filename || '')) {
                lastLoadedFiles[i].system_tags = normalized;
                break;
            }
        }
    }

    function withCollectionMembership(tags, collectionName, enable) {
        var list = normalizeSystemTags(tags);
        var targetTag = collectionNameToTag(collectionName);
        if (!targetTag) return list;

        var found = false;
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].name || '') === targetTag) {
                found = true;
                if (!enable) {
                    list.splice(i, 1);
                }
                break;
            }
        }

        if (enable && !found) {
            list.push({
                name: targetTag,
                color: getCollectionTagColor(collectionName)
            });
        }

        return list;
    }

    function renameCollectionOnLoadedFiles(oldName, newName) {
        var files = getLoadedFilesForCollection(oldName);
        if (!files.length) return Promise.resolve(0);

        var updated = 0;
        var jobs = files.map(function (file) {
            var tags = withCollectionMembership(file.system_tags || [], oldName, false);
            tags = withCollectionMembership(tags, newName, true);
            return apiSaveJsonMetainfo(file.filename, { __system_tags: tags }).then(function () {
                updateCachedFileSystemTags(file.filename, tags);
                updated += 1;
            });
        });

        return Promise.all(jobs).then(function () { return updated; });
    }

    function deleteCollectionOnLoadedFiles(name) {
        var files = getLoadedFilesForCollection(name);
        if (!files.length) return Promise.resolve(0);

        var updated = 0;
        var jobs = files.map(function (file) {
            var tags = withCollectionMembership(file.system_tags || [], name, false);
            return apiSaveJsonMetainfo(file.filename, { __system_tags: tags }).then(function () {
                updateCachedFileSystemTags(file.filename, tags);
                updated += 1;
            });
        });

        return Promise.all(jobs).then(function () { return updated; });
    }

    function setFileCollectionMembership(filename, collectionName, enable) {
        if (!filename || !collectionName) {
            return Promise.resolve(false);
        }

        return apiLoadJsonMetainfo(filename)
            .then(function (meta) {
                var tags = withCollectionMembership(meta.system_tags || [], collectionName, enable);
                return apiSaveJsonMetainfo(filename, { __system_tags: tags })
                    .then(function () {
                        updateCachedFileSystemTags(filename, tags);
                        if (selectedFile === filename) {
                            detailOriginalSystemTags = deepClone(tags);
                        }
                        return true;
                    });
            });
    }

    function getActiveCollection() {
        if (!activeCollectionId) {
            return null;
        }

        var list = getCollectionsForCurrentCategory();
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].id) === String(activeCollectionId)) {
                return list[i];
            }
        }

        return {
            id: activeCollectionId,
            name: activeCollectionId,
            filesCount: 0,
            color: '#4a90d9'
        };
    }

    function setActiveCollection(id) {
        activeCollectionId = id ? String(id) : null;
        if (activeCollectionId) {
            localStorage.setItem('mp3_active_collection', activeCollectionId);
        } else {
            localStorage.removeItem('mp3_active_collection');
        }
    }

    function isFileInActiveCollection(filename) {
        var col = getActiveCollection();
        if (!col || !filename) return false;
        var file = null;
        for (var i = 0; i < lastLoadedFiles.length; i++) {
            if (String(lastLoadedFiles[i].filename || '') === String(filename)) {
                file = lastLoadedFiles[i];
                break;
            }
        }
        if (!file) return false;
        var tags = normalizeSystemTags(file.system_tags || []);
        var targetTag = collectionNameToTag(col.name);
        for (var j = 0; j < tags.length; j++) {
            if (String(tags[j].name || '') === targetTag) {
                return true;
            }
        }
        return false;
    }

    function toggleFileInActiveCollection(filename) {
        var col = getActiveCollection();
        if (!col || !filename) return Promise.resolve(false);
        var next = !isFileInActiveCollection(filename);
        return setFileCollectionMembership(filename, col.name, next)
            .then(function () { return next; });
    }

    function createCollection(catId, name) {
        var clean = sanitizeCollectionName(name);
        if (!clean) return Promise.resolve(null);
        var list = getCollectionsForCurrentCategory();
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].name || '').toLowerCase() === clean.toLowerCase()) {
                return Promise.resolve(null);
            }
        }

        return apiCollectionCatalogAction('collection_create', {
            name: collectionNameToTag(clean),
            color: '#4a90d9'
        }).then(function (json) {
            currentTagCatalog = Array.isArray(json.catalog) ? json.catalog : currentTagCatalog;
            return { id: clean, name: clean, filesCount: 0, color: '#4a90d9' };
        });
    }

    function renameCollection(catId, colId, name) {
        var oldName = sanitizeCollectionName(colId);
        var clean = sanitizeCollectionName(name);
        if (!oldName || !clean) return Promise.resolve(0);
        if (oldName.toLowerCase() === clean.toLowerCase()) return Promise.resolve(0);

        return apiCollectionCatalogAction('collection_rename', {
            old_name: collectionNameToTag(oldName),
            new_name: collectionNameToTag(clean)
        }).then(function (json) {
            currentTagCatalog = Array.isArray(json.catalog) ? json.catalog : currentTagCatalog;
            var updated = parseInt(json.affected_files, 10) || 0;

            for (var i = 0; i < lastLoadedFiles.length; i++) {
                var tags = withCollectionMembership(lastLoadedFiles[i].system_tags || [], oldName, false);
                tags = withCollectionMembership(tags, clean, true);
                lastLoadedFiles[i].system_tags = tags;
            }

            if (String(activeCollectionId).toLowerCase() === oldName.toLowerCase()) {
                setActiveCollection(clean);
            }

            return updated;
        });
    }

    function deleteCollection(catId, colId) {
        var name = sanitizeCollectionName(colId);
        if (!name) return Promise.resolve(0);

        return apiCollectionCatalogAction('collection_delete', {
            name: collectionNameToTag(name)
        }).then(function (json) {
            currentTagCatalog = Array.isArray(json.catalog) ? json.catalog : currentTagCatalog;
            var updated = parseInt(json.affected_files, 10) || 0;

            for (var i = 0; i < lastLoadedFiles.length; i++) {
                lastLoadedFiles[i].system_tags = withCollectionMembership(lastLoadedFiles[i].system_tags || [], name, false);
            }

            if (String(activeCollectionId).toLowerCase() === name.toLowerCase()) {
                setActiveCollection(null);
            }

            return updated;
        });
    }

    function renderCollectionsSection() {
        var list = getCollectionsForCurrentCategory();
        var html = '<div class="mp3-collections-wrap">';
        html += '<div class="mp3-collections-head">';
        html += '<span class="mp3-collections-title"><i class="fa-solid fa-photo-film"></i> Sammlungen</span>';
        html += '<button type="button" class="mp3-collection-add-btn" title="Sammlung erstellen"><i class="fa-solid fa-plus"></i></button>';
        html += '</div>';

        if (!list.length) {
            html += '<div class="mp3-collection-empty">Noch keine Sammlung</div>';
        } else {
            html += '<div class="mp3-collections-list">';
            for (var i = 0; i < list.length; i++) {
                var col = list[i];
                html += '<div class="mp3-collection-row">';
                html += '<a class="mp3-collection' + (String(activeCollectionId || '').toLowerCase() === String(col.id || '').toLowerCase() ? ' mp3-collection-active' : '') + '" data-collection-id="' + escAttr(col.id) + '">';
                html += '<i class="fa-solid fa-compact-disc"></i> ' + escAttr(col.name) + ' <span class="mp3-collection-count">' + (parseInt(col.filesCount, 10) || 0) + '</span>';
                html += '</a>';
                html += '<button type="button" class="mp3-collection-rename-btn" data-collection-id="' + escAttr(col.id) + '" title="Sammlung umbenennen"><i class="fa-solid fa-pen"></i></button>';
                html += '<button type="button" class="mp3-collection-delete-btn" data-collection-id="' + escAttr(col.id) + '" title="Sammlung löschen"><i class="fa-solid fa-trash-can"></i></button>';
                html += '</div>';
            }
            html += '</div>';
        }

        if (activeCollectionId) {
            html += '<div class="mp3-collection-help">Aktiv: ' + escAttr(activeCollectionId) + ' · Medium per Lesezeichen hinzufügen/entfernen.</div>';
        } else {
            html += '<div class="mp3-collection-help">Sammlung aktivieren, dann Medien per Lesezeichen zuordnen.</div>';
        }

        html += '</div>';
        return html;
    }

    function applyCollectionFilter(files) {
        var col = getActiveCollection();
        if (!col || !col.name) {
            return files;
        }
        var targetTag = collectionNameToTag(col.name);
        if (!targetTag) return files;
        return files.filter(function (f) {
            var tags = normalizeSystemTags(f.system_tags || []);
            for (var i = 0; i < tags.length; i++) {
                if (String(tags[i].name || '') === targetTag) {
                    return true;
                }
            }
            return false;
        });
    }

    function extensionsCompatible(sourceFilename, targetFilename) {
        var sourceExt = normalizeReplacementExtension(getFilenameExtension(sourceFilename));
        var targetExt = normalizeReplacementExtension(getFilenameExtension(targetFilename));
        if (!sourceExt || !targetExt) return false;
        return sourceExt === targetExt;
    }

    function getReplacementAcceptForFilename(filename) {
        var ext = normalizeReplacementExtension(getFilenameExtension(filename));
        if (ext === 'jpg') return '.jpg,.jpeg';
        if (!ext) return '';
        return '.' + ext;
    }

    function getMediaCacheToken(mediaOrFilename) {
        var filenameFromArg = '';

        if (mediaOrFilename && typeof mediaOrFilename === 'object') {
            filenameFromArg = String(mediaOrFilename.filename || '');
            if (filenameFromArg && mediaForceCacheTokens[filenameFromArg]) {
                return String(mediaForceCacheTokens[filenameFromArg]);
            }
            if (mediaOrFilename.updatedate) return String(mediaOrFilename.updatedate);
            if (mediaOrFilename.filesize) return String(mediaOrFilename.filesize);
            return '';
        }

        var filename = String(mediaOrFilename || '');
        if (!filename) return '';

        if (mediaForceCacheTokens[filename]) {
            return String(mediaForceCacheTokens[filename]);
        }

        for (var i = 0; i < lastLoadedFiles.length; i++) {
            var f = lastLoadedFiles[i];
            if (String(f.filename || '') === filename) {
                if (f.updatedate) return String(f.updatedate);
                if (f.filesize) return String(f.filesize);
                break;
            }
        }

        return '';
    }

    function withMediaCacheBuster(url, mediaOrFilename) {
        var token = getMediaCacheToken(mediaOrFilename);
        if (!token) return url;
        return url + (url.indexOf('?') === -1 ? '?' : '&') + 'mp3v=' + encodeURIComponent(token);
    }

    function setFullscreenMode(enabled) {
        fullscreenMode = !!enabled;
        if (!overlay) return;
        overlay.classList.toggle('mp3-fullscreen-mode', fullscreenMode);
        var btn = qs('.mp3-fullscreen-toggle', overlay);
        if (!btn) return;
        btn.innerHTML = fullscreenMode
            ? '<i class="fa-solid fa-compress"></i>'
            : '<i class="fa-solid fa-expand"></i>';
        btn.title = fullscreenMode ? 'Fenstergröße wiederherstellen' : 'Vollbild';
    }

    function openLightbox(src, caption) {
        if (!lightboxLayer || !lightboxImage) return;
        if (!src) return;
        lightboxImage.src = src;
        lightboxImage.alt = caption || '';
        if (lightboxCaption) {
            lightboxCaption.textContent = caption || '';
            lightboxCaption.style.display = caption ? '' : 'none';
        }
        lightboxLayer.classList.add('mp3-lightbox-open');
        lightboxOpen = true;
    }

    function closeLightbox() {
        if (!lightboxLayer) return;
        lightboxLayer.classList.remove('mp3-lightbox-open');
        if (lightboxImage) {
            lightboxImage.removeAttribute('src');
        }
        lightboxOpen = false;
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
        var result = applyCollectionFilter(files.slice());

        // Tag filter (independent from type filter)
        var selectedTags = Object.keys(currentTagFilters);
        if (selectedTags.length) {
            result = result.filter(function (f) {
                var tags = Array.isArray(f.system_tags) ? f.system_tags : [];
                for (var i = 0; i < tags.length; i++) {
                    var n = tags[i] ? String(tags[i].name || '') : '';
                    if (n && currentTagFilters[n]) {
                        return true;
                    }
                }
                return false;
            });
        }

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
                var filename = String(f.filename || '').toLowerCase();
                var title = String(f.title || '').toLowerCase();
                var originalname = String(f.originalname || '').toLowerCase();
                
                // Check standard fields (Server-Seite Filter durchsucht auch med_json_data)
                return filename.indexOf(q) !== -1 || title.indexOf(q) !== -1 || originalname.indexOf(q) !== -1;
            });
        }
        renderFiles(filtered);
        if (!multiMode) {
            updateCollectionDragSelectionUI();
        }
        updateFilterCounts();
        updatePaginationUi(filtered.length);
    }

    function updateFilterCounts() {
        if (!overlay) return;
        var base = applyCollectionFilter(lastLoadedFiles.slice());
        var selectedTags = Object.keys(currentTagFilters);
        if (selectedTags.length) {
            base = base.filter(function (f) {
                var tags = Array.isArray(f.system_tags) ? f.system_tags : [];
                for (var i = 0; i < tags.length; i++) {
                    var n = tags[i] ? String(tags[i].name || '') : '';
                    if (n && currentTagFilters[n]) {
                        return true;
                    }
                }
                return false;
            });
        }
        var btns = qsa('.mp3-filter-btn', overlay);
        btns.forEach(function (btn) {
            var type = btn.getAttribute('data-filter');
            var filterFn = FILTER_MAP[type];
            var count = filterFn ? base.filter(filterFn).length : base.length;
            var badge = btn.querySelector('.mp3-filter-count');
            if (badge) badge.textContent = count;
        });
    }

    function getTagsApiUrl(params) {
        var root = document.getElementById('mp3-root');
        var baseUrl = root ? root.dataset.tagsUrl : null;
        if (!baseUrl) {
            baseUrl = 'index.php?rex-api-call=mediapool3_demo_tags';
        }
        var query = [];
        var keys = Object.keys(params || {});
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (params[key] === null || params[key] === undefined || params[key] === '') continue;
            query.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key])));
        }
        if (query.length) {
            baseUrl += (baseUrl.indexOf('?') === -1 ? '?' : '&') + query.join('&');
        }
        return baseUrl;
    }

    function apiCollectionCatalogAction(action, payload) {
        var body = payload && typeof payload === 'object' ? payload : {};
        body.action = action;

        return fetch(getTagsApiUrl({}), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        })
        .then(function (r) {
            if (!r.ok) {
                return r.json().then(function (json) {
                    throw new Error((json && json.error) ? json.error : ('HTTP ' + r.status));
                });
            }
            return r.json();
        });
    }

    function apiLoadSystemTagsForFiles(filenames) {
        var params = {};
        if (filenames && filenames.length) {
            params.filenames = filenames.join(',');
        }

        return fetch(getTagsApiUrl(params), {
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
            return {
                file_tags: (json && typeof json.file_tags === 'object' && json.file_tags) ? json.file_tags : {},
                catalog: Array.isArray(json.catalog) ? json.catalog : []
            };
        });
    }

    function updateTagFilterOptions() {
        if (!overlay) return;
        var menu = qs('.mp3-tag-filter-menu', overlay);
        var label = qs('.mp3-tag-filter-label', overlay);
        if (!menu || !label) return;

        var selected = {};
        var selectedNames = Object.keys(currentTagFilters);
        for (var si = 0; si < selectedNames.length; si++) {
            selected[selectedNames[si]] = true;
        }

        var unique = {};
        var tags = Array.isArray(currentTagCatalog) ? currentTagCatalog : [];

        if (!tags.length) {
            for (var i = 0; i < lastLoadedFiles.length; i++) {
                var ft = Array.isArray(lastLoadedFiles[i].system_tags) ? lastLoadedFiles[i].system_tags : [];
                for (var j = 0; j < ft.length; j++) {
                    var n = String((ft[j] && ft[j].name) || '').trim();
                    if (collectionTagToName(n)) continue;
                    if (n) unique[n] = true;
                }
            }
            tags = Object.keys(unique).sort(function (a, b) {
                return a.localeCompare(b, 'de', { sensitivity: 'base' });
            }).map(function (n) {
                return { name: n, color: '#4a90d9' };
            });
        }

        var html = '';
        var visibleNames = {};
        for (var k = 0; k < tags.length; k++) {
            var name = String((tags[k] && tags[k].name) || '').trim();
            var color = String((tags[k] && tags[k].color) || '#4a90d9');
            if (collectionTagToName(name)) continue;
            if (!name || visibleNames[name]) continue;
            visibleNames[name] = true;
            if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
                color = '#4a90d9';
            }

            html += '<button type="button" class="mp3-tag-filter-option' + (selected[name] ? ' is-selected' : '') + '" data-tag-name="' + escAttr(name) + '">';
            html += '<span class="mp3-tag-dot" style="background:' + escAttr(color.toLowerCase()) + '"></span>';
            html += '<span class="mp3-tag-filter-option-label">' + escAttr(name) + '</span>';
            html += '<i class="fa-solid ' + (selected[name] ? 'fa-square-check' : 'fa-square') + '"></i>';
            html += '</button>';
        }
        if (!html) {
            html = '<div class="mp3-tag-filter-empty">Keine Tags vorhanden</div>';
        }
        menu.innerHTML = html;

        var selectedCount = Object.keys(currentTagFilters).length;
        if (selectedCount === 0) {
            label.textContent = 'Alle Tags';
        } else if (selectedCount === 1) {
            label.textContent = Object.keys(currentTagFilters)[0];
        } else {
            label.textContent = selectedCount + ' Tags';
        }

        // Clean up stale selected tags that are not visible anymore
        var dirty = false;
        Object.keys(currentTagFilters).forEach(function (name) {
            if (!visibleNames[name]) {
                delete currentTagFilters[name];
                dirty = true;
            }
        });
        if (dirty) {
            updateTagFilterOptions();
        }
    }

    function setTagFilterMenuOpen(open) {
        if (!overlay) return;
        var wrap = qs('.mp3-tag-filter-wrap', overlay);
        if (!wrap) return;
        wrap.classList.toggle('is-open', !!open);
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

    function apiFetchRaw(endpoint) {
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
        });
    }

    function apiUpload(file, catId) {
        var fd = new FormData();
        fd.append('file', file);
        // catId -1 means collection mode (no real category) → upload to root (0)
        fd.append('category_id', (catId && catId > 0) ? catId : 0);
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

    function apiUpdateMetainfo(filename, data) {
        return fetch(API_BASE + 'media/' + encodeURIComponent(filename) + '/metainfo', {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(function (r) {
            if (!r.ok) {
                return r.json().then(function (body) {
                    throw new Error(body.error || 'HTTP ' + r.status);
                });
            }
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

    function getJsonApiUrl(filename) {
        var root = document.getElementById('mp3-root');
        var baseUrl = root ? root.dataset.jsonUrl : null;
        if (!baseUrl) {
            baseUrl = 'index.php?rex-api-call=mediapool3_demo_json_metainfo';
        }
        if (filename) {
            baseUrl += (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'filename=' + encodeURIComponent(filename);
        }
        return baseUrl;
    }

    function apiLoadJsonMetainfo(filename) {
        return fetch(getJsonApiUrl(filename), {
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
            return {
                data: (json && typeof json.data === 'object' && json.data) ? json.data : {},
                fields: Array.isArray(json.fields) ? json.fields : [],
                clangs: Array.isArray(json.clangs) ? json.clangs : [],
                system_tags: Array.isArray(json.system_tags) ? json.system_tags : [],
                system_tag_catalog: Array.isArray(json.system_tag_catalog) ? json.system_tag_catalog : []
            };
        });
    }

    function apiSaveJsonMetainfo(filename, data) {
        return fetch(getJsonApiUrl(filename), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data || {})
        })
        .then(function (r) {
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

    function apiRenameCategory(catId, name) {
        return fetch(API_BASE + 'media/category/' + encodeURIComponent(catId), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ name: name })
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function apiReplaceFile(filename, file) {
        var fd = new FormData();
        fd.append('file', file);

        return fetch(API_BASE + 'media/' + encodeURIComponent(filename) + '/update', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            },
            body: fd
        }).then(function (r) {
            if (!r.ok) {
                return r.json().then(function (body) {
                    throw new Error((body && body.error) || ('HTTP ' + r.status));
                });
            }
            return r.json();
        });
    }

    // ---- Detail Panel (JSON Widget System) ----
    var detailOriginalTitle = '';
    var detailOriginalJson = {};
    var detailOriginalSystemTags = [];
    var detailOriginalCollectionSystemTags = [];
    var detailFieldDefs = [];
    var detailClangs = [];
    var detailSystemTagCatalog = [];
    var detailLegacyLoaded = false;

    function deepClone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return value;
        }
    }

    function isObj(v) {
        return v && typeof v === 'object' && !Array.isArray(v);
    }

    function normalizeCompare(v) {
        if (Array.isArray(v)) {
            return v.map(function (x) { return normalizeCompare(x); });
        }
        if (isObj(v)) {
            var keys = Object.keys(v).sort();
            var out = {};
            for (var i = 0; i < keys.length; i++) {
                out[keys[i]] = normalizeCompare(v[keys[i]]);
            }
            return out;
        }
        if (v === null || v === undefined) return null;
        return v;
    }

    function hasChanged(a, b) {
        return JSON.stringify(normalizeCompare(a)) !== JSON.stringify(normalizeCompare(b));
    }

    function isImageFile(filename) {
        return /\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i.test(filename || '');
    }

    function getFocuspointFieldDefs() {
        return detailFieldDefs.filter(function (field) {
            return String(field.widget_type || '') === 'focuspoint';
        });
    }

    function getNormalizedFocuspoint(value) {
        var point = isObj(value) ? value : {};
        var x = Number(point.x);
        var y = Number(point.y);
        if (isNaN(x)) x = 0.5;
        if (isNaN(y)) y = 0.5;
        return {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y))
        };
    }

    function setActiveFocuspointKey(focusKey) {
        if (!detailPanel || !focusKey) return;
        var preview = detailPanel.querySelector('.mp3-detail-preview.mp3-detail-preview-has-focuspoint');
        if (preview) {
            preview.setAttribute('data-focus-active-key', focusKey);
            qsa('.mp3-focuspoint-preview-marker', preview).forEach(function (marker) {
                marker.classList.toggle('is-active', marker.getAttribute('data-focus-preview-key') === focusKey);
            });
        }

        qsa('.mp3-focuspoint-widget', detailPanel).forEach(function (widget) {
            widget.classList.toggle('mp3-focuspoint-widget-active', widget.getAttribute('data-focus-widget-key') === focusKey);
        });
    }

    function updateFocuspointPreviewMarker(focusKey, xPercent, yPercent) {
        if (!detailPanel || !focusKey) return;
        var marker = detailPanel.querySelector('.mp3-focuspoint-preview-marker[data-focus-preview-key="' + focusKey + '"]');
        if (!marker) return;
        marker.style.left = xPercent.toFixed(2) + '%';
        marker.style.top = yPercent.toFixed(2) + '%';
    }

    function renderInlineTextField(label, key, value, inputType) {
        var text = String(value || '').trim();
        var placeholder = 'Klicken zum Bearbeiten';
        var displayClass = text ? 'mp3-edit-text' : 'mp3-edit-text mp3-edit-placeholder';
        var displayText = text || placeholder;
        var html = '<div class="mp3-edit-field mp3-edit-field-inline" data-field-key="' + escAttr(key) + '">';
        html += '<label class="mp3-edit-label">' + escAttr(label) + '</label>';
        html += '<div class="mp3-edit-display" data-inline-toggle="' + escAttr(key) + '">';
        html += '<span class="' + displayClass + '">' + escAttr(displayText) + '</span>';
        html += '<i class="fa-solid fa-pen mp3-edit-pen"></i>';
        html += '</div>';
        html += '<div class="mp3-inline-edit-wrap" style="display:none">';
        html += '<input id="' + escAttr(inputType === 'title' ? 'mp3-detail-title-input' : ('mp3-inline-' + key)) + '" class="mp3-edit-input" type="text" data-json-field="' + escAttr(key) + '" value="' + escAttr(text) + '">';
        html += '</div>';
        html += '<button type="button" class="mp3-field-save-btn" data-save-field="' + escAttr(key) + '" style="display:none"><i class="fa-solid fa-floppy-disk"></i> Speichern</button>';
        html += '</div>';
        return html;
    }

    function toggleInlineEdit(fieldEl, editing) {
        if (!fieldEl) return;
        var display = qs('.mp3-edit-display', fieldEl);
        var editWrap = qs('.mp3-inline-edit-wrap', fieldEl);
        var input = qs('.mp3-edit-input[data-json-field], #mp3-detail-title-input', fieldEl);
        if (!display || !editWrap || !input) return;

        display.style.display = editing ? 'none' : '';
        editWrap.style.display = editing ? '' : 'none';
        fieldEl.classList.toggle('mp3-inline-edit-open', editing);

        if (editing) {
            setTimeout(function () {
                input.focus();
                if (typeof input.select === 'function') input.select();
            }, 0);
        }
    }

    function updateInlineDisplay(fieldEl) {
        if (!fieldEl) return;
        var displayTextEl = qs('.mp3-edit-display .mp3-edit-text', fieldEl);
        var input = qs('.mp3-edit-input[data-json-field], #mp3-detail-title-input', fieldEl);
        if (!displayTextEl || !input) return;
        var text = String(input.value || '').trim();
        if (text) {
            displayTextEl.textContent = text;
            displayTextEl.classList.remove('mp3-edit-placeholder');
        } else {
            displayTextEl.textContent = 'Klicken zum Bearbeiten';
            displayTextEl.classList.add('mp3-edit-placeholder');
        }
    }

    function updateFieldSaveButtons(currentTitle, currentJson) {
        if (!detailPanel) return;

        var titleField = detailPanel.querySelector('.mp3-edit-field[data-field-key="__title"]');
        if (titleField) {
            var titleDirty = hasChanged(currentTitle, detailOriginalTitle);
            var titleSaveBtn = qs('.mp3-field-save-btn', titleField);
            if (titleSaveBtn) titleSaveBtn.style.display = titleDirty ? '' : 'none';
            titleField.classList.toggle('mp3-field-dirty', titleDirty);
        }

        detailFieldDefs.forEach(function (field) {
            var key = String(field.key || '');
            if (!key) return;
            var fieldEl = detailPanel.querySelector('.mp3-json-field[data-field-key="' + key + '"]');
            if (!fieldEl) return;
            var cur = Object.prototype.hasOwnProperty.call(currentJson, key) ? currentJson[key] : null;
            var orig = Object.prototype.hasOwnProperty.call(detailOriginalJson, key) ? detailOriginalJson[key] : null;
            var dirty = hasChanged(cur, orig);
            fieldEl.classList.toggle('mp3-field-dirty', dirty);
            var saveBtn = qs('.mp3-field-save-btn', fieldEl);
            if (saveBtn) saveBtn.style.display = dirty ? '' : 'none';
        });

        var systemField = detailPanel.querySelector('.mp3-json-field[data-field-key="__system_tags"]');
        if (systemField) {
            var systemDirty = hasChanged(collectSystemTagsFromDetail(), detailOriginalSystemTags);
            systemField.classList.toggle('mp3-field-dirty', systemDirty);
            var systemSaveBtn = qs('.mp3-field-save-btn', systemField);
            if (systemSaveBtn) systemSaveBtn.style.display = systemDirty ? '' : 'none';
        }
    }

    function renderFocuspointPreviewMarkers(fields, jsonData) {
        if (!fields.length) return '';
        var html = '<div class="mp3-focuspoint-preview-layer">';
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            var value = Object.prototype.hasOwnProperty.call(jsonData, field.key) ? jsonData[field.key] : null;
            var point = getNormalizedFocuspoint(value);
            html += '<span class="mp3-focuspoint-preview-marker' + (i === 0 ? ' is-active' : '') + '" data-focus-preview-key="' + escAttr(field.key) + '" title="' + escAttr(field.label || field.key) + '" style="left:' + (point.x * 100).toFixed(2) + '%;top:' + (point.y * 100).toFixed(2) + '%"></span>';
        }
        html += '</div>';
        return html;
    }

    function renderSingleLangInput(field, clang, value, multiline) {
        var inputClass = arguments.length > 4 && arguments[4] ? String(arguments[4]) : '';
        var classes = 'mp3-edit-input' + (inputClass ? ' ' + inputClass : '');
        var html = '<div class="mp3-lang-row">';
        html += '<span class="mp3-lang-badge">' + escAttr(clang.code || clang.name || ('L' + clang.id)) + '</span>';
        if (multiline) {
            html += '<textarea class="' + escAttr(classes) + '" rows="3" data-json-field="' + escAttr(field.key) + '" data-clang="' + escAttr(clang.id) + '">' + escAttr(value) + '</textarea>';
        } else {
            html += '<input class="' + escAttr(classes) + '" type="text" data-json-field="' + escAttr(field.key) + '" data-clang="' + escAttr(clang.id) + '" value="' + escAttr(value) + '">';
        }
        html += '</div>';
        return html;
    }

    function renderLangInputs(field, values, multiline) {
        var inputClass = arguments.length > 3 && arguments[3] ? String(arguments[3]) : '';
        var html = '';
        var map = isObj(values) ? values : {};
        var clangs = detailClangs.length ? detailClangs : [{ id: 1, name: 'Lang 1', code: 'l1' }];

        if (clangs.length <= 1) {
            var first = clangs[0];
            var firstVal = map[String(first.id)] || '';
            return renderSingleLangInput(field, first, firstVal, multiline, inputClass);
        }

        var firstLang = clangs[0];
        var firstValue = map[String(firstLang.id)] || '';
        html += '<div class="mp3-lang-group" data-lang-group="' + escAttr(field.key) + '">';
        html += renderSingleLangInput(field, firstLang, firstValue, multiline, inputClass);
        html += '<button type="button" class="mp3-lang-toggle" data-lang-toggle="' + escAttr(field.key) + '"><i class="fa-solid fa-chevron-right"></i> ' + (clangs.length - 1) + ' weitere Sprache' + (clangs.length > 2 ? 'n' : '') + '</button>';
        html += '<div class="mp3-lang-extra" style="display:none">';
        for (var i = 1; i < clangs.length; i++) {
            var c = clangs[i];
            var v = map[String(c.id)] || '';
            html += renderSingleLangInput(field, c, v, multiline, inputClass);
        }
        html += '</div></div>';
        return html;
    }

    function destroyDetailTinyEditors() {
        if (typeof tinymce === 'undefined') {
            detailTinyEditorIds = [];
            return;
        }

        for (var i = 0; i < detailTinyEditorIds.length; i++) {
            var editor = tinymce.get(detailTinyEditorIds[i]);
            if (editor) {
                editor.remove();
            }
        }
        detailTinyEditorIds = [];
    }

    function getTinyLightOptions() {
        var fallback = {
            license_key: 'gpl',
            language: 'de',
            branding: false,
            menubar: false,
            statusbar: true,
            plugins: 'autolink lists link charmap code',
            toolbar: 'blocks | bold italic | bullist numlist | link unlink | code | undo redo',
            height: 260,
            paste_as_text: true
        };

        if (typeof tinyprofiles !== 'undefined' && tinyprofiles && tinyprofiles.light) {
            return Object.assign({}, tinyprofiles.light);
        }

        return fallback;
    }

    function initDetailTinyEditors(container) {
        if (typeof tinymce === 'undefined') return;
        if (!container) return;

        var editors = qsa('textarea.mp3-tinymce-input', container);
        for (var i = 0; i < editors.length; i++) {
            var textarea = editors[i];

            // Initialize only visible editors; hidden language sections are initialized when expanded.
            if (textarea.offsetParent === null) {
                continue;
            }

            if (!textarea.id) {
                textarea.id = 'mp3-tiny-' + Math.random().toString(36).slice(2, 10);
            }

            if (tinymce.get(textarea.id)) {
                if (detailTinyEditorIds.indexOf(textarea.id) === -1) {
                    detailTinyEditorIds.push(textarea.id);
                }
                continue;
            }

            var options = getTinyLightOptions();
            var originalSetup = options.setup;
            options.selector = '#' + textarea.id;
            options.license_key = 'gpl';
            options.setup = (function (setupFn) {
                return function (editor) {
                    if (typeof setupFn === 'function') {
                        setupFn(editor);
                    }
                    editor.on('change input keyup undo redo setcontent', function () {
                        if (typeof tinymce !== 'undefined' && typeof tinymce.triggerSave === 'function') {
                            tinymce.triggerSave();
                        }
                        updateDetailSaveState();
                    });
                };
            })(originalSetup);

            tinymce.init(options);
            detailTinyEditorIds.push(textarea.id);
        }
    }

    // ---- TinyMCE Editor Canvas ----

    function getTinyFullOptions() {
        var base = {
            license_key: 'gpl',
            language: 'de',
            branding: false,
            menubar: false,
            statusbar: true,
            toolbar_sticky: true,
            toolbar_sticky_offset: 0,
            plugins: 'autolink lists link image charmap code fullscreen searchreplace wordcount autoresize',
            toolbar: 'undo redo | blocks | bold italic underline strikethrough | bullist numlist | link image | removeformat code fullscreen',
            min_height: 400,
            autoresize_bottom_margin: 20,
            paste_as_text: false,
            entity_encoding: 'raw',
            relative_urls: false,
            skin: (typeof redaxo !== 'undefined' && redaxo.theme && redaxo.theme.current === 'dark') ? 'oxide-dark' : 'oxide',
            content_css: (typeof redaxo !== 'undefined' && redaxo.theme && redaxo.theme.current === 'dark') ? 'dark' : 'default'
        };

        // Use "default" profile from tinyprofiles if available
        if (typeof tinyprofiles !== 'undefined' && tinyprofiles && tinyprofiles['default']) {
            base = Object.assign({}, tinyprofiles['default']);
            base.license_key = 'gpl';
            base.skin = (typeof redaxo !== 'undefined' && redaxo.theme && redaxo.theme.current === 'dark') ? 'oxide-dark' : 'oxide';
            base.content_css = (typeof redaxo !== 'undefined' && redaxo.theme && redaxo.theme.current === 'dark') ? 'dark' : 'default';
        }

        return base;
    }

    function openEditorCanvas(fieldKey, clangId, label) {
        if (!overlay) return;

        var selector = clangId !== null
            ? '.mp3-tiny-canvas-value[data-json-field="' + fieldKey + '"][data-clang="' + clangId + '"]'
            : '.mp3-tiny-canvas-value[data-json-field="' + fieldKey + '"]:not([data-clang])';

        var hiddenInput = detailPanel ? detailPanel.querySelector(selector) : null;
        var currentValue = hiddenInput ? hiddenInput.value : '';

        editorCanvasOpen = true;
        editorCanvasFieldKey = fieldKey;
        editorCanvasClangId = clangId;

        var content = qs('.mp3-content', overlay);
        content.classList.add('mp3-editor-mode');

        var canvas = qs('#mp3-editor-canvas', overlay);
        canvas.style.display = '';

        // Set header title
        var titleEl = qs('.mp3-editor-canvas-title', canvas);
        if (titleEl) titleEl.textContent = label || fieldKey;

        // Prepare textarea
        var ta = qs('#mp3-editor-canvas-textarea', canvas);
        ta.value = currentValue;

        // Init TinyMCE
        if (typeof tinymce !== 'undefined') {
            if (editorCanvasTinyId && tinymce.get(editorCanvasTinyId)) {
                tinymce.get(editorCanvasTinyId).remove();
            }
            if (!ta.id) ta.id = 'mp3-editor-canvas-textarea';
            editorCanvasTinyId = ta.id;

            var opts = getTinyFullOptions();
            opts.selector = '#' + ta.id;
            opts.license_key = 'gpl';
            // Remove conflicting keys
            delete opts.height;
            opts.setup = (function (origSetup) {
                return function (editor) {
                    if (typeof origSetup === 'function') origSetup(editor);
                    editor.on('keydown', function (e) {
                        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                            e.preventDefault();
                            commitEditorCanvas();
                        }
                    });
                };
            })(opts.setup || null);
            tinymce.init(opts);
        }

        // Focus canvas
        canvas.scrollTop = 0;
    }

    function commitEditorCanvas() {
        if (!editorCanvasOpen) return;
        var val = '';
        if (typeof tinymce !== 'undefined' && editorCanvasTinyId && tinymce.get(editorCanvasTinyId)) {
            val = tinymce.get(editorCanvasTinyId).getContent();
        } else {
            var ta = qs('#mp3-editor-canvas-textarea', overlay);
            if (ta) val = ta.value;
        }

        // Write back to hidden input in detail panel
        if (detailPanel && editorCanvasFieldKey !== null) {
            var selector = editorCanvasClangId !== null
                ? '.mp3-tiny-canvas-value[data-json-field="' + editorCanvasFieldKey + '"][data-clang="' + editorCanvasClangId + '"]'
                : '.mp3-tiny-canvas-value[data-json-field="' + editorCanvasFieldKey + '"]:not([data-clang])';
            var hi = detailPanel.querySelector(selector);
            if (hi) {
                hi.value = val;
                // Update preview
                var row = hi.nextElementSibling;
                if (row && row.classList.contains('mp3-tiny-canvas-row')) {
                    var preview = row.querySelector('.mp3-tiny-canvas-preview');
                    if (preview) preview.textContent = val ? val.replace(/<[^>]+>/g, '').slice(0, 120) || '–' : '–';
                }
            }
            updateDetailSaveState();
        }

        closeEditorCanvas();
    }

    function closeEditorCanvas() {
        editorCanvasOpen = false;
        editorCanvasFieldKey = null;
        editorCanvasClangId = null;

        if (typeof tinymce !== 'undefined' && editorCanvasTinyId && tinymce.get(editorCanvasTinyId)) {
            tinymce.get(editorCanvasTinyId).remove();
        }
        editorCanvasTinyId = null;

        var content = qs('.mp3-content', overlay);
        if (content) content.classList.remove('mp3-editor-mode');
        var canvas = qs('#mp3-editor-canvas', overlay);
        if (canvas) canvas.style.display = 'none';
    }

    function updateAltHint(wrap) {
        if (!wrap) return;
        var altKey = String(wrap.getAttribute('data-alt-key') || '');
        var decCb = wrap.querySelector('[data-json-field="' + altKey + '-decorative"]');
        var isDecorative = decCb ? !!decCb.checked : false;
        var hasText = false;
        var inputs = wrap.querySelectorAll('[data-json-field="' + altKey + '"][data-clang], [data-json-field="' + altKey + '"]:not([data-clang])');
        inputs.forEach(function (inp) {
            if (String(inp.value || '').trim()) hasText = true;
        });
        var hint = wrap.querySelector('.mp3-alt-hint');
        var needsHint = !isDecorative && !hasText;
        if (needsHint && !hint) {
            hint = document.createElement('div');
            hint.className = 'mp3-alt-hint';
            hint.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ALT-Text fehlt – bitte ausfüllen oder als dekorativ markieren.';
            wrap.insertBefore(hint, wrap.firstChild);
        } else if (!needsHint && hint) {
            hint.remove();
        }
    }

    function renderTagsWidget(field, value) {
        var tags = Array.isArray(value) ? value : [];
        var normalized = [];
        for (var i = 0; i < tags.length; i++) {
            var t = tags[i];
            if (typeof t === 'string') {
                normalized.push({ name: t, color: '#4a90d9' });
            } else if (t && typeof t === 'object' && t.name) {
                normalized.push({ name: String(t.name), color: /^#[0-9a-fA-F]{6}$/.test(String(t.color || '')) ? String(t.color).toLowerCase() : '#4a90d9' });
            }
        }
        var safe = JSON.stringify(normalized);
        var html = '<div class="mp3-tags-widget" data-json-field-wrap="' + escAttr(field.key) + '">';
        html += '<input type="hidden" data-json-field="' + escAttr(field.key) + '" data-widget="tags-value" value="' + escAttr(safe) + '">';
        html += '<div class="mp3-tags-list">';
        for (var j = 0; j < normalized.length; j++) {
            html += '<span class="mp3-tag-item">';
            html += '<span class="mp3-tag-dot" style="background:' + escAttr(normalized[j].color) + '"></span> ' + escAttr(normalized[j].name);
            html += ' <input type="color" class="mp3-tag-color" data-tag="' + escAttr(normalized[j].name) + '" value="' + escAttr(normalized[j].color) + '">';
            html += ' <button type="button" class="mp3-tag-remove" data-tag="' + escAttr(normalized[j].name) + '"><i class="fa-solid fa-xmark"></i></button>';
            html += '</span>';
        }
        html += '</div>';
        html += '<div class="mp3-tags-input-wrap">';
        html += '<input class="mp3-edit-input mp3-tags-input" type="text" placeholder="Tag hinzufügen"' + (field.key === '__system_tags' ? ' list="mp3-system-tags-suggestions"' : '') + '>';
        html += '<button type="button" class="mp3-tags-add-btn"><i class="fa-solid fa-plus"></i></button>';
        html += '</div></div>';
        return html;
    }

    function repaintTagsWidget(widgetWrap) {
        if (!widgetWrap) return;
        var hidden = qs('[data-widget="tags-value"]', widgetWrap);
        var listWrap = qs('.mp3-tags-list', widgetWrap);
        if (!hidden || !listWrap) return;
        var tags = [];
        try { tags = JSON.parse(hidden.value || '[]'); } catch (e) { tags = []; }
        if (!Array.isArray(tags)) tags = [];
        var html = '';
        for (var i = 0; i < tags.length; i++) {
            var item = tags[i];
            var tagName = typeof item === 'string' ? item : String((item && item.name) || '');
            var tagColor = typeof item === 'object' && item && /^#[0-9a-fA-F]{6}$/.test(String(item.color || '')) ? String(item.color).toLowerCase() : '#4a90d9';
            if (!tagName) continue;
            html += '<span class="mp3-tag-item">';
            html += '<span class="mp3-tag-dot" style="background:' + escAttr(tagColor) + '"></span> ' + escAttr(tagName);
            html += ' <input type="color" class="mp3-tag-color" data-tag="' + escAttr(tagName) + '" value="' + escAttr(tagColor) + '">';
            html += ' <button type="button" class="mp3-tag-remove" data-tag="' + escAttr(tagName) + '"><i class="fa-solid fa-xmark"></i></button>';
            html += '</span>';
        }
        listWrap.innerHTML = html;
    }

    function applyTagColorChange(colorInput) {
        if (!colorInput) return;
        var colorWrap = colorInput.closest('.mp3-tags-widget');
        var colorHidden = colorWrap ? qs('[data-widget="tags-value"]', colorWrap) : null;
        var colorTag = colorInput.getAttribute('data-tag');
        if (!colorHidden || !colorTag) return;

        var colorValues = [];
        try { colorValues = JSON.parse(colorHidden.value || '[]'); } catch (e) { colorValues = []; }
        if (!Array.isArray(colorValues)) colorValues = [];

        for (var vi = 0; vi < colorValues.length; vi++) {
            var name = typeof colorValues[vi] === 'string' ? colorValues[vi] : String((colorValues[vi] && colorValues[vi].name) || '');
            if (name === colorTag) {
                colorValues[vi] = { name: colorTag, color: String(colorInput.value || '#4a90d9').toLowerCase() };
            }
        }

        colorHidden.value = JSON.stringify(colorValues);
        repaintTagsWidget(colorWrap);
        updateDetailSaveState();
    }

    function renderSystemTagsField(tags, catalog) {
        var split = splitSystemTags(tags || []);
        var field = { key: '__system_tags' };
        var html = '<div class="mp3-edit-field mp3-json-field" data-field-key="__system_tags">';
        html += '<label class="mp3-edit-label">System-Tags <span class="mp3-edit-kind-badge">global</span></label>';
        html += renderTagsWidget(field, split.normal);
        html += '<datalist id="mp3-system-tags-suggestions">';
        for (var i = 0; i < (catalog || []).length; i++) {
            var item = catalog[i];
            var name = item && item.name ? String(item.name) : '';
            if (isCollectionTagName(name)) continue;
            if (!name) continue;
            html += '<option value="' + escAttr(name) + '"></option>';
        }
        html += '</datalist>';
        html += '<div class="mp3-metainfo-hint">Autofill aus bestehenden Tags. Farben gelten systemweit.</div>';
        html += '<button type="button" class="mp3-field-save-btn" data-save-field="__system_tags" style="display:none"><i class="fa-solid fa-floppy-disk"></i> Speichern</button>';
        html += '</div>';
        return html;
    }

    function renderFocuspointWidget(field, value, info) {
        var point = getNormalizedFocuspoint(value);
        var x = point.x;
        var y = point.y;

        if (!info.is_image) {
            return '<div class="mp3-focuspoint-empty">Focuspoint ist nur für Bilder verfügbar.</div>' +
                '<input type="hidden" data-json-field="' + escAttr(field.key) + '-x" value="' + x.toFixed(3) + '">' +
                '<input type="hidden" data-json-field="' + escAttr(field.key) + '-y" value="' + y.toFixed(3) + '">';
        }

        var html = '<div class="mp3-focuspoint-widget" data-json-field-wrap="' + escAttr(field.key) + '" data-focus-widget-key="' + escAttr(field.key) + '">';
        html += '<div class="mp3-focuspoint-help">Klick ins Vorschaubild, um den Fokuspunkt zu setzen.</div>';
        html += '<div class="mp3-focuspoint-inputs">';
        html += '<label>X <input class="mp3-edit-input" type="number" min="0" max="100" step="0.1" data-json-field="' + escAttr(field.key) + '-x" value="' + (x * 100).toFixed(1) + '"></label>';
        html += '<label>Y <input class="mp3-edit-input" type="number" min="0" max="100" step="0.1" data-json-field="' + escAttr(field.key) + '-y" value="' + (y * 100).toFixed(1) + '"></label>';
        html += '</div></div>';
        return html;
    }

    function renderMediaLinkWidget(field, value) {
        var filename = typeof value === 'string' ? value : '';
        var html = '<div class="mp3-media-link-widget" data-json-field-wrap="' + escAttr(field.key) + '">';
        html += '<div class="mp3-media-link-row">';
        html += '<input class="mp3-edit-input" type="text" readonly data-json-field="' + escAttr(field.key) + '" value="' + escAttr(filename) + '" placeholder="Kein Medium verlinkt">';
        html += '<button type="button" class="mp3-media-link-picker" data-field="' + escAttr(field.key) + '"><i class="fa-solid fa-photo-film"></i></button>';
        html += '<button type="button" class="mp3-media-link-clear" data-field="' + escAttr(field.key) + '"><i class="fa-solid fa-xmark"></i></button>';
        html += '</div>';
        html += '<div class="mp3-media-link-pick-hint" style="display:none"><i class="fa-solid fa-circle-info"></i> Auswahl aktiv: Datei im Raster anklicken.</div>';
        if (filename && isImageFile(filename)) {
            var previewSrc = withMediaCacheBuster('index.php?rex_media_type=rex_media_small&rex_media_file=' + encodeURIComponent(filename), filename);
            html += '<div class="mp3-media-link-preview"><img src="' + escAttr(previewSrc) + '" alt=""></div>';
        }
        html += '</div>';
        return html;
    }

    function setMediaLinkPickMode(fieldKey) {
        mediaLinkPickFieldKey = fieldKey || null;
        if (!overlay || !detailPanel) return;

        overlay.classList.toggle('mp3-media-link-pick-mode', !!mediaLinkPickFieldKey);

        qsa('.mp3-media-link-widget', detailPanel).forEach(function (widget) {
            var input = qs('[data-json-field]', widget);
            var key = input ? input.getAttribute('data-json-field') : null;
            var active = !!mediaLinkPickFieldKey && key === mediaLinkPickFieldKey;

            widget.classList.toggle('mp3-media-link-widget-pick-active', active);

            var hint = qs('.mp3-media-link-pick-hint', widget);
            if (hint) {
                hint.style.display = active ? '' : 'none';
            }
        });
    }

    function repaintMediaLinkWidget(widgetWrap) {
        if (!widgetWrap) return;
        var input = qs('[data-json-field]', widgetWrap);
        if (!input) return;
        var filename = String(input.value || '').trim();
        var preview = qs('.mp3-media-link-preview', widgetWrap);
        if (!filename || !isImageFile(filename)) {
            if (preview) preview.remove();
            return;
        }
        var previewSrc = withMediaCacheBuster('index.php?rex_media_type=rex_media_small&rex_media_file=' + encodeURIComponent(filename), filename);
        var previewHtml = '<img src="' + escAttr(previewSrc) + '" alt="">';
        if (preview) {
            preview.innerHTML = previewHtml;
        } else {
            var div = document.createElement('div');
            div.className = 'mp3-media-link-preview';
            div.innerHTML = previewHtml;
            widgetWrap.appendChild(div);
        }
    }

    function renderJsonWidgetField(field, value, info) {
        var widget = String(field.widget_type || 'text');
        var html = '<div class="mp3-edit-field mp3-json-field" data-field-key="' + escAttr(field.key) + '">';
        html += '<label class="mp3-edit-label">' + escAttr(field.label || field.key) + '</label>';

        if (widget === 'textarea') {
            if (field.translatable) {
                html += renderLangInputs(field, value, true);
            } else {
                html += '<textarea class="mp3-edit-input" rows="4" data-json-field="' + escAttr(field.key) + '">' + escAttr(value || '') + '</textarea>';
            }
        } else if (widget === 'tinymce') {
            if (field.translatable) {
                // Per-language preview + canvas open buttons
                var clangs2 = detailClangs.length ? detailClangs : [{ id: 1, name: 'Lang 1', code: 'l1' }];
                var valMap = isObj(value) ? value : {};
                for (var ci = 0; ci < clangs2.length; ci++) {
                    var cl = clangs2[ci];
                    var clVal = valMap[String(cl.id)] || '';
                    html += '<input type="hidden" data-json-field="' + escAttr(field.key) + '" data-clang="' + escAttr(cl.id) + '" class="mp3-tiny-canvas-value" value="' + escAttr(clVal) + '">';
                    html += '<div class="mp3-tiny-canvas-row">';
                    html += '<span class="mp3-lang-badge">' + escAttr(cl.code || cl.name) + '</span>';
                    html += '<div class="mp3-tiny-canvas-preview">' + (clVal ? clVal.replace(/<[^>]+>/g, '').slice(0, 120) || '–' : '–') + '</div>';
                    html += '<button type="button" class="mp3-tiny-canvas-open" data-canvas-field="' + escAttr(field.key) + '" data-canvas-clang="' + escAttr(cl.id) + '" data-canvas-label="' + escAttr((field.label || field.key) + ' (' + (cl.code || cl.name) + ')') + '"><i class="fa-solid fa-pen-to-square"></i> Bearbeiten</button>';
                    html += '</div>';
                }
            } else {
                var tinyVal = String(value || '');
                html += '<input type="hidden" data-json-field="' + escAttr(field.key) + '" class="mp3-tiny-canvas-value" value="' + escAttr(tinyVal) + '">';
                html += '<div class="mp3-tiny-canvas-row">';
                html += '<div class="mp3-tiny-canvas-preview">' + (tinyVal ? tinyVal.replace(/<[^>]+>/g, '').slice(0, 120) || '–' : '–') + '</div>';
                html += '<button type="button" class="mp3-tiny-canvas-open" data-canvas-field="' + escAttr(field.key) + '" data-canvas-label="' + escAttr(field.label || field.key) + '"><i class="fa-solid fa-pen-to-square"></i> Bearbeiten</button>';
                html += '</div>';
            }
        } else if (widget === 'focuspoint') {
            html += renderFocuspointWidget(field, value, info);
        } else if (widget === 'alt') {
            var altValue = isObj(value) ? value : {};
            var altText = isObj(altValue.text) ? altValue.text : {};
            var decorative = !!altValue.decorative;
            // Determine if a text value exists in any clang
            var hasAltText = false;
            if (isObj(altText)) {
                var altKeys = Object.keys(altText);
                for (var ai = 0; ai < altKeys.length; ai++) {
                    if (String(altText[altKeys[ai]] || '').trim()) { hasAltText = true; break; }
                }
            }
            var altMissing = !decorative && !hasAltText;
            html += '<div class="mp3-alt-wrap" data-alt-key="' + escAttr(field.key) + '">';
            if (altMissing) {
                html += '<div class="mp3-alt-hint"><i class="fa-solid fa-triangle-exclamation"></i> ALT-Text fehlt – bitte ausfüllen oder als dekorativ markieren.</div>';
            }
            html += renderLangInputs(field, altText, false);
            html += '<label class="mp3-edit-checkbox-label"><input type="checkbox" data-json-field="' + escAttr(field.key) + '-decorative"' + (decorative ? ' checked' : '') + '> Dekoratives Bild (kein ALT)</label>';
            html += '</div>';
        } else if (widget === 'tags') {
            html += renderTagsWidget(field, value);
        } else if (widget === 'media_link') {
            html += renderMediaLinkWidget(field, value);
        } else {
            if (field.translatable) {
                html += renderLangInputs(field, value, false);
            } else {
                html += '<div class="mp3-edit-display" data-inline-toggle="' + escAttr(field.key) + '"><span class="mp3-edit-text' + (String(value || '').trim() ? '' : ' mp3-edit-placeholder') + '">' + escAttr(String(value || '').trim() || 'Klicken zum Bearbeiten') + '</span><i class="fa-solid fa-pen mp3-edit-pen"></i></div>';
                html += '<div class="mp3-inline-edit-wrap" style="display:none"><input class="mp3-edit-input" type="text" data-json-field="' + escAttr(field.key) + '" value="' + escAttr(value || '') + '"></div>';
            }
        }

        html += '<button type="button" class="mp3-field-save-btn" data-save-field="' + escAttr(field.key) + '" style="display:none"><i class="fa-solid fa-floppy-disk"></i> Speichern</button>';

        html += '</div>';
        return html;
    }

    function collectJsonValuesFromDetail() {
        if (typeof tinymce !== 'undefined' && typeof tinymce.triggerSave === 'function') {
            tinymce.triggerSave();
        }

        var json = {};
        detailFieldDefs.forEach(function (field) {
            var key = field.key;
            var widget = String(field.widget_type || 'text');

            if (widget === 'focuspoint') {
                var xEl = detailPanel.querySelector('[data-json-field="' + key + '-x"]');
                var yEl = detailPanel.querySelector('[data-json-field="' + key + '-y"]');
                if (!xEl || !yEl) {
                    json[key] = null;
                    return;
                }
                var xv = Number(String(xEl.value || '0').replace(',', '.')) / 100;
                var yv = Number(String(yEl.value || '0').replace(',', '.')) / 100;
                if (isNaN(xv) || isNaN(yv)) {
                    json[key] = null;
                    return;
                }
                json[key] = {
                    x: Math.max(0, Math.min(1, Number(xv.toFixed(3)))),
                    y: Math.max(0, Math.min(1, Number(yv.toFixed(3))))
                };
                return;
            }

            if (widget === 'tags') {
                var hidden = detailPanel.querySelector('[data-json-field="' + key + '"][data-widget="tags-value"]');
                if (!hidden || !hidden.value) {
                    json[key] = null;
                    return;
                }
                try {
                    var parsed = JSON.parse(hidden.value);
                    json[key] = Array.isArray(parsed) && parsed.length ? parsed : null;
                } catch (e) {
                    json[key] = null;
                }
                return;
            }

            if (widget === 'alt') {
                var langInputs = qsa('[data-json-field="' + key + '"][data-clang]', detailPanel);
                var textMap = {};
                for (var i = 0; i < langInputs.length; i++) {
                    var v = String(langInputs[i].value || '').trim();
                    var cid = String(langInputs[i].getAttribute('data-clang') || '');
                    if (v) textMap[cid] = v;
                }
                var decorativeEl = detailPanel.querySelector('[data-json-field="' + key + '-decorative"]');
                var decorative = decorativeEl ? !!decorativeEl.checked : false;
                if (!decorative && Object.keys(textMap).length === 0) {
                    json[key] = null;
                } else {
                    json[key] = { text: textMap, decorative: decorative };
                }
                return;
            }

            if (widget === 'tinymce') {
                if (field.translatable) {
                    var tinyInputs = qsa('.mp3-tiny-canvas-value[data-json-field="' + key + '"][data-clang]', detailPanel);
                    var tinyMap = {};
                    for (var ti = 0; ti < tinyInputs.length; ti++) {
                        var tv = String(tinyInputs[ti].value || '').trim();
                        var tcid = String(tinyInputs[ti].getAttribute('data-clang') || '');
                        if (tv) tinyMap[tcid] = tv;
                    }
                    json[key] = Object.keys(tinyMap).length ? tinyMap : null;
                } else {
                    var tinyEl = detailPanel.querySelector('.mp3-tiny-canvas-value[data-json-field="' + key + '"]');
                    var tinyScalar = tinyEl ? String(tinyEl.value || '').trim() : '';
                    json[key] = tinyScalar || null;
                }
                return;
            }

            if (field.translatable) {
                var inputs = qsa('[data-json-field="' + key + '"][data-clang]', detailPanel);
                var map = {};
                for (var j = 0; j < inputs.length; j++) {
                    var text = String(inputs[j].value || '').trim();
                    var clangId = String(inputs[j].getAttribute('data-clang') || '');
                    if (text) map[clangId] = text;
                }
                json[key] = Object.keys(map).length ? map : null;
                return;
            }

            var el = detailPanel.querySelector('[data-json-field="' + key + '"]');
            var scalar = el ? String(el.value || '').trim() : '';
            json[key] = scalar ? scalar : null;
        });
        return json;
    }

    function collectSystemTagsFromDetail() {
        if (!detailPanel) return [];
        var hidden = detailPanel.querySelector('[data-json-field="__system_tags"][data-widget="tags-value"]');
        if (!hidden || !hidden.value) return [];

        var parsed = [];
        try {
            parsed = JSON.parse(hidden.value || '[]');
        } catch (e) {
            parsed = [];
        }

        if (!Array.isArray(parsed)) return [];
        var out = [];
        var seen = {};
        for (var i = 0; i < parsed.length; i++) {
            var item = parsed[i];
            var name = typeof item === 'string' ? item : String((item && item.name) || '');
            var color = typeof item === 'object' && item && /^#[0-9a-fA-F]{6}$/.test(String(item.color || '')) ? String(item.color).toLowerCase() : '#4a90d9';
            name = String(name || '').trim();
            if (isCollectionTagName(name)) continue;
            if (!name || seen[name]) continue;
            seen[name] = true;
            out.push({ name: name, color: color });
        }
        return out;
    }

    function updateDetailSaveState() {
        if (!detailPanel) return;
        var saveBtn = detailPanel.querySelector('.mp3-detail-save-btn');
        if (!saveBtn) return;

        var titleEl = detailPanel.querySelector('#mp3-detail-title-input');
        var currentTitle = titleEl ? String(titleEl.value || '').trim() : '';
        var currentJson = collectJsonValuesFromDetail();
        var currentSystemTags = collectSystemTagsFromDetail();
        var changed = hasChanged(currentTitle, detailOriginalTitle)
            || hasChanged(currentJson, detailOriginalJson)
            || hasChanged(currentSystemTags, detailOriginalSystemTags);

        saveBtn.disabled = !changed;
        saveBtn.style.display = changed ? '' : 'none';
        saveBtn.classList.toggle('is-dirty', changed);

        updateFieldSaveButtons(currentTitle, currentJson);
        qsa('.mp3-edit-field-inline, .mp3-json-field', detailPanel).forEach(updateInlineDisplay);
    }

    function renderLegacyMetainfo(contentEl, values) {
        var keys = Object.keys(values || {}).filter(function (k) {
            return k !== 'med_json_data';
        }).sort();
        if (!keys.length) {
            contentEl.innerHTML = '<div class="mp3-metainfo-hint">Keine alten med_* Felder gefunden.</div>';
            return;
        }

        var html = '<table class="mp3-detail-table">';
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var val = values[key];
            if (Array.isArray(val) || isObj(val)) {
                try { val = JSON.stringify(val); } catch (e) { val = String(val); }
            }
            html += '<tr><td>' + escAttr(key) + '</td><td>' + escAttr(val === null || val === undefined ? '' : String(val)) + '</td></tr>';
        }
        html += '</table>';
        contentEl.innerHTML = html;
    }

    function saveDetail() {
        if (!selectedFile || !detailPanel) return;
        var saveBtn = detailPanel.querySelector('.mp3-detail-save-btn');
        var titleEl = detailPanel.querySelector('#mp3-detail-title-input');
        var currentTitle = titleEl ? String(titleEl.value || '').trim() : '';
        var currentJson = collectJsonValuesFromDetail();
        var currentSystemTags = collectSystemTagsFromDetail();

        var titleChanged = hasChanged(currentTitle, detailOriginalTitle);
        var jsonChanged = hasChanged(currentJson, detailOriginalJson);
        var systemTagsChanged = hasChanged(currentSystemTags, detailOriginalSystemTags);
        if (!titleChanged && !jsonChanged && !systemTagsChanged) {
            updateDetailSaveState();
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichern…';
        }

        var requests = [];
        if (titleChanged) {
            requests.push(apiUpdate(selectedFile, { title: currentTitle }));
        }
        if (jsonChanged || systemTagsChanged) {
            var payload = deepClone(currentJson);
            payload.__system_tags = mergeUniqueSystemTags(currentSystemTags, detailOriginalCollectionSystemTags);
            requests.push(apiSaveJsonMetainfo(selectedFile, payload));
        }

        Promise.all(requests)
            .then(function () {
                detailOriginalTitle = currentTitle;
                detailOriginalJson = deepClone(currentJson);
                detailOriginalSystemTags = deepClone(currentSystemTags);

                if (titleChanged) {
                    var card = grid.querySelector('.mp3-card[data-filename="' + selectedFile + '"]');
                    if (card) {
                        var nameEl = card.querySelector('.mp3-card-name');
                        if (nameEl) nameEl.textContent = currentTitle || selectedFile;
                        var fnameEl = card.querySelector('.mp3-fname');
                        if (currentTitle) {
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
                            nameCell.textContent = currentTitle || selectedFile;
                            nameCell.title = currentTitle ? selectedFile : '';
                        }
                    }
                    var masonryCard = grid.querySelector('.mp3-masonry-card[data-filename="' + selectedFile + '"]');
                    if (masonryCard) {
                        var masonryName = masonryCard.querySelector('.mp3-masonry-name');
                        if (masonryName) {
                            masonryName.textContent = currentTitle || selectedFile;
                            masonryName.title = selectedFile;
                        }
                    }
                    for (var i = 0; i < lastLoadedFiles.length; i++) {
                        if (lastLoadedFiles[i].filename === selectedFile) {
                            lastLoadedFiles[i].title = currentTitle;
                            break;
                        }
                    }
                }

                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Gespeichert';
                    saveBtn.classList.add('mp3-detail-save-success');
                    setTimeout(function () {
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Speichern';
                        saveBtn.classList.remove('mp3-detail-save-success');
                        updateDetailSaveState();
                    }, 1200);
                }

                // After saving system tags: refresh catalog + filter options
                if (systemTagsChanged && selectedFile) {
                    apiLoadSystemTagsForFiles([selectedFile]).then(function (payload) {
                        currentTagCatalog = Array.isArray(payload.catalog) ? payload.catalog : [];
                        var ft = payload.file_tags || {};
                        var selectedFileTags = Array.isArray(ft[selectedFile]) ? ft[selectedFile] : [];
                        var splitTags = splitSystemTags(selectedFileTags);
                        detailOriginalCollectionSystemTags = deepClone(splitTags.collections);
                        for (var k = 0; k < lastLoadedFiles.length; k++) {
                            if (lastLoadedFiles[k].filename === selectedFile) {
                                lastLoadedFiles[k].system_tags = selectedFileTags;
                                break;
                            }
                        }
                        updateTagFilterOptions();
                    }).catch(function () {});
                }
            })
            .catch(function (err) {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Fehler';
                    saveBtn.classList.add('mp3-detail-save-error');
                    setTimeout(function () {
                        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Speichern';
                        saveBtn.classList.remove('mp3-detail-save-error');
                        updateDetailSaveState();
                    }, 1800);
                }
                console.error('MP3 save detail failed:', err);
            });
    }

    function showDetail(filename) {
        selectedFile = filename;
        destroyDetailTinyEditors();
        if (!detailPanel) return;

        qsa('.mp3-card', grid).forEach(function (c) {
            c.classList.toggle('mp3-card-selected', c.getAttribute('data-filename') === filename);
        });
        qsa('.mp3-list-row', grid).forEach(function (r) {
            r.classList.toggle('mp3-list-row-selected', r.getAttribute('data-filename') === filename);
        });
        qsa('.mp3-masonry-card', grid).forEach(function (r) {
            r.classList.toggle('mp3-masonry-card-selected', r.getAttribute('data-filename') === filename);
        });

        detailPanel.classList.add('mp3-detail-open');
        detailPanel.innerHTML = '<div class="mp3-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> Lade Details…</div>';

        Promise.all([
            apiFetch('media/' + encodeURIComponent(filename) + '/info'),
            apiLoadJsonMetainfo(filename).catch(function () { return { data: {}, fields: [], clangs: [], system_tags: [], system_tag_catalog: [] }; })
        ])
            .then(function (payload) {
                renderDetail(payload[0], payload[1]);
            })
            .catch(function (err) {
                detailPanel.innerHTML = '<div class="mp3-detail-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message) + '</div>';
            });
    }

    function hideDetail() {
        selectedFile = null;
        destroyDetailTinyEditors();
        setMediaLinkPickMode(null);
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
        qsa('.mp3-masonry-card', grid).forEach(function (r) {
            r.classList.remove('mp3-masonry-card-selected');
        });
    }


    function renderDetail(info, jsonPayload) {
        var jsonData = (jsonPayload && isObj(jsonPayload.data)) ? jsonPayload.data : {};
        detailFieldDefs = (jsonPayload && Array.isArray(jsonPayload.fields)) ? jsonPayload.fields : [];
        detailClangs = (jsonPayload && Array.isArray(jsonPayload.clangs)) ? jsonPayload.clangs : [];
        detailSystemTagCatalog = (jsonPayload && Array.isArray(jsonPayload.system_tag_catalog)) ? jsonPayload.system_tag_catalog : [];
        var allSystemTags = (jsonPayload && Array.isArray(jsonPayload.system_tags)) ? jsonPayload.system_tags : [];
        var splitSystem = splitSystemTags(allSystemTags);
        var detailCollectionNames = splitSystem.collections.map(function (t) { return collectionTagToName(t.name); }).filter(Boolean);
        detailOriginalSystemTags = deepClone(splitSystem.normal);
        detailOriginalCollectionSystemTags = deepClone(splitSystem.collections);
        var focuspointFields = getFocuspointFieldDefs();
        var hasFocuspointPreview = info.is_image && focuspointFields.length > 0;
        detailOriginalTitle = String(info.title || '');
        detailOriginalJson = deepClone(jsonData);
        detailLegacyLoaded = false;

        var html = '<div class="mp3-detail-inner">';

        html += '<button class="mp3-detail-close" title="Schließen"><i class="fa-solid fa-xmark"></i></button>';

        if (info.is_image) {
            var src = withMediaCacheBuster('index.php?rex_media_type=rex_media_medium&rex_media_file=' + encodeURIComponent(info.filename), info);
            html += '<div class="mp3-detail-preview' + (hasFocuspointPreview ? ' mp3-detail-preview-has-focuspoint' : '') + '"' + (hasFocuspointPreview ? ' data-focus-active-key="' + escAttr(focuspointFields[0].key) + '"' : '') + '>' +
                '<button type="button" class="mp3-lightbox-open-btn" data-lightbox-src="' + escAttr(src) + '" data-lightbox-caption="' + escAttr(info.title || info.filename) + '" title="Lightbox öffnen"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>' +
                '<img src="' + escAttr(src) + '" alt="' + escAttr(info.title || info.filename) + '">' +
                (hasFocuspointPreview ? renderFocuspointPreviewMarkers(focuspointFields, jsonData) : '') +
            '</div>';
        } else if (isVideo(info.filename)) {
            var vidSrc = withMediaCacheBuster('/media/' + encodeURIComponent(info.filename), info);
            html += '<div class="mp3-detail-preview mp3-detail-preview-video">' +
                '<video controls preload="metadata" playsinline>' +
                '<source src="' + escAttr(vidSrc) + '" type="' + escAttr(info.filetype || 'video/mp4') + '">' +
                '</video>' +
            '</div>';
        } else if (isAudio(info.filename)) {
            var audSrc = withMediaCacheBuster('/media/' + encodeURIComponent(info.filename), info);
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

        html += '<div class="mp3-detail-filename">' + escAttr(info.filename) + '</div>';

        html += '<div class="mp3-edit-section">';
        html += renderInlineTextField('Titel', '__title', info.title || '', 'title');

        html += renderSystemTagsField(detailOriginalSystemTags, detailSystemTagCatalog);

        if (!detailFieldDefs.length) {
            html += '<div class="mp3-metainfo-hint"><i class="fa-solid fa-circle-info"></i> Keine Widget-Felder definiert. Über die Seite "Metainfo Felder" können neue Felder angelegt werden.</div>';
        } else {
            for (var i = 0; i < detailFieldDefs.length; i++) {
                var field = detailFieldDefs[i];
                var value = Object.prototype.hasOwnProperty.call(jsonData, field.key) ? jsonData[field.key] : null;
                html += renderJsonWidgetField(field, value, info);
            }
        }

        html += '<button type="button" class="mp3-detail-save-btn" title="Änderungen speichern">';
        html += '<i class="fa-solid fa-floppy-disk"></i> Speichern</button>';
        html += '</div>';

        html += '<div class="mp3-legacy-section">';
        html += '<button type="button" class="mp3-legacy-toggle-btn"><i class="fa-solid fa-chevron-right"></i> Alte Metadaten laden/anzeigen</button>';
        html += '<div class="mp3-legacy-content" style="display:none"></div>';
        html += '</div>';

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
        html += '<tr><td>Sammlungen</td><td>' + (detailCollectionNames.length ? escAttr(detailCollectionNames.join(', ')) : '–') + '</td></tr>';
        html += '</table>';

        html += '<div class="mp3-detail-actions">';
        if (onSelect || onMultiSelect) {
            html += '<button class="mp3-detail-select-btn" data-filename="' + escAttr(info.filename) + '">' +
                '<i class="fa-solid fa-check"></i> Auswählen</button>';
        }
        
        html += '<label class="mp3-detail-replace-btn" title="Datei ersetzen (Dateiname bleibt gleich)">' +
            '<i class="fa-solid fa-arrows-rotate"></i><input type="file" class="mp3-detail-replace-input" accept="' + escAttr(getReplacementAcceptForFilename(info.filename)) + '" style="display:none"></label>';
        html += '<a class="mp3-detail-download-btn" href="' + escAttr(withMediaCacheBuster(API_BASE + 'media/' + encodeURIComponent(info.filename) + '/file', info)) + '" ' +
            'download="' + escAttr(info.filename) + '" title="Datei herunterladen">' +
            '<i class="fa-solid fa-download"></i></a>';
        html += '<button class="mp3-detail-delete-btn" data-filename="' + escAttr(info.filename) + '" ' +
            'data-in-use="' + (info.is_in_use ? '1' : '0') + '" title="Datei löschen">' +
            '<i class="fa-solid fa-trash-can"></i></button>';
        html += '</div>';

        html += '</div>';
        detailPanel.innerHTML = html;
        if (hasFocuspointPreview) {
            setActiveFocuspointKey(focuspointFields[0].key);
        }
        initDetailTinyEditors(detailPanel);
        updateDetailSaveState();
    }

    // ---- Rendering ----

    /**
     * Build preview HTML for a single media file.
     * Uses the REDAXO Media Manager URL (same as MediaNeo) for thumbnails.
     */
    function previewHtml(file) {
        if (isImage(file.filename)) {
            // Use Media Manager for thumbnail – same URL pattern as MediaNeo
            var src = withMediaCacheBuster('index.php?rex_media_type=rex_media_small&rex_media_file=' +
                encodeURIComponent(file.filename), file);
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
        } else if (viewMode === 'masonry') {
            renderFilesMasonry(files);
        } else {
            renderFilesGrid(files);
        }
        updateStatus(files.length);
    }

    function renderFilesGrid(files) {
        var html = '';
        var activeCollection = getActiveCollection();
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var isMultiSel = multiMode && multiSelected[f.filename];
            var inCollection = activeCollection ? isFileInActiveCollection(f.filename) : false;
            var displayName = f.title || f.filename;
            html += '<div class="mp3-card' + (isMultiSel ? ' mp3-card-multi-selected' : '') + '" draggable="true" data-filename="' + escAttr(f.filename) + '">' +
                (multiMode ? '<div class="mp3-card-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></div>' : '') +
                (activeCollection ? '<button type="button" class="mp3-collection-toggle-btn' + (inCollection ? ' is-active' : '') + '" data-toggle-collection-file="' + escAttr(f.filename) + '" title="' + (inCollection ? 'Aus Sammlung entfernen' : 'Zur Sammlung hinzufügen') + '"><i class="fa-solid fa-bookmark"></i></button>' : '') +
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
        var activeCollection = getActiveCollection();
        var html = '<table class="mp3-list-table">';
        html += '<thead><tr>' +
            (multiMode ? '<th class="mp3-list-th-check"></th>' : '') +
            '<th class="mp3-list-th-preview"></th>' +
            '<th>Name</th>' +
            (activeCollection ? '<th class="mp3-list-th-collection" title="Sammlung">★</th>' : '') +
            '<th>Typ</th>' +
            '<th>Größe</th>' +
            '<th>Datum</th>' +
        '</tr></thead><tbody>';
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var sel = (selectedFile === f.filename) ? ' mp3-list-row-selected' : '';
            var isMultiSel = multiMode && multiSelected[f.filename];
            if (isMultiSel) sel += ' mp3-list-row-multi-selected';
            html += '<tr class="mp3-list-row' + sel + '" data-filename="' + escAttr(f.filename) + '" draggable="true">';
            if (multiMode) {
                html += '<td class="mp3-list-cell-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></td>';
            }
            html += '<td class="mp3-list-cell-preview">';
            if (isImage(f.filename)) {
                var src = withMediaCacheBuster('index.php?rex_media_type=rex_media_small&rex_media_file=' + encodeURIComponent(f.filename), f);
                html += '<img src="' + escAttr(src) + '" alt="">';
            } else {
                html += '<i class="' + fileIcon(f.filename) + '"></i>';
            }
            html += '</td>';
            var listLabel = f.title ? escAttr(f.title) : escAttr(f.filename);
            var listTooltip = f.title ? escAttr(f.filename) : '';
            html += '<td class="mp3-list-cell-name"' + (listTooltip ? ' title="' + listTooltip + '"' : '') + '>' + listLabel + '</td>';
            if (activeCollection) {
                var rowInCollection = isFileInActiveCollection(f.filename);
                html += '<td class="mp3-list-cell-collection">' +
                    '<button type="button" class="mp3-collection-toggle-btn' + (rowInCollection ? ' is-active' : '') + '" data-toggle-collection-file="' + escAttr(f.filename) + '" title="' + (rowInCollection ? 'Aus Sammlung entfernen' : 'Zur Sammlung hinzufügen') + '"><i class="fa-solid fa-bookmark"></i></button>' +
                    '</td>';
            }
            html += '<td class="mp3-list-cell-type">' + escAttr(f.filetype || '') + '</td>';
            html += '<td class="mp3-list-cell-size">' + formatBytes(f.filesize) + '</td>';
            html += '<td class="mp3-list-cell-date">' + formatDate(f.createdate) + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        grid.className = 'mp3-grid mp3-view-list';
        grid.innerHTML = html;
    }

    function renderFilesMasonry(files) {
        var activeCollection = getActiveCollection();
        var html = '';
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var isSel = (selectedFile === f.filename);
            var isMultiSel = multiMode && multiSelected[f.filename];
            var inCollection = activeCollection ? isFileInActiveCollection(f.filename) : false;
            var displayName = f.title || f.filename;

            // Compute aspect ratio class for visual variety
            var aspectClass = 'mp3-masonry-card-square';
            if (f.width && f.height && f.width > 0 && f.height > 0) {
                var ratio = f.width / f.height;
                if (ratio > 1.6) aspectClass = 'mp3-masonry-card-wide';
                else if (ratio < 0.75) aspectClass = 'mp3-masonry-card-tall';
            }

            html += '<div class="mp3-masonry-card ' + aspectClass +
                (isSel ? ' mp3-masonry-card-selected' : '') +
                (isMultiSel ? ' mp3-masonry-card-multi' : '') +
                '" data-filename="' + escAttr(f.filename) + '" draggable="true">';

            // Overlay toolbar
            html += '<div class="mp3-masonry-toolbar">';
            if (multiMode) {
                html += '<span class="mp3-masonry-check"><i class="fa-solid ' + (isMultiSel ? 'fa-square-check' : 'fa-square') + '"></i></span>';
            }
            if (activeCollection) {
                html += '<button type="button" class="mp3-collection-toggle-btn' + (inCollection ? ' is-active' : '') + '" data-toggle-collection-file="' + escAttr(f.filename) + '" title="' + (inCollection ? 'Aus Sammlung entfernen' : 'Zur Sammlung hinzufügen') + '"><i class="fa-solid fa-bookmark"></i></button>';
            }
            html += '</div>';

            // Media
            html += '<div class="mp3-masonry-media">' + previewHtml(f) + '</div>';

            // Footer
            html += '<div class="mp3-masonry-footer">' +
                '<span class="mp3-masonry-name" title="' + escAttr(f.filename) + '">' + escAttr(displayName) + '</span>' +
                '<span class="mp3-masonry-meta">' + formatBytes(f.filesize) + '</span>' +
                '</div>';

            html += '</div>';
        }
        grid.className = 'mp3-grid mp3-view-masonry';
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
        html += renderCollectionsSection();
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
            html += '<button class="mp3-cat-rename-btn" data-rename-cat="' + id + '" title="Kategorie umbenennen">' +
                '<i class="fa-solid fa-pen"></i></button>';
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
            var txt = count + ' Treffer';
            if (mediaTotal > 0) {
                txt += ' | ' + lastLoadedFiles.length + ' von ' + mediaTotal + ' geladen';
            }
            statusBar.textContent = txt;
        }
        updateHeaderInfo(count);
    }

    function buildMediaEndpoint() {
        var endpoint = 'media?per_page=' + mediaPerPage + '&page=' + mediaPage;
        // catId -1 = alle Medien (kein Kategorie-Filter)
        if (currentCat >= 0) {
            endpoint += '&filter[category_id]=' + currentCat;
        }
        if (mediaQuery) {
            endpoint += '&filter[title]=' + encodeURIComponent(mediaQuery);
        }
        return endpoint;
    }

    function updatePaginationUi(filteredCount) {
        if (!overlay) return;
        var footer = qs('.mp3-page-footer', overlay);
        if (!footer) return;
        var btn = qs('.mp3-load-more-btn', footer);
        var info = qs('.mp3-page-info', footer);
        if (!btn || !info) return;

        var loaded = lastLoadedFiles.length;
        var total = mediaTotal || loaded;
        if (mediaLoading) {
            info.textContent = 'Lade weitere Medien...';
            btn.style.display = 'none';
            return;
        }

        info.textContent = filteredCount + ' sichtbar | ' + loaded + ' / ' + total + ' geladen';
        btn.style.display = mediaHasMore ? '' : 'none';
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
        var activeCol = getActiveCollection();
        if (activeCol) {
            parts.push('<i class="fa-solid fa-compact-disc mp3-hi-icon"></i> ' + escAttr(activeCol.name));
        }
        if (typeof count === 'number') {
            parts.push('<i class="fa-solid fa-images mp3-hi-icon"></i> ' + count);
        }

        el.innerHTML = parts.join('<span class="mp3-hi-sep">|</span>');
    }

    // ---- Data Loading ----
    function loadFiles(catId, reset) {
        currentCat = catId;

        if (reset) {
            mediaPage = 1;
            mediaHasMore = true;
            mediaTotal = 0;
            lastLoadedFiles = [];
            currentTagCatalog = [];
            if (grid) {
                grid.innerHTML = '<div style="padding:40px;text-align:center;">' +
                    '<i class="fa-solid fa-spinner fa-spin" style="font-size:2em;color:#3c4d60;"></i></div>';
            }
        }

        if (!mediaHasMore || mediaLoading) {
            updatePaginationUi(0);
            return;
        }

        mediaLoading = true;

        var endpoint = buildMediaEndpoint();

        apiFetchRaw(endpoint)
            .then(function (payload) {
                var files = (payload && Array.isArray(payload.data)) ? payload.data : [];
                var meta = (payload && payload.meta) ? payload.meta : {};
                mediaTotal = parseInt(meta.total, 10) || 0;
                var page = parseInt(meta.page, 10) || mediaPage;
                var totalPages = parseInt(meta.total_pages, 10) || page;
                mediaHasMore = page < totalPages;
                mediaPage = page + 1;

                var taggedFiles = files.slice();
                var filenames = taggedFiles.map(function (f) { return f.filename; }).filter(Boolean);

                return apiLoadSystemTagsForFiles(filenames)
                    .then(function (tagsPayload) {
                        var fileTags = tagsPayload.file_tags || {};
                        currentTagCatalog = Array.isArray(tagsPayload.catalog) ? tagsPayload.catalog : currentTagCatalog;

                        for (var i = 0; i < taggedFiles.length; i++) {
                            var fn = String(taggedFiles[i].filename || '');
                            taggedFiles[i].system_tags = Array.isArray(fileTags[fn]) ? fileTags[fn] : [];
                        }

                        if (reset) {
                            lastLoadedFiles = taggedFiles;
                        } else {
                            lastLoadedFiles = lastLoadedFiles.concat(taggedFiles);
                        }
                    })
                    .catch(function () {
                        for (var i = 0; i < taggedFiles.length; i++) {
                            taggedFiles[i].system_tags = [];
                        }
                        if (reset) {
                            lastLoadedFiles = taggedFiles;
                        } else {
                            lastLoadedFiles = lastLoadedFiles.concat(taggedFiles);
                        }
                    });
            })
            .then(function () {
                updateTagFilterOptions();
                // Re-render sidebar after catalog/tag data is available,
                // so collections are visible on initial open.
                rerenderSidebar();
                refreshDisplay();
            })
            .catch(function (err) {
                if (reset) {
                    lastLoadedFiles = [];
                    currentTagCatalog = [];
                    updateTagFilterOptions();
                    grid.innerHTML = '<div style="padding:40px;text-align:center;color:#c9302c;">' +
                        '<i class="fa-solid fa-triangle-exclamation"></i> API-Fehler: ' + escAttr(err.message) +
                        '<br><small style="color:#6c757d;">Ist das API-Addon installiert und aktiviert?</small></div>';
                }
                console.error('MP3 loadFiles error:', err);
            })
            .then(function () {
                mediaLoading = false;
                var visibleCount = applyFilterSort(lastLoadedFiles).length;
                var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
                if (q) {
                    visibleCount = applyFilterSort(lastLoadedFiles).filter(function (f) {
                        var filename = String(f.filename || '').toLowerCase();
                        var title = String(f.title || '').toLowerCase();
                        return filename.indexOf(q) !== -1 || title.indexOf(q) !== -1;
                    }).length;
                }
                updatePaginationUi(visibleCount);
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

        // In collection mode: ask which category to upload to, then assign to collection
        if (currentCat === -1) {
            var col = getActiveCollection();
            showCollectionUploadCategoryPicker(files, col);
            return;
        }

        startUpload(files, currentCat, null);
    }

    function showCollectionUploadCategoryPicker(files, collection) {
        // Build flat category list from cache
        var options = '<option value="0">(Stamm / kein Kategorie)</option>';
        var rootCats = Array.isArray(catCache._root) ? catCache._root : [];
        function addOptions(list, depth) {
            for (var i = 0; i < list.length; i++) {
                var c = list[i];
                options += '<option value="' + escAttr(String(c.id)) + '">' + '\u00A0\u00A0\u00A0\u00A0'.repeat(depth) + escAttr(c.name) + '</option>';
                var cached = catCache[c.id];
                if (cached && cached.loaded && Array.isArray(cached.children)) {
                    addOptions(cached.children, depth + 1);
                }
            }
        }
        addOptions(rootCats, 0);

        var colName = collection ? collection.name : '';
        var modal = document.createElement('div');
        modal.className = 'mp3-catpick-modal';
        modal.innerHTML =
            '<div class="mp3-catpick-box">' +
            '<div class="mp3-catpick-title"><i class="fa-solid fa-folder-open"></i> Kategorie für Upload wählen</div>' +
            '<p class="mp3-catpick-info">Im Sammlungs-Modus muss eine Kategorie gewählt werden. Die Dateien werden danach automatisch der Sammlung <strong>' + escAttr(colName) + '</strong> zugeordnet.</p>' +
            '<select class="mp3-catpick-select">' + options + '</select>' +
            '<div class="mp3-catpick-actions">' +
            '<button type="button" class="mp3-catpick-cancel">Abbrechen</button>' +
            '<button type="button" class="mp3-catpick-confirm">Hochladen</button>' +
            '</div>' +
            '</div>';

        overlay.appendChild(modal);

        modal.querySelector('.mp3-catpick-cancel').addEventListener('click', function () {
            modal.remove();
        });

        modal.querySelector('.mp3-catpick-confirm').addEventListener('click', function () {
            var catId = parseInt(modal.querySelector('.mp3-catpick-select').value || '0', 10);
            modal.remove();
            startUpload(files, catId, collection ? collection.name : null);
        });
    }

    function startUpload(files, catId, assignToCollectionName) {

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

        var total = files.length;
        var done = 0;
        var failed = 0;
        var uploadedFilenames = []; // track successfully uploaded filenames for collection assignment

        // Upload one at a time sequentially
        function uploadNext(idx) {
            if (idx >= files.length) {
                // All done — optionally assign to collection
                var finalize = function () {
                    var summaryEl = document.getElementById('mp3-upload-summary');
                    if (summaryEl) {
                        var msg = done + ' von ' + total + ' erfolgreich';
                        if (failed > 0) msg += ', ' + failed + ' fehlgeschlagen';
                        if (assignToCollectionName && uploadedFilenames.length) {
                            msg += ' – werden Sammlung "' + escAttr(assignToCollectionName) + '" zugeordnet…';
                        }
                        summaryEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#28a745;"></i> ' + msg;
                    }
                    setTimeout(function () { loadFiles(currentCat, true); }, 1500);
                };

                if (assignToCollectionName && uploadedFilenames.length) {
                    var assigns = uploadedFilenames.map(function (fn) {
                        return setFileCollectionMembership(fn, assignToCollectionName, true);
                    });
                    Promise.all(assigns).then(finalize).catch(finalize);
                } else {
                    finalize();
                }
                return;
            }

            var itemEl = document.getElementById('mp3-upl-' + idx);
            if (itemEl) {
                var statusEl = itemEl.querySelector('.mp3-upload-item-status');
                statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mp3-upload-spinning"></i>';
                itemEl.classList.add('mp3-upload-active');
            }

            var uploadFile = files[idx];
            apiUpload(uploadFile, catId)
                .then(function (resp) {
                    done++;
                    // API returns { filename: '...' } — use that (server may rename)
                    var resultName = (resp && resp.filename) ? resp.filename : uploadFile.name;
                    uploadedFilenames.push(resultName);
                    if (itemEl) {
                        var st = itemEl.querySelector('.mp3-upload-item-status');
                        st.innerHTML = '<i class="fa-solid fa-circle-check mp3-upload-ok"></i>';
                        itemEl.classList.remove('mp3-upload-active');
                        itemEl.classList.add('mp3-upload-done');
                    }
                })
                .catch(function (err) {
                    failed++;
                    console.error('MP3 upload failed:', uploadFile.name, err);
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

    // ---- Clipboard Paste Upload ----
    function readClipboardAndUpload() {
        if (!navigator.clipboard || !navigator.clipboard.read) return;
        navigator.clipboard.read().then(function (items) {
            var files = [];
            var promises = [];
            items.forEach(function (item) {
                item.types.forEach(function (type) {
                    if (type.indexOf('image/') === 0 || type === 'application/octet-stream') {
                        promises.push(
                            item.getType(type).then(function (blob) {
                                var ext = type.split('/')[1] || 'bin';
                                ext = ext.replace('jpeg', 'jpg').replace('svg+xml', 'svg');
                                var name = 'paste-' + Date.now() + '.' + ext;
                                files.push(new File([blob], name, { type: type }));
                            })
                        );
                    }
                });
            });
            Promise.all(promises).then(function () {
                if (!files.length) return;
                if (gridWrap) {
                    gridWrap.classList.add('mp3-pasteover');
                    setTimeout(function () { gridWrap.classList.remove('mp3-pasteover'); }, 300);
                }
                doUpload(files);
            });
        }).catch(function () {
            // Permission denied or clipboard empty – silently ignore
        });
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
                                '<button class="mp3-view-btn" data-view="masonry" title="Masonry"><i class="fa-solid fa-table-cells-large"></i></button>' +
                            '</div>' +
                            '<label class="mp3-upload-btn" title="Dateien hochladen">' +
                                '<i class="fa-solid fa-cloud-arrow-up"></i>' +
                                '<span class="mp3-upload-label">Hochladen</span>' +
                                '<input type="file" multiple style="display:none">' +
                            '</label>' +
                        '</div>' +
                        '<button type="button" class="mp3-dark-mode-toggle" title="Dark Mode"><i class="fa-solid fa-moon"></i></button>' +
                        '<button type="button" class="mp3-fullscreen-toggle" title="Vollbild"><i class="fa-solid fa-expand"></i></button>' +
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
                                '<div class="mp3-tag-filter-wrap">' +
                                    '<button type="button" class="mp3-tag-filter-toggle" title="Nach Tags filtern">' +
                                        '<span class="mp3-tag-filter-label">Alle Tags</span>' +
                                        '<i class="fa-solid fa-chevron-down"></i>' +
                                    '</button>' +
                                    '<div class="mp3-tag-filter-menu"></div>' +
                                '</div>' +
                            '</div>' +
                            '<div class="mp3-breadcrumb" id="mp3-breadcrumb"></div>' +
                            '<div class="mp3-status" id="mp3-status"></div>' +
                            '<div class="mp3-grid-wrap" id="mp3-grid-wrap">' +
                                '<div class="mp3-grid" id="mp3-grid"></div>' +
                            '</div>' +
                            '<div class="mp3-page-footer">' +
                                '<div class="mp3-page-size">' +
                                    '<label for="mp3-per-page-select">Pro Seite</label>' +
                                    '<select id="mp3-per-page-select" class="mp3-per-page-select">' +
                                        '<option value="30">30</option>' +
                                        '<option value="50">50</option>' +
                                        '<option value="100">100</option>' +
                                        '<option value="250">250</option>' +
                                    '</select>' +
                                '</div>' +
                                '<button type="button" class="mp3-load-more-btn" style="display:none"><i class="fa-solid fa-angles-down"></i> Mehr laden</button>' +
                                '<span class="mp3-page-info"></span>' +
                            '</div>' +
                            '<div class="mp3-editor-canvas" id="mp3-editor-canvas" style="display:none">' +
                                '<div class="mp3-editor-canvas-header">' +
                                    '<button type="button" class="mp3-editor-canvas-back" title="Zurück zur Übersicht">' +
                                        '<i class="fa-solid fa-arrow-left"></i> Zurück' +
                                    '</button>' +
                                    '<div class="mp3-editor-canvas-title"></div>' +
                                    '<button type="button" class="mp3-editor-canvas-save">' +
                                        '<i class="fa-solid fa-floppy-disk"></i> Speichern' +
                                    '</button>' +
                                '</div>' +
                                '<div class="mp3-editor-canvas-body">' +
                                    '<textarea id="mp3-editor-canvas-textarea" class="mp3-editor-canvas-textarea"></textarea>' +
                                '</div>' +
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
                '<div class="mp3-lightbox" id="mp3-lightbox">' +
                    '<button type="button" class="mp3-lightbox-close" title="Schließen"><i class="fa-solid fa-xmark"></i></button>' +
                    '<img class="mp3-lightbox-image" alt="">' +
                    '<div class="mp3-lightbox-caption"></div>' +
                '</div>' +
            '</div>';

        overlay   = qs('#mp3-overlay');
        overlay.setAttribute('tabindex', '-1');
        sidebar   = qs('#mp3-sidebar');
        grid      = qs('#mp3-grid');
        gridWrap  = qs('#mp3-grid-wrap');
        searchInput = qs('.mp3-search', overlay);
        statusBar = qs('#mp3-status');
        breadcrumb = qs('#mp3-breadcrumb');
        detailPanel = qs('#mp3-detail');
        multiFooter = qs('#mp3-multi-footer');
        lightboxLayer = qs('#mp3-lightbox');
        lightboxImage = qs('.mp3-lightbox-image', overlay);
        lightboxCaption = qs('.mp3-lightbox-caption', overlay);

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
                if (isMobile() || overlay.classList.contains('mp3-fullscreen-mode')) return;
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
                if (isMobile() || overlay.classList.contains('mp3-fullscreen-mode')) return;
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

        // Dark Mode Toggle
        // setDarkMode is defined globally and called from button click handlers

        var darkToggleBtn = qs('.mp3-dark-mode-toggle', overlay);
        if (darkToggleBtn) {
            darkToggleBtn.addEventListener('click', function () {
                setDarkMode(!darkModeEnabled);
            });
        }

        // Click backdrop to close (but not after drag/resize)
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay && !interacting) close();
        });

        // ESC to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('mp3-open')) {
                if (lightboxOpen) {
                    closeLightbox();
                    return;
                }
                close();
                return;
            }

            if ((e.key === 'f' || e.key === 'F') && overlay.classList.contains('mp3-open')) {
                var active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
                    return;
                }
                e.preventDefault();
                setFullscreenMode(!fullscreenMode);
            }

        });

        // Add category button (event delegation)
        sidebar.addEventListener('click', function (e) {
            var collectionAddBtn = e.target.closest('.mp3-collection-add-btn');
            if (collectionAddBtn) {
                e.preventDefault();
                e.stopPropagation();
                var collectionName = prompt('Name der Sammlung:');
                if (null === collectionName) return;
                createCollection(currentCat, collectionName)
                    .then(function (created) {
                        if (!created) {
                            alert('Sammlung konnte nicht erstellt werden (Name leer oder bereits vorhanden).');
                            return;
                        }
                        setActiveCollection(created.id);
                        rerenderSidebar();
                        refreshDisplay();
                        alert('Sammlung aktiviert. Klicke auf das Lesezeichen am Medium oder im Detailpanel.');
                    })
                    .catch(function (err) {
                        alert('Fehler beim Erstellen der Sammlung: ' + err.message);
                    });
                return;
            }

            var collectionRenameBtn = e.target.closest('.mp3-collection-rename-btn');
            if (collectionRenameBtn) {
                e.preventDefault();
                e.stopPropagation();
                var renameCollectionId = String(collectionRenameBtn.getAttribute('data-collection-id') || '');
                if (!renameCollectionId) return;
                var collectionList = getCollectionsForCurrentCategory();
                var currentCollectionName = '';
                for (var ci = 0; ci < collectionList.length; ci++) {
                    if (String(collectionList[ci].id) === renameCollectionId) {
                        currentCollectionName = String(collectionList[ci].name || '');
                        break;
                    }
                }
                var nextCollectionName = prompt('Neuer Name der Sammlung:', currentCollectionName);
                if (null === nextCollectionName) return;
                renameCollection(currentCat, renameCollectionId, nextCollectionName)
                    .then(function (updatedCount) {
                        if (updatedCount <= 0) {
                            alert('Sammlung umbenannt. Es waren aktuell keine Dateien zugeordnet.');
                            return;
                        }
                        rerenderSidebar();
                        refreshDisplay();
                        if (selectedFile) showDetail(selectedFile);
                    })
                    .catch(function (err) {
                        alert('Fehler beim Umbenennen der Sammlung: ' + err.message);
                    });
                return;
            }

            var collectionDeleteBtn = e.target.closest('.mp3-collection-delete-btn');
            if (collectionDeleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                var deleteCollectionId = String(collectionDeleteBtn.getAttribute('data-collection-id') || '');
                if (!deleteCollectionId) return;
                if (!confirm('Sammlung wirklich löschen?')) return;
                deleteCollection(currentCat, deleteCollectionId)
                    .then(function (updatedCount) {
                        rerenderSidebar();
                        refreshDisplay();
                        if (selectedFile) showDetail(selectedFile);
                        if (updatedCount <= 0) {
                            alert('Sammlung gelöscht. Es waren aktuell keine Dateien zugeordnet.');
                        }
                    })
                    .catch(function (err) {
                        alert('Fehler beim Löschen der Sammlung: ' + err.message);
                    });
                return;
            }

            var addBtn = e.target.closest('.mp3-cat-add-btn');
            if (addBtn) {
                e.preventDefault();
                e.stopPropagation();
                var parentId = parseInt(addBtn.getAttribute('data-add-parent'), 10) || 0;
                showCategoryInput(parentId);
                return;
            }

            var renameBtn = e.target.closest('.mp3-cat-rename-btn');
            if (renameBtn) {
                e.preventDefault();
                e.stopPropagation();
                var renameId = parseInt(renameBtn.getAttribute('data-rename-cat'), 10) || 0;
                if (renameId <= 0 || !catCache[renameId]) return;
                var currentName = String(catCache[renameId].name || '');
                var nextName = prompt('Neuer Kategoriename:', currentName);
                if (null === nextName) return;
                nextName = String(nextName || '').trim();
                if (!nextName || nextName === currentName) return;

                apiRenameCategory(renameId, nextName)
                    .then(function () {
                        catCache[renameId].name = nextName;
                        buildBreadcrumb(currentCat);
                        rerenderSidebar();
                    })
                    .catch(function (err) {
                        alert('Fehler beim Umbenennen: ' + err.message);
                    });
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

            var collection = e.target.closest('.mp3-collection');
            if (collection) {
                e.stopPropagation();
                var collectionId = String(collection.getAttribute('data-collection-id') || '');
                if (!collectionId) return;
                // Toggle: Sammlung XOR Kategorie. Wenn Sammlung aktiv, verlasse Kategorie-Modus
                if (String(activeCollectionId) === collectionId) {
                    setActiveCollection(null);
                } else {
                    setActiveCollection(collectionId);
                }
                // Reset category to -1 (show all) when entering collection mode
                currentCat = activeCollectionId ? -1 : 0;
                localStorage.setItem('mp3_cat', String(currentCat));
                buildBreadcrumb(currentCat);
                rerenderSidebar();
                loadFiles(currentCat, true);
                return;
            }

            // Toggle arrow click: expand/collapse subcategories
            var toggleIcon = e.target.closest('.mp3-cat-toggle');
            if (toggleIcon) {
                e.stopPropagation();
                var toggleId = parseInt(toggleIcon.getAttribute('data-toggle-cat'), 10);
                toggleCategory(toggleId);
                return;
            }

            // Category name click: navigate to that category (exit collection mode)
            var cat = e.target.closest('.mp3-cat');
            if (!cat) return;
            var catId = parseInt(cat.getAttribute('data-cat'), 10);
            currentCat = catId;
            localStorage.setItem('mp3_cat', catId);
            // Exit collection mode when clicking a category
            setActiveCollection(null);

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
            loadFiles(catId, true);
        });

        // Drag & Drop media -> collection
        sidebar.addEventListener('dragover', function (e) {
            var collectionRow = e.target.closest('.mp3-collection-row');
            if (!collectionRow) return;
            e.preventDefault();
            collectionRow.classList.add('mp3-collection-drop-target');
        });

        sidebar.addEventListener('dragleave', function (e) {
            var collectionRow = e.target.closest('.mp3-collection-row');
            if (!collectionRow) return;
            if (collectionRow.contains(e.relatedTarget)) return;
            collectionRow.classList.remove('mp3-collection-drop-target');
        });

        sidebar.addEventListener('drop', function (e) {
            var collectionRow = e.target.closest('.mp3-collection-row');
            if (!collectionRow) return;
            e.preventDefault();
            collectionRow.classList.remove('mp3-collection-drop-target');

            var collection = collectionRow.querySelector('.mp3-collection[data-collection-id]');
            if (!collection) return;
            var collectionId = String(collection.getAttribute('data-collection-id') || '');
            if (!collectionId) return;

            var dt = e.dataTransfer;
            var filenames = [];
            if (dt) {
                var multi = String(dt.getData('text/mp3-filenames') || '').trim();
                if (multi) {
                    filenames = multi.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                } else {
                    var single = String(dt.getData('text/mp3-filename') || dt.getData('text/plain') || '').trim();
                    if (single) filenames = [single];
                }
            }
            if (!filenames.length) return;

            var promises = filenames.map(function (fn) {
                return setFileCollectionMembership(fn, collectionId, true);
            });
            Promise.all(promises)
                .then(function () {
                    if (!multiMode) {
                        clearCollectionDragSelection();
                    }
                    setActiveCollection(collectionId);
                    rerenderSidebar();
                    refreshDisplay();
                    if (selectedFile && filenames.indexOf(selectedFile) !== -1) showDetail(selectedFile);
                })
                .catch(function (err) {
                    alert('Fehler beim Zuordnen zur Sammlung: ' + err.message);
                });
        });

        // Breadcrumb clicks (event delegation)
        breadcrumb.addEventListener('click', function (e) {
            var item = e.target.closest('.mp3-bc-item');
            if (!item) return;
            e.preventDefault();
            var catId = parseInt(item.getAttribute('data-cat'), 10);
            currentCat = catId;
            localStorage.setItem('mp3_cat', catId);
            buildBreadcrumb(catId);
            rerenderSidebar();
            loadFiles(catId, true);
        });

        // Card/row clicks (event delegation) — show detail panel or toggle multi-select
        grid.addEventListener('click', function (e) {
            var quickCollectionBtn = e.target.closest('.mp3-collection-toggle-btn');
            if (quickCollectionBtn) {
                var quickFilename = quickCollectionBtn.getAttribute('data-toggle-collection-file');
                if (!quickFilename || !getActiveCollection()) return;

                quickCollectionBtn.disabled = true;
                toggleFileInActiveCollection(quickFilename)
                    .then(function () {
                        rerenderSidebar();
                        refreshDisplay();
                        if (selectedFile === quickFilename) {
                            showDetail(quickFilename);
                        }
                    })
                    .catch(function (err) {
                        alert('Fehler beim Aktualisieren der Sammlung: ' + err.message);
                    })
                    .then(function () {
                        quickCollectionBtn.disabled = false;
                    });
                return;
            }

            var card = e.target.closest('.mp3-card') || e.target.closest('.mp3-list-row') || e.target.closest('.mp3-masonry-card');
            if (!card) return;
            var filename = card.getAttribute('data-filename');
            if (!filename) return;

            if (mediaLinkPickFieldKey && detailPanel) {
                var targetInput = detailPanel.querySelector('[data-json-field="' + mediaLinkPickFieldKey + '"]');
                if (targetInput) {
                    targetInput.value = filename;
                    repaintMediaLinkWidget(targetInput.closest('.mp3-media-link-widget'));
                    setMediaLinkPickMode(null);
                    updateDetailSaveState();
                    return;
                }
                setMediaLinkPickMode(null);
            }

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

            // Normal mode: Cmd/Ctrl+click toggles batch selection for collection drag
            if (e.metaKey || e.ctrlKey) {
                toggleCollectionDragSelection(filename);
                return;
            }

            showDetail(filename);
        });

        grid.addEventListener('dragstart', function (e) {
            var item = e.target.closest('.mp3-card') || e.target.closest('.mp3-list-row') || e.target.closest('.mp3-masonry-card');
            if (!item) return;
            var filename = String(item.getAttribute('data-filename') || '');
            if (!filename || !e.dataTransfer) return;
            // Carry selected files if dragged card is part of selection.
            var selectedMap = multiMode ? multiSelected : collectionDragSelected;
            var dragFiles = (Object.keys(selectedMap).length > 0 && selectedMap[filename])
                ? Object.keys(selectedMap)
                : [filename];
            e.dataTransfer.setData('text/mp3-filenames', dragFiles.join(','));
            e.dataTransfer.setData('text/mp3-filename', filename);
            e.dataTransfer.setData('text/plain', filename);
            e.dataTransfer.effectAllowed = 'copy';

            // Create a small drag image so the card doesn't obscure the sidebar drop targets
            var thumb = item.querySelector('img');
            var ghost = document.createElement('div');
            ghost.style.cssText = 'position:fixed;top:-200px;left:-200px;width:64px;height:64px;border-radius:6px;overflow:hidden;background:#222;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;';
            if (thumb && thumb.src) {
                var img = document.createElement('img');
                img.src = thumb.src;
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                ghost.appendChild(img);
            } else {
                ghost.style.fontSize = '24px';
                ghost.textContent = '\uD83D\uDCC4';
            }
            // Badge for multi-file drag
            if (dragFiles.length > 1) {
                var badge = document.createElement('div');
                badge.textContent = dragFiles.length;
                badge.style.cssText = 'position:absolute;bottom:2px;right:2px;background:#e44;color:#fff;font-size:11px;font-weight:700;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;line-height:1;';
                ghost.style.position = 'relative';
                ghost.appendChild(badge);
            }
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 32, 32);
            setTimeout(function () { ghost.remove(); }, 0);

            item.classList.add('mp3-card-dragging');
        });

        grid.addEventListener('dragend', function (e) {
            var item = e.target.closest('.mp3-card') || e.target.closest('.mp3-list-row') || e.target.closest('.mp3-masonry-card');
            if (item) item.classList.remove('mp3-card-dragging');
        });

        // Detail panel events (event delegation)
        overlay.addEventListener('click', function (e) {
            var fsBtn = e.target.closest('.mp3-fullscreen-toggle');
            if (fsBtn) {
                setFullscreenMode(!fullscreenMode);
                return;
            }

            var openLbBtn = e.target.closest('.mp3-lightbox-open-btn');
            if (openLbBtn) {
                openLightbox(
                    openLbBtn.getAttribute('data-lightbox-src') || '',
                    openLbBtn.getAttribute('data-lightbox-caption') || ''
                );
                return;
            }

            var closeLbBtn = e.target.closest('.mp3-lightbox-close');
            if (closeLbBtn) {
                closeLightbox();
                return;
            }

            if (e.target.classList && e.target.classList.contains('mp3-lightbox')) {
                closeLightbox();
                return;
            }

            var selAllBtn = e.target.closest('.mp3-multi-select-all');
            if (selAllBtn) {
                toggleSelectAll();
                return;
            }

            var confirmBtn = e.target.closest('.mp3-multi-confirm');
            if (confirmBtn) {
                if (onMultiSelect) onMultiSelect(Object.keys(multiSelected));
                close();
                return;
            }

            var selectBtn = e.target.closest('.mp3-detail-select-btn');
            if (selectBtn) {
                var fn = selectBtn.getAttribute('data-filename');
                if (multiMode) {
                    if (multiSelected[fn]) delete multiSelected[fn];
                    else multiSelected[fn] = true;
                    updateMultiUI();
                    hideDetail();
                } else if (onSelect && fn) {
                    onSelect(fn);
                    close();
                }
                return;
            }

            var deleteBtn = e.target.closest('.mp3-detail-delete-btn');
            if (deleteBtn) {
                var delFilename = deleteBtn.getAttribute('data-filename');
                var inUse = deleteBtn.getAttribute('data-in-use') === '1';
                if (inUse) {
                    alert('Diese Datei wird noch verwendet und kann nicht gelöscht werden.');
                    return;
                }
                if (!confirm('Datei "' + delFilename + '" wirklich löschen?')) return;
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                apiDelete(delFilename)
                    .then(function () {
                        lastLoadedFiles = lastLoadedFiles.filter(function (f) { return f.filename !== delFilename; });
                        delete multiSelected[delFilename];
                        delete collectionDragSelected[delFilename];
                        hideDetail();
                        refreshDisplay();
                        if (multiMode) updateMultiUI();
                        else updateCollectionDragSelectionUI();
                    })
                    .catch(function (err) {
                        alert('Fehler beim Löschen: ' + err.message);
                        deleteBtn.disabled = false;
                        deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                    });
                return;
            }

            var collectionBtn = e.target.closest('.mp3-detail-collection-btn');
            if (collectionBtn) {
                var collectionFilename = collectionBtn.getAttribute('data-filename');
                if (!collectionFilename || !getActiveCollection()) return;
                collectionBtn.disabled = true;
                toggleFileInActiveCollection(collectionFilename)
                    .then(function () {
                        rerenderSidebar();
                        refreshDisplay();
                        showDetail(collectionFilename);
                    })
                    .catch(function (err) {
                        alert('Fehler beim Aktualisieren der Sammlung: ' + err.message);
                    })
                    .then(function () {
                        collectionBtn.disabled = false;
                    });
                return;
            }

            var loadMoreBtn = e.target.closest('.mp3-load-more-btn');
            if (loadMoreBtn) {
                loadFiles(currentCat, false);
                return;
            }

            var closeBtn = e.target.closest('.mp3-detail-close');
            if (closeBtn) {
                hideDetail();
                return;
            }

            var inlineToggle = e.target.closest('.mp3-edit-display[data-inline-toggle]');
            if (inlineToggle) {
                var inlineField = inlineToggle.closest('.mp3-edit-field');
                if (inlineField) toggleInlineEdit(inlineField, true);
                return;
            }

            var saveBtn = e.target.closest('.mp3-detail-save-btn');
            if (saveBtn) {
                saveDetail();
                return;
            }

            var fieldSaveBtn = e.target.closest('.mp3-field-save-btn');
            if (fieldSaveBtn) {
                saveDetail();
                return;
            }

            var legacyToggleBtn = e.target.closest('.mp3-legacy-toggle-btn');
            if (legacyToggleBtn && selectedFile) {
                var legacyContent = detailPanel.querySelector('.mp3-legacy-content');
                if (!legacyContent) return;
                var isOpen = legacyContent.style.display !== 'none';
                if (isOpen) {
                    legacyContent.style.display = 'none';
                    legacyToggleBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i> Alte Metadaten laden/anzeigen';
                    return;
                }

                legacyContent.style.display = '';
                legacyToggleBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Alte Metadaten ausblenden';
                if (detailLegacyLoaded) return;

                legacyContent.innerHTML = '<div class="mp3-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> Lade alte Metadaten…</div>';
                apiFetch('media/' + encodeURIComponent(selectedFile) + '/metainfo')
                    .then(function (legacyValues) {
                        detailLegacyLoaded = true;
                        renderLegacyMetainfo(legacyContent, legacyValues || {});
                    })
                    .catch(function (err) {
                        legacyContent.innerHTML = '<div class="mp3-detail-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + escAttr(err.message) + '</div>';
                    });
                return;
            }

            var mediaPickBtn = e.target.closest('.mp3-media-link-picker');
            if (mediaPickBtn) {
                var fieldKey = mediaPickBtn.getAttribute('data-field');
                if (!fieldKey) return;
                setMediaLinkPickMode(mediaLinkPickFieldKey === fieldKey ? null : fieldKey);
                return;
            }

            var mediaClearBtn = e.target.closest('.mp3-media-link-clear');
            if (mediaClearBtn) {
                var clearFieldKey = mediaClearBtn.getAttribute('data-field');
                var clearInput = clearFieldKey ? detailPanel.querySelector('[data-json-field="' + clearFieldKey + '"]') : null;
                if (clearInput) {
                    clearInput.value = '';
                    repaintMediaLinkWidget(mediaClearBtn.closest('.mp3-media-link-widget'));
                    if (mediaLinkPickFieldKey === clearFieldKey) {
                        setMediaLinkPickMode(null);
                    }
                    updateDetailSaveState();
                }
                return;
            }

            var addTagBtn = e.target.closest('.mp3-tags-add-btn');
            if (addTagBtn) {
                var wrap = addTagBtn.closest('.mp3-tags-widget');
                var tagsInput = wrap ? qs('.mp3-tags-input', wrap) : null;
                var hiddenInput = wrap ? qs('[data-widget="tags-value"]', wrap) : null;
                if (!wrap || !tagsInput || !hiddenInput) return;
                var newTag = String(tagsInput.value || '').trim();
                if (!newTag) return;
                var list = [];
                try { list = JSON.parse(hiddenInput.value || '[]'); } catch (e1) { list = []; }
                if (!Array.isArray(list)) list = [];
                var exists = false;
                for (var li = 0; li < list.length; li++) {
                    var existingName = typeof list[li] === 'string' ? list[li] : String((list[li] && list[li].name) || '');
                    if (existingName === newTag) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    if (wrap.closest('.mp3-json-field[data-field-key="__system_tags"]') && isCollectionTagName(newTag)) {
                        alert('Collection-Tags werden über die Sammlungsauswahl verwaltet und nicht als normale System-Tags.');
                        return;
                    }
                    var color = '#4a90d9';
                    if (wrap.closest('.mp3-json-field[data-field-key="__system_tags"]') && Array.isArray(detailSystemTagCatalog)) {
                        for (var ci = 0; ci < detailSystemTagCatalog.length; ci++) {
                            var c = detailSystemTagCatalog[ci];
                            if (c && c.name === newTag && /^#[0-9a-fA-F]{6}$/.test(String(c.color || ''))) {
                                color = String(c.color).toLowerCase();
                                break;
                            }
                        }
                    }
                    list.push({ name: newTag, color: color });
                }
                hiddenInput.value = JSON.stringify(list);
                tagsInput.value = '';
                repaintTagsWidget(wrap);
                updateDetailSaveState();
                return;
            }

            var removeTagBtn = e.target.closest('.mp3-tag-remove');
            if (removeTagBtn) {
                var removeWrap = removeTagBtn.closest('.mp3-tags-widget');
                var removeHidden = removeWrap ? qs('[data-widget="tags-value"]', removeWrap) : null;
                var removeTag = removeTagBtn.getAttribute('data-tag');
                if (!removeHidden || !removeTag) return;
                var values = [];
                try { values = JSON.parse(removeHidden.value || '[]'); } catch (e2) { values = []; }
                if (!Array.isArray(values)) values = [];
                values = values.filter(function (t) {
                    var name = typeof t === 'string' ? t : String((t && t.name) || '');
                    return name !== removeTag;
                });
                removeHidden.value = JSON.stringify(values);
                repaintTagsWidget(removeWrap);
                updateDetailSaveState();
                return;
            }

            var langToggleBtn = e.target.closest('.mp3-lang-toggle');
            if (langToggleBtn) {
                var target = langToggleBtn.getAttribute('data-lang-toggle');
                var langGroup = target ? detailPanel.querySelector('.mp3-lang-group[data-lang-group="' + target + '"]') : null;
                var extra = langGroup ? qs('.mp3-lang-extra', langGroup) : null;
                if (!extra) return;
                var open = extra.style.display !== 'none';
                if (open) {
                    extra.style.display = 'none';
                    langToggleBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i> ' + qsa('.mp3-lang-row', extra).length + ' weitere Sprache' + (qsa('.mp3-lang-row', extra).length > 1 ? 'n' : '');
                } else {
                    extra.style.display = '';
                    langToggleBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Weitere Sprachen ausblenden';
                    initDetailTinyEditors(extra);
                }
                return;
            }

            var fpPreview = e.target.closest('.mp3-detail-preview.mp3-detail-preview-has-focuspoint');
            if (fpPreview) {
                var key = fpPreview.getAttribute('data-focus-active-key');
                if (!key) return;
                var image = qs('img', fpPreview);
                if (!image) return;
                var rect = image.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                    return;
                }
                var x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                var y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                var xInput = detailPanel.querySelector('[data-json-field="' + key + '-x"]');
                var yInput = detailPanel.querySelector('[data-json-field="' + key + '-y"]');
                if (xInput) xInput.value = (x * 100).toFixed(1);
                if (yInput) yInput.value = (y * 100).toFixed(1);
                updateFocuspointPreviewMarker(key, x * 100, y * 100);
                updateDetailSaveState();
                return;
            }
        });

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.closest('.mp3-tags-input')) {
                e.preventDefault();
                var tagWrap = e.target.closest('.mp3-tags-widget');
                var addBtn = tagWrap ? qs('.mp3-tags-add-btn', tagWrap) : null;
                if (addBtn) addBtn.click();
                return;
            }

            if (e.key === 'Enter' && e.target.closest('.mp3-inline-edit-wrap')) {
                e.preventDefault();
                saveDetail();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.closest('#mp3-detail')) {
                e.preventDefault();
                saveDetail();
                return;
            }

            if (e.key === 'Escape' && e.target.closest('#mp3-detail')) {
                updateDetailSaveState();
            }
        });

        overlay.addEventListener('input', function (e) {
            if (!e.target.closest('#mp3-detail')) return;

            var tagColorInput = e.target.closest('.mp3-tag-color');
            if (tagColorInput) {
                applyTagColorChange(tagColorInput);
                return;
            }

            if (!(e.target.matches('#mp3-detail-title-input') || e.target.hasAttribute('data-json-field'))) return;

            var fieldName = e.target.getAttribute('data-json-field') || '';

            // ALT text input → update hint live
            var altWrap = e.target.closest('.mp3-alt-wrap');
            if (altWrap) {
                updateAltHint(altWrap);
            }

            if (/-x$/.test(fieldName) || /-y$/.test(fieldName)) {
                var focusKey = fieldName.replace(/-(x|y)$/, '');
                var xEl = detailPanel.querySelector('[data-json-field="' + focusKey + '-x"]');
                var yEl = detailPanel.querySelector('[data-json-field="' + focusKey + '-y"]');
                if (xEl && yEl) {
                    var nx = Math.max(0, Math.min(100, Number(String(xEl.value || '0').replace(',', '.'))));
                    var ny = Math.max(0, Math.min(100, Number(String(yEl.value || '0').replace(',', '.'))));
                    setActiveFocuspointKey(focusKey);
                    updateFocuspointPreviewMarker(focusKey, nx, ny);
                }
            }

            var maybeField = e.target.closest('.mp3-edit-field');
            if (maybeField) updateInlineDisplay(maybeField);
            updateDetailSaveState();
        });

        overlay.addEventListener('change', function (e) {
            var perPageSelect = e.target.closest('.mp3-per-page-select');
            if (perPageSelect) {
                var nextPerPage = normalizeMediaPerPage(perPageSelect.value);
                perPageSelect.value = String(nextPerPage);

                if (nextPerPage !== mediaPerPage) {
                    mediaPerPage = nextPerPage;
                    localStorage.setItem('mp3_per_page', String(mediaPerPage));
                    loadFiles(currentCat, true);
                }
                return;
            }

            var replaceInput = e.target.closest('.mp3-detail-replace-input');
            if (replaceInput) {
                var file = replaceInput.files && replaceInput.files[0] ? replaceInput.files[0] : null;
                if (!file || !selectedFile) return;

                if (!extensionsCompatible(selectedFile, file.name)) {
                    var allowed = getReplacementAcceptForFilename(selectedFile).replace(/,/g, ' oder ');
                    alert('Ungueltige Dateiendung. Erlaubt ist nur: ' + allowed + '.');
                    replaceInput.value = '';
                    return;
                }

                var replaceLabel = replaceInput.closest('.mp3-detail-replace-btn');
                if (replaceLabel) replaceLabel.classList.add('is-loading');

                var reloadCat = currentCat;
                var reloadQuery = mediaQuery;

                apiReplaceFile(selectedFile, file)
                    .then(function () {
                        mediaForceCacheTokens[selectedFile] = Date.now();
                        currentCat = reloadCat;
                        localStorage.setItem('mp3_cat', String(reloadCat));
                        mediaQuery = reloadQuery;
                        if (searchInput) searchInput.value = reloadQuery;
                        buildBreadcrumb(reloadCat);
                        rerenderSidebar();
                        loadFiles(reloadCat, true);
                        showDetail(selectedFile);
                    })
                    .catch(function (err) {
                        alert('Fehler beim Datei-Tausch: ' + err.message);
                    })
                    .then(function () {
                        if (replaceLabel) replaceLabel.classList.remove('is-loading');
                        replaceInput.value = '';
                    });
                return;
            }

            if (!e.target.closest('#mp3-detail')) return;
            var tagColorInput = e.target.closest('.mp3-tag-color');
            if (tagColorInput) {
                applyTagColorChange(tagColorInput);
                return;
            }
            // Decorative checkbox toggled → update ALT hint
            var decCb = e.target.closest('[data-json-field$="-decorative"]');
            if (decCb) {
                updateAltHint(decCb.closest('.mp3-alt-wrap'));
            }
        });

        // Search (client-side filter, combined with type filter/sort)
        var searchTimer;
        searchInput.addEventListener('input', function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                mediaQuery = searchInput.value.trim();
                loadFiles(currentCat, true);
            }, 200);
        });

        gridWrap.addEventListener('scroll', function () {
            if (mediaLoading || !mediaHasMore) return;
            var threshold = 180;
            if ((gridWrap.scrollTop + gridWrap.clientHeight) >= (gridWrap.scrollHeight - threshold)) {
                loadFiles(currentCat, false);
            }
        });

        // Sort dropdown
        var sortSelect = qs('.mp3-sort-select', overlay);
        sortSelect.addEventListener('change', function () {
            currentSort = sortSelect.value;
            localStorage.setItem('mp3_sort', currentSort);
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
            localStorage.setItem('mp3_view', viewMode);
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

        var tagFilterWrap = qs('.mp3-tag-filter-wrap', overlay);
        if (tagFilterWrap) {
            tagFilterWrap.addEventListener('click', function (e) {
                var toggle = e.target.closest('.mp3-tag-filter-toggle');
                if (toggle) {
                    e.stopPropagation();
                    var isOpen = tagFilterWrap.classList.contains('is-open');
                    setTagFilterMenuOpen(!isOpen);
                    return;
                }

                var option = e.target.closest('.mp3-tag-filter-option');
                if (option) {
                    e.stopPropagation();
                    var name = String(option.getAttribute('data-tag-name') || '').trim();
                    if (!name) return;
                    if (currentTagFilters[name]) {
                        delete currentTagFilters[name];
                    } else {
                        currentTagFilters[name] = true;
                    }
                    updateTagFilterOptions();
                    refreshDisplay();
                }
            });
        }

        overlay.addEventListener('click', function (e) {
            if (e.target.closest('.mp3-tag-filter-wrap')) return;
            setTagFilterMenuOpen(false);
        });

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                setTagFilterMenuOpen(false);
                if (editorCanvasOpen) {
                    closeEditorCanvas();
                }
            }
        });

        updateTagFilterOptions();

        // Editor Canvas events
        var editorCanvas = qs('#mp3-editor-canvas', overlay);
        if (editorCanvas) {
            editorCanvas.addEventListener('click', function (e) {
                if (e.target.closest('.mp3-editor-canvas-back')) {
                    closeEditorCanvas();
                } else if (e.target.closest('.mp3-editor-canvas-save')) {
                    commitEditorCanvas();
                }
            });
        }

        // "Bearbeiten" button in detail panel (event delegation on overlay)
        overlay.addEventListener('click', function (e) {
            var btn = e.target.closest('.mp3-tiny-canvas-open');
            if (!btn) return;
            var fk = String(btn.getAttribute('data-canvas-field') || '').trim();
            var cl = btn.hasAttribute('data-canvas-clang') ? String(btn.getAttribute('data-canvas-clang')) : null;
            var lbl = String(btn.getAttribute('data-canvas-label') || fk);
            if (fk) openEditorCanvas(fk, cl, lbl);
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

        // Paste from Clipboard via Cmd+V (paste event fires when modal has focus)
        document.addEventListener('paste', function (e) {
            if (!overlay || !overlay.classList.contains('mp3-open')) return;
            // Skip when actively typing in a text field
            var active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

            var cd = e.clipboardData || window.clipboardData;
            if (!cd || !cd.items || !cd.items.length) return;

            var files = [];
            for (var i = 0; i < cd.items.length; i++) {
                var item = cd.items[i];
                if (item.kind === 'file') {
                    var file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (!files.length) return;
            e.preventDefault();
            if (gridWrap) {
                gridWrap.classList.add('mp3-pasteover');
                setTimeout(function () { gridWrap.classList.remove('mp3-pasteover'); }, 300);
            }
            doUpload(files);
        });
    }

    // ---- Multi-Select Helpers ----
    function getVisibleFilenames() {
        var filenames = [];
        qsa('.mp3-card, .mp3-list-row, .mp3-masonry-card', grid).forEach(function (el) {
            var fn = el.getAttribute('data-filename');
            if (fn) filenames.push(fn);
        });
        return filenames;
    }

    function updateCollectionDragSelectionUI() {
        qsa('.mp3-card', grid).forEach(function (c) {
            var fn = c.getAttribute('data-filename');
            c.classList.toggle('mp3-card-multi-selected', !!collectionDragSelected[fn]);
        });

        qsa('.mp3-list-row', grid).forEach(function (r) {
            var fn = r.getAttribute('data-filename');
            r.classList.toggle('mp3-list-row-multi-selected', !!collectionDragSelected[fn]);
        });

        qsa('.mp3-masonry-card', grid).forEach(function (m) {
            var fn = m.getAttribute('data-filename');
            m.classList.toggle('mp3-masonry-card-multi', !!collectionDragSelected[fn]);
        });
    }

    function toggleCollectionDragSelection(filename) {
        if (!filename) return;
        if (collectionDragSelected[filename]) {
            delete collectionDragSelected[filename];
        } else {
            collectionDragSelected[filename] = true;
        }
        updateCollectionDragSelectionUI();
    }

    function clearCollectionDragSelection() {
        collectionDragSelected = {};
        updateCollectionDragSelectionUI();
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

        // Update masonry checks
        qsa('.mp3-masonry-card', grid).forEach(function (r) {
            var fn = r.getAttribute('data-filename');
            var isSel = !!multiSelected[fn];
            r.classList.toggle('mp3-masonry-card-multi', isSel);
            var chk = qs('.mp3-masonry-check i', r);
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
        collectionDragSelected = {};
        mediaLinkPickFieldKey = null;
        closeLightbox();
        setFullscreenMode(false);
        destroyDetailTinyEditors();
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
        // Focus overlay so paste events (Cmd+V) are received
        setTimeout(function () { overlay.focus(); }, 50);
        searchInput.value = '';
        currentCat = parseInt(localStorage.getItem('mp3_cat') || '0', 10);
        catCache = {};
        catPath = [];
        lastLoadedFiles = [];
        mediaPage = 1;
        mediaTotal = 0;
        mediaHasMore = false;
        mediaLoading = false;
        mediaQuery = '';
        mediaPerPage = normalizeMediaPerPage(localStorage.getItem('mp3_per_page'));
        currentFilter = 'all';
        currentTagFilters = {};
        currentTagCatalog = [];
        currentSort = localStorage.getItem('mp3_sort') || 'date_desc';
        viewMode = localStorage.getItem('mp3_view') || 'grid';
        if (viewMode !== 'grid' && viewMode !== 'list' && viewMode !== 'masonry') {
            viewMode = 'grid';
        }
        setActiveCollection(localStorage.getItem('mp3_active_collection') || null);
        setDarkMode(localStorage.getItem('mp3_dark_mode') === '1');
        closeEditorCanvas();

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
        setTagFilterMenuOpen(false);
        updateTagFilterOptions();
        qsa('.mp3-view-btn', overlay).forEach(function (b) {
            b.classList.toggle('mp3-view-active', b.getAttribute('data-view') === viewMode);
        });
        var sortSel = qs('.mp3-sort-select', overlay);
        if (sortSel) sortSel.value = currentSort;
        var perPageSel = qs('.mp3-per-page-select', overlay);
        if (perPageSel) perPageSel.value = String(mediaPerPage);
        localStorage.setItem('mp3_per_page', String(mediaPerPage));
        // Reset mobile states
        if (sidebar) sidebar.classList.remove('mp3-sidebar-open');
        var bd = qs('#mp3-sidebar-backdrop');
        if (bd) bd.classList.remove('mp3-backdrop-open');
        renderBreadcrumb();
        loadCategories();
        loadFiles(currentCat, true);
    }

    function close() {
        closeLightbox();
        setFullscreenMode(false);
        if (overlay) {
            overlay.classList.remove('mp3-open');
            overlay.classList.remove('mp3-multi-mode');
            overlay.classList.remove('mp3-media-link-pick-mode');
            document.body.style.overflow = '';
        }
        multiMode = false;
        multiSelected = {};
        collectionDragSelected = {};
        mediaLinkPickFieldKey = null;
        destroyDetailTinyEditors();
        onSelect = null;
        onMultiSelect = null;
    }

    // ---- Public API ----
    window.MP3 = {
        open: open,
        close: close
    };

})();
