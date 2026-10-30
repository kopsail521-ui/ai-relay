# UnoRouter price guard

UnoRouter's public platform API exposes the current catalog at `https://api.unorouter.com/api/pricing/catalog`. The `input_price` and `output_price` fields are the current dollars-per-million-token prices selected by its default provider routing. The existing Keyo configuration is a static snapshot, so it cannot protect a fixed sell price when upstream costs move.

This repository now includes `scripts/unorouter-price-guard.py`. It reads that catalog every five minutes through the supplied systemd timer and disables only the matching `Keyo Chat` channel's `abilities.enabled` row when the live input or output cost exceeds policy. Other channels for the same model remain eligible. It does not change user balances, public model prices, provider keys, or request bodies.

The example policy uses a default maximum upstream cost of 80% of Keyo's configured sell price, leaving 20% gross margin before payment and infrastructure costs. Per-model absolute caps can override that ratio. The guard fails closed after 15 minutes without a successful catalog read, requires two consecutive within-policy reads to recover, and writes only sanitized state (model names, prices, reasons and timestamps) to the state file.

The configuration is intentionally disabled in the checked-in example. Before enabling it, copy the example to `/opt/ai-relay/config/unorouter-price-guard.json`, review the model list and caps, then run `scripts/install-unorouter-price-guard.sh`. Run the script with `--dry-run` first. A blocked model remains visible in the catalog but calls receive the platform's normal no-available-channel response; the request is stopped before UnoRouter is called.

The live price source and field meanings are documented by [UnoRouter's Platform API](https://unorouter.com/en/docs/platform/platform-api). If a channel is pinned to a specific provider group, use the per-model endpoint and group prices instead of the catalog summary.
