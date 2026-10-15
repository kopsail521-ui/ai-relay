// Survey: the three speech models' live state + current :free IDs.
(async () => {
  const r = await fetch("https://www.keyoapi.xyz/api/pricing");
  const j = await r.json();
  const s = JSON.stringify(j);
  const targets = ["SenseVoiceSmall", "GLM-ASR", "Spark-TTS-0.5B"];
  for (const t of targets) {
    // find all occurrences (base + :free variants)
    for (const name of [t, t + ":free"]) {
      const i = s.indexOf(`"${name}"`);
      if (i < 0) { console.log(`[live] ${name}: NOT LISTED`); continue; }
      const seg = s.slice(i, i + 600);
      const price = seg.match(/"model_price":[^,}]+/);
      const ratio = seg.match(/"model_ratio":[^,}]+/);
      const quota = seg.match(/"quota_type":[^,}]+/);
      const vendor = seg.match(/"vendor_name":"[^"]*"/);
      const groups = seg.match(/"enable_groups":\[[^\]]*\]/);
      console.log(`[live] ${name}:`, price && price[0], "|", ratio && ratio[0], "|", quota && quota[0], "|", vendor && vendor[0]);
      if (groups) console.log("        ", groups[0]);
    }
  }
  // what :free IDs exist at all
  const frees = [...new Set([...s.matchAll(/"([A-Za-z0-9._-]+:free)"/g)].map((m) => m[1]))];
  console.log("\n[live] all :free IDs:", frees.join(", "));
})();