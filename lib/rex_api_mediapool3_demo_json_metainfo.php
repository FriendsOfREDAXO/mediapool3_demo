<?php

/**
 * Mediapool3 Demo – JSON Metainfo Storage API
 *
 * Saves metadata JSON for media files.
 * Backend-only (session auth).
 *
 * POST /api/backend/mediapool3_demo_json_metainfo/{filename}
 * Body: { "field_key": value, ... }
 */
class rex_api_mediapool3_demo_json_metainfo extends rex_api_function
{
    protected $published = true;

    public function execute(): rex_api_result
    {
        rex_response::cleanOutputBuffers();

        if (!rex::getUser()) {
            rex_response::setStatus(rex_response::HTTP_UNAUTHORIZED);
            rex_response::sendJson(['error' => 'Unauthorized']);
            exit;
        }

        $filename = rex_request('filename', 'string', '');
        $method = rex_request::server('REQUEST_METHOD', 'string', 'GET');

        if (!$filename) {
            rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
            rex_response::sendJson(['error' => 'Missing filename']);
            exit;
        }

        $media = rex_media::get($filename);
        if (!$media) {
            rex_response::setStatus(rex_response::HTTP_NOT_FOUND);
            rex_response::sendJson(['error' => 'Media not found']);
            exit;
        }

        try {
            if ('GET' === $method) {
                return $this->handleGet($media);
            }

            if ('POST' === $method || 'PATCH' === $method) {
                return $this->handleSave($media);
            }

            rex_response::setStatus(405);
            rex_response::sendJson(['error' => 'Method not allowed']);
            exit;
        } catch (Exception $e) {
            rex_response::setStatus(rex_response::HTTP_INTERNAL_ERROR);
            rex_response::sendJson(['error' => $e->getMessage()]);
            exit;
        }
    }

    private function handleGet(rex_media $media): rex_api_result
    {
        \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::ensureSchema();
        $data = \FriendsOfRedaxo\Mediapool3Demo\MetainfoJsonStorage::loadFromMedia($media);

        $fieldsData = [];
        foreach (\FriendsOfRedaxo\Mediapool3Demo\MetainfoFieldGroup::getFields() as $field) {
            if ('tags' === $field->getWidgetType()) {
                continue;
            }

            if (!$field->isVisibleForMedia($media)) {
                continue;
            }

            $fieldsData[] = [
                'id' => $field->getId(),
                'key' => $field->getKey(),
                'label' => $field->getLabel(),
                'widget_type' => $field->getWidgetType(),
                'options' => $field->getOptions(),
                'translatable' => $field->isTranslatable(),
                'image_only' => $field->isImageOnly(),
            ];
        }

        $clangs = [];
        foreach (rex_clang::getAll() as $clang) {
            $clangs[] = [
                'id' => $clang->getId(),
                'name' => $clang->getName(),
                'code' => $clang->getCode(),
            ];
        }

        rex_response::sendJson([
            'success' => true,
            'data' => $data,
            'fields' => $fieldsData,
            'clangs' => $clangs,
            'system_tags' => \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::getTagsForFilename($media->getFileName()),
            'system_tag_catalog' => \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::getCatalog(),
        ]);
        exit;
    }

    private function handleSave(rex_media $media): rex_api_result
    {
        \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::ensureSchema();
        $input = $this->getJsonInput();

        if (isset($input['__system_tags']) && is_array($input['__system_tags'])) {
            \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::saveTagsForFilename($media->getFileName(), $input['__system_tags']);
            unset($input['__system_tags']);
        }

        // Load current data
        $data = \FriendsOfRedaxo\Mediapool3Demo\MetainfoJsonStorage::loadFromMedia($media);

        // Get all field definitions to validate input
        $fields = \FriendsOfRedaxo\Mediapool3Demo\MetainfoFieldGroup::getFields();
        $fieldsByKey = [];
        foreach ($fields as $field) {
            if ('tags' === $field->getWidgetType()) {
                continue;
            }
            $fieldsByKey[$field->getKey()] = $field;
        }

        // Process each input value
        foreach ($input as $key => $value) {
            if (!isset($fieldsByKey[$key])) {
                continue; // Ignore unknown fields
            }

            $field = $fieldsByKey[$key];

            // Normalize widget value once and store directly.
            // This supports scalar values, language maps and nested widget payloads.
            $widget = $field->createWidget();
            $normalized = $widget ? $widget->normalizeValue($value) : $value;
            \FriendsOfRedaxo\Mediapool3Demo\MetainfoJsonStorage::setFieldValue($data, $key, $normalized);
        }

        // Save to database
        if (!\FriendsOfRedaxo\Mediapool3Demo\MetainfoJsonStorage::saveToMedia($media, $data)) {
            rex_response::setStatus(rex_response::HTTP_INTERNAL_ERROR);
            rex_response::sendJson(['error' => 'Failed to save data']);
            exit;
        }

        rex_response::sendJson(['success' => true, 'data' => $data]);
        exit;
    }

    /**
     * Get raw JSON input from request body.
     * @return array<string, mixed>
     */
    private function getJsonInput(): array
    {
        $input = file_get_contents('php://input');
        $decoded = json_decode($input, true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Normalize a single value before storage.
     */
    private function normalizeValue(\FriendsOfRedaxo\Mediapool3Demo\MetainfoField $field, mixed $value): mixed
    {
        $widget = $field->createWidget();
        if (!$widget) {
            return $value;
        }
        return $widget->normalizeValue($value);
    }
}
