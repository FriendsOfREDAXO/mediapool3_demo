<?php

namespace FriendsOfRedaxo\Mediapool3Demo\Widgets;

use FriendsOfRedaxo\Mediapool3Demo\MetainfoWidget;

/**
 * Textarea field widget (multi-line).
 * Supports multiple languages.
 */
class TextareaWidget extends MetainfoWidget
{
    public function renderEdit(mixed $value, \rex_media $media, int $clangId): string
    {
        $currentValue = '';
        if ($this->isTranslatable()) {
            if (is_array($value)) {
                $currentValue = $value[(string) $clangId] ?? '';
            }
        } else {
            $currentValue = $value ?? '';
        }

        $id = $this->getFieldId($clangId);
        $name = $this->getFieldName($clangId);

        $html = '<div class="mp3-meta-field mp3-meta-field-textarea">';
        if ($this->isTranslatable()) {
            $clangName = \rex_clang::get($clangId)?->getName() ?? 'Sprache ' . $clangId;
            $html .= '<label for="' . $id . '" class="mp3-meta-label">' . $this->escape($this->getFieldLabel()) . ' <span class="mp3-meta-lang">(' . $this->escape($clangName) . ')</span></label>';
        } else {
            $html .= '<label for="' . $id . '" class="mp3-meta-label">' . $this->escape($this->getFieldLabel()) . '</label>';
        }
        $html .= '<textarea id="' . $id . '" name="' . $name . '" class="form-control mp3-meta-textarea" rows="4">' . $this->escape($currentValue) . '</textarea>';
        $html .= '</div>';

        return $html;
    }

    public function renderDisplay(mixed $value, \rex_media $media, int $clangId): string
    {
        $displayValue = '';
        if ($this->isTranslatable()) {
            if (is_array($value)) {
                $displayValue = $value[(string) $clangId] ?? '';
            }
        } else {
            $displayValue = $value ?? '';
        }

        if (!$displayValue) {
            return '<span class="mp3-meta-empty">–</span>';
        }

        return '<pre class="mp3-meta-textarea-display">' . $this->escape($displayValue) . '</pre>';
    }

    public function normalizeValue(mixed $value): mixed
    {
        if (is_string($value)) {
            return trim($value);
        }
        if (is_array($value)) {
            return array_filter(array_map(fn($v) => is_string($v) ? trim($v) : $v, $value));
        }
        return $value;
    }
}
