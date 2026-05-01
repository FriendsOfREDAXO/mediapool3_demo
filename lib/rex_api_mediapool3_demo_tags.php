<?php

/**
 * Mediapool3 Demo - system tags API.
 */
class rex_api_mediapool3_demo_tags extends rex_api_function
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

        $method = rex_request::server('REQUEST_METHOD', 'string', 'GET');
        $filename = rex_request('filename', 'string', '');
        $filenamesRaw = rex_request('filenames', 'string', '');

        try {
            if ('GET' === $method) {
                $catalog = \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::getCatalog();
                $tags = [];
                $fileTags = [];

                if ('' !== $filenamesRaw) {
                    $filenames = array_values(array_filter(array_map('trim', explode(',', $filenamesRaw)), static fn (string $v): bool => '' !== $v));
                    if ([] !== $filenames) {
                        $fileTags = \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::getTagsForFilenames($filenames);
                    }
                }

                if ('' !== $filename) {
                    $media = rex_media::get($filename);
                    if (!$media) {
                        rex_response::setStatus(rex_response::HTTP_NOT_FOUND);
                        rex_response::sendJson(['error' => 'Media not found']);
                        exit;
                    }

                    $tags = \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::getTagsForFilename($filename);
                }

                rex_response::sendJson([
                    'success' => true,
                    'catalog' => $catalog,
                    'tags' => $tags,
                    'file_tags' => $fileTags,
                ]);
                exit;
            }

            if ('POST' === $method || 'PATCH' === $method) {
                $input = $this->getJsonInput();

                $action = trim((string) ($input['action'] ?? ''));
                if ('' !== $action) {
                    if ('collection_create' === $action) {
                        $name = trim((string) ($input['name'] ?? ''));
                        $color = trim((string) ($input['color'] ?? '#4a90d9'));
                        if ('' === $name) {
                            rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
                            rex_response::sendJson(['error' => 'Missing collection name']);
                            exit;
                        }

                        \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::ensureCatalogTag($name, $color);

                        rex_response::sendJson([
                            'success' => true,
                            'catalog' => \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::getCatalog(),
                            'affected_files' => 0,
                        ]);
                        exit;
                    }

                    if ('collection_rename' === $action) {
                        $oldName = trim((string) ($input['old_name'] ?? ''));
                        $newName = trim((string) ($input['new_name'] ?? ''));
                        if ('' === $oldName || '' === $newName) {
                            rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
                            rex_response::sendJson(['error' => 'Missing old_name/new_name']);
                            exit;
                        }

                        $affected = \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::renameCatalogTag($oldName, $newName);

                        rex_response::sendJson([
                            'success' => true,
                            'catalog' => \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::getCatalog(),
                            'affected_files' => $affected,
                        ]);
                        exit;
                    }

                    if ('collection_delete' === $action) {
                        $name = trim((string) ($input['name'] ?? ''));
                        if ('' === $name) {
                            rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
                            rex_response::sendJson(['error' => 'Missing name']);
                            exit;
                        }

                        $affected = \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::deleteCatalogTag($name);

                        rex_response::sendJson([
                            'success' => true,
                            'catalog' => \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::getCatalog(),
                            'affected_files' => $affected,
                        ]);
                        exit;
                    }

                    rex_response::setStatus(rex_response::HTTP_BAD_REQUEST);
                    rex_response::sendJson(['error' => 'Unknown action']);
                    exit;
                }

                if ('' === $filename) {
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

                $tags = is_array($input['tags'] ?? null) ? $input['tags'] : [];

                \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::saveTagsForFilename($filename, $tags);

                rex_response::sendJson([
                    'success' => true,
                    'catalog' => \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::getCatalog(),
                    'tags' => \FriendsOfRedaxo\Mediapool3Demo\SystemTagManager::getTagsForFilename($filename),
                ]);
                exit;
            }

            rex_response::setStatus(405);
            rex_response::sendJson(['error' => 'Method not allowed']);
            exit;
        } catch (Throwable $e) {
            rex_response::setStatus(rex_response::HTTP_INTERNAL_ERROR);
            rex_response::sendJson(['error' => $e->getMessage()]);
            exit;
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function getJsonInput(): array
    {
        $input = file_get_contents('php://input');
        $decoded = json_decode($input, true);
        return is_array($decoded) ? $decoded : [];
    }
}
