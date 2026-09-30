#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Rebuild blog index.html + sitemap.txt from catalog.json.
 * Optionally rewrite one article HTML (clean meta + robots by status).
 *
 *   php scripts/geoflow-rebuild-blog.php
 *   php scripts/geoflow-rebuild-blog.php --rewrite-html=ncx234u2
 *   php scripts/geoflow-rebuild-blog.php --sanitize-all
 *   php scripts/geoflow-rebuild-blog.php --delete-smoke
 */

$opts = getopt('', ['rewrite-html:', 'sanitize-all', 'delete-smoke', 'help']);
if (isset($opts['help'])) {
    echo "Usage: php scripts/geoflow-rebuild-blog.php [--sanitize-all] [--delete-smoke] [--rewrite-html=SLUG]\n";
    exit(0);
}

$root = dirname(__DIR__);
$blogDir = getenv('GEOFLOW_BLOG_DIR') ?: '';
$dataDir = getenv('GEOFLOW_DATA_DIR') ?: '';
if ($blogDir === '' || $dataDir === '') {
    if (is_dir('/opt/ai-relay/static/brand/blog')) {
        $blogDir = '/opt/ai-relay/static/brand/blog';
        $dataDir = '/opt/ai-relay/data/geoflow-agent';
    } else {
        $blogDir = $root . '/static/brand/blog';
        $dataDir = $root . '/data/geoflow-agent';
    }
}
$site = 'https://www.keyoapi.xyz';

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function is_smoke_slug(string $slug): bool
{
    $s = strtolower($slug);
    return str_contains($s, 'smoke') || str_contains($s, 'test-only');
}

