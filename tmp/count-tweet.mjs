const tweets = [
`This UI never cuts.

One shape morphs across every state — button → loader → player → chart → ⌘K → toast — on a 120 BPM grid, springs only, cursor-driven.

Directed + built with Claude Opus 5.5 via KeyoAPI.
model=claude-opus-5-5 · https://www.keyoapi.xyz/`,

`The Battle of Red Cliffs (208 AD) — told as a code-rendered cinematic.

Mist on the Yangtze. Chained fleets. Fire ships. The southeast wind.

Not a slide deck. A film that happens to be software.
Opus 5.5 on KeyoAPI → model=claude-opus-5-5
https://www.keyoapi.xyz/`,

`USA history in one loop:

Mayflower rain → Boston Tea Party → Hancock's signature → Delaware ice → cowboy lasso → jazz smokestacks → Apollo helmet → garage → smartphone.

Claude Opus 5.5 wrote the whole ride.
KeyoAPI · model=claude-opus-5-5
https://www.keyoapi.xyz/`,

`UK, from Stonehenge toy-blocks to a red bus under the Shard.

Romans vs drizzle. Bayeux chaos. Henry VIII "ANNULLED." Watt's kettle → locomotive.

History with jokes, still accurate enough to teach.
Built with Opus 5.5 on KeyoAPI → claude-opus-5-5
https://www.keyoapi.xyz/`,

`France, condensed:

Gallic rooster steals Caesar's wreath → Versailles heels → Bastille baguettes → Napoleon on a tiny horse → Impressionist dots → Eiffel sprouts "Voilà!"

Claude Opus 5.5. One OpenAI-compatible call.
model=claude-opus-5-5 · https://www.keyoapi.xyz/`,

`Persia / Iran — Cyrus Cylinder to Azadi Tower.

"Rule #1: be nice." Thermopylae Immortals. Silk Road express carpet. Algebra from Khwarizmi's book.

Epic scale, coded by Opus 5.5 on KeyoAPI.
claude-opus-5-5 · https://www.keyoapi.xyz/`,

`Russia in nesting-doll layers:

Rurik → Golden Horde → Ivan → Peter's scissors → Napoleon ice cube → Gagarin "Poyekhali!" → modern Moscow.

Claude Opus 5.5 directed this loop.
KeyoAPI · model=claude-opus-5-5
https://www.keyoapi.xyz/`,

`Japan: Jōmon pot → Tang envoys → kemari → Whack-a-Shogun → sakoku tea stall → Black Ships → neon Tokyo.

One continuous visual language. Opus 5.5 on KeyoAPI.
model=claude-opus-5-5 · ~$1.76/$8.82 per 1M
https://www.keyoapi.xyz/`,

`Korea — Dangun's cave to K-pop lightsticks.

Hangul "learn in a morning." Turtle Ships. Miracle on the Han. Sync dances.

Claude Opus 5.5 turned the brief into motion.
KeyoAPI · claude-opus-5-5
https://www.keyoapi.xyz/`,

`Spain: Segovia aqueduct (no mortar) → Alhambra pop-up → Columbus potatoes → Don Quixote vs windmills → Gaudí still unfinished → GOOOOL!

Opus 5.5 via KeyoAPI. Swap base_url, keep your agent.
model=claude-opus-5-5 · https://www.keyoapi.xyz/`,

`Portugal — Age of Discovery edition.

Pastel de nata → compass → da Gama waves to sea monsters → Magellan (18 made it back) → 1755 rebuild snap → Tram 28.

Claude Opus 5.5 on KeyoAPI.
claude-opus-5-5 · https://www.keyoapi.xyz/`,

`Germany, drawn like an engineering blueprint.

Teutoburg ambush. "Neither holy, nor Roman, nor an empire." Luther's hammer. Benz at 16 km/h. Wall as dominoes. Prost!

Opus 5.5 · KeyoAPI · model=claude-opus-5-5
https://www.keyoapi.xyz/`,

`Italy: she-wolf city plans → Caesar poses → Leonardo flies (sort of) → pizza = flag → Garibaldi's boot → David on a Milan runway + espresso from the Leaning Tower.

Claude Opus 5.5 made the cut.
KeyoAPI · claude-opus-5-5
https://www.keyoapi.xyz/`,

`10–15 seconds. Kinetic type. Apple-clean.

A SaaS promo for https://www.keyoapi.xyz/ — storyboarded and produced with Claude Opus 5.5.

Same model you can call today:
model=claude-opus-5-5 · ~$1.76 / $8.82 per 1M
Docs: https://www.keyoapi.xyz/brand/keyo-docs.html`,
];

const labels = [
  "01 UI morph",
  "02 Red Cliffs",
  "03 USA",
  "04 UK",
  "05 France",
  "06 Persia/Iran",
  "07 Russia",
  "08 Japan",
  "09 Korea",
  "10 Spain",
  "11 Portugal",
  "12 Germany",
  "13 Italy",
  "14 Keyo SaaS promo",
];

let bad = 0;
for (const [i, t] of tweets.entries()) {
  const w = t.replace(/https?:\/\/[^\s]+/g, "x".repeat(23));
  const n = [...w].length;
  if (n > 280) bad++;
  console.log(`${labels[i]} | ${n}${n > 280 ? " OVER" : ""}`);
}
console.log("TOTAL", tweets.length, "OVER", bad);
