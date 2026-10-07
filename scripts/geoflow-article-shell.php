<?php
declare(strict_types=1);

/**
 * Shared public HTML shell for GEOFlow articles (full document, not a fragment).
 */

if (!function_exists('h')) {
    function h(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}

function geoflow_public_nav(): string
{
    return '  <header class="k-nav">
    <a class="k-wordmark" href="/"><img src="/brand/logo.svg" alt="" width="22" height="22" />KeyoAPI</a>
    <nav aria-label="Primary">
      <a href="/pricing">Pricing</a>
      <a href="/models">Models</a>
      <a href="/compare">Compare</a>
      <a href="/brand/keyo-docs.html">Docs</a>
      <a href="/brand/blog/">Blog</a>
      <a href="/brand/faq.html">FAQ</a>
      <a href="/console">Console</a>
      <a href="/sign-in">Sign in</a>
      <a class="k-nav-cta" href="/sign-up">Get started</a>
    </nav>
  </header>
';
}

function geoflow_extract_body(string $html): string
{
    if (preg_match('/<article class="geoflow-body">([\s\S]*?)<\/article>/i', $html, $m)) {
        return trim($m[1]);
    }
    $trim = ltrim($html);
    if (str_starts_with($trim, '<!DOCTYPE') || str_starts_with($trim, '<html')) {
        if (preg_match('/<body[^>]*>([\s\S]*?)<\/body>/i', $html, $m)) {
            $inner = $m[1];
            $inner = preg_replace('/<header class="k-nav">[\s\S]*?<\/header>/i', '', $inner) ?? $inner;
            $inner = preg_replace('/<p class="k-foot">[\s\S]*?<\/p>/i', '', $inner) ?? $inner;
            return trim($inner);
        }
    }
    return trim($html);
}

function geoflow_wrap_article(
    string $title,
    string $desc,
    string $excerpt,
    string $body,
    string $canonical,
    string $published,
    bool $isDraft
): string {
    $body = preg_replace('/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i', '', $body) ?? $body;
    $robots = $isDraft
        ? '<meta name="robots" content="noindex,nofollow" />' . "\n"
        : '';
    $time = $published !== ''
        ? ' · <time datetime="' . h($published) . '">' . h(substr($published, 0, 10)) . '</time>'
        : '';
    $draft = $isDraft ? ' · <span>Draft</span>' : '';
    $sub = $excerpt !== '' ? '    <p class="sub">' . h($excerpt) . '</p>' . "\n" : '';

    return '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>' . h($title) . ' — KeyoAPI</title>
<meta name="description" content="' . h($desc) . '" />
' . $robots . '<link rel="canonical" href="' . h($canonical) . '" />
<link rel="icon" href="/brand/logo.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/brand/keyo-theme.css" />
</head>
<body>
' . geoflow_public_nav() . '  <div class="k-page">
    <p class="meta"><a href="/brand/blog/">← Blog</a>' . $time . $draft . '</p>
    <h1>' . h($title) . '</h1>
' . $sub . '    <article class="geoflow-body">
' . $body . '
    </article>
    <p class="k-foot"><a href="/brand/blog/">← Blog</a> · <a href="/">Home</a> · <a href="/brand/keyo-docs.html">Docs</a></p>
  </div>
</body>
</html>
';
}
