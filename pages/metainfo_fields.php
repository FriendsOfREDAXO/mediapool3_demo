<?php

/**
 * Manage metainfo field definitions for mediapool3_demo.
 */

$func = rex_request('func', 'string', '');
$moveId = rex_request('move_id', 'int', 0);
$moveDir = rex_request('move_dir', 'string', '');
$fieldId = rex_request('field_id', 'int', 0);
$fieldToEdit = null;

$listUrl = rex_url::currentBackendPage([], false);
$addUrl = rex_url::currentBackendPage(['func' => 'add'], false);

echo rex_view::info(rex_i18n::msg('mediapool3_demo_fields_scope_hint'));


// Move field up/down
if (in_array($moveDir, ['up', 'down'], true) && $moveId > 0) {
    $allFields = \FriendsOfRedaxo\Mediapool3Demo\MetainfoFieldGroup::getFields();
    $ids = array_map(fn($f) => $f->getId(), $allFields);
    $pos = array_search($moveId, $ids, true);
    if (false !== $pos) {
        $swapPos = 'up' === $moveDir ? $pos - 1 : $pos + 1;
        if (isset($ids[$swapPos])) {
            $table = rex::getTable('mediapool3_demo_metainfo_fields');

            rex_sql::factory()->setQuery(
                'UPDATE ' . $table . ' SET priority = :priority WHERE id = :id',
                [':priority' => $swapPos, ':id' => $ids[$pos]],
            );

            rex_sql::factory()->setQuery(
                'UPDATE ' . $table . ' SET priority = :priority WHERE id = :id',
                [':priority' => $pos, ':id' => $ids[$swapPos]],
            );
        }
    }
}

// Delete field
if ('delete' === $func && $fieldId > 0) {
    $field = \FriendsOfRedaxo\Mediapool3Demo\MetainfoFieldGroup::getFields();
    $fieldToDelete = null;
    foreach ($field as $f) {
        if ($f->getId() === $fieldId) {
            $fieldToDelete = $f;
            break;
        }
    }

    if ($fieldToDelete) {
        \FriendsOfRedaxo\Mediapool3Demo\MetainfoFieldGroup::deleteField($fieldToDelete->getKey());
        echo rex_view::success(\rex_i18n::msg('mediapool3_demo_field_deleted', 'Feld gelöscht'));
    }
    $func = '';
}

// Edit/Create form
if ('edit' === $func && $fieldId > 0) {
    $fields = \FriendsOfRedaxo\Mediapool3Demo\MetainfoFieldGroup::getFields();
    $fieldToEdit = null;
    foreach ($fields as $f) {
        if ($f->getId() === $fieldId) {
            $fieldToEdit = $f;
            break;
        }
    }

    if (!$fieldToEdit) {
        echo rex_view::error(\rex_i18n::msg('mediapool3_demo_field_not_found', 'Feld nicht gefunden'));
        $func = '';
    }
} elseif ('add' === $func) {
    $fieldToEdit = null;
}

if ('edit' === $func || 'add' === $func) {
    $key = rex_request('key', 'string', $fieldToEdit?->getKey() ?? '');
    $label = rex_request('label', 'string', $fieldToEdit?->getLabel() ?? '');
    $widgetType = rex_request('widget_type', 'string', $fieldToEdit?->getWidgetType() ?? 'text');
    $translatable = (bool) rex_request('translatable', 'int', $fieldToEdit?->isTranslatable() ? 1 : 0);
    $imageOnly = (bool) rex_request('image_only', 'int', $fieldToEdit?->isImageOnly() ? 1 : 0);

    $allowedWidgets = [
        'text' => 'Text (einzeilig)',
        'textarea' => 'Text (mehrzeilig)',
        'tinymce' => 'TinyMCE (WYSIWYG)',
        'focuspoint' => 'Focuspoint Editor',
        'alt' => 'ALT-Text (mit dekorativ-Option)',
        'media_link' => 'Link zu Medium',
    ];

    ?>
    <form method="post">
        <div class="row">
            <div class="col-md-6">
                <div class="form-group">
                    <label for="key" class="form-label">Feld-Schlüssel</label>
                    <input type="text" id="key" name="key" value="<?php echo rex_escape($key); ?>" class="form-control" <?php if ($fieldToEdit) echo 'readonly'; ?> required>
                    <small class="form-text text-muted">z.B. "description", "focuspoint". Nur Kleinbuchstaben, Zahlen, Unterstriche.</small>
                </div>

                <div class="form-group">
                    <label for="label" class="form-label">Label</label>
                    <input type="text" id="label" name="label" value="<?php echo rex_escape($label); ?>" class="form-control" required>
                </div>

                <div class="form-group">
                    <label for="widget_type" class="form-label">Widget-Typ</label>
                    <select id="widget_type" name="widget_type" class="form-control" required>
                        <option value="">– Wählen –</option>
                        <?php foreach ($allowedWidgets as $type => $name): ?>
                            <option value="<?php echo rex_escape($type); ?>" <?php if ($widgetType === $type) echo 'selected'; ?>>
                                <?php echo rex_escape($name); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>

            <div class="col-md-6">
                <div class="form-check" style="margin-bottom: 12px;">
                    <input type="checkbox" id="translatable" name="translatable" value="1" class="form-check-input" <?php if ($translatable) echo 'checked'; ?>>
                    <label for="translatable" class="form-check-label">
                        Mehrsprachig <small class="text-muted">(separate Werte pro Sprache)</small>
                    </label>
                </div>

                <div class="form-check">
                    <input type="checkbox" id="image_only" name="image_only" value="1" class="form-check-input" <?php if ($imageOnly) echo 'checked'; ?>>
                    <label for="image_only" class="form-check-label">
                        Nur für Bilder <small class="text-muted">(versteckt für andere Dateitypen)</small>
                    </label>
                </div>
            </div>
        </div>

        <div style="margin-top: 16px;">
            <button type="submit" name="save" value="1" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> Speichern</button>
            <a href="<?php echo $listUrl; ?>" class="btn btn-secondary">Abbrechen</a>
        </div>
    </form>
    <?php
}

