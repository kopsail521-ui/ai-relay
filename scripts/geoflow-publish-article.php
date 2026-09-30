#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Manually publish a GEOFlow draft onto the public blog index.
 *
 *   php scripts/geoflow-publish-article.php --slug=ncx234u2 --tdk-ok --keyword-volume=170 --ack-previous-batch
 */

$opts = getopt('', [
    'slug:',
    'tdk-ok',
    'keyword-volume:',
    'ack-previous-batch',
    'force',
    'unpublish',
    'help',
]);

if (isset($opts['help']) || empty($opts['slug'])) {
    fwrite(STDERR, "Usage: php scripts/geoflow-publish-article.php --slug=ID --tdk-ok --keyword-volume=N [--ack-previous-batch]\n");
    exit(isset($opts['help']) ? 0 : 2);
}

$slug = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$opts['slug']);
if ($slug === '' || str_contains(strtolower($slug), 'smoke')) {
    fwrite(STDERR, "Refuse: invalid or smoke slug\n");
    exit(2);
}

$blogDir = getenv('GEOFLOW_BLOG_DIR') ?: '';
$dataDir = getenv('GEOFLOW_DATA_DIR') ?: '';
if ($blogDir === '' || $dataDir === '') {
    if (is_dir('/opt/ai-relay/data/geoflow-agent')) {
        $blogDir = '/opt/ai-relay/static/brand/blog';
        $dataDir = '/opt/ai-relay/data/geoflow-agent';
    } else {
        $root = dirname(__DIR__);
        $blogDir = $root . '/static/brand/blog';
        $dataDir = $root . '/data/geoflow-agent';
    }
}

$catalogPath = $dataDir . '/catalog.json';
$gatePath = $dataDir . '/gate.json';
$catalog = is_file($catalogPath) ? json_decode((string)file_get_contents($catalogPath), true) : [];
if (!is_array($catalog) || empty($catalog[$slug])) {
    fwrite(STDERR, "Slug not in catalog: $slug\n");
    exit(1);
}

$gate = [
    'auto_publish' => false,
    'sitemap_include_articles' => false,
    'max_publish_per_week' => 5,
    'require_previous_batch_ok' => true,
    'previous_batch_ok' => false,
];
if (is_file($gatePath)) {
    $g = json_decode((string)file_get_contents($gatePath), true);
    if (is_array($g)) {
        $gate = array_merge($gate, $g);
    }
}

if (isset($opts['ack-previous-batch'])) {
    $gate['previous_batch_ok'] = true;
    @mkdir($dataDir, 0775, true);
    file_put_contents($gatePath, json_encode($gate, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
    fwrite(STDOUT, "gate.previous_batch_ok=true\n");
}

$rebuild = __DIR__ . '/geoflow-rebuild-blog.php';

if (isset($opts['unpublish'])) {
    $catalog[$slug]['status'] = 'draft';
    file_put_contents($catalogPath, json_encode($catalog, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
    passthru('php ' . escapeshellarg($rebuild) . ' --rewrite-html=' . escapeshellarg($slug), $code);
    exit((int)$code);
}

if (!isset($opts['tdk-ok'])) {
    fwrite(STDERR, "Refuse: pass --tdk-ok after human TDK review\n");
    exit(2);
}

$vol = isset($opts['keyword-volume']) ? (int)$opts['keyword-volume'] : -1;
if (!isset($opts['force']) && $vol < 10) {
    fwrite(STDERR, "Refuse: --keyword-volume must be >= 10 (or use --force)\n");
    exit(2);
}

if (!empty($gate['require_previous_batch_ok']) && empty($gate['previous_batch_ok'])) {
    fwrite(STDERR, "Refuse: previous_batch_ok=false — confirm GSC then pass --ack-previous-batch\n");
    exit(2);
}

$weekAgo = time() - 7 * 86400;
$publishedThisWeek = 0;
foreach ($catalog as $row) {
    if (($row['status'] ?? '') !== 'published') {
        continue;
    }
    $ts = strtotime((string)($row['listed_at'] ?? $row['published_at'] ?? '')) ?: 0;
    if ($ts >= $weekAgo) {
        $publishedThisWeek++;
    }
}
$max = (int)($gate['max_publish_per_week'] ?? 5);
if (($catalog[$slug]['status'] ?? '') !== 'published' && $publishedThisWeek >= $max) {
    fwrite(STDERR, "Refuse: weekly publish cap {$max} reached ({$publishedThisWeek})\n");
    exit(2);
}

$title = (string)($catalog[$slug]['title'] ?? '');
$ex = (string)($catalog[$slug]['excerpt'] ?? '');
$ex = preg_replace('/\bMeta\s*description\s*:\s*/iu', '', $ex) ?? $ex;
if ($title !== '' && strncasecmp(trim($ex), $title, strlen($title)) === 0) {
    $ex = trim(substr(trim($ex), strlen($title)));
    $ex = preg_replace('/^[\s:;,\-—–|]+/u', '', $ex) ?? $ex;
}
$catalog[$slug]['excerpt'] = trim($ex);
$catalog[$slug]['status'] = 'published';
$catalog[$slug]['listed_at'] = gmdate('c');
$catalog[$slug]['keyword_volume'] = $vol;
$catalog[$slug]['tdk_ok'] = true;
file_put_contents($catalogPath, json_encode($catalog, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");

// After publishing one, require fresh GSC ack before next batch
$gate['previous_batch_ok'] = false;
file_put_contents($gatePath, json_encode($gate, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");

passthru('php ' . escapeshellarg($rebuild) . ' --rewrite-html=' . escapeshellarg($slug), $code);
fwrite(STDOUT, "published {$slug} (weekly count now includes this; previous_batch_ok reset to false)\n");
exit((int)$code);
