<?php

/**
 * Flat category list + category move endpoint.
 *
 * GET  → returns all media categories as a flat, sorted list with full path labels
 * PATCH ?id=<int>&parent_id=<int> → moves a category to a new parent
 */
class rex_api_mediapool3_demo_categories extends rex_api_function
{
    protected $published = true;

    public function execute(): rex_api_result
    {
        rex_response::cleanOutputBuffers();

        if (!rex_backend_login::hasSession()) {
            rex_response::sendJson(['error' => 'Unauthorized']);
            exit;
        }

        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

        if ($method === 'PATCH' || $method === 'POST') {
            $this->handleMove();
        } else {
            $this->handleList();
        }

        exit;
    }

    private function handleList(): void
    {
        $sql = rex_sql::factory();
        $cats = $sql->getArray(
            'SELECT id, name, parent_id FROM ' . rex::getTablePrefix() . 'media_category ORDER BY parent_id, name',
        );

        // Build lookup
        $byId = [];
        foreach ($cats as $c) {
            $byId[(int) $c['id']] = $c;
        }

        // Build a flat ordered list with indented path labels
        $result = [];
        $this->collectChildren($byId, 0, $result, '', 0);

        rex_response::sendJson(['categories' => $result]);
    }

    /**
     * @param array<int, array<string, mixed>> $byId
     * @param list<array<string, mixed>>       $result
     */
    private function collectChildren(array $byId, int $parentId, array &$result, string $prefix, int $depth): void
    {
        foreach ($byId as $id => $c) {
            if ((int) $c['parent_id'] !== $parentId) {
                continue;
            }
            $label = $prefix . (string) $c['name'];
            $result[] = [
                'id' => $id,
                'name' => (string) $c['name'],
                'parent_id' => (int) $c['parent_id'],
                'label' => $label,
                'depth' => $depth,
            ];
            $this->collectChildren($byId, $id, $result, $prefix . '  ', $depth + 1);
        }
    }

    private function handleMove(): void
    {
        $body = (string) file_get_contents('php://input');
        $data = json_decode($body, true);
        if (!is_array($data)) {
            $data = $_POST;
        }

        $catId = (int) ($data['id'] ?? 0);
        $newParentId = (int) ($data['parent_id'] ?? 0);

        if ($catId <= 0) {
            rex_response::sendJson(['error' => 'Missing id']);
            exit;
        }

        $cat = rex_media_category::get($catId);
        if (!$cat) {
            rex_response::sendJson(['error' => 'Category not found']);
            exit;
        }

        // Prevent moving to own subtree
        if ($newParentId > 0 && $this->isDescendant($catId, $newParentId)) {
            rex_response::sendJson(['error' => 'Cannot move a category into its own subtree']);
            exit;
        }

        if ($newParentId > 0 && !rex_media_category::get($newParentId)) {
            rex_response::sendJson(['error' => 'Target parent category not found']);
            exit;
        }

        $sql = rex_sql::factory();
        $sql->setTable(rex::getTablePrefix() . 'media_category');
        $sql->setWhere(['id' => $catId]);
        $sql->setValue('parent_id', $newParentId);
        $sql->addGlobalUpdateFields();
        $sql->update();

        rex_media_cache::deleteCategory($catId);
        if ($cat->getParentId() > 0) {
            rex_media_cache::deleteCategory($cat->getParentId());
        }
        if ($newParentId > 0) {
            rex_media_cache::deleteCategory($newParentId);
        }

        rex_response::sendJson(['success' => true, 'id' => $catId, 'parent_id' => $newParentId]);
    }

    private function isDescendant(int $ancestorId, int $targetId): bool
    {
        $sql = rex_sql::factory();
        $cats = $sql->getArray(
            'SELECT id, parent_id FROM ' . rex::getTablePrefix() . 'media_category',
        );

        $byId = [];
        foreach ($cats as $c) {
            $byId[(int) $c['id']] = (int) $c['parent_id'];
        }

        $current = $targetId;
        $visited = [];
        while ($current > 0) {
            if ($current === $ancestorId) {
                return true;
            }
            if (isset($visited[$current])) {
                break; // Cycle protection
            }
            $visited[$current] = true;
            $current = $byId[$current] ?? 0;
        }

        return false;
    }
}
