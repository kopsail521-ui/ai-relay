/**
 * Shared Caddy handles for KeyoAPI static SEO.
 * Import via: import { caddySeoHandles, caddyFullSite } from "./caddy-seo-shared.mjs"
 */
export function caddySeoHandles() {
  return `	handle /robots.txt {
		root * /opt/ai-relay/static/seo
		header Content-Type text/plain
		file_server
	}
	@sitemaps path /sitemap.xml /sitemap-live.xml
	handle @sitemaps {
		root * /opt/ai-relay/static/seo
		file_server
	}
	handle / {
		root * /opt/ai-relay/static/seo
		rewrite * /index.html
		file_server
	}
	handle /models {
		root * /opt/ai-relay/static/seo
		rewrite * /models.html
		file_server
	}
	handle /compare {
		root * /opt/ai-relay/static/seo
		rewrite * /compare.html
		file_server
	}
	handle /pricing-list {
		root * /opt/ai-relay/static/seo
		rewrite * /pricing.html
		file_server
	}
	handle /free-models {
		root * /opt/ai-relay/static/seo
		rewrite * /free-models.html
		file_server
	}
	handle /gemini-api-pricing {
		root * /opt/ai-relay/static/seo
		rewrite * /gemini-api-pricing.html
		file_server
	}
	handle /deepseek-api-pricing {
		root * /opt/ai-relay/static/seo
		rewrite * /deepseek-api-pricing.html
		file_server
	}
	handle /about {
		root * /opt/ai-relay/static/seo
		rewrite * /about.html
		file_server
	}
	redir /free /free-models permanent
	redir /free/ /free-models permanent
	@seo_model path /model /model/*
	handle @seo_model {
		root * /opt/ai-relay/static/seo
		try_files {path}.html {path}/index.html {path}
		file_server
	}
	handle_path /brand/* {
		root * /opt/ai-relay/static/brand
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
	@gitee_special path /v1/images/object-detection* /v1/images/segmentation* /v1/images/pose-detection* /v1/images/upscaling* /v1/images/unwarping* /v1/images/mattings* /v1/async/* /v1/task/*
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
	encode gzip
${caddySeoHandles()}
	handle /static/* {
		reverse_proxy 127.0.0.1:3000 {
			header_up Accept-Encoding identity
		}
	}${giteeBlock}
	handle /__spa_raw {
		header X-Robots-Tag "noindex, nofollow"
		rewrite * /
		reverse_proxy 127.0.0.1:3000 {
			header_up Accept-Encoding identity
		}
	}
	@spa_noindex path /pricing /sign-in /sign-in/* /sign-up /sign-up/* /console /console/* /rankings /rankings/* /dashboard /dashboard/* /admin /admin/* /setup /setup/*
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
