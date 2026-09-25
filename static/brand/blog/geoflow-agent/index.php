<?php
declare(strict_types=1);

/**
 * GEOFlow agent — POST /brand/blog/geoflow-agent/v1/articles
 * Signing path (HMAC): /geoflow-agent/v1/articles
 */

header('X-Content-Type-Options: nosniff');

const SIGNING_PATH = '/geoflow-agent/v1/articles';
const ROUTE_SUFFIX = '/geoflow-agent/v1/articles';

function env_path(string $key, string $fallback): string
{
    $v = getenv($key);
    return is_string($v) && $v !== '' ? $v : $fallback;
}

function json_out(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $error): void
{
    json_out($status, ['ok' => false, 'error' => $error]);
}

function read_config(string $path): array
{
    if (!is_file($path)) {
        fail(500, 'agent_not_configured');
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        fail(500, 'agent_not_configured');
    }
    $cfg = json_decode($raw, true);
    if (!is_array($cfg) || empty($cfg['key_id']) || empty($cfg['secret']) || $cfg['key_id'] === 'REPLACE_ME') {
        fail(500, 'agent_not_configured');
    }
    $cfg['clock_skew_seconds'] = max(30, (int)($cfg['clock_skew_seconds'] ?? 300));
    $cfg['site_origin'] = rtrim((string)($cfg['site_origin'] ?? 'https://www.keyoapi.xyz'), '/');
    $cfg['allowed_events'] = $cfg['allowed_events'] ?? ['article.publish'];
    return $cfg;
}

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function ensure_writable_dir(string $dir): void
{
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        fail(500, 'article_storage_not_writable');
    }
    if (!is_writable($dir)) {
        fail(500, 'article_storage_not_writable');
    }
}

function load_json_file(string $path, $default)
{
    if (!is_file($path)) {
        return $default;
    }
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') {
        return $default;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) || is_object($decoded) ? $decoded : $default;
}

function save_json_file(string $path, $data): void
{
    $dir = dirname($path);
    ensure_writable_dir($dir);
    $tmp = $path . '.tmp.' . getmypid();
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false || file_put_contents($tmp, $json . "\n", LOCK_EX) === false) {
        fail(500, 'article_storage_not_writable');
    }
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        fail(500, 'article_storage_not_writable');
    }
}

function verify_signature(array $cfg, string $rawBody): void
{
    $headers = [
        'key_id' => $_SERVER['HTTP_X_GEOFLOW_KEY_ID'] ?? '',
        'timestamp' => $_SERVER['HTTP_X_GEOFLOW_TIMESTAMP'] ?? '',
        'nonce' => $_SERVER['HTTP_X_GEOFLOW_NONCE'] ?? '',
        'idempotency' => $_SERVER['HTTP_X_GEOFLOW_IDEMPOTENCY_KEY'] ?? '',
        'body_sha' => $_SERVER['HTTP_X_GEOFLOW_BODY_SHA256'] ?? '',
        'signature' => $_SERVER['HTTP_X_GEOFLOW_SIGNATURE'] ?? '',
        'event' => $_SERVER['HTTP_X_GEOFLOW_EVENT'] ?? '',
    ];

    foreach (['key_id', 'timestamp', 'nonce', 'idempotency', 'body_sha', 'signature', 'event'] as $k) {
        if ($headers[$k] === '') {
            fail(401, 'missing_signature_headers');
        }
    }

    if (!hash_equals((string)$cfg['key_id'], $headers['key_id'])) {
        fail(403, 'key_id_not_allowed');
    }

    $ts = strtotime($headers['timestamp']);
    if ($ts === false) {
        fail(401, 'invalid_timestamp');
    }
    $skew = (int)$cfg['clock_skew_seconds'];
    if (abs(time() - $ts) > $skew) {
        fail(401, 'timestamp_out_of_range');
    }

    $bodyHash = hash('sha256', $rawBody);
    if (!hash_equals($bodyHash, strtolower($headers['body_sha'])) && !hash_equals($bodyHash, $headers['body_sha'])) {
        fail(401, 'body_hash_mismatch');
    }

    $signingString = implode("\n", [
        'POST',
        SIGNING_PATH,
        $headers['timestamp'],
        $headers['nonce'],
        $bodyHash,
    ]);
    $expected = hash_hmac('sha256', $signingString, (string)$cfg['secret']);
    if (!hash_equals($expected, strtolower($headers['signature'])) && !hash_equals($expected, $headers['signature'])) {
        fail(401, 'signature_invalid');
    }
}

