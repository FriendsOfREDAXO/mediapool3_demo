<?php

namespace FriendsOfRedaxo\Mediapool3Demo\Widgets;

use FriendsOfRedaxo\Mediapool3Demo\MetainfoWidget;

/**
 * Tags widget for simple tagging.
 * Stores as array: ["tag1", "tag2", ...]
 */
class TagsWidget extends MetainfoWidget
{
    public function renderEdit(mixed $value, \rex_media $media, int $clangId): string
    {
        $tags = [];
        if (is_array($value)) {
            $tags = array_values(array_filter(array_map('strval', $value)));
        } elseif (is_string($value)) {
            $tags = array_values(array_filter(array_map('trim', explode(',', $value))));
        }

        $id = $this->getFieldId();
        $name = $this->getFieldName();

        $html = '<div class="mp3-meta-field mp3-meta-field-tags">';
        $html .= '<label for="' . $id . '" class="mp3-meta-label">' . $this->escape($this->getFieldLabel()) . '</label>';

        // Hidden input for JSON value
        $html .= '<input type="hidden" id="' . $id . '" name="' . $name . '" value="' . $this->escape(json_encode($tags)) . '" class="mp3-tags-value">';

        // Tag list display
        $html .= '<div class="mp3-tags-display" style="margin-bottom: 8px;">';
        foreach ($tags as $tag) {
            $html .= '<span class="badge bg-secondary mp3-tag" data-tag="' . $this->escape($tag) . '">';
            $html .= $this->escape($tag);
            $html .= ' <i class="fa-solid fa-xmark mp3-tag-remove" style="cursor: pointer; margin-left: 4px;"></i>';
            $html .= '</span> ';
        }
        $html .= '</div>';

        // Input for adding new tags
        $html .= '<div class="input-group input-group-sm">';
        $html .= '<input type="text" class="form-control mp3-tags-input" placeholder="Tag eingeben + Enter" style="font-size: 12px;">';
        $html .= '<button type="button" class="btn btn-outline-secondary mp3-tags-add-btn"><i class="fa-solid fa-plus"></i></button>';
        $html .= '</div>';

        $html .= '</div>';

        return $html;
    }

    public function renderDisplay(mixed $value, \rex_media $media, int $clangId): string
    {
        $tags = [];
        if (is_array($value)) {
            $tags = array_values(array_filter(array_map('strval', $value)));
        } elseif (is_string($value)) {
            $tags = array_values(array_filter(array_map('trim', explode(',', $value))));
        }

        if (empty($tags)) {
            return '<span class="mp3-meta-empty">–</span>';
        }

        $html = '<div>';
        foreach ($tags as $tag) {
            $html .= '<span class="badge bg-info">' . $this->escape($tag) . '</span> ';
        }
        $html .= '</div>';

        return $html;
    }

    public function normalizeValue(mixed $value): mixed
    {
        $tags = [];

        if (is_array($value)) {
            $tags = array_values(array_filter(array_map('trim', array_filter(array_map('strval', $value)))));
        } elseif (is_string($value)) {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                $tags = array_values(array_filter(array_map('trim', array_filter(array_map('strval', $decoded)))));
            } else {
                $tags = array_values(array_filter(array_map('trim', explode(',', $value))));
            }
        }

        return empty($tags) ? null : $tags;
    }
}
