const posts = [
  `DeepSeek-V4.1-Flash is live on KeyoAPI.

Early community checks keep calling out three surprises:
• Flash beating last-gen Pro on coding / automation benches
• 1M context with tiny KV cost + ~200 tok/s class throughput
• Strong UI + vision debug from screenshots → React/Tailwind`,

  `OpenAI-compatible. Model: deepseek-v4.1-flash
Indicative: ~$0.45 / $1.80 per 1M in/out

Grab a key → top up → ship: https://www.keyoapi.xyz/
Docs: https://www.keyoapi.xyz/brand/keyo-docs.html`,
];

for (const [i, t] of posts.entries()) {
  const weighted = t.replace(/https?:\/\/[^\s]+/g, "x".repeat(23));
  console.log(`${i + 1}: raw=${[...t].length} x=${[...weighted].length}`);
}
