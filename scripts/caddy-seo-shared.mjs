/**
 * Shared Caddy handles for KeyoAPI static SEO.
 * Import via: import { caddySeoHandles, caddyFullSite } from "./caddy-seo-shared.mjs"
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const landingsPath = path.join(__dirname, "../config/seo/pricing-landings.json");

function pricingLandingSlugs() {
  try {
    const data = JSON.parse(fs.readFileSync(landingsPath, "utf8"));
    return (data.pages || []).map((p) => p.slug).filter(Boolean);
  } catch {
    return [];
  }
}

/** Landing-only handles for deploy-brand-static.sh (no runtime node). */
export function caddyLandingHandles(seoRoot = "/opt/ai-relay") {
  const root = `${seoRoot}/static/seo`;
  return pricingLandingSlugs()
    .map(
      (slug) => `	handle /${slug} {
		root * ${root}
		rewrite * /${slug}.html
		file_server
	}`
    )
    .join("\n");
}

/** Placeholder form so deploy can sed ROOT without calling node under sudo. */
export function caddyLandingHandlesTemplate() {
  return caddyLandingHandles("__AI_RELAY_ROOT__");
}

/** @param {string} [seoRoot] absolute path used in Caddy root directives */
export function caddySeoHandles(seoRoot = "/opt/ai-relay") {
  const root = `${seoRoot}/static/seo`;
  const landingBlocks = caddyLandingHandles(seoRoot);

  return `	handle /robots.txt {
		root * ${root}
		header Content-Type text/plain
		file_server
	}
	@sitemaps path /sitemap.xml /sitemap-live.xml
	handle @sitemaps {
		root * ${root}
		file_server
	}
	handle / {
		root * ${root}
		rewrite * /index.html
		file_server
	}
	handle /models {
		root * ${root}
		rewrite * /models.html
		file_server
	}
	handle /compare {
		root * ${root}
		rewrite * /compare.html
		file_server
	}
	handle /pricing-list {
		root * ${root}
		rewrite * /pricing.html
		file_server
	}
	handle /free-models {
		root * ${root}
		rewrite * /free-models.html
		file_server
	}
${landingBlocks}
	handle /about {
		root * ${root}
		rewrite * /about.html
		file_server
	}
	redir /free /free-models permanent
	redir /free/ /free-models permanent
	@seo_model path /model /model/*
	handle @seo_model {
		root * ${root}
		try_files {path}.html {path}/index.html {path}
		file_server
	}
	handle_path /brand/* {
		root * ${seoRoot}/static/brand
		file_server
	}
	handle_path /uploads/* {
		root * ${seoRoot}/static/uploads
		header Cache-Control "public, max-age=3600"
		header X-Content-Type-Options "nosniff"
		file_server
	}`;
}

/**
 * @param {{ gitee?: boolean }} opts
 */
export function caddyFullSite(opts = {}) {
  const gitee = opts.gitee !== false;
  const giteeBlock = gitee
    ? `
	@gitee_special path /v1/images/object-detection* /v1/images/segmentation* /v1/images/pose-detection* /v1/images/upscaling* /v1/images/unwarping* /v1/images/mattings* /v1/async/* /v1/task/* /v1/systemone*
	handle @gitee_special {
		reverse_proxy 127.0.0.1:3010 {
			header_up Accept-Encoding identity
		}
	}`
    : "";

  // Apex must 301 → www so GSC domain property can follow redirects to sitemap.
  return `keyoapi.xyz {
	redir https://www.keyoapi.xyz{uri} permanent
}

www.keyoapi.xyz {
	@compress_pages not path /v1/*
	encode @compress_pages gzip
${caddySeoHandles()}
	handle /static/* {
		reverse_proxy 127.0.0.1:3000 {
			header_up Accept-Encoding identity
		}
	}${giteeBlock}
	# Exact /pricing = Model Square via :3001 (vendor order + icon injects). Not spa-shell.
	handle /pricing {
		header X-Robots-Tag "noindex, nofollow"
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
	handle /__spa_raw {
		header X-Robots-Tag "noindex, nofollow"
		rewrite * /
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
	# Auth: native SPA via :3001 (same as /login). Avoid spa-shell DOMParser boot failures.
	@spa_auth path /sign-in /sign-in/* /sign-up /sign-up/*
	handle @spa_auth {
		header X-Robots-Tag "noindex, nofollow"
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
	@spa_noindex path /console /console/* /rankings /rankings/* /dashboard /dashboard/* /admin /admin/* /setup /setup/*
	handle @spa_noindex {
		header X-Robots-Tag "noindex, nofollow"
		header Content-Type "text/html; charset=utf-8"
		respond <<'SPAEOF'
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="robots" content="noindex, nofollow" /><title>KeyoAPI</title></head>
<body><div id="root"></div><p>Use deploy-brand-static.sh to embed full spa-shell.</p></body></html>
SPAEOF 200
	}
	handle {
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
}
`;
}
