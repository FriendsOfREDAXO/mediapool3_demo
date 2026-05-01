<?php

namespace FriendsOfRedaxo\Mediapool3Demo;

/**
 * Base class for all metainfo widgets.
 * Widgets render editable UI elements for different field types.
 */
abstract class MetainfoWidget
{
    protected MetainfoField $field;

    public function __construct(MetainfoField $field)
    {
        $this->field = $field;
    }

    /**
     * Create widget instance by type.
     */
    public static function createByType(string $type, MetainfoField $field): ?self
    {
        $widgetClass = match ($type) {
            'text' => Widgets\TextWidget::class,
            'textarea' => Widgets\TextareaWidget::class,
            'tinymce' => Widgets\TinyMceWidget::class,
            'focuspoint' => Widgets\FocuspointWidget::class,
            'alt' => Widgets\AltFieldWidget::class,
            'media_link' => Widgets\MediaLinkWidget::class,
            default => null,
        };

        if (!$widgetClass || !class_exists($widgetClass)) {
            return null;
        }

        return new $widgetClass($field);
    }

    /**
     * Render the widget HTML for editing.
     * @param mixed $value Current field value (scalar, array, or nested structure)
     * @param \rex_media $media Media file context
     * @param int $clangId Current language ID (for translatable fields)
     */
    abstract public function renderEdit(mixed $value, \rex_media $media, int $clangId): string;

    /**
     * Render the widget HTML for display (read-only view).
     */
    abstract public function renderDisplay(mixed $value, \rex_media $media, int $clangId): string;

    /**
     * Validate and normalize input value before saving.
     * @return mixed Normalized value (or null to remove field)
     */
    public function normalizeValue(mixed $value): mixed
    {
        return $value;
    }

    /**
     * Get field key.
     */
    protected function getFieldKey(): string
    {
        return $this->field->getKey();
    }

    /**
     * Get field label.
     */
    protected function getFieldLabel(): string
    {
        return $this->field->getLabel();
    }

    /**
     * Get field options.
     */
    protected function getFieldOptions(): array
    {
        return $this->field->getOptions();
    }

    /**
     * Check if field is translatable.
     */
    protected function isTranslatable(): bool
    {
        return $this->field->isTranslatable();
    }

    /**
     * Escape HTML for safe output.
     */
    protected function escape(mixed $value): string
    {
        if (is_array($value)) {
            $value = json_encode($value);
        }
        return \rex_escape((string) $value);
    }

    /**
     * Generate unique HTML ID for this field (and language if applicable).
     */
    protected function getFieldId(int $clangId = 0): string
    {
        $id = 'mp3-meta-' . preg_replace('/[^a-z0-9_-]/i', '_', $this->getFieldKey());
        if ($clangId > 0) {
            $id .= '-' . $clangId;
        }
        return $id;
    }

    /**
     * Generate form input name for this field (and language if applicable).
     */
    protected function getFieldName(int $clangId = 0): string
    {
        $name = 'mp3_meta_' . $this->getFieldKey();
        if ($clangId > 0) {
            $name .= '[' . $clangId . ']';
        }
        return $name;
    }
}
