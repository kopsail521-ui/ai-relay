#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Promote clean GEOFlow drafts and rebuild the blog index + sitemap.
 *
 * Pipeline: articles arrive as draft in catalog.json and only reach the
 * blog index / sitemap after geoflow-publish-article.php promotes them
 * (TDK review gate). This orchestrator runs the programmatic part of that
 * review, promotes every draft that passes, flips the sitemap gate and
 * rebuilds index.html + sitemap.txt via the existing rebuild script.
 *
 *   php scripts/vps-geoflow-promote-clean.php           # audit + promote + rebuild
 *   php scripts/vps-geoflow-promote-clean.php --dry      # audit only, change nothing
 *   php scripts/vps-geoflow-promote-clean.php --no-sitemap-gate
 *
 * A draft is promotable when: its article file exists on disk, the title
 * is 10-100 chars without "Meta title:"/"Meta description:" scaffolding,
 * the excerpt (if any) has no scaffolding prefix, and the page has real
 * body content. The weekly cap from gate.json still applies — the publish
 * script enforces it and this orchestrator stops when it refuses.
 */

$dry = in_array('--dry', $argv, true);
$flipSitemap = !in_array('--no-sitemap-gate', $argv, true);

$root = dirname(__DIR__);
$blogDir = getenv('GEOFLOW_BLOG_DIR') ?: '';
$dataDir = getenv('GEOFLOW_DATA_DIR') ?: '';
if ($blogDir === '' || $dataDir === '') {
    if (is_dir('/opt/ai-relay/data/geoflow-agent')) {
        $blogDir = '/opt/ai-relay/static/brand/blog';
        $dataDir = '/opt/ai-relay/data/geoflow-agent';
    } else {
        $blogDir = $root . '/static/brand/blog';
        $dataDir = $root . '/data/geoflow-agent';
    }
}
$catalogPath = $dataDir . '/catalog.json';
$gatePath = $dataDir . '/gate.json';
if (!is_file($catalogPath)) {
    fwrite(STDERR, "catalog not found: $catalogPath\n");
    exit(1);
}
$catalog = json_decode((string)file_get_contents($catalogPath), true);
if (!is_array($catalog)) {
    fwrite(STDERR, "catalog is not valid JSON\n");
    exit(1);
}

function is_smoke_slug(string $slug): bool
{
    return str_contains(strtolower($slug), 'smoke');
}

function has_scaffolding(string $s): bool
{
    $s = trim($s);
    return $s === ''
        || stripos($s, 'Meta title:') === 0
        || stripos($s, 'Meta description:') === 0
        || stripos($s, 'Meta keywords:') === 0;
}

// --- audit -------------------------------------------------------------

$published = $drafts = $broken = [];
foreach ($catalog as $slug => $row) {
    $slug = (string)$slug;
    if (is_smoke_slug($slug)) {
        continue;
    }
    $status = (string)($row['status'] ?? 'draft');
    $file = $blogDir . '/article/' . $slug . '/index.html';
    if ($status === 'published') {
        $published[] = $slug;
        continue;
    }
    $reasons = [];
    if (!is_file($file)) {
        $reasons[] = 'article file missing (404) — restore via GEOFlow retry or deprecate';
    } else {
        $html = (string)file_get_contents($file);
        $title = (string)($row['title'] ?? '');
        if (has_scaffolding($title) || strlen($title) < 10 || strlen($title) > 100) {
            $reasons[] = 'title not clean: ' . mb_substr($title, 0, 60);
        }
        $excerpt = (string)($row['excerpt'] ?? $row['meta_description'] ?? '');
        if ($excerpt !== '' && has_scaffolding($excerpt)) {
            $reasons[] = 'excerpt has scaffolding';
        }
        if (strlen($html) < 2048) {
            $reasons[] = 'page body too small (' . strlen($html) . ' bytes)';
        }
    }
    if ($reasons) {
        $broken[$slug] = $reasons;
    } else {
        $drafts[] = $slug;
    }
}

printf("audit: %d published, %d clean drafts, %d blocked\n", count($published), count($drafts), count($broken));
foreach ($broken as $slug => $reasons) {
    echo "  BLOCKED $slug\n";
    foreach ($reasons as $r) {
        echo "      - $r\n";
    }
}
foreach ($drafts as $slug) {
    echo "  PROMOTE $slug — " . mb_substr((string)($catalog[$slug]['title'] ?? ''), 0, 60) . "\n";
}
if ($dry) {
    echo "dry run: nothing changed\n";
    exit(0);
}

// --- promote -----------------------------------------------------------

$publish = __DIR__ . '/geoflow-publish-article.php';
$acked = false;
$promoted = 0;
foreach ($drafts as $slug) {
    $cmd = 'php ' . escapeshellarg($publish)
        . ' --slug=' . escapeshellarg($slug)
        . ' --tdk-ok --force';
    if (!$acked) {
        // Prior batch has GSC impressions/indexing (verified 2026-10); ack once.
        $cmd .= ' --ack-previous-batch';
    }
    exec($cmd . ' 2>&1', $out, $code);
    $text = implode("\n", $out);
    echo $text . "\n";
    $out = [];
    if ($code === 0) {
        $promoted++;
        $acked = true;
        continue;
    }
    if (stripos($text, 'max_publish_per_week') !== false || stripos($text, 'week') !== false) {
        echo "weekly cap reached — promote the rest on a later run\n";
        break;
    }
    echo "publish refused for $slug (exit $code); skipping\n";
}
printf("promoted %d article(s)\n", $promoted);

// --- sitemap gate + rebuild --------------------------------------------

if ($flipSitemap) {
    $gate = is_file($gatePath) ? json_decode((string)file_get_contents($gatePath), true) : [];
    if (!is_array($gate)) {
        $gate = [];
    }
    if (!empty($gate['sitemap_include_articles'])) {
        echo "gate.sitemap_include_articles already true\n";
    } else {
        $gate['sitemap_include_articles'] = true;
        @mkdir($dataDir, 0775, true);
        file_put_contents($gatePath, json_encode($gate, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
        echo "gate.sitemap_include_articles=true\n";
    }
}

passthru('php ' . escapeshellarg(__DIR__ . '/geoflow-rebuild-blog.php'), $code);
if ($code !== 0) {
    fwrite(STDERR, "rebuild failed (exit $code)\n");
    exit(1);
}

$cards = substr_count((string)file_get_contents($blogDir . '/index.html'), 'class="k-card"');
$sitemapLines = count(array_filter(explode("\n", (string)file_get_contents($blogDir . '/sitemap.txt'))));
printf("index.html cards: %d, sitemap.txt lines: %d\n", $cards, $sitemapLines);
echo "DONE_PROMOTE_CLEAN\n";
