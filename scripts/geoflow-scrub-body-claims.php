#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Scrub GEOFlow scaffolding + self-hedges from published article HTML.
 * GEOFlow prompt lives elsewhere — this only fixes Keyo-hosted HTML.
 *
 *   php scripts/geoflow-scrub-body-claims.php [--dry-run]
 */

$opts = getopt('', ['dry-run', 'help']);
if (isset($opts['help'])) {
    echo "Usage: php scripts/geoflow-scrub-body-claims.php [--dry-run]\n";
    exit(0);
}
$dry = isset($opts['dry-run']);

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

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function a(string $path, ?string $label = null): string
{
    $label = $label ?? $path;
    return '<a href="' . h($path) . '">' . h($label) . '</a>';
}

/** Count scaffold / hedge tokens in HTML. */
function claim_hits(string $html): array
{
    $patterns = [
        'materials' => '/\b(?:product|provided|supplied|available)\s+materials\b|\bmaterials\s+(?:describe|indicate|show|document)\b/i',
        'hedge' => '/\b(?:does not assume that KeyoAPI|do not establish(?: that)?|unverified integration|not as a drop-in Claude|Claude compatibility should never be assumed|does not prove that every SDK)\b/i',
    ];
    $out = [];
    foreach ($patterns as $k => $re) {
        $out[$k] = preg_match_all($re, $html) ?: 0;
    }
    return $out;
}

/**
 * Rewrite one article body HTML. Returns [html, changedBool, notes[]].
 */
