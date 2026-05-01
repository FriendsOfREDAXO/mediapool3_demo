<?php

namespace FriendsOfRedaxo\Mediapool3Demo\Widgets;

use FriendsOfRedaxo\Mediapool3Demo\MetainfoWidget;

/**
 * TinyMCE WYSIWYG widget (requires TinyMCE addon).
 * Supports multiple languages.
 */
class TinyMceWidget extends MetainfoWidget
{
    public function renderEdit(mixed $value, \rex_media $media, int $clangId): string
    {
        if (!\rex_addon::get('tinymce')?->isAvailable()) {
            return '<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation"></i> TinyMCE Addon erforderlich</div>';
        }

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

        $html = '<div class="mp3-meta-field mp3-meta-field-tinymce">';
        if ($this->isTranslatable()) {
            $clangName = \rex_clang::get($clangId)?->getName() ?? 'Sprache ' . $clangId;
            $html .= '<label class="mp3-meta-label">' . $this->escape($this->getFieldLabel()) . ' <span class="mp3-meta-lang">(' . $this->escape($clangName) . ')</span></label>';
        } else {
            $html .= '<label class="mp3-meta-label">' . $this->escape($this->getFieldLabel()) . '</label>';
        }

        $html .= '<textarea id="' . $id . '" name="' . $name . '" class="tinymce" style="height: 300px;">' . $this->escape($currentValue) . '</textarea>';
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

        // Only display first 200 chars
        $preview = substr(strip_tags($displayValue), 0, 200);
        return '<small>' . $this->escape($preview) . (strlen(strip_tags($displayValue)) > 200 ? '…' : '') . '</small>';
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
