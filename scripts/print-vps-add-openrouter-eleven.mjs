import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const command = "curl -fsSL https://raw.githubusercontent.com/kopsail521-ui/ai-relay/main/scripts/vps-add-openrouter-eleven.sh | sudo bash";
fs.writeFileSync(path.join(dir, "vps-add-openrouter-eleven-short.txt"), command + "\n");
fs.writeFileSync(path.join(dir, "vps-add-openrouter-eleven-readme.txt"), `Eleven V4 / V4 Turbo 上架（成本 × 2）

公开模型                 售价 USD / 百万输入字符
eleven-v4            80
eleven-v4-turbo      40

实测成本（2026-10-12）分别为 $40 / $20 每百万字符；default 组倍率为 1。
ModelRatio=40/20；CompletionRatio、AudioRatio、AudioCompletionRatio 均为 0。
只按输入字符收费，不再收取输出音频费用；没有按次 ModelPrice。

VPS 执行：
${command}

脚本优先读取 OPENROUTER_API_KEY 环境变量或 /opt/ai-relay/.env。
如未配置，会通过终端隐藏输入要求提供密钥；随后密钥存入渠道数据库。
无需把密钥写进代码，也无需 git pull。数据库支持：
/opt/ai-relay/data/new-api/one-api.db 或 /data/one-api.db。

脚本备份数据库，新建/合并专用 Keyo TTS 渠道，上架模型及定价，
将 config 和 services copy 同步为逐字节一致，更新代理脱敏和 SEO 页面，
部署与源码匹配的控制台镜像、重启 moderation 容器，检查公开 pricing。
运行前先等 GitHub 的 Publish Keyo console image 构建成功；镜像未就绪时脚本会提前退出。
脚本要求 CountToken 开启、default 组倍率为 1，防止字符计费失效。
部署后完整刷新 /pricing，加载新的文案与语音调用示例。
重复执行不会增加重复渠道或模型，也不会修改原有免费模型定价。
最后应出现 public_leak False、ALL_OK、DONE_ADD_OPENROUTER_ELEVEN。

调用示例（YOUR_KEYO_API_KEY 为 KeyoAPI 密钥）：
curl https://www.keyoapi.xyz/v1/audio/speech \\
  -H "Authorization: Bearer YOUR_KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"eleven-v4","input":"Hello from KeyoAPI.","voice":"george","response_format":"mp3"}' \\
  --output speech.mp3
Turbo 使用相同请求结构，将 model 改为 eleven-v4-turbo。

本地验证：py -3 scripts/_dryrun-openrouter-eleven.py
`);
console.log(command);