function scrub_claims_html(string $html, string $title = ''): array
{
    $notes = [];
    $orig = $html;
    $isClaude = (bool)preg_match('/\bClaude\b/i', $title . ' ' . mb_substr(strip_tags($html), 0, 800));

    // --- Phrase-level materials scaffolding (keep surrounding sentence where possible) ---
    $phraseMap = [
        '/\bThe supplied product materials describe KeyoAPI as\b/iu'
            => 'KeyoAPI is',
        '/\bKeyoAPI is described in the provided product materials as\b/iu'
            => 'KeyoAPI is',
        '/\bdescribed in the provided product materials as\b/iu'
            => 'is',
        '/\bThe available materials indicate that\b/iu'
            => '',
        '/\bThe product materials describe\b/iu'
            => '',
        '/\bThe provided materials show that\b/iu'
            => '',
        '/\bThe materials also document\b/iu'
            => 'Documentation also covers',
        '/\bthe provided materials\b/iu'
            => 'current documentation',
        '/\bthe available materials\b/iu'
            => 'current documentation',
        '/\bthe supplied product materials\b/iu'
            => 'current documentation',
        '/\bthe product materials\b/iu'
            => 'current documentation',
        '/\bprovided product materials\b/iu'
            => 'current documentation',
        '/\bsupplied product materials\b/iu'
            => 'current documentation',
    ];
    foreach ($phraseMap as $re => $to) {
        $html2 = preg_replace($re, $to, $html);
        if (is_string($html2) && $html2 !== $html) {
            $notes[] = 'phrase:' . substr($re, 0, 40);
            $html = $html2;
        }
    }

    // Fix doubled spaces / "is is" after empty replacements
    $html = preg_replace('/\b(is|are|that)\s+\1\b/iu', '$1', $html) ?? $html;
    $html = preg_replace('/\s{2,}/u', ' ', $html) ?? $html;
    $html = preg_replace('/<p>\s+/u', '<p>', $html) ?? $html;

    // --- Paragraph-level rewrites for hard hedges ---
    $paraReplacements = [];

    if ($isClaude) {
        $paraReplacements[] = [
            'match' => '/does not assume that KeyoAPI provides Claude models/i',
            'replace' => '<p>This article presents a practical migration and evaluation workflow. KeyoAPI is an OpenAI-compatible multi-model gateway that serves Claude-class model IDs (for example <code>claude-sonnet-5</code> and sibling Opus/Fable IDs) through the same <code>/v1/chat/completions</code> surface as other catalog models. Confirm current IDs and rates on ' . a('/claude-api-pricing') . ' and ' . a('/pricing-list') . ' before selecting it as a fallback.</p>',
        ];
        $paraReplacements[] = [
            'match' => '/do not establish that KeyoAPI supports Claude models/i',
            'replace' => '<p>KeyoAPI lists Claude-class model IDs in the live catalog with one API endpoint and one API key for supported models. Confirm exact IDs, limits, and rates on ' . a('/claude-api-pricing') . ' and ' . a('/pricing-list') . ' — Anthropic-native request schemas may still differ from OpenAI-compatible chat completions.</p>',
        ];
        $paraReplacements[] = [
            'match' => '/not as a drop-in Claude replacement/i',
            'replace' => '<p>Use KeyoAPI as an OpenAI-compatible gateway for Claude-class IDs alongside GPT-class and other models on one key; verify live IDs on ' . a('/pricing-list') . ' before production.</p>',
        ];
        $paraReplacements[] = [
            'match' => '/Claude compatibility should never be assumed without explicit confirmation/i',
            'replace' => '<p>KeyoAPI can be evaluated as an independent multi-model gateway using its current documentation and live <code>/v1/models</code> catalog. Confirm the Claude-class model ID and rates you need on ' . a('/claude-api-pricing') . ' (and ' . a('/pricing-list') . ') before enabling automatic failover.</p>',
        ];
    }

    $paraReplacements[] = [
        'match' => '/do not establish a complete image-generation endpoint/i',
        'replace' => '<p>KeyoAPI lists image-generation models in the live catalog. Confirm the exact endpoint, request schema, model ID, and response format in current docs and on ' . a('/pricing-list') . ' before production.</p>',
    ];
    $paraReplacements[] = [
        'match' => '/treated as an unverified integration until the current documentation confirms/i',
        'replace' => '<p>Treat image generation as production-ready only after you confirm the live model ID and request shape against current documentation and ' . a('/pricing-list') . '.</p>',
    ];
    $paraReplacements[] = [
        'match' => '/do not verify a specific speech-to-text endpoint/i',
        'replace' => '<p>KeyoAPI documents speech capabilities at a high level. Confirm the specific speech-to-text endpoint, model ID, SDK method, audio limits, and response schema in current docs (and related guides such as ' . a('/model/CosyVoice3', '/model/CosyVoice3') . ') before migrating a transcription workload.</p>',
    ];
    $paraReplacements[] = [
        'match' => '/It does not prove that every SDK method/i',
        'replace' => '<p>This configuration shows that the client can point at a compatible base URL. Still verify that each SDK method you need maps to a supported provider operation, especially for image and speech workflows.</p>',
    ];

    // Rewrite matching <p>...</p> blocks (non-greedy, multiline)
    $html = preg_replace_callback(
        '/<p\b[^>]*>[\s\S]*?<\/p>/iu',
        static function ($m) use ($paraReplacements, &$notes) {
            $p = $m[0];
            foreach ($paraReplacements as $rule) {
                if (preg_match($rule['match'], $p)) {
                    $notes[] = 'para:' . substr($rule['match'], 0, 48);
                    return $rule['replace'];
                }
            }
            return $p;
        },
        $html
    ) ?? $html;

    // Residual hedges inside longer conclusion paragraphs (sentence surgery)
    $sentenceMap = [
        '/[,.]?\s*but it does not assume that KeyoAPI provides Claude models or Claude API compatibility\.?\s*Verify the current model catalog and documentation before selecting it as a fallback\.?/iu'
            => '. KeyoAPI serves Claude-class IDs through an OpenAI-compatible endpoint; confirm current IDs and rates on ' . a('/claude-api-pricing') . ' and ' . a('/pricing-list') . ' before selecting it as a fallback.',
        '/[,.]?\s*They do not establish that KeyoAPI supports Claude models, Anthropic(?:\'|’)?s API schema, or any specific Claude capability\.?/iu'
            => '. KeyoAPI lists Claude-class IDs in the live catalog; confirm exact IDs and rates on ' . a('/claude-api-pricing') . ' and ' . a('/pricing-list') . '.',
        '/[,.]?\s*but they do not establish a complete image-generation endpoint, request schema, model list, response format, or feature matrix\.?/iu'
            => '. Confirm the exact image endpoint, request schema, model ID, and response format in current docs and on ' . a('/pricing-list') . '.',
        '/[,.]?\s*but they do not verify a specific speech-to-text endpoint, model ID, SDK method, audio limit, or response schema\.?/iu'
            => '. Confirm the speech-to-text endpoint, model ID, limits, and response schema in current docs before migrating.',
        '/Claude compatibility should never be assumed without explicit confirmation in the current provider documentation\.?/iu'
            => 'Confirm the Claude-class model ID and rates on ' . a('/claude-api-pricing') . ' and ' . a('/pricing-list') . ' before enabling automatic failover.',
        '/treat KeyoAPI as a candidate gateway to evaluate, not as a drop-in Claude replacement\.?/iu'
            => 'use KeyoAPI as an OpenAI-compatible gateway for Claude-class IDs on one key with other catalog models; verify live IDs on ' . a('/pricing-list') . ' before production.',
        '/image generation should be treated as an unverified integration until the current documentation confirms the details\.?/iu'
            => 'treat image generation as production-ready only after confirming the live model ID and request shape in current docs.',
    ];
    foreach ($sentenceMap as $re => $to) {
        $html2 = preg_replace($re, $to, $html);
        if (is_string($html2) && $html2 !== $html) {
            $notes[] = 'sent:' . substr($re, 0, 40);
            $html = $html2;
        }
    }

    // Cleanup awkward punctuation after surgery
    $html = preg_replace('/\.\s*\./u', '.', $html) ?? $html;
    $html = preg_replace('/<p>\s*\./u', '<p>', $html) ?? $html;
    $html = preg_replace('/\s+<\/p>/u', '</p>', $html) ?? $html;

    return [$html, $html !== $orig, array_values(array_unique($notes))];
}