// Handle save
if (1 === rex_post('save', 'int', 0)) {
    $key = rex_post('key', 'string', '');
    $label = rex_post('label', 'string', '');
    $widgetType = rex_post('widget_type', 'string', '');
    $translatable = (bool) rex_post('translatable', 'int');
    $imageOnly = (bool) rex_post('image_only', 'int');

    if ('alt' === $widgetType) {
        $key = 'alt';
        $imageOnly = true;
    }

    if (!$key || !$label || !$widgetType) {
        echo rex_view::error(\rex_i18n::msg('mediapool3_demo_invalid_input', 'Ungültige Eingabe'));
    } else {
        \FriendsOfRedaxo\Mediapool3Demo\MetainfoFieldGroup::saveField(
            $key,
            $label,
            $widgetType,
            [],
            $translatable,
            $imageOnly,
        );
        echo rex_view::success(\rex_i18n::msg('mediapool3_demo_field_saved', 'Feld gespeichert'));
        $func = '';
    }
}

// List all fields
if ('' === $func) {
    $fields = \FriendsOfRedaxo\Mediapool3Demo\MetainfoFieldGroup::getFields();

    ?>
    <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
        <a href="<?php echo $addUrl; ?>" class="btn btn-success"><i class="fa-solid fa-plus"></i> Neues Feld</a>
    </div>

    <?php if (empty($fields)): ?>
        <div class="alert alert-info">
            <?php echo \rex_i18n::msg('mediapool3_demo_no_fields', 'Noch keine Felder definiert. Erstelle eines um zu beginnen.'); ?>
        </div>
    <?php else: ?>
        <table class="table table-striped">
            <thead>
                <tr>
                    <th style="width: 70px;"></th>
                    <th>Label</th>
                    <th>Schlüssel</th>
                    <th>Typ</th>
                    <th>Optionen</th>
                    <th>Aktionen</th>
                </tr>
            </thead>
            <tbody class="mp3-fields-sortable">
            <tbody>
                <?php foreach ($fields as $i => $field): ?>
                    <tr>
                        <td style="white-space:nowrap;">
                            <?php if ($i > 0): ?><a href="<?php echo rex_url::currentBackendPage(['move_id' => $field->getId(), 'move_dir' => 'up'], false); ?>" class="btn btn-xs btn-default" title="Nach oben"><i class="fa-solid fa-arrow-up"></i></a><?php endif; ?>
                            <?php if ($i < count($fields) - 1): ?><a href="<?php echo rex_url::currentBackendPage(['move_id' => $field->getId(), 'move_dir' => 'down'], false); ?>" class="btn btn-xs btn-default" title="Nach unten"><i class="fa-solid fa-arrow-down"></i></a><?php endif; ?>
                        </td>
                        <td><?php echo rex_escape($field->getLabel()); ?></td>
                        <td><code><?php echo rex_escape($field->getKey()); ?></code></td>
                        <td>
                            <span class="badge bg-info"><?php echo rex_escape($field->getWidgetType()); ?></span>
                        </td>
                        <td>
                            <?php $badges = [];
                            if ($field->isTranslatable()) $badges[] = '<span class="badge bg-secondary">Multilingual</span>';
                            if ($field->isImageOnly()) $badges[] = '<span class="badge bg-warning text-dark">Bilder nur</span>';
                            echo implode(' ', $badges);
                            ?>
                        </td>
                        <td>
                            <a href="<?php echo rex_url::currentBackendPage(['func' => 'edit', 'field_id' => $field->getId()], false); ?>" class="btn btn-sm btn-primary"><i class="fa-solid fa-pencil"></i></a>
                            <a href="<?php echo rex_url::currentBackendPage(['func' => 'delete', 'field_id' => $field->getId()], false); ?>" class="btn btn-sm btn-danger" onclick="return confirm('Wirklich löschen?');"><i class="fa-solid fa-trash"></i></a>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif;
}
