<?php

$addon = rex_addon::get('mediapool3_demo');
$addon->setConfig('version', $addon->getVersion());

// Register med_json_data field for storing structured metadata (replaces the old schema-based approach)
require_once __DIR__ . '/lib/MetainfoFieldGroup.php';
\FriendsOfRedaxo\Mediapool3Demo\MetainfoFieldGroup::ensureJsonField();
require_once __DIR__ . '/lib/SystemTagManager.php';
\FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::ensureSchema();

// Register med_json_data in REDAXO core metainfo addon so it appears in field list
if (rex_addon::get('metainfo')->isInstalled()) {
    $metainfoSql = rex_sql::factory();
    $existing = $metainfoSql->getArray(
        'SELECT id FROM ' . rex::getTable('metainfo_field') . ' WHERE name = :name',
        [':name' => 'med_json_data'],
    );
    if (empty($existing)) {
        $metainfoSql->setTable(rex::getTable('metainfo_field'));
        $metainfoSql->setValue('name', 'med_json_data');
        $metainfoSql->setValue('title', 'Medienpool 3 Metadaten');
        $metainfoSql->setValue('type_id', 2);
        $metainfoSql->setValue('priority', 100);
        $metainfoSql->setValue('attributes', 'readonly="readonly" rows="3" class="form-control"');
        $metainfoSql->setValue('default', '');
        $metainfoSql->setValue('createdate', date('Y-m-d H:i:s'));
        $metainfoSql->setValue('createuser', 'mediapool3_demo');
        $metainfoSql->setValue('updatedate', date('Y-m-d H:i:s'));
        $metainfoSql->setValue('updateuser', 'mediapool3_demo');
        $metainfoSql->insert();
    }
}
