const drafts = {
  quote: `Remove.bg turning into a $25/mo Canva paywall is wild.

KeyoAPI exposes RMBG-2.0 as an API — batch-remove backgrounds, ~$0.0068 per image.

POST /v1/images/mattings · model=RMBG-2.0
https://www.keyoapi.xyz/pricing/RMBG-2.0`,
  quoteShort: `Skip the $25/mo Canva tax.

RMBG-2.0 on KeyoAPI: batch background removal at ~$0.0068/image.

POST /v1/images/mattings · model=RMBG-2.0
https://www.keyoapi.xyz/pricing/RMBG-2.0`,
};

for (const [k, t] of Object.entries(drafts)) {
  const w = t.replace(/https?:\/\/[^\s]+/g, "x".repeat(23));
  console.log(k, "raw", [...t].length, "x", [...w].length);
}
