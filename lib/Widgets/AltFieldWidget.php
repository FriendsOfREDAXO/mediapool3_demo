<?php

namespace FriendsOfRedaxo\Mediapool3Demo\Widgets;

use FriendsOfRedaxo\Mediapool3Demo\MetainfoWidget;

/**
 * ALT text field widget (for images only).
 * Includes checkbox to mark image as decorative (no alt needed).
 * Shows warning if no alt text provided for non-decorative images.
 */
class AltFieldWidget extends MetainfoWidget
{
    public function renderEdit(mixed $value, \rex_media $media, int $clangId): string
    {
        // ALT text value
        $altText = '';
        if (is_array($value) && isset($value['text'])) {
            $textData = $value['text'];
            if (is_array($textData)) {
                $altText = $textData[(string) $clangId] ?? '';
            } else {
                $altText = $textData ?? '';
            }
        } elseif (is_string($value)) {
            $altText = $value;
        }

        // Decorative checkbox
        $isDecorative = is_array($value) && ($value['decorative'] ?? false);

        $id = $this->getFieldId($clangId);
        $idText = $id . '-text';
        $idDecorative = $id . '-decorative';
        $nameName = $this->getFieldName($clangId) . '[text]';
        $decorativeName = $this->getFieldName($clangId) . '[decorative]';

        $html = '<div class="mp3-meta-field mp3-meta-field-alt">';
        if ($this->isTranslatable()) {
            $clangName = \rex_clang::get($clangId)?->getName() ?? 'Sprache ' . $clangId;
            $html .= '<label class="mp3-meta-label">' . $this->escape($this->getFieldLabel()) . ' <span class="mp3-meta-lang">(' . $this->escape($clangName) . ')</span></label>';
        } else {
            $html .= '<label class="mp3-meta-label">' . $this->escape($this->getFieldLabel()) . '</label>';
        }

        // ALT text input
        $html .= '<input type="text" id="' . $idText . '" name="' . $nameName . '" value="' . $this->escape($altText) . '" class="form-control mp3-meta-input mp3-alt-text">';

        // Decorative checkbox
        $checked = $isDecorative ? ' checked' : '';
        $html .= '<div class="mp3-meta-checkbox" style="margin-top: 6px;">';
        $html .= '<label>';
        $html .= '<input type="checkbox" id="' . $idDecorative . '" name="' . $decorativeName . '" value="1"' . $checked . ' class="mp3-alt-decorative">';
        $html .= ' <i class="fa-solid fa-image"></i> ' . \rex_i18n::msg('mediapool3_demo_alt_decorative', 'Dekoratives Bild (kein ALT-Text nötig)');
        $html .= '</label>';
        $html .= '</div>';

        // Warning if no ALT and not decorative
        if (!$altText && !$isDecorative) {
            $html .= '<div class="alert alert-warning" style="margin-top: 8px;">';
            $html .= '<i class="fa-solid fa-triangle-exclamation"></i> ' . \rex_i18n::msg('mediapool3_demo_alt_required', 'ALT-Text wird für die Barrierefreiheit empfohlen!');
            $html .= '</div>';
        }

        $html .= '</div>';

        return $html;
    }

    public function renderDisplay(mixed $value, \rex_media $media, int $clangId): string
    {
        $altText = '';
        $isDecorative = false;

        if (is_array($value)) {
            $isDecorative = $value['decorative'] ?? false;
            if (isset($value['text'])) {
                $textData = $value['text'];
                if (is_array($textData)) {
                    $altText = $textData[(string) $clangId] ?? '';
                } else {
                    $altText = $textData ?? '';
                }
            }
        } elseif (is_string($value)) {
            $altText = $value;
        }

        $html = '<div class="mp3-meta-alt-display">';

        if ($isDecorative) {
            $html .= '<span class="badge bg-info"><i class="fa-solid fa-image"></i> Dekorativ</span>';
        } else if ($altText) {
            $html .= '<code>' . $this->escape($altText) . '</code>';
        } else {
            $html .= '<span class="badge bg-warning text-dark"><i class="fa-solid fa-triangle-exclamation"></i> Kein ALT</span>';
        }

        $html .= '</div>';

        return $html;
    }

    public function normalizeValue(mixed $value): mixed
    {
        if (!is_array($value)) {
            $value = ['text' => $value, 'decorative' => false];
        }

        // Normalize text values
        if (isset($value['text'])) {
            if (is_string($value['text'])) {
                $value['text'] = trim($value['text']);
            } elseif (is_array($value['text'])) {
                $value['text'] = array_filter(array_map(fn($v) => is_string($v) ? trim($v) : $v, $value['text']));
            }
            if (empty($value['text'])) {
                unset($value['text']);
            }
        }

        // Normalize decorative flag
        $value['decorative'] = (bool) ($value['decorative'] ?? false);

        // If empty, return null to remove field
        if (empty($value['text']) && !$value['decorative']) {
            return null;
        }

        return $value;
    }
}
