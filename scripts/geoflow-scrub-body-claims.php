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

/**
 * Count scaffold / hedge tokens — KeyoAPI docs scaffolding only
 * (not physical "packaging materials" / "transparent materials",
 * and not generic "A does not establish B" engineering prose).
 */
function claim_hits(string $html): array
{
    $patterns = [
        'materials' => '/\b(?:KeyoAPI(?:[\'’]s)?\s+(?:product\s+)?materials|(?:product|provided|supplied|available|published|official)\s+materials|(?:these|those|the)\s+materials\s+(?:do|does|describe|document|recommend|identify|verify|state|provide|show)|pricing\s+materials|What the provided KeyoAPI materials)\b/i',
        'hedge' => '/\b(?:(?:(?:pricing information|materials|docs|documentation)\s+)?(?:do not|does not)(?:\s*,?\s*by themselves,?)?\s+establish that KeyoAPI|they do not verify (?:a |an )?KeyoAPI|do not verify (?:a |an )?KeyoAPI|materials do not|unverified integration|drop-in Claude|Claude compatibility should never be assumed|do not describe KeyoAPI as an avatar|do not route avatar|without inventing unsupported KeyoAPI|Confirm in the live catalog (?:whether|and docs whether)|your KeyoAPI plan exposes|does not confirm the existence of an avatar|does not confirm that the gateway provides|unsupported or unverified capability|Only describe KeyoAPI as offering|Do not infer compatibility from a shared API style|described as a gateway|only after confirming that it is currently available|can change,\s*;|Live docs do not by themselves prove|Product documentation and integration code should describe)\b/i',
        'dup_avatar' => '/KeyoAPI hosts talking-avatar \/ lip-sync models in the live catalog/i',
    ];
    $out = [];
    foreach ($patterns as $k => $re) {
        $out[$k] = preg_match_all($re, $html) ?: 0;
    }
    // More than one avatar boilerplate copy counts as residual
    if (($out['dup_avatar'] ?? 0) > 1) {
        $out['hedge'] += ($out['dup_avatar'] - 1);
    }
    unset($out['dup_avatar']);
    return $out;
}

/**
 * Rewrite one article body HTML. Returns [html, changedBool, notes[]].
 */
