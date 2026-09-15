/**
 * Repair corrupted I18N in keyo-docs.html:
 * each locale ended with "hello" then a duplicated fragment without commas/braces.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsPath = path.join(__dirname, "../static/brand/keyo-docs.html");
let html = fs.readFileSync(docsPath, "utf8");

const startMark = "const I18N = {";
const endMark = "const LANG_LABELS";
const start = html.indexOf(startMark);
const end = html.indexOf(endMark);
if (start < 0 || end < 0) throw new Error("I18N markers not found");

const before = html.slice(0, start);
const after = html.slice(end);
const block = html.slice(start + startMark.length, end);

const localeRe = /"((?:en|zhCN|zhTW|ja|fr|ru|vi))"\s*:\s*\{/g;
const hits = [...block.matchAll(localeRe)];
if (hits.length < 7) throw new Error("expected 7 locales, got " + hits.length);

const repaired = {};
for (let i = 0; i < hits.length; i++) {
  const code = hits[i][1];
  const bodyStart = hits[i].index + hits[i][0].length;
  const bodyEnd = i + 1 < hits.length ? hits[i + 1].index : block.length;
  let body = block.slice(bodyStart, bodyEnd);
  // Drop trailing garbage after the first hello value (duplicate merge remnant)
  const hello = body.match(/"hello"\s*:\s*"(?:\\.|[^"\\])*"/);
  if (!hello) throw new Error("no hello in " + code);
  body = body.slice(0, hello.index + hello[0].length);
  // Parse as object
  let obj;
  try {
    obj = JSON.parse("{" + body + "}");
  } catch (e) {
    throw new Error(code + " parse fail: " + e.message + "\n" + body.slice(-200));
  }
  repaired[code] = obj;
}

const pretty = JSON.stringify(repaired, null, 2)
  .split("\n")
  .map((ln, idx) => (idx === 0 ? ln : "  " + ln))
  .join("\n");

// JSON.stringify wraps whole object; we need `const I18N = { ... };\n\n`
const outBlock = "const I18N = " + JSON.stringify(repaired, null, 2) + ";\n\n";
html = before + outBlock + after;
fs.writeFileSync(docsPath, html);

// verify
const m = html.match(/const I18N = (\{[\s\S]*?\n\});\s*\n+const LANG_LABELS/);
if (!m) throw new Error("verify: block missing");
const obj = new Function(`return (${m[1]})`)();
console.log("ok", Object.keys(obj).join(","));
console.log("en.videoIntroA", !!obj.en?.videoIntroA);
console.log("zhCN.nVeoComponents", obj.zhCN?.nVeoComponents);
