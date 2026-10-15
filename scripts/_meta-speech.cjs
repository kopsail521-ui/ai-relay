// Fetch full live metadata for the three speech models (for the twin rows).
(async () => {
  const r = await fetch("https://www.keyoapi.xyz/api/pricing");
  const j = await r.json();
  const data = Array.isArray(j.data) ? j.data : [];
  for (const m of data) {
    if (["SenseVoiceSmall", "GLM-ASR", "Spark-TTS-0.5B"].includes(m.model_name)) {
      console.log(JSON.stringify(m, null, 1));
      console.log("---");
    }
  }
})();