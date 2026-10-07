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

require_once $root . '/scripts/geoflow-article-shell.php';

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

    // Always prefer a complete first sentence (up to 280). Never leave "… such as".
    if (preg_match('/^(.+?[.!?])(\s|$)/u', $s, $m)) {
        $sentence = trim($m[1]);
        $slen = function_exists('mb_strlen') ? mb_strlen($sentence) : strlen($sentence);
        if ($slen >= 40 && $slen <= 280) {
            return $sentence;
        }
    }

    $len = function_exists('mb_strlen') ? mb_strlen($s) : strlen($s);
    $soft = $maxLen > 0 ? max($maxLen, 200) : 280;
    if ($len <= $soft) {
        return $s;
    }

    // No sentence end — word-boundary only; strip dangling stop-words
    $slice = function_exists('mb_substr') ? mb_substr($s, 0, $soft) : substr($s, 0, $soft);
    if (preg_match('/^(.*)\s+\S*$/u', $slice, $m) && trim($m[1]) !== '') {
        $slice = rtrim($m[1], " \t.,;:|-");
    }
    $slice = preg_replace('/\b(?:such as|including|with|and|or|to|for|a|an|the|of|in|on)$/iu', '', $slice) ?? $slice;
    return trim($slice);
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

/** Strip GEOFlow “materials” scaffolding and self-hedges from article body HTML. */
function scrub_geoflow_voice(string $html): string
{
    $catalog = '<a href="/pricing-list">/pricing-list</a> or <a href="/pricing">/pricing</a>';
    $claude = '<a href="/pricing-list">/pricing-list</a> or <a href="/claude-api-pricing">/claude-api-pricing</a>';

    $inline = [
        // Materials scaffolding → direct product voice
        '/\bThe supplied product materials describe KeyoAPI as\b/iu'
            => 'KeyoAPI is',
        '/\bKeyoAPI is described in the provided product materials as\b/iu'
            => 'KeyoAPI is',
        '/\bThe available materials indicate that KeyoAPI provides\b/iu'
            => 'KeyoAPI provides',
        '/\bThe available materials indicate that\b/iu'
            => 'KeyoAPI',
        '/\bThe product materials describe\b/iu'
            => 'KeyoAPI documents',
        '/\bThe provided materials show that\b/iu'
            => '',
        '/\bFor KeyoAPI, the supplied materials document\b/iu'
            => 'KeyoAPI documents',
        '/\bFor KeyoAPI, the supplied materials state that\b/iu'
            => 'KeyoAPI uses',
        '/\bThe supplied materials document\b/iu'
            => 'KeyoAPI documents',
        '/\bThe supplied materials state that\b/iu'
            => 'KeyoAPI uses',
        '/\bthe supplied materials document\b/iu'
            => 'KeyoAPI documents',
        '/\bthe materials also document\b/iu'
            => 'KeyoAPI also documents',

        // “The documented …” endpoint scaffolding (not generic “documented behavior”)
        '/\bThe documented API base URL is:\s*/iu'
            => 'The API base URL is: ',
        '/\bThe documented chat endpoint is:\s*/iu'
            => 'The chat completions endpoint is: ',
        '/\bthe documented model-list endpoint\b/iu'
            => 'the model-list endpoint',

        // Claude capability hedges
        '/,\s*but it does not assume that KeyoAPI provides Claude models or Claude API compatibility\.?\s*/iu'
            => '. KeyoAPI serves Claude-class models through an OpenAI-compatible endpoint; confirm current IDs and rates on '
            . $claude . '. ',
        '/\bThey do not establish that KeyoAPI supports Claude models[^.]*\./iu'
            => 'KeyoAPI serves Claude-class models through an OpenAI-compatible endpoint; confirm current IDs and rates on '
            . $claude . '.',
        '/\bClaude compatibility should never be assumed without explicit confirmation in the current provider documentation\./iu'
            => 'Confirm current Claude-class model IDs and rates on ' . $claude . ' before production use.',

        // Image / speech hedges → live catalog
        '/,\s*but they do not establish a complete image-generation endpoint[^.]*\./iu'
            => '. Confirm image model IDs, request schemas, and rates in the live catalog at ' . $catalog . '.',
        '/\bbut they do not verify a specific speech-to-text endpoint[^.]*\./iu'
            => 'Confirm speech-to-text model IDs, audio limits, and response schemas in the live catalog at ' . $catalog . '.',
        '/\bThat pricing information does not establish that KeyoAPI offers[^.]*\./iu'
            => 'Confirm whether this workload is listed in the live model catalog at ' . $catalog . '.',

        // Drop-in / candidate-gateway hedges
        '/\btreat KeyoAPI as a candidate gateway to evaluate, not as a drop-in Claude replacement\.?\s*/iu'
            => 'Use KeyoAPI as an OpenAI-compatible gateway; confirm Claude-class model IDs on ' . $claude . '. ',
        '/\bnot as a drop-in Claude replacement\b/iu'
            => 'after confirming Claude-class model IDs on ' . $claude,
        '/\bcandidate gateway to evaluate\b/iu'
            => 'OpenAI-compatible multi-model gateway',
        '/\btreat image generation as an unverified integration[^.]*\./iu'
            => 'Confirm image-generation models and endpoints in the live catalog at ' . $catalog . '.',

        // Affirmative gateway statement (when buried in materials phrasing)
        '/\bKeyoAPI can be evaluated as an independent multi-model gateway using its current documentation and live \/v1\/models catalog\.[^.]*\./iu'
            => 'KeyoAPI is an independent OpenAI-compatible multi-model gateway with one API key and one base URL. '
            . 'Confirm model IDs, rates, and capabilities on ' . $catalog . ' and via GET /v1/models.',
    ];

    $deleteNorm = [
        '/^Therefore,\s*treat KeyoAPI as a candidate gateway to evaluate,\s*not as a drop-in Claude replacement\.?$/iu',
        '/^That means image generation should be treated as an unverified integration until[^.]*\.?$/iu',
        '/^That pricing information does not establish that KeyoAPI offers an InfiniteTalk[^.]*\.?$/iu',
    ];

    $rewriteNorm = [
        '/^This article presents a verification-first migration workflow using KeyoAPI as the example gateway\.\s*It distinguishes documented integration facts from details that must be checked in the live documentation and model catalog\.?$/iu'
            => 'This article presents a verification-first migration workflow using KeyoAPI as an OpenAI-compatible multi-model gateway. '
            . 'Confirm model IDs, endpoints, and rates in the live catalog at ' . $catalog . ' before production use.',
        '/^This article presents a practical migration and evaluation workflow\.\s*It uses KeyoAPI as an example of a separately operated, OpenAI-compatible multi-model gateway,[^.]*\.\s*Verify the current model catalog and documentation before selecting it as a fallback\.?$/iu'
            => 'This article presents a practical migration and evaluation workflow using KeyoAPI, an independent OpenAI-compatible multi-model gateway. '
            . 'KeyoAPI serves Claude-class and other models through one endpoint; confirm current IDs and rates on ' . $claude . ' before selecting fallbacks.',
    ];

    $html = preg_replace_callback(
        '/<p([^>]*)>([\s\S]*?)<\/p>/iu',
        static function (array $m) use ($inline, $deleteNorm, $rewriteNorm): string {
            $attrs = $m[1];
            $inner = $m[2];
            $plain = html_entity_decode(strip_tags($inner), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $norm = preg_replace('/\s+/u', ' ', trim($plain)) ?? '';

            if ($norm === '') {
                return '';
            }

            foreach ($deleteNorm as $re) {
                if (preg_match($re, $norm) === 1) {
                    return '';
                }
            }

            foreach ($rewriteNorm as $re => $replacement) {
                if (preg_match($re, $norm) === 1) {
                    return '<p' . $attrs . '>' . $replacement . '</p>';
                }
            }

            // Skip paragraphs that are mostly code/pre (curl blocks stored as <p> on some articles)
            if (preg_match('/^\s*(?:curl|GET|POST|Authorization:|import |from |client\s*=)/iu', $norm) === 1) {
                return $m[0];
            }

            $out = $inner;
            foreach ($inline as $pattern => $replacement) {
                $next = preg_replace($pattern, $replacement, $out);
                if (is_string($next)) {
                    $out = $next;
                }
            }

            // Collapse double spaces left by empty replacements
            $out = preg_replace('/  +/', ' ', $out) ?? $out;
            $out = preg_replace('/\.\s+\./u', '.', $out) ?? $out;

            if (trim(strip_tags($out)) === '') {
                return '';
            }

            return '<p' . $attrs . '>' . $out . '</p>';
        },
        $html
    ) ?? $html;

    // Same voice scrub on list items (short material leaks in bullets)
    $html = preg_replace_callback(
        '/<li([^>]*)>([\s\S]*?)<\/li>/iu',
        static function (array $m) use ($inline): string {
            $out = $m[2];
            foreach ($inline as $pattern => $replacement) {
                $next = preg_replace($pattern, $replacement, $out);
                if (is_string($next)) {
                    $out = $next;
                }
            }
            return '<li' . $m[1] . '>' . $out . '</li>';
        },
        $html
    ) ?? $html;

    $html = preg_replace("/\n{3,}/", "\n\n", $html) ?? $html;
    return $html;
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

function rewrite_article_html(string $blogDir, string $site, string $slug, array &$row, bool $isDraft): void
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
    if ($title === '') {
        $title = $slug;
        $row['title'] = $title;
    }

    $body = geoflow_extract_body($html);
    [$body, $fromTemplate] = scrub_body_html($body);
    $body = scrub_geoflow_voice($body);

    $candidates = [
        $fromTemplate,
        (string)($row['meta_description_full'] ?? ''),
        (string)($row['meta_description'] ?? ''),
        (string)($row['excerpt'] ?? ''),
        first_body_sentence($body),
    ];
    $desc = '';
    foreach ($candidates as $c) {
        $cleaned = clean_meta_text($c, $title, 0);
        if ($cleaned === '') {
            continue;
        }
        // Prefer longest complete sentence (ends with .!?)
        $score = mb_strlen($cleaned);
        if (preg_match('/[.!?]$/u', $cleaned)) {
            $score += 1000;
        }
        $best = 0;
        if ($desc !== '') {
            $best = mb_strlen($desc);
            if (preg_match('/[.!?]$/u', $desc)) {
                $best += 1000;
            }
        }
        if ($score > $best) {
            $desc = $cleaned;
        }
    }
    // Keep complete sentence in attribute — no 160 hard cut
    $descAttr = clean_meta_text($desc, $title, 0);
    $excerpt = $descAttr;

    $row['excerpt'] = $excerpt;
    $row['meta_description'] = $descAttr;
    if ($fromTemplate !== '') {
        $row['meta_description_full'] = clean_meta_text($fromTemplate, $title, 0);
    }

    $canonical = $site . '/brand/blog/article/' . rawurlencode($slug) . '/';
    $published = (string)($row['published_at'] ?? '');
    $html = geoflow_wrap_article($title, $descAttr, $excerpt, $body, $canonical, $published, $isDraft);
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
' . geoflow_public_nav() . '  <div class="k-page">
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

function wrap_articles_on_disk(string $blogDir, string $site, array &$catalog): void
{
    $ok = 0;
    $fail = 0;
    foreach (glob($blogDir . '/article/*/index.html') ?: [] as $path) {
        $slug = basename(dirname($path));
        if ($slug === '' || is_smoke_slug($slug)) {
            continue;
        }
        if (!isset($catalog[$slug]) || !is_array($catalog[$slug])) {
            $catalog[$slug] = [
                'slug' => $slug,
                'title' => $slug,
                'path' => '/brand/blog/article/' . $slug . '/',
                'status' => 'published',
            ];
        }
        $row = &$catalog[$slug];
        if (!isset($row['status']) || $row['status'] === '') {
            $row['status'] = 'published';
        }
        $isDraft = ($row['status'] ?? 'draft') !== 'published';
        rewrite_article_html($blogDir, $site, $slug, $row, $isDraft);
        unset($row);
        $start = ltrim((string)file_get_contents($path, false, null, 0, 64));
        if (str_starts_with($start, '<!DOCTYPE')) {
            echo "WRAP_OK $slug\n";
            $ok++;
        } else {
            echo "WRAP_FAIL $slug " . json_encode(substr($start, 0, 40)) . "\n";
            $fail++;
        }
    }
    echo "WRAP_COUNT ok={$ok} fail={$fail}\n";
}

if (isset($opts['sanitize-all'])) {
    wrap_articles_on_disk($blogDir, $site, $catalog);
}

if (!empty($opts['rewrite-html'])) {
    $slug = (string)$opts['rewrite-html'];
    if (isset($catalog[$slug]) && is_array($catalog[$slug])) {
        $isDraft = ($catalog[$slug]['status'] ?? 'draft') !== 'published';
        rewrite_article_html($blogDir, $site, $slug, $catalog[$slug], $isDraft);
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
