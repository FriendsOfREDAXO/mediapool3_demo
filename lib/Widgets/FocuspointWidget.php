<?php

namespace FriendsOfRedaxo\Mediapool3Demo\Widgets;

use FriendsOfRedaxo\Mediapool3Demo\MetainfoWidget;

/**
 * Focuspoint widget for selecting focus point on images.
 * Stores coordinates as { "x": 0-1, "y": 0-1 }
 * Integrates with image preview if available.
 */
class FocuspointWidget extends MetainfoWidget
{
    public function renderEdit(mixed $value, \rex_media $media, int $clangId): string
    {
        $x = 0.5;
        $y = 0.5;

        if (is_array($value)) {
            $x = (float) ($value['x'] ?? 0.5);
            $y = (float) ($value['y'] ?? 0.5);
        }

        $id = $this->getFieldId();
        $idX = $id . '-x';
        $idY = $id . '-y';
        $idCanvas = $id . '-canvas';

        $html = '<div class="mp3-meta-field mp3-meta-field-focuspoint">';
        $html .= '<label class="mp3-meta-label">' . $this->escape($this->getFieldLabel()) . '</label>';

        // Hidden inputs for X/Y
        $html .= '<input type="hidden" id="' . $idX . '" name="' . $this->getFieldName() . '[x]" value="' . $x . '" class="mp3-focuspoint-x">';
        $html .= '<input type="hidden" id="' . $idY . '" name="' . $this->getFieldName() . '[y]" value="' . $y . '" class="mp3-focuspoint-y">';

        // Canvas for image + focuspoint
        if ($media && $media->getFilesize() > 0) {
            $ext = $media->getExtension();
            if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) {
                $mediaUrl = $media->getUrl();
                $html .= '<div class="mp3-focuspoint-container" style="position: relative; display: inline-block; margin: 8px 0; max-width: 100%; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">';
                $html .= '<img id="' . $idCanvas . '" src="' . \rex_escape($mediaUrl) . '" class="mp3-focuspoint-image" style="max-width: 100%; display: block; cursor: crosshair;">';
                $html .= '<div class="mp3-focuspoint-marker" style="position: absolute; width: 16px; height: 16px; background: rgba(255,0,0,0.5); border: 2px solid red; border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; display: none;"></div>';
                $html .= '</div>';
                $html .= '<small class="form-text text-muted">Klicken auf das Bild um den Focuspoint zu setzen</small>';
            }
        }

        // Manual input fields
        $html .= '<div class="row" style="margin-top: 8px;">';
        $html .= '<div class="col-6">';
        $html .= '<label for="' . $idX . '" class="form-label">X:</label>';
        $html .= '<input type="number" id="' . $idX . '-input" value="' . ($x * 100) . '" min="0" max="100" step="0.1" class="form-control form-control-sm mp3-focuspoint-x-input" style="font-size: 12px;">';
        $html .= '</div>';
        $html .= '<div class="col-6">';
        $html .= '<label for="' . $idY . '" class="form-label">Y:</label>';
        $html .= '<input type="number" id="' . $idY . '-input" value="' . ($y * 100) . '" min="0" max="100" step="0.1" class="form-control form-control-sm mp3-focuspoint-y-input" style="font-size: 12px;">';
        $html .= '</div>';
        $html .= '</div>';

        $html .= '</div>';

        return $html;
    }

    public function renderDisplay(mixed $value, \rex_media $media, int $clangId): string
    {
        if (!is_array($value)) {
            return '<span class="mp3-meta-empty">–</span>';
        }

        $x = (float) ($value['x'] ?? 0.5);
        $y = (float) ($value['y'] ?? 0.5);

        return '<code>X: ' . round($x, 2) . ' | Y: ' . round($y, 2) . '</code>';
    }

    public function normalizeValue(mixed $value): mixed
    {
        if (!is_array($value)) {
            return null;
        }

        $x = (float) ($value['x'] ?? 0.5);
        $y = (float) ($value['y'] ?? 0.5);

        // Clamp to 0-1 range
        $x = max(0, min(1, $x));
        $y = max(0, min(1, $y));

        return ['x' => round($x, 3), 'y' => round($y, 3)];
    }

    /**
     * Get focuspoint from a media file by filename.
     * Returns null if not set.
     */
    public static function getFromMedia(\rex_media $media): ?array
    {
        $data = \FriendsOfRedaxo\Mediapool3Demo\MetainfoJsonStorage::loadFromMedia($media);
        $focuspoint = $data['focuspoint'] ?? null;

        if (!is_array($focuspoint)) {
            return null;
        }

        return [
            'x' => (float) ($focuspoint['x'] ?? 0.5),
            'y' => (float) ($focuspoint['y'] ?? 0.5),
        ];
    }

    /**
     * Get focuspoint from filename.
     */
    public static function getFromFilename(string $filename): ?array
    {
        $data = \FriendsOfRedaxo\Mediapool3Demo\MetainfoJsonStorage::loadFromFilename($filename);
        return self::normalizeFromData($data['focuspoint'] ?? null);
    }

    /**
     * Set focuspoint for a media file.
     */
    public static function setForMedia(\rex_media $media, ?array $focuspoint): bool
    {
        $data = \FriendsOfRedaxo\Mediapool3Demo\MetainfoJsonStorage::loadFromMedia($media);

        if ($focuspoint === null) {
            unset($data['focuspoint']);
        } else {
            $data['focuspoint'] = self::normalizeFromData($focuspoint);
        }

        return \FriendsOfRedaxo\Mediapool3Demo\MetainfoJsonStorage::saveToMedia($media, $data);
    }

    private static function normalizeFromData(?array $data): ?array
    {
        if (!is_array($data)) {
            return null;
        }

        $x = (float) ($data['x'] ?? 0.5);
        $y = (float) ($data['y'] ?? 0.5);
        $x = max(0, min(1, $x));
        $y = max(0, min(1, $y));

        return ['x' => round($x, 3), 'y' => round($y, 3)];
    }
}
