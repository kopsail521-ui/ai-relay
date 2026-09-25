#!/usr/bin/env python3
"""Local/VPS smoke: signed POST to geoflow-agent (does not mark GEOFlow synced)."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from urllib import error, request

SITE = os.environ.get("GEOFLOW_SITE", "https://www.keyoapi.xyz")
URL = f"{SITE}/brand/blog/geoflow-agent/v1/articles"
CONFIG = os.environ.get(
    "GEOFLOW_CONFIG", "/opt/ai-relay/data/geoflow-agent/config.json"
)


def main() -> int:
    with open(CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    key_id = cfg["key_id"]
    secret = cfg["secret"]
    if key_id == "REPLACE_ME" or secret == "REPLACE_ME_LONG_RANDOM_SECRET":
        print("config still has REPLACE_ME placeholders", file=sys.stderr)
        return 2

    body_obj = {
        "version": "1.0",
        "source": "geoflow",
        "event": "article.publish",
        "article": {
            "id": 0,
            "title": "GEOFlow agent smoke test",
            "slug": "geoflow-smoke-test",
            "excerpt": "Signed publish smoke test",
            "content": "Smoke body",
            "content_format": "markdown",
            "content_html": "<p>Smoke body</p>",
            "hero_image_url": "",
            "keywords": "",
            "meta_description": "Smoke",
            "status": "published",
            "is_featured": False,
            "is_hot": False,
            "published_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "category": {"id": 1, "name": "Developer Guides", "slug": "developer-guides"},
            "author": {"id": 1, "name": "KeyoAPI Editorial Team"},
            "task": {"id": 0, "name": "smoke"},
        },
        "assets": {"images": []},
    }
    raw = json.dumps(body_obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    body_hash = hashlib.sha256(raw).hexdigest()
    ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    nonce = str(uuid.uuid4())
    signing = "\n".join(["POST", "/geoflow-agent/v1/articles", ts, nonce, body_hash])
    sig = hmac.new(secret.encode("utf-8"), signing.encode("utf-8"), hashlib.sha256).hexdigest()
    idem = f"smoke-{body_hash[:16]}"

    req = request.Request(URL, data=raw, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    req.add_header("X-GEOFlow-Key-Id", key_id)
    req.add_header("X-GEOFlow-Timestamp", ts)
    req.add_header("X-GEOFlow-Nonce", nonce)
    req.add_header("X-GEOFlow-Idempotency-Key", idem)
    req.add_header("X-GEOFlow-Body-SHA256", body_hash)
    req.add_header("X-GEOFlow-Signature", sig)
    req.add_header("X-GEOFlow-Event", "article.publish")

    try:
        with request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            print(resp.status, text)
            data = json.loads(text)
            return 0 if data.get("ok") is True else 1
    except error.HTTPError as e:
        print(e.code, e.read().decode("utf-8", errors="replace"), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