$articleRoot = $blogDir . '/article';
if (!is_dir($articleRoot)) {
    fwrite(STDERR, "No article dir: $articleRoot\n");
    exit(1);
}

$catalogPath = $dataDir . '/catalog.json';
$catalog = is_file($catalogPath) ? json_decode((string)file_get_contents($catalogPath), true) : [];
if (!is_array($catalog)) {
    $catalog = [];
}

$beforeTotal = ['materials' => 0, 'hedge' => 0];
$afterTotal = ['materials' => 0, 'hedge' => 0];
$changed = 0;
$scanned = 0;

$dirs = glob($articleRoot . '/*', GLOB_ONLYDIR) ?: [];
foreach ($dirs as $dir) {
    $slug = basename($dir);
    if (str_contains(strtolower($slug), 'smoke')) {
        continue;
    }
    $path = $dir . '/index.html';
    if (!is_file($path)) {
        continue;
    }
    $html = (string)file_get_contents($path);
    $scanned++;
    $b = claim_hits($html);
    $beforeTotal['materials'] += $b['materials'];
    $beforeTotal['hedge'] += $b['hedge'];

    $title = '';
    if (isset($catalog[$slug]['title'])) {
        $title = (string)$catalog[$slug]['title'];
    } elseif (preg_match('/<h1[^>]*>(.*?)<\/h1>/is', $html, $m)) {
        $title = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    $finalHtml = (string)file_get_contents($path);
    if (preg_match('/(<article class="geoflow-body">)([\s\S]*?)(<\/article>)/i', $finalHtml, $m)) {
        [$body, $did, $notes] = scrub_claims_html($m[2], $title);
        if ($did) {
            $newHtml = $m[1] . $body . $m[3];
            $changed++;
            echo ($dry ? 'DRY ' : 'FIX ') . "$slug materials={$b['materials']} hedge={$b['hedge']} notes=" . implode(',', $notes) . "\n";
            if (!$dry) {
                file_put_contents($path, $newHtml);
                $finalHtml = $newHtml;
            } else {
                $finalHtml = $newHtml;
            }
        } elseif ($b['materials'] + $b['hedge'] > 0) {
            echo "LEFT $slug materials={$b['materials']} hedge={$b['hedge']} (no rule matched)\n";
        }
    } else {
        [$newHtml, $did, $notes] = scrub_claims_html($finalHtml, $title);
        if ($did) {
            $changed++;
            echo ($dry ? 'DRY ' : 'FIX ') . "$slug (full) notes=" . implode(',', $notes) . "\n";
            if (!$dry) {
                file_put_contents($path, $newHtml);
            }
            $finalHtml = $newHtml;
        }
    }

    $a = claim_hits($finalHtml);
    $afterTotal['materials'] += $a['materials'];
    $afterTotal['hedge'] += $a['hedge'];
}

echo "SCANNED={$scanned} CHANGED={$changed}\n";
echo "BEFORE materials={$beforeTotal['materials']} hedge={$beforeTotal['hedge']}\n";
echo "AFTER  materials={$afterTotal['materials']} hedge={$afterTotal['hedge']}\n";

if (!$dry) {
    $rebuild = __DIR__ . '/geoflow-rebuild-blog.php';
    if (is_file($rebuild)) {
        passthru('php ' . escapeshellarg($rebuild) . ' --sanitize-all', $code);
        if ($code !== 0) {
            exit((int)$code);
        }
    }
}

echo 'DONE_MATERIALS' . ($dry ? '_DRY' : '') . "\n";
exit($afterTotal['materials'] + $afterTotal['hedge'] > 0 ? 2 : 0);
