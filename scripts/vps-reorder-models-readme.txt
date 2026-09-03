# 无 display_order 时的排序方案（软删重建 id）

你的镜像没有 display_order。本方案按 id 倒序展示规则，重排 models.id。

步骤：
1. vps-reorder-models-p1.txt
2. vps-reorder-models-p2.txt
3. vps-reorder-models-dry.txt  ← 先看 head/vendors 是否符合预期
4. 确认后再 vps-reorder-models-run.txt
5. Ctrl+F5
