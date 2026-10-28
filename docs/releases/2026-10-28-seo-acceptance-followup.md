# 2026-10-28 SEO 验收后续

## 本次范围与状态

按用户提供的验收记录，仅修 N-1；B 组公开页面调整留到 2026-11-07。
本次未重新逐条验收 A 组，不能将用户报告当成本次实测。

- 公网 `/claude-api-pricing` 抓取 HTTP 200，仍存在 `Cheaper than all ... deepseek-v4.1-flash (~$0.14 / $0.56)`。
- 源配置 `config/seo/pricing-landings.json` 将该句改为 `deepseek-v4.1-flash-1017 (~$0.02 / $0.06)`。
- 只用 `node scripts/gen-seo-pages.mjs --pages=claude-api-pricing --html-only` 重生成这一页。
- `node --test scripts/seo-content.test.mjs`：17/17 通过。
- 用户随后明确授权发版。修复提交 `33479f5` 已推送；首次发布被 TTS 重生成测试的页脚日期比较拦住。
- 提交 `e456945` 仅修测试：生成页比较忽略页脚日期，手维护页仍要求字节一致，6/6 通过；未更改其他公开页面。
- 发布流程 https://github.com/kopsail521-ui/ai-relay/actions/runs/40625217039 成功，Linux、Windows 验证及 VPS 部署均通过。
- 发布后直接 GET 公网 `/claude-api-pricing` 返回 200，目标句为 `deepseek-v4.1-flash-1017 (~$0.02 / $0.06)`，已实测生效。
- 未执行付费冒烟、GSC 提交或计费配置写入。

## 两个价格项已由公网接口直接确认

实测 `GET https://www.keyoapi.xyz/api/pricing` HTTP 200、`success: true`。
原始抓取保存在工作区 `scratch/acceptance-20261028/api-pricing.txt`；同时保存了 Claude 页面原文。

口径：USD / 每百万 token，默认分组 `group_ratio.default = 1`。
控制台计算代码 `new-api/web/src/features/pricing/lib/price.ts`：
输入 = `model_ratio × 2 × group_ratio`，输出 = 输入 × `completion_ratio`。
这是当前基础目录价，不代表其他分组或长上下文阶梯价。

| 模型 | model_ratio | completion_ratio | 精确输入 | 精确输出 | 两位小数显示 |
| --- | ---: | ---: | ---: | ---: | --- |
| claude-fable-5 | 2.205875 | 5 | $4.41175 | $22.05875 | $4.41 / $22.06 |
| claude-fable-5-1 | 3.6765 | 5 | $7.353 | $36.765 | $7.35 / $36.77 |
| kimi-k3 | 0.204 | 5 | $0.408 | $2.04 | $0.41 / $2.04 |

因此不再需要用户手工查看 console 来确定这两个基础价。
代际价格方向只能用于发现异常，不能用来确定价格；本次结论来自实时接口。
接口基础计费值已经正确，后续应修 SEO 配置中的陈旧源值，不能为了同步文案而再次修改实际计费。

精确预算示例：fable-5 的 10M 输入 + 2M 输出为
`10 × 4.41175 + 2 × 22.05875 = $88.235`，最终金额显示约 $88.24。
用户报告中的 $88.22 来自先将单价四舍五入到两位再计算；精确预算不要沿用该值。

## 2026-11-07 队列

1. B1：新增 -1017 模型页、四处内链改指、free-models Base twin 补链。
2. B2：27 篇方案 A，执行 `scripts/vps-articles-plan-a-runbook.md`。
3. B3：模板正文合并整改。N-2 应按 token / request / second / character 写明计量单位；token 示例说明仅按输入估算、输出另计；不得把赠金表述为可用于付费 ID。N-3 补 Claude 表 fable-5，采用上述精确基础价；DeepSeek 首段枚举与表格范围一起核对。
4. B4：compare、models、pricing-list、free-models 首个 H2 后移。
5. B5：代际错配三处对照列；同步 fable-5、kimi-k3 的 SEO 源价格、meta、正文、表格、预算和相关生成页。fable-5 的预算按精确值重算；模型页 $1 示例明确输入单位与输出成本。
6. B6：同价双胞胎五组及 deepseek-v4-pro 别名三处统一。

以上队列记录不代表已经执行。付费冒烟 `run_real_models` 及 GSC sitemap 操作保留原授权边界。