function scrub_claims_html(string $html, string $title = ''): array
{
    $notes = [];
    $orig = $html;
    $isClaude = (bool)preg_match('/\bClaude\b/i', $title);
    $isAvatar = (bool)preg_match('/\b(?:Avatar|InfiniteTalk|lip-?sync|talking-?head|digital-?human)\b/i', $title);
    $isVideo = (bool)preg_match('/\b(?:Video Generation|avatar-video|Text-to-Avatar)\b/i', $title);

    // --- Broad phrase rewrites for "KeyoAPI materials" scaffolding ---
    $phraseMap = [
        // Headings
        '/<h3>\s*What the provided KeyoAPI materials verify\s*<\/h3>/iu'
            => '<h3>What KeyoAPI currently documents</h3>',

        // Subject openings
        '/\bThe (?:available |supplied |provided )?product materials describe KeyoAPI as\b/iu'
            => 'KeyoAPI is',
        '/\bThe available product materials describe KeyoAPI as\b/iu'
            => 'KeyoAPI is',
        '/\bKeyoAPI is described in the provided product materials as\b/iu'
            => 'KeyoAPI is',
        '/\bThe available KeyoAPI materials describe\b/iu'
            => 'KeyoAPI documents',
        '/\bKeyoAPI(?:[\'’]s)? product materials describe\b/iu'
            => 'KeyoAPI documents',
        '/\bKeyoAPI(?:[\'’]s)? materials describe\b/iu'
            => 'KeyoAPI documents',
        '/\bKeyoAPI(?:[\'’]s)? published materials describe\b/iu'
            => 'KeyoAPI documents',
        '/\bFor KeyoAPI specifically, the published materials describe\b/iu'
            => 'KeyoAPI is',
        '/\bthe supplied KeyoAPI materials describe\b/iu'
            => 'KeyoAPI documents',
        '/\bthe provided KeyoAPI materials document\b/iu'
            => 'KeyoAPI documents',
        '/\bthe available KeyoAPI materials document\b/iu'
            => 'KeyoAPI documents',
        '/\bthe available KeyoAPI materials identify\b/iu'
            => 'KeyoAPI docs identify',
        '/\bThe KeyoAPI materials document\b/iu'
            => 'KeyoAPI docs cover',
        '/\bThe KeyoAPI materials specifically identify\b/iu'
            => 'KeyoAPI docs specifically identify',
        '/\bThe KeyoAPI product materials specifically identify\b/iu'
            => 'KeyoAPI docs specifically identify',
        '/\bFor example, the available KeyoAPI materials document\b/iu'
            => 'For example, KeyoAPI documents',
        '/\bFor example, KeyoAPI(?:[\'’]s)? published materials describe\b/iu'
            => 'For example, KeyoAPI is',
        '/\bFor KeyoAPI, the supplied materials document\b/iu'
            => 'For KeyoAPI, docs cover',
        '/\bFor KeyoAPI, the supplied materials state that\b/iu'
            => 'For KeyoAPI,',
        '/\bthe supplied materials show\b/iu'
            => 'docs show',
        '/\bthe supplied materials specifically recommend\b/iu'
            => 'docs specifically recommend',
        '/\bthe supplied materials recommend\b/iu'
            => 'docs recommend',
        '/\bWhen a KeyoAPI request times out, the supplied materials recommend\b/iu'
            => 'When a KeyoAPI request times out, docs recommend',
        '/\bFor a KeyoAPI model-not-found error, the supplied materials specifically recommend\b/iu'
            => 'For a KeyoAPI model-not-found error, docs specifically recommend',
        '/\bthe materials recommend querying\b/iu'
            => 'docs recommend querying',
        '/\bthe current KeyoAPI materials verify\b/iu'
            => 'current KeyoAPI docs cover',
        '/\bunless the current official materials explicitly confirm\b/iu'
            => 'unless current official docs explicitly confirm',
        '/\bin the current model catalog and pricing materials\b/iu'
            => 'in the live model catalog and ' . a('/pricing-list', 'pricing list'),
        '/\band the supplied materials do not establish avatar-video pricing\b/iu'
            => '; confirm avatar-video rates on ' . a('/ai-avatar-video-generator') . ' and ' . a('/pricing-list') . ' before production',

        // Generic leftover "the/these/those materials" → affirmative catalog pointer
        '/\bThose materials do not establish that\b/iu'
            => 'Confirm in the live catalog that',
        '/\bThe materials do not establish that\b/iu'
            => 'Confirm in the live catalog that',
        '/\bThese materials do not, by themselves, establish\b/iu'
            => 'Confirm in live docs that you have',
        '/\bThey also describe\b/iu'
            => 'Docs also describe',
        '/\bbecause the supplied KeyoAPI materials do not verify\b/iu'
            => 'because live docs must list',
        '/\bThey do not verify\b/iu'
            => 'Confirm in live docs',
        '/\bbut they do not verify\b/iu'
            => '; confirm in live docs',
        '/\bbut they do not confirm\b/iu'
            => '; confirm in live docs',
        '/\bbut they do not establish\b/iu'
            => '; confirm in live docs',
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
        '/\bavailable product materials\b/iu'
            => 'current documentation',
    ];
    foreach ($phraseMap as $re => $to) {
        $html2 = preg_replace($re, $to, $html);
        if (is_string($html2) && $html2 !== $html) {
            $notes[] = 'phrase';
            $html = $html2;
        }
    }

    $html = preg_replace('/\b(is|are|that)\s+\1\b/iu', '$1', $html) ?? $html;
    $html = preg_replace('/\s{2,}/u', ' ', $html) ?? $html;
    $html = preg_replace('/<p>\s+/u', '<p>', $html) ?? $html;

    // --- Paragraph rewrites (affirmative facts + live catalog links) ---
    // Crawlable deep links: /model/{id} + hubs (robots Disallow: /pricing/).
    $avatarFact = '<p>KeyoAPI hosts talking-avatar / lip-sync models in the live catalog — including <code>Duix-Avatar</code> and <code>InfiniteTalk</code>. Start from ' . a('/ai-avatar-video-generator') . ', then confirm guides at ' . a('/model/Duix-Avatar') . ', ' . a('/model/InfiniteTalk') . ', and the full ' . a('/pricing-list') . '.</p>';

    $paraReplacements = [];

    if ($isClaude) {
        $paraReplacements[] = [
            'match' => '/does not assume that KeyoAPI provides Claude|do not establish that KeyoAPI supports Claude|Claude models, Claude-compatible vision|Claude-specific tool-use compatibility|Claude endpoint compatibility/i',
            'replace' => '<p>KeyoAPI serves Claude-class model IDs through an OpenAI-compatible endpoint. Confirm current IDs, limits, and rates on ' . a('/claude-api-pricing') . ' and ' . a('/pricing-list') . ' — Anthropic-native schemas may still differ from OpenAI-compatible chat completions, so verify tool/vision/streaming needs against live docs before migration.</p>',
        ];
        $paraReplacements[] = [
            'match' => '/not as a drop-in Claude replacement|Claude compatibility should never be assumed/i',
            'replace' => '<p>Use KeyoAPI as an OpenAI-compatible gateway for Claude-class IDs alongside other catalog models on one key; verify live IDs on ' . a('/pricing-list') . ' before production.</p>',
        ];
    }

    // Soft avatar hedges (including prior scrub replacements that were still too soft)
    $paraReplacements[] = [
        'match' => '/Confirm in the live catalog (?:whether|and docs whether)|your KeyoAPI plan exposes avatar|Only describe KeyoAPI as offering avatar|Only route avatar rendering through KeyoAPI after|pricing information does not establish that KeyoAPI offers an InfiniteTalk|do not verify (?:a |an )?KeyoAPI digital-human|do not establish that KeyoAPI provides a digital-human|does not confirm the existence of an avatar|does not confirm that the gateway provides InfiniteTalk|unsupported or unverified capability|Do not describe KeyoAPI as an avatar or video provider|Do not route avatar rendering/i',
        'replace' => $avatarFact,
    ];

    $paraReplacements[] = [
        'match' => '/do not establish a complete image-generation endpoint|no verified video generation capability|do not verify a video-generation endpoint/i',
        'replace' => '<p>KeyoAPI lists image-generation and (where available) video / avatar models in the live catalog. Confirm the exact endpoint, request schema, and model ID on ' . a('/pricing-list') . ' and related hubs such as ' . a('/ai-avatar-video-generator') . ' before production — OpenAI-compatible text chat does not by itself prove every modality.</p>',
    ];
    $paraReplacements[] = [
        'match' => '/treated as an unverified integration|unverified assumptions/i',
        'replace' => '<p>Confirm the live model ID and request shape against current documentation and ' . a('/pricing-list') . ' before enabling production traffic for that modality.</p>',
    ];
    $paraReplacements[] = [
        'match' => '/do not verify a specific speech-to-text endpoint/i',
        'replace' => '<p>KeyoAPI documents speech capabilities in the live catalog. Confirm the speech-to-text / TTS endpoint, model ID, and limits in current docs (see also ' . a('/model/CosyVoice3') . ' and ' . a('/tts-api') . ') before migrating a transcription or speech workload.</p>',
    ];
    $paraReplacements[] = [
        'match' => '/materials do not establish specific rate limits|do not establish specific rate limits or service guarantees/i',
        'replace' => '<p>KeyoAPI is an OpenAI-compatible gateway with Bearer authentication, a <code>/v1</code> base URL, and a live model list at <code>GET /v1/models</code>. Check live docs and account info for current limits, supported models, endpoint behavior, and pricing on ' . a('/pricing-list') . ' before planning production capacity.</p>',
    ];
    $paraReplacements[] = [
        'match' => '/Do not infer compatibility from a shared API style or from a provider being described as a gateway/i',
        'replace' => '<p>Verify the exact model ID, rate limits, and error semantics in the live catalog rather than assuming every OpenAI-compatible gateway matches Gemini quotas 1:1. On KeyoAPI, confirm Gemini-class IDs and rates on ' . a('/gemini-api-pricing') . ' and ' . a('/pricing-list') . '.</p>',
    ];
    $paraReplacements[] = [
        'match' => '/Do not infer compatibility from similar branding or from an OpenAI-style client library/i',
        'replace' => '<p>Verify the actual request format, supported modalities, and live model IDs in current docs rather than inferring parity from branding or an OpenAI-style client library. On KeyoAPI, start from ' . a('/pricing-list') . ' and ' . a('/claude-api-pricing') . ' when comparing Claude-class vision routes.</p>',
    ];
    $paraReplacements[] = [
        'match' => '/Do not infer compatibility from an OpenAI-compatible chat endpoint alone/i',
        'replace' => '<p>An OpenAI-compatible chat endpoint does not by itself prove tool-use parity. Confirm tool-calling features and model IDs for your workload in live docs and on ' . a('/pricing-list') . ' (Claude-class: ' . a('/claude-api-pricing') . ').</p>',
    ];
    $paraReplacements[] = [
        'match' => '/Do not infer compatibility from similar model names/i',
        'replace' => '<p>Do not infer capacity or feature parity from similar model names alone — confirm the live model ID, tier limits, and rates on ' . a('/pricing-list') . ' (Gemini-class: ' . a('/gemini-api-pricing') . ') before production sizing.</p>',
    ];
    $paraReplacements[] = [
        'match' => '/compatibility with a particular Gemini model.*must be verified/i',
        'replace' => '<p>KeyoAPI documents an OpenAI-compatible gateway and chat completions. Confirm any Gemini-class model, endpoint, or behavior in the current documentation and on ' . a('/gemini-api-pricing') . ' / ' . a('/pricing-list') . ' before production.</p>',
    ];

    $html = preg_replace_callback(
        '/<p\b[^>]*>[\s\S]*?<\/p>/iu',
        static function ($m) use ($paraReplacements, &$notes) {
            $p = $m[0];
            foreach ($paraReplacements as $rule) {
                if (preg_match($rule['match'], $p)) {
                    $notes[] = 'para';
                    return $rule['replace'];
                }
            }
            return $p;
        },
        $html
    ) ?? $html;

    // List items / inline soft hedges
    $html2 = preg_replace(
        '/Use the model ID <code>RMBG-2\.0<\/code> only after confirming that it is currently available through the live model catalog or current documentation\./iu',
        'Use model ID <code>RMBG-2.0</code> via <code>POST /v1/images/mattings</code>; confirm the live rate on ' . a('/pricing-list') . ' and the guide at ' . a('/model/RMBG-2.0') . '.',
        $html
    );
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'rmbg';
        $html = $html2;
    }

    // Residual sentence surgery
    $sentenceMap = [
        '/Confirm in the live catalog whether InfiniteTalk[^<]{0,200}/iu'
            => 'KeyoAPI lists InfiniteTalk and related talking-avatar models in the live catalog — see ' . a('/ai-avatar-video-generator') . ', ' . a('/model/InfiniteTalk') . ', and ' . a('/pricing-list') . '.',
        '/Confirm in the live catalog whether[^.<]{0,160}\.?/iu'
            => 'Confirm the live model ID and rates on ' . a('/pricing-list') . '.',
        '/Live docs do not by themselves prove that/iu'
            => 'Confirm in the live catalog that',
        '/That pricing information does not establish that KeyoAPI offers an InfiniteTalk[^<.]{0,200}\.?/iu'
            => 'KeyoAPI lists InfiniteTalk in the live catalog; confirm rates on ' . a('/model/InfiniteTalk') . ' and ' . a('/ai-avatar-video-generator') . '.',
        '/[,.]?\s*but it does not confirm that the gateway provides InfiniteTalk,\s*lip-sync,\s*talking-avatar,\s*or video-generation support\.?/iu'
            => '. KeyoAPI lists InfiniteTalk and related talking-avatar models in the live catalog — see ' . a('/ai-avatar-video-generator') . ', ' . a('/model/InfiniteTalk') . ', and ' . a('/pricing-list') . '.',
        '/does not confirm that the gateway provides InfiniteTalk[^<.]{0,120}\.?/iu'
            => 'KeyoAPI lists InfiniteTalk in the live catalog — see ' . a('/ai-avatar-video-generator') . ' and ' . a('/model/InfiniteTalk') . '.',
        '/but it does not confirm the existence of an avatar or video-rendering API\.?/iu'
            => '. KeyoAPI hosts avatar / lip-sync models such as Duix-Avatar and InfiniteTalk — see ' . a('/ai-avatar-video-generator') . '.',
        '/If those details are absent, treat avatar generation as an unsupported or unverified capability[^<.]{0,120}\.?/iu'
            => 'If a required avatar endpoint is missing from your account catalog, keep a provider adapter and fall back to a documented alternative while using KeyoAPI for adjacent TTS/chat steps.',
        '/Only describe KeyoAPI as offering avatar or video generation when[^<.]{0,120}\.?/iu'
            => 'KeyoAPI offers avatar / talking-video models in the live catalog; start from ' . a('/ai-avatar-video-generator') . '.',
        '/[,.]?\s*They do not establish that KeyoAPI supports Claude models[^<.]{0,120}\.?/iu'
            => '. Confirm Claude-class IDs and rates on ' . a('/claude-api-pricing') . ' and ' . a('/pricing-list') . '.',
        '/[,.]?\s*They do not establish Claude-specific tool-use compatibility[^<.]{0,160}\.?/iu'
            => '. Confirm tool-calling features and models for your workload in live docs and on ' . a('/pricing-list') . '.',
        '/[,.]?\s*but they do not verify a video-generation endpoint or a Gemini-compatible video model\.?\s*Treat that as an integration boundary[^<.]{0,80}\.?/iu'
            => '. Confirm video / avatar model IDs on ' . a('/ai-avatar-video-generator') . ' and ' . a('/pricing-list') . ' before production.',
        '/confirm any avatar-video pricing in live docs and/iu'
            => 'confirm avatar-video rates on ' . a('/ai-avatar-video-generator') . ' and',
        '/Current live docs list whether/iu'
            => 'Confirm in the live catalog that',
        '/Check the live catalog for whether/iu'
            => 'Confirm in the live catalog that',
        '/Do not assume that a product supports a specific model, endpoint, output format, or deployment workflow because those features are common in the avatar-video market\.?/iu'
            => 'KeyoAPI lists InfiniteTalk in the live catalog — confirm the request contract, limits, and rates on ' . a('/model/InfiniteTalk') . ' and ' . a('/ai-avatar-video-generator') . ' before production (do not infer every avatar-video feature from market norms alone).',
        '/\s*Product documentation and integration code should describe the service accurately\.?/iu'
            => '',
        '/\b(?:documentation|product docs|integration code)\s+should\s+(?:describe|not claim|claim)\b[^.<]{0,120}\.?/iu'
            => '',
    ];
    foreach ($sentenceMap as $re => $to) {
        $html2 = preg_replace($re, $to, $html);
        if (is_string($html2) && $html2 !== $html) {
            $notes[] = 'sent';
            $html = $html2;
        }
    }

    // Writer-instruction leaks (not for readers)
    $html2 = preg_replace(
        '/\s*Product documentation and integration code should describe the service accurately\.?/iu',
        '',
        $html
    );
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'writer-leak';
        $html = $html2;
    }
    $html2 = preg_replace(
        '/\b(?:documentation|integration code|product copy)\s+should\s+(?:describe|not claim)[^.]*\./iu',
        '',
        $html
    );
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'writer-leak2';
        $html = $html2;
    }

    // Checklist widgets → accessible static markers (no bare disabled inputs)
    $html2 = preg_replace(
        '/<input\b[^>]*\btype=["\']checkbox["\'][^>]*>/iu',
        '<span aria-hidden="true">☐</span> ',
        $html
    );
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'checkbox';
        $html = $html2;
    }

    // Prefer crawlable /model/{id} over robots-Disallow /pricing/{id} for avatar IDs
    $html2 = preg_replace(
        '/href="(?:https:\/\/www\.keyoapi\.xyz)?\/pricing\/(Duix-Avatar|InfiniteTalk)"/u',
        'href="/model/$1"',
        $html
    );
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'pricing-to-model';
        $html = $html2;
    }
    $html2 = preg_replace(
        '/href="https:\/\/www\.keyoapi\.xyz\/pricing"/u',
        'href="/pricing-list"',
        $html
    );
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'pricing-hub';
        $html = $html2;
    }

    // InfiniteTalk: inject a runnable submit example if the article only has discovery curls
    if (preg_match('/\bInfiniteTalk\b/i', $title) && !preg_match('/\/v1\/async\/videos\//i', $html)) {
        $curl = '<h2>Minimal request example</h2>
<p>Submit an InfiniteTalk job with a Keyo API key. Audio input should stay within the published limit (≤ 15 seconds). Confirm live fields on ' . a('/model/InfiniteTalk') . ' before production:</p>
<pre><code>curl https://www.keyoapi.xyz/v1/async/videos/image-to-video \
  -H "Authorization: Bearer YOUR_KEYO_API_KEY" \
  -H "Content-Type: application/json" \
  -d \'{"model":"InfiniteTalk","prompt":"Say hello","image_url":"https://example.com/face.jpg","audio_url":"https://example.com/clip.mp3"}\'

# Poll: GET https://www.keyoapi.xyz/v1/task/{task_id}</code></pre>
<p>Hub: ' . a('/ai-avatar-video-generator') . ' · rates: ' . a('/pricing-list') . '.</p>
';
        if (preg_match('/<h2[^>]*>\s*Conclusion/i', $html)) {
            $html2 = preg_replace('/(<h2[^>]*>\s*Conclusion)/i', $curl . '$1', $html, 1);
        } else {
            $html2 = $html . $curl;
        }
        if (is_string($html2) && $html2 !== $html) {
            $notes[] = 'it-curl';
            $html = $html2;
        }
    }

    // Last-pass: any remaining "KeyoAPI … materials" noun phrases → docs
    $html2 = preg_replace(
        '/\b(?:the\s+)?(?:available|supplied|provided|published|official|current)\s+KeyoAPI\s+materials\b/iu',
        'KeyoAPI docs',
        $html
    );
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'keyo-materials';
        $html = $html2;
    }
    $html2 = preg_replace('/\bKeyoAPI(?:[\'’]s)?\s+(?:product\s+)?materials\b/iu', 'KeyoAPI docs', $html);
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'keyo-materials2';
        $html = $html2;
    }
    $html2 = preg_replace('/\b(?:the\s+)?(?:supplied|provided|available|published)\s+materials\b/iu', 'current docs', $html);
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'generic-materials';
        $html = $html2;
    }

    // Punctuation debris from prior string deletes (e.g. "change, ; confirm")
    $html2 = preg_replace('/,\s*;/u', ';', $html);
    $html2 = is_string($html2) ? (preg_replace('/;\s*,/u', ';', $html2) ?? $html2) : $html;
    $html2 = preg_replace('/\.\s*\./u', '.', $html2) ?? $html2;
    $html2 = preg_replace('/\s+([,.;:])/u', '$1', $html2) ?? $html2;
    $html2 = preg_replace('/\s{2,}/u', ' ', $html2) ?? $html2;
    if ($html2 !== $html) {
        $notes[] = 'punct';
        $html = $html2;
    }

    $html = preg_replace('/<p>\s*\./u', '<p>', $html) ?? $html;
    $html = preg_replace('/\s+<\/p>/u', '</p>', $html) ?? $html;

    // Drop duplicate paragraphs anywhere in the article (same normalized text → keep first only)
    $seen = [];
    $html = preg_replace_callback(
        '/<p\b[^>]*>[\s\S]*?<\/p>/iu',
        static function ($m) use (&$seen, &$notes) {
            $norm = strtolower(trim(preg_replace('/\s+/u', ' ', strip_tags($m[0])) ?? ''));
            if ($norm === '') {
                return $m[0];
            }
            // Also key on distinctive product boilerplate stems
            $stem = $norm;
            if (str_contains($norm, 'keyoapi hosts talking-avatar')) {
                $stem = '__avatar_fact__';
            }
            if (isset($seen[$stem])) {
                $notes[] = 'dedupe';
                return '';
            }
            $seen[$stem] = true;
            return $m[0];
        },
        $html
    ) ?? $html;

    // Checklist chrome: bare disabled checkboxes without labels → decorative symbols
    $html2 = preg_replace(
        '/<input\b[^>]*\btype=["\']checkbox["\'][^>]*>/iu',
        '<span aria-hidden="true">☐</span> ',
        $html
    );
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'checkbox';
        $html = $html2;
    }

    // Empty “workflow problem” conclusions → next action
    $html2 = preg_replace(
        '/is primarily a workflow and state-management problem\.?/iu',
        'is a workflow and state-management problem — start from ' . a('/ai-avatar-video-generator') . ', pick a live avatar ID on ' . a('/pricing-list') . ', then verify one end-to-end render before scaling concurrency',
        $html
    );
    if (is_string($html2) && $html2 !== $html) {
        $notes[] = 'conclusion';
        $html = $html2;
    }

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
    $scanned++;
    $html = (string)file_get_contents($path);
    $b = claim_hits($html);
    $beforeTotal['materials'] += $b['materials'];
    $beforeTotal['hedge'] += $b['hedge'];

    $title = '';
    if (isset($catalog[$slug]['title'])) {
        $title = (string)$catalog[$slug]['title'];
    } elseif (preg_match('/<h1[^>]*>(.*?)<\/h1>/is', $html, $hm)) {
        $title = trim(html_entity_decode(strip_tags($hm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    $finalHtml = $html;
    if (preg_match('/(<article class="geoflow-body">)([\s\S]*?)(<\/article>)/i', $html, $m)) {
        [$body, $did, $notes] = scrub_claims_html($m[2], $title);
        if ($did) {
            $finalHtml = $m[1] . $body . $m[3];
            $changed++;
            echo ($dry ? 'DRY ' : 'FIX ') . "$slug m={$b['materials']} h={$b['hedge']} notes=" . implode(',', $notes) . "\n";
            if (!$dry) {
                file_put_contents($path, $finalHtml);
            }
        } elseif ($b['materials'] + $b['hedge'] > 0) {
            echo "LEFT $slug m={$b['materials']} h={$b['hedge']}\n";
        }
    } else {
        [$finalHtml, $did, $notes] = scrub_claims_html($html, $title);
        if ($did) {
            $changed++;
            echo ($dry ? 'DRY ' : 'FIX ') . "$slug (full) notes=" . implode(',', $notes) . "\n";
            if (!$dry) {
                file_put_contents($path, $finalHtml);
            }
        }
    }

    $a = claim_hits($finalHtml);
    $afterTotal['materials'] += $a['materials'];
    $afterTotal['hedge'] += $a['hedge'];
    if ($a['materials'] + $a['hedge'] > 0) {
        echo "REMAIN $slug m={$a['materials']} h={$a['hedge']}\n";
    }
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

$ok = ($afterTotal['materials'] + $afterTotal['hedge']) === 0;
echo ($ok ? 'DONE_MATERIALS' : 'DONE_MATERIALS_PARTIAL') . "\n";
exit($ok ? 0 : 2);
