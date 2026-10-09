#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Publish a blog article by hand — no GEOFlow needed.
 *
 *   php scripts/blog-self-publish.php --title="My guide" --file=guide.html
 *   php scripts/blog-self-publish.php --title="..." --file=guide.html \
 *        --slug=my-guide --excerpt="one-line teaser" --desc="meta description"
 *   php scripts/blog-self-publish.php --unpublish --slug=my-guide
 *
 * --file takes an HTML fragment (just <h2>/<p>/<pre> blocks) or a full HTML
 * document (nav/footer and the first <h1> are stripped — the shell renders
 * its own). The article is registered in catalog.json as published and the
 * blog index + sitemap are rebuilt in the same run, so the new post goes
 * live with homepage links and sitemap coverage immediately.
 */

$opts = getopt('', ['title:', 'file:', 'slug:', 'excerpt:', 'desc:', 'unpublish', 'draft', 'help']);
if (isset($opts['help'])) {
    fwrite(STDOUT, "Usage: php scripts/blog-self-publish.php --title=T --file=F [--slug=S] [--excerpt=E] [--desc=D] [--draft]\n" .
        "       php scripts/blog-self-publish.php --unpublish --slug=S\n");
    exit(0);
}

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
$site = 'https://www.keyoapi.xyz';
$catalogPath = $dataDir . '/catalog.json';
require_once $root . '/scripts/geoflow-article-shell.php';

$catalog = is_file($catalogPath) ? json_decode((string)file_get_contents($catalogPath), true) : [];
if (!is_array($catalog)) {
    $catalog = [];
}

function save_catalog(string $path, array $catalog): void
{
    @mkdir(dirname($path), 0775, true);
    file_put_contents($path, json_encode($catalog, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
}

function random_slug(): string
{
    $alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    $out = '';
    for ($i = 0; $i < 8; $i++) {
        $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $out;
}

function rebuild(string $scriptDir): int
{
    passthru('php ' . escapeshellarg($scriptDir . '/geoflow-rebuild-blog.php'), $code);
    return (int)$code;
}

// --- unpublish ---------------------------------------------------------

if (isset($opts['unpublish'])) {
    $slug = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($opts['slug'] ?? ''));
    if ($slug === '' || empty($catalog[$slug])) {
        fwrite(STDERR, "slug not in catalog: $slug\n");
        exit(1);
    }
    $catalog[$slug]['status'] = 'draft';
    save_catalog($catalogPath, $catalog);
    echo "unpublished: $slug (page stays, marked draft, drops off index/sitemap)\n";
    exit(rebuild(__DIR__));
}

// --- publish -----------------------------------------------------------

$title = trim((string)($opts['title'] ?? ''));
$file = (string)($opts['file'] ?? '');
if ($title === '' || $file === '') {
    fwrite(STDERR, "Refuse: --title and --file are required (see --help)\n");
    exit(2);
}
if (!is_file($file)) {
    fwrite(STDERR, "Refuse: file not found: $file\n");
    exit(2);
}
if (mb_strlen($title) < 8 || mb_strlen($title) > 100) {
    fwrite(STDERR, "Refuse: title should be 8-100 chars\n");
    exit(2);
}

$slug = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($opts['slug'] ?? ''));
if ($slug === '') {
    $slug = random_slug();
}
if (str_contains(strtolower($slug), 'smoke')) {
    fwrite(STDERR, "Refuse: reserved slug\n");
    exit(2);
}

$raw = (string)file_get_contents($file);
$body = geoflow_extract_body($raw);
if (strlen($body) < 200) {
    fwrite(STDERR, "Refuse: body too small (" . strlen($body) . " bytes) — write real content\n");
    exit(2);
}
// Meta description / card excerpt need a real sentence: strip heading
// elements entirely (tag + text) before strip_tags, so "The short answer"
// doesn't prefix the description.
$bodyNoHead = preg_replace('/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i', '', $body) ?? $body;
$plain = trim(strip_tags($bodyNoHead));
$plain = preg_replace('/\s+/u', ' ', $plain) ?? $plain;
function first_sentence(string $text, int $max): string
{
    if (preg_match('/^(.{20,' . $max . '}?)\.\s/su', $text, $m)) {
        return $m[1] . '.';
    }
    return mb_substr($text, 0, $max);
}
$excerpt = trim((string)($opts['excerpt'] ?? ''));
if ($excerpt === '') {
    $excerpt = first_sentence($plain, 140);
}
$desc = trim((string)($opts['desc'] ?? ''));
if ($desc === '') {
    $desc = first_sentence($plain, 155);
}
$isDraft = isset($opts['draft']);
$publishedAt = date('c');
$canonical = $site . '/brand/blog/article/' . $slug . '/';

$html = geoflow_wrap_article($title, $desc, $excerpt, $body, $canonical, $publishedAt, $isDraft);

$articleDir = $blogDir . '/article/' . $slug;
@mkdir($articleDir, 0775, true);
if (file_put_contents($articleDir . '/index.html', $html) === false) {
    fwrite(STDERR, "Refuse: cannot write $articleDir/index.html\n");
    exit(1);
}
@chmod($articleDir . '/index.html', 0664);

$catalog[$slug] = [
    'slug' => $slug,
    'title' => $title,
    'excerpt' => $excerpt,
    'meta_description' => $desc,
    'published_at' => $publishedAt,
    'path' => '/brand/blog/article/' . $slug . '/',
    'remote_id' => 'self-' . $slug,
    'status' => $isDraft ? 'draft' : 'published',
    'is_smoke' => false,
];
save_catalog($catalogPath, $catalog);

$code = rebuild(__DIR__);
if ($code !== 0) {
    fwrite(STDERR, "rebuild failed (exit $code) — article saved, run geoflow-rebuild-blog.php after fixing\n");
    exit(1);
}

$cards = substr_count((string)file_get_contents($blogDir . '/index.html'), 'class="k-card"');
$sitemapLines = count(array_filter(explode("\n", (string)file_get_contents($blogDir . '/sitemap.txt'))));
echo "published: $canonical\n";
printf("index.html cards: %d, sitemap.txt lines: %d\n", $cards, $sitemapLines);
echo $isDraft ? "status: draft (not listed; publish later with the same command minus --draft)\n" : "DONE_SELF_PUBLISH\n";
