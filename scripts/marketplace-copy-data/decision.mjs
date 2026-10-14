export default {
  "DiffusionGemma-26B-A4B-it-Jev": {
    unit: "token", in: "0.082192", out: "0.082192",
    fam: "Jev 系列决策模型 DiffusionGemma 26B",
    famEn: "Jev's DiffusionGemma 26B decision model",
    feat: "将扩散架构用于决策任务，直接输出选项判断而非自由文本",
    featEn: "applies diffusion architecture to decision tasks, returning option judgments rather than free text",
    mod: "文本与图像", modEn: "text and image",
    usage: "智能决策、策略选择、状态评估",
    usageEn: "decision-making, strategy selection, state evaluation"
  },
  "Bespoke-Nimble-9B": {
    unit: "token", in: "0.032", out: "0.032",
    fam: "Bespoke Nimble 9B 轻量决策模型",
    famEn: "Bespoke Nimble 9B lightweight decision model",
    feat: "面向实时决策场景优化，响应快速、成本极低",
    featEn: "optimized for real-time decision scenarios with fast responses and minimal cost",
    mod: "文本与图像", modEn: "text and image",
    usage: "实时决策、流程判断、自动化选择",
    usageEn: "real-time decisions, process judgments, automated selection"
  },
  "SemIf-OpenJev-4B": {
    unit: "token", in: "0.027398", out: "0.027398",
    fam: "SemIf OpenJev 4B 紧凑型决策模型",
    famEn: "SemIf OpenJev 4B compact decision model",
    feat: "以极小参数量提供可靠的决策输出，适合嵌入式与高并发场景",
    featEn: "reliable decision output at a very small scale for embedded and high-concurrency use",
    mod: "文本与图像", modEn: "text and image",
    usage: "轻量决策、批量判断、边缘部署",
    usageEn: "lightweight decisions, batch judgments, edge deployment"
  },
  "jev-1.13.0": {
    unit: "token", in: "0.0336", out: "0.0336",
    fam: "Jev 1.13.0 决策模型",
    famEn: "Jev 1.13.0 decision model",
    feat: "提供稳定的选项判断与置信度输出，适合自动化决策链路",
    featEn: "stable option judgments with confidence outputs for automated decision pipelines",
    mod: "文本与图像", modEn: "text and image",
    usage: "决策自动化、策略评估、智能路由",
    usageEn: "decision automation, strategy evaluation, intelligent routing"
  },
  "laya-multilingual": {
    unit: "token", in: "0.00274", out: "0.00274",
    fam: "Laya 多语言决策模型",
    famEn: "Laya multilingual decision model",
    feat: "以极低成本支持多语言决策判断",
    featEn: "multilingual decision-making at an extremely low cost",
    mod: "文本与图像", modEn: "text and image",
    usage: "多语言决策、大规模筛选、规则替代",
    usageEn: "multilingual decisions, large-scale filtering, rule replacement"
  },
  "cloudflare/clef": {
    unit: "token", in: "0.05", out: "0.05",
    fam: "Cloudflare Clef 多模态决策模型",
    famEn: "Cloudflare's Clef multimodal decision model",
    feat: "基于 Qwen3.8-27B 微调，读取文本或图像状态并返回带校准概率的选项判断",
    featEn: "fine-tuned from Qwen3.8-27B, reads text or image states and returns calibrated choice probabilities",
    mod: "文本与图像", modEn: "text and image",
    usage: "状态判断、结构化决策、多模态评估",
    usageEn: "state judgment, structured decisions, multimodal evaluation"
  }
};