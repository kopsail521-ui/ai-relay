/**
 * Fill weak marketplace descriptions (zhCN + en bag). No supplier/upstream wording.
 * Usage: node scripts/patch-weak-marketplace-descs.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const DESCS = {
  "glm-5.3": {
    zh: "智谱 GLM-5.3 旗舰对话与推理模型：强制深度思考、工具调用与长上下文，适合复杂规划、代码与知识工作。",
    en: "Zhipu GLM-5.3 flagship chat/reasoning with required deep thinking, tool use, and long context for complex planning, coding, and knowledge work.",
  },
  "glm-5.3-flash": {
    zh: "智谱 GLM-5.3 Flash 原生多模态高速模型：支持图/视频/文件，强化视觉 Coding、Agent 与 Office 文档任务，约 1M 上下文。",
    en: "Zhipu GLM-5.3 Flash native multimodal model for image/video/file inputs, strong visual coding/agents/Office workflows, ~1M context.",
  },
  "glm-5.2": {
    zh: "智谱 GLM-5.2 旗舰对话与代码模型：强推理与工具调用，适合编程助手、长对话与通用生产任务。",
    en: "Zhipu GLM-5.2 flagship chat/coding model with strong reasoning and tool calling for assistants and production workloads.",
  },
  "glm-5.3-flash:free": {
    zh: "GLM-5.3 Flash 免费额度：原生多模态高速对话（图/视频/文件），适合试用与轻量 Agent/视觉 Coding。",
    en: "Free tier of GLM-5.3 Flash: native multimodal fast chat (image/video/file) for trials and light agent/visual-coding use.",
  },
  "glm-5.3-flash-thinking:free": {
    zh: "GLM-5.3 Flash Thinking 免费额度：在 Flash 多模态能力上强化思维链推理，适合需要可见思考过程的复杂问答。",
    en: "Free GLM-5.3 Flash Thinking: Flash multimodal plus chain-of-thought reasoning for harder Q&A with visible thinking.",
  },
  "glm-5.3-flash-search:free": {
    zh: "GLM-5.3 Flash Search 免费额度：多模态对话并结合检索增强，适合需要时效信息的问答与资料整理。",
    en: "Free GLM-5.3 Flash Search: multimodal chat with retrieval-style search for fresher facts and research notes.",
  },
  "glm-5.3-flash-think-search:free": {
    zh: "GLM-5.3 Flash Think+Search 免费额度：深度思考与检索增强组合，适合复杂调研与多步推理任务。",
    en: "Free GLM-5.3 Flash Think+Search: combined deep thinking and search for multi-step research tasks.",
  },
  "grok-4.7": {
    zh: "xAI Grok 4.7 对话模型：强实时语感与推理，适合编程、写作与需要快速跟进资讯的助手场景。",
    en: "xAI Grok 4.7 chat model with strong reasoning and timely style for coding, writing, and newsy assistants.",
  },
  "gemma-4-31b-it:free": {
    zh: "Google Gemma 4 31B 指令版免费额度：开源友好的通用对话与指令跟随，适合试用与本地级轻量任务。",
    en: "Free Google Gemma 4 31B Instruct: open-friendly general chat and instruction following for light trials.",
  },
  "gemma-4-26b:free": {
    zh: "Google Gemma 4 26B 免费额度：高效通用对话模型，适合日常问答、摘要与轻量编程辅助。",
    en: "Free Google Gemma 4 26B: efficient general chat for Q&A, summarization, and light coding help.",
  },
  "gemini-robotics-er-2-preview:free": {
    zh: "Google Gemini Robotics-ER 2 预览免费额度：面向具身/机器人相关理解与规划的多模态对话预览能力。",
    en: "Free Gemini Robotics-ER 2 preview: multimodal chat oriented to embodied/robotics understanding and planning.",
  },
  "mistral-large-3-675b:free": {
    zh: "Mistral Large 3（675B MoE）免费额度：多模态通用旗舰，约 256K 上下文，适合高质量对话、文档与工具调用试用。",
    en: "Free Mistral Large 3 (675B MoE): multimodal flagship chat with ~256K context for high-quality trials and tool use.",
  },
  "nemotron-3-ultra-550b-a55b:free": {
    zh: "NVIDIA Nemotron 3 Ultra 免费额度：550B/55B 激活 MoE，约 1M 上下文，擅长长程 Agent、编排、深度研究与复杂推理。",
    en: "Free NVIDIA Nemotron 3 Ultra: 550B/55B-active MoE, ~1M context for long-running agents, orchestration, and deep research.",
  },
  "nemotron-3-super-120b-a12b:free": {
    zh: "NVIDIA Nemotron 3 Super 免费额度：120B/12B 激活，效率与推理均衡，适合多 Agent、工具调用与高吞吐对话。",
    en: "Free NVIDIA Nemotron 3 Super: 120B/12B-active, balanced efficiency/accuracy for multi-agent and tool-calling chat.",
  },
  "nemotron-3.5-lightning-30b-a3b:free": {
    zh: "NVIDIA Nemotron 3.5 Lightning（30B/3B）免费额度：高速 Agent/RAG/编码工作负载，约 1M 上下文，适合高吞吐试用。",
    en: "Free Nemotron 3.5 Lightning (30B/3B): high-throughput agents/RAG/coding with ~1M context.",
  },
  "nemotron-3.5-lightning:free": {
    zh: "NVIDIA Nemotron 3.5 Lightning 免费额度：轻量高速推理与对话，适合 Agent 流水线与批量指令跟随。",
    en: "Free Nemotron 3.5 Lightning: lightweight high-speed reasoning/chat for agent pipelines and batch instructions.",
  },
  "muse-glimmer-30b:free": {
    zh: "Muse Glimmer 30B 免费额度：通用开放权重对话模型，适合日常问答、写作与轻量推理试用。",
    en: "Free Muse Glimmer 30B: general open-weight chat for everyday Q&A, writing, and light reasoning trials.",
  },
  "qwen3.8-27b:free": {
    zh: "通义千问 Qwen3.8-27B 免费额度：中英双语通用对话与代码辅助，适合高频试用与轻量日常任务。",
    en: "Free Qwen3.8-27B: bilingual chat and coding help for high-frequency everyday trials.",
  },
  "qwen3.6-35b-a3b:free": {
    zh: "通义千问 Qwen3.6-35B-A3B 免费额度：MoE 高效对话，适合中文场景下的问答、摘要与工具调用试用。",
    en: "Free Qwen3.6-35B-A3B: efficient MoE chat for Chinese-centric Q&A, summarization, and tool trials.",
  },
  "step-3.7-flash:free": {
    zh: "阶跃星辰 Step-3.7 Flash 免费额度：高速通用对话，适合日常助手、写作润色与轻量推理。",
    en: "Free StepFun Step-3.7 Flash: fast general chat for assistants, editing, and light reasoning.",
  },
  "ling-3.0-flash-fin:free": {
    zh: "InclusionAI Ling 3.0 Flash Fin 免费额度：面向金融等垂直场景优化的高速对话模型，适合行业问答试用。",
    en: "Free InclusionAI Ling 3.0 Flash Fin: fast chat tuned for finance-style vertical Q&A trials.",
  },
  "laguna-s-2.1:free": {
    zh: "Poolside Laguna S 2.1 免费额度：面向软件工程与代码助手的对话模型，适合编程问答与补全试用。",
    en: "Free Poolside Laguna S 2.1: software-engineering oriented chat for coding Q&A and completion trials.",
  },
  "dots-3-note-preview:free": {
    zh: "Dots 3 Note Preview 免费额度：笔记/知识整理向对话预览，适合摘要、提纲与文档草稿试用。",
    en: "Free Dots 3 Note Preview: note/knowledge-style chat preview for summaries, outlines, and drafts.",
  },
  "seedance-2.5-1080p": {
    zh: "字节 Seedance 2.5 文生/图生视频（1080p）：更长镜头与更强参考控制，适合短片、广告与叙事视频。",
    en: "ByteDance Seedance 2.5 text/image-to-video at 1080p: longer clips and stronger reference control for shorts and ads.",
  },
  "seedance-2.5-720p": {
    zh: "字节 Seedance 2.5 文生/图生视频（720p）：更长时长与多模态参考，适合社媒与快速成片。",
    en: "ByteDance Seedance 2.5 text/image-to-video at 720p: longer clips with multimodal references for social drafts.",
  },
  "seedance-2.0-1080p": {
    zh: "字节 Seedance 2.0 文生/图生视频（1080p）：电影感运动与主体一致，适合高质量短视频成片。",
    en: "ByteDance Seedance 2.0 text/image-to-video at 1080p: cinematic motion and subject consistency for polished shorts.",
  },
  "seedance-2.0-1080p-fast": {
    zh: "字节 Seedance 2.0 1080p 加速档：更快出片的高清视频生成，适合迭代预览与批量生产。",
    en: "ByteDance Seedance 2.0 1080p fast tier: quicker HD video generation for iteration and batch production.",
  },
  "seedance-2.0-1080p-mini": {
    zh: "字节 Seedance 2.0 1080p 精简档：更省资源的高清视频生成，适合短镜头与轻量批量任务。",
    en: "ByteDance Seedance 2.0 1080p mini tier: leaner HD video generation for short clips and light batch jobs.",
  },
  "seedance-2.0-720p": {
    zh: "字节 Seedance 2.0 文生/图生视频（720p）：平衡画质与速度，适合社媒短视频与创意草稿。",
    en: "ByteDance Seedance 2.0 text/image-to-video at 720p: balanced quality/speed for social drafts.",
  },
  "seedance-2.0-720p-fast": {
    zh: "字节 Seedance 2.0 720p 加速档：更快生成的标清成片，适合快速试错与批量镜头。",
    en: "ByteDance Seedance 2.0 720p fast tier: quicker SD/HD-ish clips for rapid iteration.",
  },
  "seedance-2.0-720p-mini": {
    zh: "字节 Seedance 2.0 720p 精简档：更轻量的视频生成，适合短时长与高频调用。",
    en: "ByteDance Seedance 2.0 720p mini tier: lighter video generation for short clips and high volume.",
  },
};

function bag(zh, en) {
  return {
    zhCN: zh,
    zhTW: zh,
    en,
    fr: en,
    ru: en,
    ja: en,
    vi: en,
  };
}

function upsert(map, id, zh, en) {
  const prev = map[id] && typeof map[id] === "object" ? map[id] : {};
  map[id] = {
    ...prev,
    description: zh,
    description_zh: zh,
    description_en: en,
    descriptions: bag(zh, en),
  };
}

function patchFile(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.log("skip missing", rel);
    return 0;
  }
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  let n = 0;
  for (const [id, { zh, en }] of Object.entries(DESCS)) {
    upsert(j, id, zh, en);
    n++;
  }
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n", "utf8");
  console.log("patched", rel, n);
  return n;
}

patchFile("services/creem-moderation-proxy/marketplace-model-copy.json");
patchFile("config/marketplace-model-copy.json");

// Also emit a tiny DB heal for New API description column
const py = `#!/usr/bin/env python3
import json, os, sqlite3, sys, time
DESCS = ${JSON.stringify(
  Object.fromEntries(Object.entries(DESCS).map(([k, v]) => [k, v.zh])),
  null,
  0
)}
db = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
con = sqlite3.connect(db)
cur = con.cursor()
cols = {r[1] for r in cur.execute("PRAGMA table_info(models)")}
now = int(time.time())
n = 0
for mid, desc in DESCS.items():
    sets = ["description=?"]
    vals = [desc]
    if "updated_time" in cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(mid)
    cur.execute("UPDATE models SET %s WHERE model_name=?" % ",".join(sets), vals)
    if cur.rowcount:
        n += 1
        print("desc", mid)
con.commit()
con.close()
print("updated", n)
print("DONE_PATCH_WEAK_DESCS")
`;
fs.writeFileSync(path.join(root, "scripts/vps-patch-weak-descs.py"), py, "utf8");
console.log("wrote scripts/vps-patch-weak-descs.py");
