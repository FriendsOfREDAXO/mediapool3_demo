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
        $inject = '<div id="mp3-root"></div>';
        $content = str_replace('</body>', $inject . "\n" . '</body>', $content);
        $ep->setSubject($content);
    });
}
