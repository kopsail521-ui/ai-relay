#!/usr/bin/env python3
"""Heal marketplace tags + restore billing lines in model descriptions."""
import json, sqlite3, sys, time
DESCS = {"seedance-2.0-1080p":"字节 Seedance 2.0 文生/图生视频（1080p）：电影感运动与主体一致，适合高质量短视频成片。 计费：$0.100599/秒。","seedance-2.0-1080p-fast":"字节 Seedance 2.0 1080p 加速档：更快出片的高清视频生成，适合迭代预览与批量生产。 计费：$0.0754/秒。","seedance-2.0-1080p-mini":"字节 Seedance 2.0 1080p 精简档：更省资源的高清视频生成，适合短镜头与轻量批量任务。 计费：$0.050112/秒。","seedance-2.0-720p":"字节 Seedance 2.0 文生/图生视频（720p）：平衡画质与速度，适合社媒短视频与创意草稿。 计费：$0.096165/秒。","seedance-2.0-720p-fast":"字节 Seedance 2.0 720p 加速档：更快生成的标清成片，适合快速试错与批量镜头。 计费：$0.074794/秒。","seedance-2.0-720p-mini":"字节 Seedance 2.0 720p 精简档：更轻量的视频生成，适合短时长与高频调用。 计费：$0.049863/秒。","seedance-2.5-1080p":"字节 Seedance 2.5 文生/图生视频（1080p）：更长镜头与更强参考控制，适合短片、广告与叙事视频。 计费：$0.137996/秒。","seedance-2.5-720p":"字节 Seedance 2.5 文生/图生视频（720p）：更长时长与多模态参考，适合社媒与快速成片。 计费：$0.133562/秒。","gemini-omni-1.1-flash":"Google Gemini Omni 1.1 Flash，多模态视频生成，适合快速出片。 计费：$0.1056/秒（时长由模型决定，约 3–10s）。","gemini-omni-1.1-flash-ext":"Gemini Omni Ext 扩展档，支持更多分辨率与参考视频输入。 计费：档位包（如 720P-8s $0.42）；参考视频按秒。","MiniMax-H3":"MiniMax-H3 视频生成，支持 480p / 768p / 1080p，可附参考图。 计费：480p $0.02055/秒；768p $0.02877/秒；1080p $0.04110/秒。","flux-3-video":"FLUX.3 Video，多档位视频生成，含图生与视频到视频。 计费：DRAFT $0.0576/秒；HD $0.1632/秒；FHD $0.2784/秒。","wan3.0-video":"通义万相 Wan 3.0 视频生成，按分辨率输出。 计费：480P $0.04115/秒；720P $0.08228/秒；1080P $0.16457/秒。","grok-imagine-video-1.5-preview":"xAI Grok Imagine Video 预览版，适合由图片快速生成短视频。 计费：480p $0.08825/秒；720p $0.1545/秒（仅图生）。","grok-1.5-video":"xAI Grok 1.5 视频：文生或参考图生成，时长 1–15 秒，最高 1080p。 计费：$0.60675/次。"}
TAGS = {"grok-1.5-video":"视频按次","gpt-image-2.5":"图片","gpt-image-2.5-flare":"图片","gpt-image-2.5-sunburst":"图片"}
db = sys.argv[1] if len(sys.argv) > 1 else "/data/one-api.db"
con = sqlite3.connect(db)
cur = con.cursor()
cols = {r[1] for r in cur.execute("PRAGMA table_info(models)")}
now = int(time.time())
nd = nt = 0
for mid, desc in DESCS.items():
    sets = ["description=?"]
    vals = [desc]
    if "updated_time" in cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(mid)
    cur.execute("UPDATE models SET %s WHERE model_name=?" % ",".join(sets), vals)
    if cur.rowcount:
        nd += 1
        print("desc", mid)
for mid, tag in TAGS.items():
    sets = ["tags=?"]
    vals = [tag]
    if "updated_time" in cols:
        sets.append("updated_time=?")
        vals.append(now)
    vals.append(mid)
    cur.execute("UPDATE models SET %s WHERE model_name=?" % ",".join(sets), vals)
    if cur.rowcount:
        nt += 1
        print("tag", mid, "->", tag)
con.commit()
con.close()
print("descs", nd, "tags", nt)
print("DONE_HEAL_BILLING_DESCS")