function render_article_html(array $article, string $site, string $canonical): string
{
    $title = (string)($article['title'] ?? 'Untitled');
    $desc = (string)($article['meta_description'] ?? $article['excerpt'] ?? '');
    $excerpt = (string)($article['excerpt'] ?? '');
    $html = (string)($article['content_html'] ?? '');
    if ($html === '' && !empty($article['content'])) {
        // Minimal markdown fallback: escape + paragraphs
        $html = '<p>' . nl2br(h((string)$article['content']), false) . '</p>';
    }
    $published = (string)($article['published_at'] ?? '');

    return '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>' . h($title) . ' — KeyoAPI</title>
<meta name="description" content="' . h($desc) . '" />
<link rel="canonical" href="' . h($canonical) . '" />
<link rel="icon" href="/brand/logo.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/brand/keyo-theme.css" />
</head>
<body>
  <header class="k-nav">
    <a class="k-wordmark" href="/"><img src="/brand/logo.svg" alt="" width="22" height="22" />KeyoAPI</a>
    <nav aria-label="Primary">
      <a href="/pricing-list">Pricing list</a>
      <a href="/pricing">Model Square</a>
      <a href="/brand/keyo-docs.html">Docs</a>
      <a href="/brand/blog/">Blog</a>
      <a href="/brand/faq.html">FAQ</a>
      <a href="/sign-in">Sign in</a>
      <a class="k-nav-cta" href="/sign-up">Get started</a>
    </nav>
  </header>
  <div class="k-page">
    <p class="meta"><a href="/brand/blog/">← Blog</a>' . ($published !== '' ? ' · <time datetime="' . h($published) . '">' . h(substr($published, 0, 10)) . '</time>' : '') . '</p>
    <h1>' . h($title) . '</h1>
    ' . ($excerpt !== '' ? '<p class="sub">' . h($excerpt) . '</p>' : '') . '
    <article class="geoflow-body">
' . $html . '
    </article>
    <p class="k-foot"><a href="/brand/blog/">← Blog</a> · <a href="/">Home</a> · <a href="/brand/keyo-docs.html">Docs</a></p>
  </div>
</body>
</html>
';
}

