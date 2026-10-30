#!/usr/bin/env python3
"""Disable UnoRouter channel abilities when live upstream prices exceed policy.

The public UnoRouter pricing catalog is used deliberately: it reports the
current price selected by UnoRouter's default provider routing without sending
an inference request.  This process changes only the target channel's
``abilities.enabled`` values; it never changes user balances or model prices.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


DEFAULT_URL = "https://api.unorouter.com/api/pricing/catalog"


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return default


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def fetch_catalog(url: str, timeout: float) -> dict:
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "KeyoAPI-price-guard/1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError("pricing catalog HTTP %s" % response.status)
        payload = json.loads(response.read(8 * 1024 * 1024).decode("utf-8"))
    models = payload.get("models")
    if not isinstance(models, list):
        raise RuntimeError("pricing catalog has no models array")
    return payload


def finite_price(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if value >= 0 else None


def price_rows(catalog: dict) -> dict[str, dict]:
    rows = {}
    for row in catalog.get("models", []):
        if not isinstance(row, dict) or not isinstance(row.get("model_name"), str):
            continue
        rows[row["model_name"]] = {
            "input_price": finite_price(row.get("input_price")),
            "output_price": finite_price(row.get("output_price")),
            "online": bool(row.get("online")),
            "is_free": bool(row.get("is_free")),
        }
    return rows


def option_json(conn: sqlite3.Connection, key: str, default):
    row = conn.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
    if not row:
        return default
    try:
        value = json.loads(row[0])
    except (ValueError, TypeError):
        return default
    return value


def sell_prices(conn: sqlite3.Connection, model: str) -> tuple[float | None, float | None]:
    ratios = option_json(conn, "ModelRatio", {})
    completion = option_json(conn, "CompletionRatio", {})
    try:
        ratio = float(ratios[model])
        completion_ratio = float(completion.get(model, 1))
    except (KeyError, TypeError, ValueError):
        return None, None
    # vps-add-unorouter-paid.py stores ModelRatio as sell_input / 2.
    sell_input = ratio * 2
    sell_output = sell_input * completion_ratio
    if sell_input <= 0 or sell_output <= 0:
        return None, None
    return sell_input, sell_output


def target_channel(conn: sqlite3.Connection, name: str):
    cols = {row[1] for row in conn.execute("PRAGMA table_info(channels)")}
    where = " WHERE name=?"
    args = [name]
    if "deleted_at" in cols:
        where += " AND (deleted_at IS NULL OR deleted_at=0)"
    return conn.execute("SELECT id FROM channels" + where + " ORDER BY id LIMIT 1", args).fetchone()


def ability_rows(conn: sqlite3.Connection, channel_id: int, model: str):
    return conn.execute("SELECT rowid, enabled FROM abilities WHERE channel_id=? AND model=?", (channel_id, model)).fetchall()


def policy_for(config: dict, model: str, sell_input: float | None, sell_output: float | None, explicit=None):
    overrides = config.get("model_overrides") or {}
    override = overrides.get(model) if isinstance(overrides, dict) else None
    override = dict(override) if isinstance(override, dict) else {}
    if isinstance(explicit, dict):
        override.update({key: value for key, value in explicit.items() if value is not None})
    share = override.get("max_cost_share_of_sell", config.get("max_cost_share_of_sell", 0.8))
    try:
        share = float(share)
    except (TypeError, ValueError):
        raise RuntimeError("max_cost_share_of_sell must be numeric")
    if not 0 < share <= 1:
        raise RuntimeError("max_cost_share_of_sell must be between 0 and 1")
    max_input = finite_price(override.get("max_input_price"))
    max_output = finite_price(override.get("max_output_price"))
    if max_input is None and sell_input is not None:
        max_input = sell_input * share
    if max_output is None and sell_output is not None:
        max_output = sell_output * share
    return max_input, max_output, share


def target_specs(config: dict) -> list[dict]:
    """Normalize the original one-channel config and the multi-channel form."""
    targets = config.get("targets")
    if not isinstance(targets, list) or not targets:
        return [config]
    result = []
    for target in targets:
        if not isinstance(target, dict):
            continue
        merged = dict(config)
        merged.update(target)
        result.append(merged)
    return result


def model_specs(target: dict) -> list[dict]:
    result = []
    for item in target.get("models") or []:
        if isinstance(item, str) and item.strip():
            result.append({"public_model": item.strip(), "upstream_model": item.strip()})
            continue
        if not isinstance(item, dict):
            continue
        public = item.get("public_model") or item.get("model") or item.get("id")
        if isinstance(public, str) and public.strip():
            result.append({
                "public_model": public.strip(),
                "upstream_model": str(item.get("upstream_model") or item.get("upstream") or public).strip(),
                "max_input_price": item.get("max_input_price"),
                "max_output_price": item.get("max_output_price"),
            })
    return result


def set_blocked(conn, channel_id: int, model: str, state: dict, reason: str) -> None:
    key = "%s:%s" % (channel_id, model)
    entry = state.setdefault("models", {}).setdefault(key, {})
    if not entry.get("blocked_by_guard"):
        entry["restore_enabled"] = any(int(row[1] or 0) != 0 for row in ability_rows(conn, channel_id, model))
    conn.execute("UPDATE abilities SET enabled=0 WHERE channel_id=? AND model=?", (channel_id, model))
    entry.update({"blocked_by_guard": True, "reason": reason, "updated_at": now_iso()})


def set_recovered(conn, channel_id: int, model: str, state: dict) -> None:
    key = "%s:%s" % (channel_id, model)
    entry = (state.get("models") or {}).get(key) or {}
    if not entry.get("blocked_by_guard"):
        return
    if entry.get("restore_enabled", True):
        conn.execute("UPDATE abilities SET enabled=1 WHERE channel_id=? AND model=?", (channel_id, model))
    entry.update({"blocked_by_guard": False, "reason": "within_policy", "updated_at": now_iso()})


def run(config: dict, db_path: Path, state_path: Path, catalog: dict | None = None, dry_run: bool = False) -> dict:
    if not config.get("enabled", False):
        return {"result": "PRICE_GUARD_DISABLED", "enforce": False}
    targets = target_specs(config)
    if not targets or not any(model_specs(target) for target in targets):
        return {"result": "PRICE_GUARD_NO_MODELS", "enforce": True}
    conn = sqlite3.connect(str(db_path), timeout=5)
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        state = read_json(state_path, {"models": {}})
        if not isinstance(state, dict):
            state = {"models": {}}
        price_rows_by_model = None
        fetch_error = None
        if catalog is None:
            try:
                catalog = fetch_catalog(config.get("catalog_url", DEFAULT_URL), float(config.get("request_timeout_sec", 15)))
            except Exception as error:  # noqa: BLE001 - state records only the class
                fetch_error = type(error).__name__
        if catalog is not None:
            price_rows_by_model = price_rows(catalog)
            state["last_success_at"] = now_iso()
            state["last_success_epoch"] = time.time()
            state["catalog_counts"] = catalog.get("counts") if isinstance(catalog.get("counts"), dict) else {}
        stale_after = float(config.get("stale_after_sec", 900))
        last_success = float(state.get("last_success_epoch") or 0)
        stale = fetch_error is not None and (not last_success or time.time() - last_success > stale_after)
        rows = []
        channel_ids = []
        for target in targets:
            channel = target_channel(conn, target.get("channel_name", "Keyo Chat"))
            if not channel:
                raise RuntimeError("target channel not found")
            channel_id = int(channel[0])
            channel_ids.append(channel_id)
            for spec in model_specs(target):
                public_model = spec["public_model"]
                upstream_model = spec["upstream_model"]
                sell_input, sell_output = sell_prices(conn, public_model)
                max_input, max_output, share = policy_for(target, public_model, sell_input, sell_output, spec)
                current = (price_rows_by_model or {}).get(upstream_model)
                reason = None
                if stale:
                    reason = "price_data_stale"
                elif current is None:
                    reason = "model_missing_from_catalog"
                elif not current["online"]:
                    reason = "model_offline"
                elif max_input is None or max_output is None:
                    reason = "sell_price_missing"
                elif current["input_price"] is None or current["output_price"] is None:
                    reason = "upstream_price_missing"
                elif current["input_price"] >= max_input or current["output_price"] >= max_output:
                    reason = "upstream_price_over_cap"
                key = "%s:%s" % (channel_id, public_model)
                entry = state.setdefault("models", {}).setdefault(key, {})
                good = reason is None
                entry["consecutive_good"] = int(entry.get("consecutive_good") or 0) + 1 if good else 0
                if not dry_run:
                    if reason:
                        set_blocked(conn, channel_id, public_model, state, reason)
                    elif entry["consecutive_good"] >= int(config.get("recovery_checks", 2)):
                        set_recovered(conn, channel_id, public_model, state)
                    state.setdefault("models", {})[key] = entry
                rows.append({"model": public_model, "upstream_model": upstream_model, "reason": reason, "good": good,
                             "input_price": current.get("input_price") if current else None,
                             "output_price": current.get("output_price") if current else None,
                             "max_input_price": max_input, "max_output_price": max_output,
                             "max_cost_share_of_sell": share, "consecutive_good": entry["consecutive_good"]})
        if fetch_error:
            state["last_error_class"] = fetch_error
        else:
            state.pop("last_error_class", None)
        state["last_run_at"] = now_iso()
        state["last_result"] = "PRICE_GUARD_STALE" if stale else "PRICE_GUARD_OK"
        if not dry_run:
            conn.commit()
            write_json(state_path, state)
        return {"result": state["last_result"], "enforce": True,
                "channel_id": channel_ids[0] if len(channel_ids) == 1 else None,
                "channel_ids": channel_ids,
                "stale": stale, "fetch_error_class": fetch_error, "models": rows}
    finally:
        conn.close()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--db", required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    config = read_json(Path(args.config), {})
    try:
        result = run(config, Path(args.db), Path(args.state), dry_run=args.dry_run)
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")), flush=True)
        return 0
    except Exception as error:  # noqa: BLE001 - do not print DB paths or credentials
        print(json.dumps({"result": "PRICE_GUARD_FAILED", "error_class": type(error).__name__}, ensure_ascii=False), flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
