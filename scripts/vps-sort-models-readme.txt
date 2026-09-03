# 模型广场排序

规则：
1. 按供应商：OpenAI → Anthropic → Google → DeepSeek → … → 其他最后
2. 同一供应商内：新模型（更大 id）靠前
3. 「其他」排最后

步骤：
1. vps-sort-models-p1.txt → OK_SORT_1
2. vps-sort-models-p2.txt → OK_SORT_2
3. vps-sort-models-dry.txt → 先预览（若报 display_order 不存在，说明当前镜像不支持，停下来告诉我）
4. 预览 OK 后再跑 vps-sort-models-run.txt → DONE_SORT_MODELS
5. 网站 Ctrl+F5
