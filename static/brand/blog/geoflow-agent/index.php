<?php
declare(strict_types=1);

/**
 * GEOFlow agent — POST /brand/blog/geoflow-agent/v1/articles
 * Signing path (HMAC): /geoflow-agent/v1/articles
 *
 * Gate (default):
 * - New articles land as draft (not on blog index / not in sitemap)
 * - Smoke / test slugs never listed
 * - Manual publish via scripts/geoflow-publish-article.php
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
    // Publishing gate defaults (override in config.json / gate.json)
    $cfg['auto_publish'] = (bool)($cfg['auto_publish'] ?? false);
    $cfg['sitemap_include_articles'] = (bool)($cfg['sitemap_include_articles'] ?? false);
    $cfg['max_publish_per_week'] = max(1, (int)($cfg['max_publish_per_week'] ?? 5));
    $cfg['require_previous_batch_ok'] = (bool)($cfg['require_previous_batch_ok'] ?? true);
    return $cfg;
}

function load_gate(string $dataDir, array $cfg): array
{
    $path = $dataDir . '/gate.json';
    $gate = [
        'auto_publish' => (bool)($cfg['auto_publish'] ?? false),
        'sitemap_include_articles' => (bool)($cfg['sitemap_include_articles'] ?? false),
        'max_publish_per_week' => (int)($cfg['max_publish_per_week'] ?? 5),
        'require_previous_batch_ok' => (bool)($cfg['require_previous_batch_ok'] ?? true),
        'previous_batch_ok' => false,
        'notes' => 'Set previous_batch_ok=true only after prior batch has GSC impressions/indexing. Articles stay draft until scripts/geoflow-publish-article.php.',
    ];
    if (is_file($path)) {
        $raw = json_decode((string)file_get_contents($path), true);
        if (is_array($raw)) {
            $gate = array_merge($gate, $raw);
        }
    } else {
        ensure_writable_dir($dataDir);
        file_put_contents($path, json_encode($gate, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
    }
    return $gate;
}

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$geoflowShell = dirname(__DIR__, 4) . '/scripts/geoflow-article-shell.php';
if (!is_file($geoflowShell)) {
    $geoflowShell = '/opt/ai-relay/scripts/geoflow-article-shell.php';
}
require_once $geoflowShell;

function is_smoke_slug(string $slug): bool
{
    $s = strtolower($slug);
    return str_contains($s, 'smoke') || str_contains($s, 'test-only') || preg_match('/(^|-)test$/', $s) === 1;
}

function norm_key(string $t): string
{
    $t = html_entity_decode($t, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = mb_strtolower(trim($t));
    $t = str_replace(['—', '–', '-', ':', '|'], ' ', $t);
    $t = preg_replace('/\s+/u', ' ', $t) ?? $t;
    return trim($t);
}

/**
 * Strip GEOFlow template leaks / title echo. Never mid-word truncate.
 * $maxLen 0 = soft 300; otherwise word-boundary cut.
 */
