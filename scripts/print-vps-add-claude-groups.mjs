/**
 * Add Claude-Code-2 / AWS-Bedrock-2 groups (same markup vs current default).
 * No git pull, no bash heredoc.
 *   node scripts/print-vps-add-claude-groups.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

const py = fs.readFileSync(path.join(__dirname, "vps-add-claude-groups.py"));
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const checkPy = `#!/usr/bin/env python3
import json,re
d=json.load(open("/tmp/pricing.json"))
gr=d.get("group_ratio") or {}
print("ratio_cc2", gr.get("Claude-Code-2"))
print("ratio_ab2", gr.get("AWS-Bedrock-2"))
by={m.get("model_name"):m for m in (d.get("data") or [])}
want=["claude-sonnet-5-5","claude-opus-5-5","claude-fable-5-1","claude-sonnet-5","claude-opus-5","claude-fable-5"]
for n in want:
    m=by.get(n)
    if not m:
        print(n,"MISSING"); continue
    gs=m.get("enable_groups") or []
    print(n, "groups", ",".join(gs), "sell", round(float(m.get("model_ratio") or 0)*2,6))
html=open("/tmp/pricing-page.html",encoding="utf-8",errors="ignore").read()
print("copy_cc2", "Claude-Code-2" in html)
print("copy_ab2", "AWS-Bedrock-2" in html)
print("copy_sonnet55", "0.88235" in html and "1.4706" in html)
blob=json.dumps(d,ensure_ascii=False)
print("public_leak", bool(re.search(r"unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough|进货|二道|转售", blob, re.I)))
print("DONE_ADD_CLAUDE_GROUPS")
`;
const checkB64 = zlib.gzipSync(Buffer.from(checkPy, "utf8"), { level: 9 }).toString("base64");

const packList = [
  "config/marketplace-model-copy.json",
  "services/creem-moderation-proxy/marketplace-model-copy.json",
];
for (const rel of packList) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error("missing " + rel);
}
const tarPath = path.join(root, "tmp/_claude-groups-copy.tar.gz");
fs.mkdirSync(path.dirname(tarPath), { recursive: true });
execSync(`tar -czf "${tarPath}" ${packList.map((s) => `"${s}"`).join(" ")}`, {
  cwd: root,
  stdio: "pipe",
  shell: true,
});
const tarB64 = fs.readFileSync(tarPath).toString("base64");
if (tarB64.length < 200) throw new Error("tar too small");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts /opt/ai-relay/config /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${pyB64}' | sudo tee /tmp/claude-g-py.b64 >/dev/null`,
  "base64 -d /tmp/claude-g-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-claude-groups.py >/dev/null",
  `echo '${checkB64}' | sudo tee /tmp/claude-g-check.b64 >/dev/null`,
  "base64 -d /tmp/claude-g-check.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-check-claude-groups.py >/dev/null",
  `echo '${tarB64}' | sudo tee /tmp/claude-g-copy.b64 >/dev/null`,
  "base64 -d /tmp/claude-g-copy.b64 | sudo tee /tmp/claude-g-copy.tar.gz >/dev/null",
  "sudo tar -xzf /tmp/claude-g-copy.tar.gz -C /opt/ai-relay",
  "sudo docker run --rm -e KEYO_ROOT=/opt/ai-relay -v /opt/ai-relay:/opt/ai-relay:rw -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-add-claude-groups.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code} ' https://www.keyoapi.xyz/api/pricing",
  "curl -sS -o /tmp/pricing-page.html -w 'page=%{http_code} ' https://www.keyoapi.xyz/pricing",
  "python3 /opt/ai-relay/scripts/vps-check-claude-groups.py",
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc leaked");
if (short.includes("\n")) throw new Error("short must be one line");

writeLf(path.join(root, "scripts/vps-add-claude-groups-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-add-claude-groups-readme.txt"),
  `# Claude 系列新增分组 Claude-Code-2 / AWS-Bedrock-2（售价按现 default 同比例）

粘贴：scripts/vps-add-claude-groups-short.txt（一整行）
期望：
  ratio_cc2 1.666686 · ratio_ab2 3.333371
  claude-sonnet-5-5 groups 含 Claude-Code-2,AWS-Bedrock-2 · default $0.88235 / CC2 $1.4706 / AB2 $2.9412
  claude-fable-5-1 只有 Claude-Code-2（无 AWS-Bedrock-2）
  public_leak False · DONE_ADD_CLAUDE_GROUPS
硬开 /pricing 详情看「分组价格」。
`
);
console.log({ pyB64: pyB64.length, checkB64: checkB64.length, tarB64: tarB64.length, short: short.length });
