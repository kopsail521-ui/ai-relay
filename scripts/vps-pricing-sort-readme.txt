# 修复模型广场排序（Array.sort 劫持版）

## 现状
- /api/pricing 已正确（OpenAI 在前）
- 页面仍按名称字母序（AnimeSharp 第一）
- 旧版只做 DOM 挪卡片，会被 React 盖回去

## 本版
劫持 Array.prototype.sort：名称/推荐排序时保留或恢复接口顺序；价格排序不变。

## 步骤（Workbench 依次粘贴）
1. vps-pricing-sort-p1.txt → OK_MOD_1_OF_5
2. vps-pricing-sort-p2.txt → OK_MOD_2_OF_5
3. vps-pricing-sort-p3.txt → OK_MOD_3_OF_5
4. vps-pricing-sort-p4.txt → OK_MOD_4_OF_5
5. vps-pricing-sort-p5.txt → OK_MOD_5_OF_5
6. vps-pricing-sort-deploy.txt → DONE_PRICING_SORT

然后无痕窗口 Ctrl+F5。第一张应是 gpt-5.6-terra，不是 AnimeSharp。

自检：
curl -sS http://127.0.0.1:3001/ | grep -o 'Array.prototype.sort=sortHook' | head -1
# 应输出 Array.prototype.sort=sortHook（若仍是 climbCard 则旧容器未换掉）