function rebuild_index_and_sitemap(string $blogDir, string $site, array $catalog): void
{
    $cards = [];
    // Keep hand-written guides first
    $guides = [
        ['href' => '/brand/blog/openai-compatible-api-python.html', 'title' => 'How to use an OpenAI-compatible API in Python', 'meta' => 'Python SDK · custom base URL'],
        ['href' => '/brand/blog/openai-compatible-api-nodejs.html', 'title' => 'How to use an OpenAI-compatible API in Node.js', 'meta' => 'Node SDK · baseURL'],
        ['href' => '/brand/blog/openai-compatible-api-cursor.html', 'title' => 'Use KeyoAPI in Cursor', 'meta' => 'OpenAI Compatible · Base URL'],
    ];
    foreach ($guides as $g) {
        $cards[] = '    <div class="k-card" style="margin-bottom:10px">
      <a href="' . h($g['href']) . '">' . h($g['title']) . '</a>
      <p class="meta" style="margin:6px 0 0">' . h($g['meta']) . '</p>
    </div>';
    }

    // Newest GEO articles first
    $geo = array_values($catalog);
    usort($geo, static function ($a, $b) {
        return strcmp((string)($b['published_at'] ?? ''), (string)($a['published_at'] ?? ''));
    });
    foreach ($geo as $item) {
        if (($item['status'] ?? 'published') !== 'published') {
            continue;
        }
        $href = (string)$item['path'];
        $title = (string)$item['title'];
        $meta = (string)($item['excerpt'] ?? 'GEOFlow');
        if (strlen($meta) > 120) {
            $meta = substr($meta, 0, 117) . '...';
        }
        $cards[] = '    <div class="k-card" style="margin-bottom:10px">
      <a href="' . h($href) . '">' . h($title) . '</a>
      <p class="meta" style="margin:6px 0 0">' . h($meta) . '</p>
    </div>';
    }

    $index = '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>KeyoAPI Blog - OpenAI Compatible API Guides</title>
<meta name="description" content="Tutorials and guides for OpenAI-compatible API integration with Python, Node.js, Cursor and multi-model gateways." />
<link rel="canonical" href="' . h($site) . '/brand/blog/" />
<meta property="og:title" content="KeyoAPI Blog - OpenAI Compatible API Guides" />
<meta property="og:description" content="Tutorials for OpenAI-compatible API integration." />
<meta property="og:url" content="' . h($site) . '/brand/blog/" />
<link rel="icon" href="/brand/logo.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/brand/keyo-theme.css" />
</head>
<body>
  <header class="k-nav">
    <a class="k-wordmark" href="/">
      <img src="/brand/logo.svg" alt="" width="22" height="22" />
      KeyoAPI
    </a>
    <nav aria-label="Primary">
      <a href="/pricing-list">Pricing list</a>
      <a href="/pricing">Model Square</a>
      <a href="/models">Models</a>
      <a href="/free-models">Free models</a>
      <a href="/brand/keyo-docs.html">Docs</a>
      <a href="/brand/faq.html">FAQ</a>
      <a href="/sign-in">Sign in</a>
      <a class="k-nav-cta" href="/sign-up">Get started</a>
    </nav>
  </header>
  <div class="k-page">
    <h1>Blog</h1>
    <p class="sub">Guides for OpenAI-compatible APIs, custom base URLs, and multi-model gateways.</p>
' . implode("\n", $cards) . '
    <p class="k-foot"><a href="/">← KeyoAPI home</a> · <a href="/pricing-list">Pricing list</a> · <a href="/free-models">Free models</a></p>
  </div>
</body>
</html>
';

    if (file_put_contents($blogDir . '/index.html', $index) === false) {
        fail(500, 'article_storage_not_writable');
    }

    $lines = [
        $site . '/brand/blog/',
        $site . '/brand/blog/openai-compatible-api-python.html',
        $site . '/brand/blog/openai-compatible-api-nodejs.html',
        $site . '/brand/blog/openai-compatible-api-cursor.html',
    ];
    foreach ($geo as $item) {
        if (($item['status'] ?? 'published') !== 'published') {
            continue;
        }
        $lines[] = $site . $item['path'];
    }
    $lines = array_values(array_unique($lines));
    if (file_put_contents($blogDir . '/sitemap.txt', implode("\n", $lines) . "\n") === false) {
        fail(500, 'article_storage_not_writable');
    }
}

// --- main ---

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    fail(405, 'method_not_allowed');
}

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
if (!str_ends_with(rtrim($uri, '/'), rtrim(ROUTE_SUFFIX, '/')) && !str_contains($uri, ROUTE_SUFFIX)) {
    // Allow exact match after rewrite; still require articles endpoint
    if (!preg_match('#/geoflow-agent/v1/articles/?$#', $uri)) {
        fail(404, 'not_found');
    }
}

$root = dirname(__DIR__, 4); // .../static/brand/blog/geoflow-agent -> repo root if layout matches
// Prefer env; fallbacks for /opt/ai-relay layout
$blogDir = env_path('GEOFLOW_BLOG_DIR', dirname(__DIR__)); // static/brand/blog
$dataDir = env_path('GEOFLOW_DATA_DIR', dirname($blogDir, 3) . '/data/geoflow-agent');
$configPath = env_path('GEOFLOW_CONFIG_PATH', $dataDir . '/config.json');