function clean_meta_text(string $raw, string $title = '', int $maxLen = 160): string
{
    $s = html_entity_decode(trim($raw), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($s === '') {
        return '';
    }
    $s = preg_replace('/\bMeta\s*description\s*:\s*/iu', '', $s) ?? $s;
    $s = preg_replace('/\b(SEO\s*)?Title\s*:\s*/iu', '', $s) ?? $s;
    $s = preg_replace('/\bKey\s*Takeaways\s*:?\s*/iu', '', $s) ?? $s;
    $s = preg_replace('/^[\s.·•:;,\-—–|]+/u', '', $s) ?? $s;

    $title = trim($title);
    if ($title !== '') {
        $ns = norm_key($s);
        $nt = norm_key($title);
        if ($nt !== '' && str_starts_with($ns, $nt)) {
            $pattern = '/^' . preg_quote($title, '/') . '/iu';
            $pattern = str_replace(['\\-', '\\—', '\\–', ' '], '[\\s\\-—–]+', $pattern);
            $s2 = preg_replace($pattern, '', $s, 1);
            if (is_string($s2) && $s2 !== $s) {
                $s = $s2;
            } else {
                $words = preg_split('/\s+/u', $nt) ?: [];
                $sw = preg_split('/\s+/u', $s) ?: [];
                if (count($sw) > count($words)) {
                    $s = implode(' ', array_slice($sw, count($words)));
                }
            }
            $s = preg_replace('/^[\s.·•:;,\-—–|]+/u', '', $s) ?? $s;
        }
    }

    $s = preg_replace('/\s+/u', ' ', $s) ?? $s;
    $s = trim($s);
    if ($s === '' || $s === '.') {
        return '';
    }

    // Always prefer a complete first sentence (up to 280). Never leave "… such as".
    if (preg_match('/^(.+?[.!?])(\s|$)/u', $s, $m)) {
        $sentence = trim($m[1]);
        if (mb_strlen($sentence) >= 40 && mb_strlen($sentence) <= 280) {
            return $sentence;
        }
    }

    $len = mb_strlen($s);
    $soft = $maxLen > 0 ? max($maxLen, 200) : 280;
    if ($len <= $soft) {
        return $s;
    }

    $slice = mb_substr($s, 0, $soft);
    if (preg_match('/^(.*)\s+\S*$/u', $slice, $m) && trim($m[1]) !== '') {
        $slice = rtrim($m[1], " \t.,;:|-");
    }
    $slice = preg_replace('/\b(?:such as|including|with|and|or|to|for|a|an|the|of|in|on)$/iu', '', $slice) ?? $slice;
    return trim($slice);
}

/** Remove GEOFlow template blocks from body. Returns [html, extractedMeta]. */
function scrub_body_html(string $html): array
{
    $extracted = '';
    $html = preg_replace_callback(
        '/<p[^>]*>\s*(?:<strong>\s*)?Meta\s*description\s*:?\s*(?:<\/strong>)?\s*([\s\S]*?)<\/p>/iu',
        static function ($m) use (&$extracted) {
            $t = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if ($t !== '' && strlen($t) > strlen($extracted)) {
                $extracted = $t;
            }
            return '';
        },
        $html
    ) ?? $html;
    $html = preg_replace(
        '/<p[^>]*>\s*(?:<strong>\s*)?(?:SEO\s*)?Title\s*:?\s*(?:<\/strong>)?\s*[\s\S]*?<\/p>/iu',
        '',
        $html
    ) ?? $html;
    // Soft claim scrub for newly ingested drafts (full rewrite is scripts/geoflow-scrub-body-claims.php)
    $html = preg_replace('/\bThe supplied product materials describe KeyoAPI as\b/iu', 'KeyoAPI is', $html) ?? $html;
    $html = preg_replace('/\bKeyoAPI is described in the provided product materials as\b/iu', 'KeyoAPI is', $html) ?? $html;
    $html = preg_replace('/\bThe available materials indicate that\b/iu', '', $html) ?? $html;
    $html = preg_replace('/\bThe product materials describe\b/iu', '', $html) ?? $html;
    $html = preg_replace('/\bThe provided materials show that\b/iu', '', $html) ?? $html;
    $html = preg_replace('/\b(?:the\s+)?(?:available|supplied|provided|published|official|current)\s+KeyoAPI\s+materials\b/iu', 'KeyoAPI docs', $html) ?? $html;
    $html = preg_replace('/\bKeyoAPI(?:[\'’]s)?\s+(?:product\s+)?materials\b/iu', 'KeyoAPI docs', $html) ?? $html;
    $html = preg_replace('/\b(?:provided|supplied|available)\s+product\s+materials\b/iu', 'current documentation', $html) ?? $html;
    $html = preg_replace('/\b(?:provided|supplied|available|published)\s+materials\b/iu', 'current documentation', $html) ?? $html;
    $html = preg_replace('/\s{2,}/u', ' ', $html) ?? $html;
    return [$html, $extracted];
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

function render_article_html(array $article, string $site, string $canonical, bool $isDraft): string
{
    $title = (string)($article['title'] ?? 'Untitled');
    $html = (string)($article['content_html'] ?? '');
    if ($html === '' && !empty($article['content'])) {
        $html = '<p>' . nl2br(h((string)$article['content']), false) . '</p>';
    }
    [$html, $fromTemplate] = scrub_body_html($html);

    $rawDesc = (string)($article['meta_description'] ?? '');
    if ($fromTemplate !== '' && (strlen($fromTemplate) > strlen($rawDesc) || $rawDesc === '')) {
        $rawDesc = $fromTemplate;
    }
    if ($rawDesc === '') {
        $rawDesc = (string)($article['excerpt'] ?? '');
    }
    $desc = clean_meta_text($rawDesc, $title, 160);
    $excerpt = clean_meta_text((string)($article['excerpt'] ?? ''), $title, 160);
    if ($excerpt === '' || str_starts_with(norm_key($excerpt), norm_key($title))) {
        $excerpt = $desc;
    }
    if ($desc === '' && $excerpt !== '') {
        $desc = $excerpt;
    }

    $published = (string)($article['published_at'] ?? '');
    return geoflow_wrap_article(
        $title,
        $desc,
        $excerpt,
        geoflow_extract_body($html),
        $canonical,
        $published,
        $isDraft
    );
}

function rebuild_index_and_sitemap(string $blogDir, string $site, array $catalog, array $gate): void
{
    $cards = [];
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

    $geo = array_values($catalog);
    usort($geo, static function ($a, $b) {
        return strcmp((string)($b['published_at'] ?? ''), (string)($a['published_at'] ?? ''));
    });
    foreach ($geo as $item) {
        $slug = (string)($item['slug'] ?? '');
        if (is_smoke_slug($slug)) {
            continue;
        }
        if (($item['status'] ?? 'draft') !== 'published') {
            continue;
        }
        $href = (string)$item['path'];
        $title = (string)$item['title'];
        $meta = clean_meta_text((string)($item['excerpt'] ?? $item['meta_description'] ?? ''), $title, 140);
        if ($meta === '') {
            $meta = 'Developer guide';
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
' . geoflow_public_nav() . '  <div class="k-page">
    <h1>Blog</h1>
    <p class="sub">Guides for OpenAI-compatible APIs, custom base URLs, and multi-model gateways.</p>
' . implode("\n", $cards) . '
    <p class="k-foot"><a href="/">← KeyoAPI home</a> · <a href="/pricing-list">Pricing list</a> · <a href="/free-models">Free models</a> · <a href="/model/CosyVoice3">CosyVoice3 API</a> · <a href="/tts-api">TTS API</a></p>
  </div>
</body>
</html>
';

    if (file_put_contents($blogDir . '/index.html', $index) === false) {
        fail(500, 'article_storage_not_writable');
    }

    // Sitemap: guides only until gate allows articles (after meta repair).
    $lines = [
        $site . '/brand/blog/',
        $site . '/brand/blog/openai-compatible-api-python.html',
        $site . '/brand/blog/openai-compatible-api-nodejs.html',
        $site . '/brand/blog/openai-compatible-api-cursor.html',
    ];
    if (!empty($gate['sitemap_include_articles'])) {
        foreach ($geo as $item) {
            $slug = (string)($item['slug'] ?? '');
            if (is_smoke_slug($slug)) {
                continue;
            }
            if (($item['status'] ?? 'draft') !== 'published') {
                continue;
            }
            $lines[] = $site . $item['path'];
        }
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
    if (!preg_match('#/geoflow-agent/v1/articles/?$#', $uri)) {
        fail(404, 'not_found');
    }
}

$blogDir = env_path('GEOFLOW_BLOG_DIR', dirname(__DIR__));
$dataDir = env_path('GEOFLOW_DATA_DIR', dirname($blogDir, 3) . '/data/geoflow-agent');
$configPath = env_path('GEOFLOW_CONFIG_PATH', $dataDir . '/config.json');

$cfg = read_config($configPath);
$gate = load_gate($dataDir, $cfg);
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
        'static' => ['idempotent' => true, 'status' => $prev['status'] ?? 'draft'],
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

$title = (string)$article['title'];
$contentHtml = (string)($article['content_html'] ?? '');
if ($contentHtml === '' && !empty($article['content'])) {
    $contentHtml = '<p>' . nl2br(h((string)$article['content']), false) . '</p>';
}
[$contentHtml, $fromTemplate] = scrub_body_html($contentHtml);
$article['content_html'] = $contentHtml;

$rawDesc = (string)($article['meta_description'] ?? '');
if ($fromTemplate !== '' && strlen($fromTemplate) >= strlen($rawDesc)) {
    $rawDesc = $fromTemplate;
}
$excerpt = clean_meta_text((string)($article['excerpt'] ?? ''), $title, 160);
$metaDesc = clean_meta_text($rawDesc !== '' ? $rawDesc : $excerpt, $title, 160);
if ($metaDesc === '') {
    $metaDesc = $excerpt;
}
if ($excerpt === '' || str_starts_with(norm_key($excerpt), norm_key($title))) {
    $excerpt = $metaDesc;
}
$article['excerpt'] = $excerpt;
$article['meta_description'] = $metaDesc;

// Default draft. Smoke always draft. Auto-publish only if gate explicitly allows.
$requested = strtolower((string)($article['status'] ?? 'draft'));
$isSmoke = is_smoke_slug($slug);
$status = 'draft';
if (!$isSmoke && !empty($gate['auto_publish']) && $requested === 'published') {
    $status = 'published';
}
$article['status'] = $status;
$isDraft = $status !== 'published';

$site = $cfg['site_origin'];
$remotePath = '/brand/blog/article/' . $slug . '/';
$remoteUrl = $site . $remotePath;
$remoteId = 'geoflow-' . $slug;
$articleDir = $blogDir . '/article/' . $slug;
ensure_writable_dir($articleDir);

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

$html = render_article_html($article, $site, $remoteUrl, $isDraft || $isSmoke);
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
    'title' => $title,
    'excerpt' => $excerpt,
    'meta_description' => $metaDesc,
    'published_at' => (string)($article['published_at'] ?? ''),
    'path' => $remotePath,
    'remote_id' => $remoteId,
    'status' => $status,
    'is_smoke' => $isSmoke,
];
save_json_file($catalogPath, $catalog);
rebuild_index_and_sitemap($blogDir, $site, $catalog, $gate);

$idem[$idemKey] = [
    'remote_id' => $remoteId,
    'remote_url' => $remoteUrl,
    'slug' => $slug,
    'status' => $status,
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
        'status' => $status,
        'listed_on_index' => !$isDraft && !$isSmoke,
        'gate' => [
            'auto_publish' => !empty($gate['auto_publish']),
            'sitemap_include_articles' => !empty($gate['sitemap_include_articles']),
        ],
    ],
]);
