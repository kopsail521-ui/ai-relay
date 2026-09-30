#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Rebuild blog index.html + sitemap.txt from catalog.json.
 * Full meta/body sanitize for GEOFlow articles.
 *
 *   php scripts/geoflow-rebuild-blog.php
 *   php scripts/geoflow-rebuild-blog.php --sanitize-all --delete-smoke
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
 * Clean SERP / card blurbs. Never mid-word truncate.
 * $maxLen 0 = keep full cleaned sentence(s) up to soft 300.
 */
function clean_meta_text(string $raw, string $title = '', int $maxLen = 160): string
{
    $s = html_entity_decode(trim($raw), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($s === '') {
        return '';
    }
    // Template labels (optional trailing punctuation after colon)
    $s = preg_replace('/\bMeta\s*description\s*:\s*/iu', '', $s) ?? $s;
    $s = preg_replace('/\b(SEO\s*)?Title\s*:\s*/iu', '', $s) ?? $s;
    $s = preg_replace('/\bKey\s*Takeaways\s*:?\s*/iu', '', $s) ?? $s;
    // Leftover leading junk after label strip (e.g. ". A developer…")
    $s = preg_replace('/^[\s.·•:;,\-—–|]+/u', '', $s) ?? $s;

    $title = trim($title);
    if ($title !== '') {
        $ns = norm_key($s);
        $nt = norm_key($title);
        if ($nt !== '' && str_starts_with($ns, $nt)) {
            // Drop title-length prefix from original with flexible separators
            $pattern = '/^' . preg_quote($title, '/') . '/iu';
            $pattern = str_replace(['\\-', '\\—', '\\–', ' '], '[\\s\\-—–]+', $pattern);
            $s2 = preg_replace($pattern, '', $s, 1);
            if (is_string($s2) && $s2 !== $s) {
                $s = $s2;
            } else {
                // Fallback: cut by normalized length map — take remainder after first title-ish span
                $s = preg_replace('/^.{0,' . (strlen($title) + 12) . '}?\s+(?=[A-Z“"\'(])/u', '', $s, 1) ?? $s;
                if (norm_key($s) === $ns) {
                    // last resort: strip mb prefix equal to title word count
                    $words = preg_split('/\s+/u', $nt) ?: [];
                    $sw = preg_split('/\s+/u', $s) ?: [];
                    if (count($sw) > count($words)) {
                        $s = implode(' ', array_slice($sw, count($words)));
                    }
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

    $len = function_exists('mb_strlen') ? mb_strlen($s) : strlen($s);
    $soft = $maxLen > 0 ? $maxLen : 300;
    if ($len <= $soft) {
        return $s;
    }

    // Prefer first complete sentence if it fits
    if (preg_match('/^(.+?[.!?])(\s|$)/u', $s, $m)) {
        $sentence = trim($m[1]);
        $slen = function_exists('mb_strlen') ? mb_strlen($sentence) : strlen($sentence);
        if ($slen >= 40 && $slen <= $soft) {
            return $sentence;
        }
    }

    // Word-boundary cut — never mid-word
    $slice = function_exists('mb_substr') ? mb_substr($s, 0, $soft) : substr($s, 0, $soft);
    if (preg_match('/^(.*)\s+\S*$/u', $slice, $m) && trim($m[1]) !== '') {
        $slice = rtrim($m[1], " \t.,;:|-");
    }
    return $slice;
}

/** Remove GEOFlow template blocks from article body HTML. Returns [html, extractedMeta]. */
function scrub_body_html(string $html): array
{
    $extracted = '';
    $html = preg_replace_callback(
        '/<p[^>]*>\s*(?:<strong>\s*)?Meta\s*description\s*:?\s*(?:<\/strong>)?\s*([\s\S]*?)<\/p>/iu',
        static function ($m) use (&$extracted) {
            $t = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if ($t !== '' && (strlen($t) > strlen($extracted))) {
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

    $html = preg_replace(
        '/<p[^>]*>\s*(?:<strong>\s*)?Key\s*Takeaways\s*:?\s*(?:<\/strong>)?\s*<\/p>/iu',
        '',
        $html
    ) ?? $html;

    // Collapse leftover blank lines at start of body
    $html = preg_replace('/^(\s*\n)+/', '', $html) ?? $html;
    return [$html, $extracted];
}

function first_body_sentence(string $html): string
{
    if (!preg_match('/<p[^>]*>([\s\S]*?)<\/p>/i', $html, $m)) {
        return '';
    }
    $t = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $t = preg_replace('/\s+/u', ' ', $t) ?? $t;
    if (preg_match('/^(.+?[.!?])(\s|$)/u', $t, $sm)) {
        return trim($sm[1]);
    }
    return $t;
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

function rewrite_article_html(string $blogDir, string $slug, array &$row, bool $isDraft): void
{
    $path = $blogDir . '/article/' . $slug . '/index.html';
    if (!is_file($path)) {
        return;
    }
    $html = (string)file_get_contents($path);
    $title = (string)($row['title'] ?? '');
    if ($title === '' && preg_match('/<h1[^>]*>(.*?)<\/h1>/is', $html, $m)) {
        $title = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $row['title'] = $title;
    }

    $body = '';
    if (preg_match('/<article class="geoflow-body">([\s\S]*?)<\/article>/i', $html, $m)) {
        $body = $m[1];
    } else {
        $body = $html;
    }
    [$body, $fromTemplate] = scrub_body_html($body);

    $candidates = [
        $fromTemplate,
        (string)($row['meta_description'] ?? ''),
        (string)($row['excerpt'] ?? ''),
        first_body_sentence($body),
    ];
    $desc = '';
    foreach ($candidates as $c) {
        $cleaned = clean_meta_text($c, $title, 0); // full sentence first
        if ($cleaned === '') {
            continue;
        }
        // Prefer longer complete copy (template often has full sentence)
        if (mb_strlen($cleaned) > mb_strlen($desc)) {
            $desc = $cleaned;
        }
    }
    // Card / meta attribute: word-safe soft limit
    $descAttr = clean_meta_text($desc, $title, 160);
    $excerpt = $descAttr;

    $row['excerpt'] = $excerpt;
    $row['meta_description'] = $descAttr;
    if ($fromTemplate !== '') {
        $row['meta_description_full'] = clean_meta_text($fromTemplate, $title, 0);
    }

    $html = preg_replace(
        '/<meta name="description" content="[^"]*"\s*\/?>/i',
        '<meta name="description" content="' . h($descAttr) . '" />',
        $html,
        1
    ) ?? $html;

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

    if (preg_match('/<p class="sub">/i', $html)) {
        $html = preg_replace(
            '/<p class="sub">[\s\S]*?<\/p>/i',
            '<p class="sub">' . h($excerpt) . '</p>',
            $html,
            1
        ) ?? $html;
    } elseif ($excerpt !== '') {
        $html = preg_replace(
            '/(<h1[^>]*>[\s\S]*?<\/h1>)/i',
            '$1' . "\n" . '    <p class="sub">' . h($excerpt) . '</p>',
            $html,
            1
        ) ?? $html;
    }

    if (preg_match('/<article class="geoflow-body">/i', $html)) {
        $html = preg_replace(
            '/<article class="geoflow-body">[\s\S]*?<\/article>/i',
            '<article class="geoflow-body">' . "\n" . $body . "\n" . '    </article>',
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
        $meta = clean_meta_text((string)($item['excerpt'] ?? $item['meta_description'] ?? ''), $title, 140);
        if ($meta === '') {
            $meta = 'Developer guide';
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
$n = 0;
foreach ($catalog as $slug => $row) {
    if (!is_smoke_slug((string)$slug) && ($row['status'] ?? '') === 'published') {
        $n++;
    }
}
echo "DONE_GEOFLOW_REBUILD published={$n} sitemap_include_articles=" . (!empty($gate['sitemap_include_articles']) ? '1' : '0') . "\n";
