<?php

namespace FriendsOfRedaxo\Mediapool3Demo\Widgets;

use FriendsOfRedaxo\Mediapool3Demo\MetainfoWidget;

/**
 * Media link widget – link to another media file.
 * Useful for poster images, thumbnails, etc.
 */
class MediaLinkWidget extends MetainfoWidget
{
    public function renderEdit(mixed $value, \rex_media $media, int $clangId): string
    {
        $filename = '';
        if (is_string($value)) {
            $filename = $value;
        } elseif (is_array($value) && isset($value['filename'])) {
            $filename = $value['filename'];
        }

        $id = $this->getFieldId();
        $name = $this->getFieldName();

        $html = '<div class="mp3-meta-field mp3-meta-field-media-link">';
        $html .= '<label for="' . $id . '" class="mp3-meta-label">' . $this->escape($this->getFieldLabel()) . '</label>';

        $html .= '<div class="input-group input-group-sm">';
        $html .= '<input type="text" id="' . $id . '" name="' . $name . '" value="' . $this->escape($filename) . '" class="form-control mp3-media-link-input" placeholder="Mediendatei eingeben oder aus Picker wählen" readonly style="background: #f5f5f5;">';
        $html .= '<button type="button" class="btn btn-outline-secondary mp3-media-link-picker" title="Aus Mediapool wählen">';
        $html .= '<i class="fa-solid fa-image"></i>';
        $html .= '</button>';
        $html .= '<button type="button" class="btn btn-outline-secondary mp3-media-link-clear" title="Zurücksetzen">';
        $html .= '<i class="fa-solid fa-times"></i>';
        $html .= '</button>';
        $html .= '</div>';

        // Preview if file selected
        if ($filename) {
            $linkedMedia = \rex_media::get($filename);
            if ($linkedMedia) {
                $ext = $linkedMedia->getExtension();
                if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) {
                    $html .= '<div style="margin-top: 8px;">';
                    $html .= '<img src="' . \rex_escape($linkedMedia->getUrl()) . '" style="max-width: 200px; max-height: 150px; border: 1px solid #ddd; border-radius: 4px;">';
                    $html .= '</div>';
                }
            }
        }

        $html .= '</div>';

        return $html;
    }

    public function renderDisplay(mixed $value, \rex_media $media, int $clangId): string
    {
        $filename = '';
        if (is_string($value)) {
            $filename = $value;
        } elseif (is_array($value) && isset($value['filename'])) {
            $filename = $value['filename'];
        }

        if (!$filename) {
            return '<span class="mp3-meta-empty">–</span>';
        }

        $linkedMedia = \rex_media::get($filename);
        if (!$linkedMedia) {
            return '<span class="text-danger">' . $this->escape($filename) . ' (nicht gefunden)</span>';
        }

        return '<code><i class="fa-solid fa-file"></i> ' . $this->escape($filename) . '</code>';
    }

    public function normalizeValue(mixed $value): mixed
    {
        $filename = '';

        if (is_string($value)) {
            $filename = trim($value);
        } elseif (is_array($value) && isset($value['filename'])) {
            $filename = trim($value['filename']);
        }

        if (!$filename) {
            return null;
        }

        // Validate that media file exists
        if (!\rex_media::get($filename)) {
            return null;
        }

        return $filename;
    }

    /**
     * Get linked media file.
     */
    public static function getLinkedMedia(\rex_media $media, string $fieldKey): ?\rex_media
    {
        $data = \FriendsOfRedaxo\Mediapool3Demo\MetainfoJsonStorage::loadFromMedia($media);
        $filename = $data[$fieldKey] ?? null;

        if (!is_string($filename) || !$filename) {
            return null;
        }

        return \rex_media::get($filename);
    }
}
