#!/usr/bin/env python3
import json, os, sqlite3, sys, time
DESCS = {"glm-5.3":"智谱 GLM-5.3 旗舰对话与推理模型：强制深度思考、工具调用与长上下文，适合复杂规划、代码与知识工作。","glm-5.3-flash":"智谱 GLM-5.3 Flash 原生多模态高速模型：支持图/视频/文件，强化视觉 Coding、Agent 与 Office 文档任务，约 1M 上下文。","glm-5.2":"智谱 GLM-5.2 旗舰对话与代码模型：强推理与工具调用，适合编程助手、长对话与通用生产任务。","glm-5.3-flash:free":"GLM-5.3 Flash 免费额度：原生多模态高速对话（图/视频/文件），适合试用与轻量 Agent/视觉 Coding。","glm-5.3-flash-thinking:free":"GLM-5.3 Flash Thinking 免费额度：在 Flash 多模态能力上强化思维链推理，适合需要可见思考过程的复杂问答。","glm-5.3-flash-search:free":"GLM-5.3 Flash Search 免费额度：多模态对话并结合检索增强，适合需要时效信息的问答与资料整理。","glm-5.3-flash-think-search:free":"GLM-5.3 Flash Think+Search 免费额度：深度思考与检索增强组合，适合复杂调研与多步推理任务。","grok-4.7":"xAI Grok 4.7 对话模型：强实时语感与推理，适合编程、写作与需要快速跟进资讯的助手场景。","gemma-4-31b-it:free":"Google Gemma 4 31B 指令版免费额度：开源友好的通用对话与指令跟随，适合试用与本地级轻量任务。","gemma-4-26b:free":"Google Gemma 4 26B 免费额度：高效通用对话模型，适合日常问答、摘要与轻量编程辅助。","gemini-robotics-er-2-preview:free":"Google Gemini Robotics-ER 2 预览免费额度：面向具身/机器人相关理解与规划的多模态对话预览能力。","mistral-large-3-675b:free":"Mistral Large 3（675B MoE）免费额度：多模态通用旗舰，约 256K 上下文，适合高质量对话、文档与工具调用试用。","nemotron-3-ultra-550b-a55b:free":"NVIDIA Nemotron 3 Ultra 免费额度：550B/55B 激活 MoE，约 1M 上下文，擅长长程 Agent、编排、深度研究与复杂推理。","nemotron-3-super-120b-a12b:free":"NVIDIA Nemotron 3 Super 免费额度：120B/12B 激活，效率与推理均衡，适合多 Agent、工具调用与高吞吐对话。","nemotron-3.5-lightning-30b-a3b:free":"NVIDIA Nemotron 3.5 Lightning（30B/3B）免费额度：高速 Agent/RAG/编码工作负载，约 1M 上下文，适合高吞吐试用。","nemotron-3.5-lightning:free":"NVIDIA Nemotron 3.5 Lightning 免费额度：轻量高速推理与对话，适合 Agent 流水线与批量指令跟随。","muse-glimmer-30b:free":"Muse Glimmer 30B 免费额度：通用开放权重对话模型，适合日常问答、写作与轻量推理试用。","qwen3.8-27b:free":"通义千问 Qwen3.8-27B 免费额度：中英双语通用对话与代码辅助，适合高频试用与成本敏感场景。","qwen3.6-35b-a3b:free":"通义千问 Qwen3.6-35B-A3B 免费额度：MoE 高效对话，适合中文场景下的问答、摘要与工具调用试用。","step-3.7-flash:free":"阶跃星辰 Step-3.7 Flash 免费额度：高速通用对话，适合日常助手、写作润色与轻量推理。","ling-3.0-flash-fin:free":"InclusionAI Ling 3.0 Flash Fin 免费额度：面向金融等垂直场景优化的高速对话模型，适合行业问答试用。","laguna-s-2.1:free":"Poolside Laguna S 2.1 免费额度：面向软件工程与代码助手的对话模型，适合编程问答与补全试用。","dots-3-note-preview:free":"Dots 3 Note Preview 免费额度：笔记/知识整理向对话预览，适合摘要、提纲与文档草稿试用。","seedance-2.5-1080p":"字节 Seedance 2.5 文生/图生视频（1080p）：更长镜头与更强参考控制，适合短片、广告与叙事视频。","seedance-2.5-720p":"字节 Seedance 2.5 文生/图生视频（720p）：更长时长与多模态参考，适合社媒与快速成片。","seedance-2.0-1080p":"字节 Seedance 2.0 文生/图生视频（1080p）：电影感运动与主体一致，适合高质量短视频成片。","seedance-2.0-1080p-fast":"字节 Seedance 2.0 1080p 加速档：更快出片的高清视频生成，适合迭代预览与批量生产。","seedance-2.0-1080p-mini":"字节 Seedance 2.0 1080p 精简档：更省资源的高清视频生成，适合短镜头与成本敏感任务。","seedance-2.0-720p":"字节 Seedance 2.0 文生/图生视频（720p）：平衡画质与速度，适合社媒短视频与创意草稿。","seedance-2.0-720p-fast":"字节 Seedance 2.0 720p 加速档：更快生成的标清成片，适合快速试错与批量镜头。","seedance-2.0-720p-mini":"字节 Seedance 2.0 720p 精简档：更轻量的视频生成，适合短时长与高频调用。"}
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