$cfg = read_config($configPath);
$rawBody = file_get_contents('php://input');
if ($rawBody === false) {
    fail(422, 'invalid_article_payload');
}

verify_signature($cfg, $rawBody);

$eventHeader = $_SERVER['HTTP_X_GEOFLOW_EVENT'] ?? '';
$idemKey = $_SERVER['HTTP_X_GEOFLOW_IDEMPOTENCY_KEY'] ?? '';

ensure_writable_dir($dataDir);
ensure_writable_dir($blogDir . '/article');

$idemPath = $dataDir . '/idempotency.json';
$idem = load_json_file($idemPath, []);
if (!is_array($idem)) {
    $idem = [];
}
if (isset($idem[$idemKey]) && is_array($idem[$idemKey])) {
    $prev = $idem[$idemKey];
    json_out(200, [
        'ok' => true,
        'remote_id' => $prev['remote_id'],
        'remote_url' => $prev['remote_url'],
        'static' => ['idempotent' => true],
    ]);
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    fail(422, 'invalid_article_payload');
}

$event = (string)($payload['event'] ?? $eventHeader);
if (!in_array($event, $cfg['allowed_events'], true) || $event !== 'article.publish') {
    fail(422, 'unsupported_event');
}

$article = $payload['article'] ?? null;
if (!is_array($article) || empty($article['slug']) || empty($article['title'])) {
    fail(422, 'invalid_article_payload');
}

$slug = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$article['slug']);
if ($slug === '' || $slug !== (string)$article['slug']) {
    fail(422, 'invalid_article_payload');
}

$site = $cfg['site_origin'];
$remotePath = '/brand/blog/article/' . $slug . '/';
$remoteUrl = $site . $remotePath;
$remoteId = 'geoflow-' . $slug;
$articleDir = $blogDir . '/article/' . $slug;
ensure_writable_dir($articleDir);

// Optional assets
$assets = $payload['assets']['images'] ?? [];
$savedAssets = [];
if (is_array($assets) && $assets) {
    $assetDir = $articleDir . '/assets';
    ensure_writable_dir($assetDir);
    foreach ($assets as $i => $img) {
        if (!is_array($img) || empty($img['content_base64']) || empty($img['filename'])) {
            continue;
        }
        $name = basename((string)$img['filename']);
        $name = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name) ?: ('image-' . $i . '.bin');
        $bin = base64_decode((string)$img['content_base64'], true);
        if ($bin === false) {
            continue;
        }
        $dest = $assetDir . '/' . $name;
        if (file_put_contents($dest, $bin) === false) {
            fail(500, 'article_storage_not_writable');
        }
        $savedAssets[] = $remotePath . 'assets/' . $name;
    }
}

$html = render_article_html($article, $site, $remoteUrl);
if (file_put_contents($articleDir . '/index.html', $html) === false) {
    fail(500, 'article_storage_not_writable');
}

$catalogPath = $dataDir . '/catalog.json';
$catalog = load_json_file($catalogPath, []);
if (!is_array($catalog)) {
    $catalog = [];
}
$catalog[$slug] = [
    'slug' => $slug,
    'title' => (string)$article['title'],
    'excerpt' => (string)($article['excerpt'] ?? ''),
    'published_at' => (string)($article['published_at'] ?? ''),
    'path' => $remotePath,
    'remote_id' => $remoteId,
    'status' => (string)($article['status'] ?? 'published'),
];
save_json_file($catalogPath, $catalog);
rebuild_index_and_sitemap($blogDir, $site, $catalog);

$idem[$idemKey] = [
    'remote_id' => $remoteId,
    'remote_url' => $remoteUrl,
    'slug' => $slug,
    'saved_at' => gmdate('c'),
];
save_json_file($idemPath, $idem);

json_out(200, [
    'ok' => true,
    'remote_id' => $remoteId,
    'remote_url' => $remoteUrl,
    'static' => [
        'article_path' => $articleDir . '/index.html',
        'assets' => $savedAssets,
    ],
]);