function clean_meta_text(string $raw, string $title = ''): string
{
    $s = html_entity_decode(trim($raw), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($s === '') {
        return '';
    }
    $s = preg_replace('/\bMeta\s*description\s*:\s*/iu', '', $s) ?? $s;
    $s = preg_replace('/\b(SEO\s*)?Title\s*:\s*/iu', '', $s) ?? $s;
    $s = preg_replace('/\bKey\s*Takeaways\s*:?\s*/iu', '', $s) ?? $s;
    $title = trim($title);
    if ($title !== '' && strncasecmp($s, $title, strlen($title)) === 0) {
        $s = trim(substr($s, strlen($title)));
        $s = preg_replace('/^[\s:;,\-—–|]+/u', '', $s) ?? $s;
    }
    $s = preg_replace('/\s+/u', ' ', $s) ?? $s;
    $s = trim($s);
    if (function_exists('mb_strlen') && mb_strlen($s) > 155) {
        $s = mb_substr($s, 0, 152) . '...';
    } elseif (strlen($s) > 155) {
        $s = substr($s, 0, 152) . '...';
    }
    return $s;
}

function load_gate(string $dataDir): array
{
    $gate = [
        'auto_publish' => false,
        'sitemap_include_articles' => false,
        'max_publish_per_week' => 5,
        'require_previous_batch_ok' => true,
        'previous_batch_ok' => false,
    ];
    $path = $dataDir . '/gate.json';
    if (is_file($path)) {
        $raw = json_decode((string)file_get_contents($path), true);
        if (is_array($raw)) {
            $gate = array_merge($gate, $raw);
        }
    }
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0775, true);
    }
    if (!is_file($path)) {
        file_put_contents($path, json_encode($gate, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
    }
    return $gate;
}

function rewrite_article_html(string $blogDir, string $slug, array $row, bool $isDraft): void
{
    $path = $blogDir . '/article/' . $slug . '/index.html';
    if (!is_file($path)) {
        return;
    }
    $html = (string)file_get_contents($path);
    $title = (string)($row['title'] ?? '');
    $desc = clean_meta_text((string)($row['meta_description'] ?? $row['excerpt'] ?? ''), $title);
    $excerpt = clean_meta_text((string)($row['excerpt'] ?? ''), $title);

    // Replace meta description
    $html = preg_replace(
        '/<meta name="description" content="[^"]*"\s*\/?>/i',
        '<meta name="description" content="' . h($desc) . '" />',
        $html,
        1
    ) ?? $html;

    // Robots: draft/smoke => noindex; published => remove noindex
    if ($isDraft || is_smoke_slug($slug)) {
        if (!preg_match('/name="robots"/i', $html)) {
            $html = preg_replace(
                '/(<meta name="description"[^>]*>)/i',
                '$1' . "\n" . '<meta name="robots" content="noindex,nofollow" />',
                $html,
                1
            ) ?? $html;
        }
    } else {
        $html = preg_replace('/\s*<meta name="robots" content="noindex[^"]*"\s*\/?>/i', '', $html) ?? $html;
    }

    // Fix visible sub blurb if present
    if ($excerpt !== '') {
        $html = preg_replace(
            '/<p class="sub">.*?<\/p>/s',
            '<p class="sub">' . h($excerpt) . '</p>',
            $html,
            1
        ) ?? $html;
    }

    file_put_contents($path, $html);
}

function rebuild(string $blogDir, string $site, array $catalog, array $gate): void
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
    usort($geo, static fn($a, $b) => strcmp((string)($b['published_at'] ?? ''), (string)($a['published_at'] ?? '')));
    foreach ($geo as $item) {
        $slug = (string)($item['slug'] ?? '');
        if ($slug === '' || is_smoke_slug($slug)) {
            continue;
        }
        if (($item['status'] ?? 'draft') !== 'published') {
            continue;
        }
        $title = (string)$item['title'];
        $meta = clean_meta_text((string)($item['excerpt'] ?? ''), $title);
        if ($meta === '') {
            $meta = 'Developer guide';
        }
        if (strlen($meta) > 120) {
            $meta = substr($meta, 0, 117) . '...';
        }
        $cards[] = '    <div class="k-card" style="margin-bottom:10px">
      <a href="' . h((string)$item['path']) . '">' . h($title) . '</a>
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
    <p class="k-foot"><a href="/">← KeyoAPI home</a> · <a href="/pricing-list">Pricing list</a> · <a href="/free-models">Free models</a> · <a href="/model/CosyVoice3">CosyVoice3 API</a> · <a href="/tts-api">TTS API</a></p>
  </div>
</body>
</html>
';
    file_put_contents($blogDir . '/index.html', $index);

    $lines = [
        $site . '/brand/blog/',
        $site . '/brand/blog/openai-compatible-api-python.html',
        $site . '/brand/blog/openai-compatible-api-nodejs.html',
        $site . '/brand/blog/openai-compatible-api-cursor.html',
    ];
    if (!empty($gate['sitemap_include_articles'])) {
        foreach ($geo as $item) {
            $slug = (string)($item['slug'] ?? '');
            if (is_smoke_slug($slug) || ($item['status'] ?? '') !== 'published') {
                continue;
            }
            $lines[] = $site . $item['path'];
        }
    }
    file_put_contents($blogDir . '/sitemap.txt', implode("\n", array_values(array_unique($lines))) . "\n");
}

$gate = load_gate($dataDir);
$catalogPath = $dataDir . '/catalog.json';
$catalog = is_file($catalogPath) ? json_decode((string)file_get_contents($catalogPath), true) : [];
if (!is_array($catalog)) {
    $catalog = [];
}

if (isset($opts['delete-smoke'])) {
    foreach (array_keys($catalog) as $slug) {
        if (!is_smoke_slug((string)$slug)) {
            continue;
        }
        $dir = $blogDir . '/article/' . $slug;
        if (is_dir($dir)) {
            // recursive delete
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            foreach ($it as $f) {
                $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
            }
            @rmdir($dir);
        }
        unset($catalog[$slug]);
        echo "deleted smoke $slug\n";
    }
}

if (isset($opts['sanitize-all'])) {
    foreach ($catalog as $slug => &$row) {
        if (!is_array($row)) {
            continue;
        }
        $title = (string)($row['title'] ?? '');
        $row['excerpt'] = clean_meta_text((string)($row['excerpt'] ?? ''), $title);
        $row['meta_description'] = clean_meta_text((string)($row['meta_description'] ?? $row['excerpt'] ?? ''), $title);
        // Existing public articles stay published; smoke forced draft
        if (is_smoke_slug((string)$slug)) {
            $row['status'] = 'draft';
        } elseif (!isset($row['status']) || $row['status'] === '') {
            $row['status'] = 'published';
        }
        $isDraft = ($row['status'] ?? 'draft') !== 'published' || is_smoke_slug((string)$slug);
        rewrite_article_html($blogDir, (string)$slug, $row, $isDraft);
        echo "sanitized $slug\n";
    }
    unset($row);
}

if (!empty($opts['rewrite-html'])) {
    $slug = (string)$opts['rewrite-html'];
    if (isset($catalog[$slug]) && is_array($catalog[$slug])) {
        $isDraft = ($catalog[$slug]['status'] ?? 'draft') !== 'published';
        rewrite_article_html($blogDir, $slug, $catalog[$slug], $isDraft);
        echo "rewrote $slug\n";
    }
}

file_put_contents($catalogPath, json_encode($catalog, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
rebuild($blogDir, $site, $catalog, $gate);
echo "DONE_GEOFLOW_REBUILD index+sitemap (sitemap_include_articles=" . (!empty($gate['sitemap_include_articles']) ? '1' : '0') . ")\n";
