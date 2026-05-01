<?php

if (rex::isBackend() && rex::getUser()) {
    $buster = '?v=' . filemtime($this->getPath('assets/mediapool3.css'));

    // Core: Overlay Picker
    rex_view::addCssFile($this->getAssetsUrl('mediapool3.css') . $buster);
    rex_view::addJsFile($this->getAssetsUrl('mediapool3.js') . $buster);

    // Widget: Input-Feld → Media Picker
    rex_view::addCssFile($this->getAssetsUrl('mediapool3_widget.css') . $buster);
    rex_view::addJsFile($this->getAssetsUrl('mediapool3_widget.js') . $buster);

    rex_extension::register('OUTPUT_FILTER', static function (rex_extension_point $ep) {
        $content = $ep->getSubject();
        $schemaUrl = rex_url::backendController(['rex-api-call' => 'mediapool3_demo_schema', 'prefix' => 'med_']);
        $jsonUrl = rex_url::backendController(['rex-api-call' => 'mediapool3_demo_json_metainfo']);
        $tagsUrl = rex_url::backendController(['rex-api-call' => 'mediapool3_demo_tags']);
        $categoriesUrl = rex_url::backendController(['rex-api-call' => 'mediapool3_demo_categories']);
        $inject = '<div id="mp3-root" data-schema-url="' . rex_escape($schemaUrl) . '" data-json-url="' . rex_escape($jsonUrl) . '" data-tags-url="' . rex_escape($tagsUrl) . '" data-categories-url="' . rex_escape($categoriesUrl) . '"></div>';
        $content = str_replace('</body>', $inject . "\n" . '</body>', $content);
        $ep->setSubject($content);
    });
}
