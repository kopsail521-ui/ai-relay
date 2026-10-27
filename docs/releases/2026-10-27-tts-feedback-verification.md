# TTS 用户反馈核实记录（2026-10-27）

本轮目标是核实反馈，不是修复或上线。没有调用真实模型、生成音频或执行付费请求；没有修改 TTS 业务代码、客户接入文档或部署服务。验证包括源码审查、匿名 GET 当前公开文档/模型元数据、生产数据库只读渠道检查，以及仅连接本机假服务的转发测试。

## 结论

反馈中有确定的网关和文档缺陷，不能统一解释为模型故障或用户配置错误。但“Step 的 voice 被网关过滤”“eleven 的 input 没有传出”“speed 导致乱码”“keyo-tts 连续三小时不可用”这些具体归因，现有证据不能全部支持。

最应优先处理的三类问题：

1. 同步语音请求的参考音频、参考文本等扩展字段在本站转换过程中丢失，GLM-TTS / IndexTTS-2 / Step-Audio-TTS-3B 均受影响。
2. Qwen3-TTS 的纯字符串示例与留存的逐模型参数合同不符；CosyVoice3、IndexTTS-2、Spark 的示例也没有完整交代模型专属参数。
3. Gemini TTS 的部分公开页面仍推荐代码没有实现的同步 speech 入口，与主手册矛盾。

## 逐项判定

| 用户反馈 | 判定 | 证据及边界 |
| --- | --- | --- |
| keyo-tts 同步请求反复 502 | 报错现象未独立复测；长期不可用的归因未证实 | 历史注册使用 Chat 协议，当前公开元数据为 `contract_status=pending`、`supported_endpoint_types=[]`，并未提供经过确认的 speech 合同。异步目录中也没有该模型。不能保证用户给出的同步/异步请求受支持，更不能仅凭 502 承诺恢复时间。 |
| Step 所有 voice 都像女声，所以 voice 被过滤 | 本站过滤 voice 的假设未复现；实际音色效果待核实 | 22 个用户提供的 voice 值均原样到达本机假服务。保留字段不代表模型支持这些声音名称。仅凭基频接近也不足以确认音色相同或字段失效。留存的模型专属参数提供参考音频方式，但该参考字段在本站同步路径确实会丢失。 |
| Step 带 speed 偶发内容乱码 | 未证实因果关系 | 本机确认 speed 原样转发；没有生成/转写真实音频，不能判定是 speed、随机生成、识别误差或其他问题。 |
| GLM 传参考音频仍提示为空 | 存在直接匹配现象的网关缺陷 | `prompt_audio_url` / `prompt_audio` / `prompt_text` 等不在 AudioRequest 中，重新编码后消失。用户把有效 URL 放到顶层也不能通过当前转换路径。模型资料对无参考模式的要求与用户运行错误不完全一致，因此不额外承诺无参考模式或 base64 格式可用。 |
| Index 必须参考音频，但 base64 不行 | 参考字段丢失机制已确认；用户没有测试 URL，需区分 | 留存模型参数要求 `prompt_audio_url`。用户仅发送 `prompt_audio` 不等于满足该要求；即使发送正确 URL 字段，当前同步转换也会丢弃它。本机证据不能冒充用户已在生产测试过 URL。 |
| eleven-v4 返回无关内容，怀疑 input 未转成 text | input 丢失未复现；无关音频原因未证实 | 当前渠道映射后仍使用 type 1 speech 路径；本机确认中文 input 和 voice 原样保留，没有创建 text 别名。该入口声明 OpenAI 兼容，不能直接套用其他原生接口的字段名。音频响应处理直接回传响应字节，没有在本站替换台词。 |
| Qwen 字符串与对象都失败，接口校验自相矛盾 | 文档合同存在问题；不能据此认定本站两套校验冲突 | 模型专属留存合同使用数组 `inputs:[{prompt,language,...}]`。用户试了字符串和对象，没有试数组。本站只做 input→inputs 别名，不补数组结构，也未实施这些模型字段校验。不能继续推荐错误的纯字符串示例。 |
| 有效任务报 task_query_unavailable | 查询错误含义已确认，具体生产原因未定位 | 本机断连复现同一错误码。它代表查询转发/响应处理异常，可能涉及超时、断连或响应处理等；不等于任务失败、ID 错误，也不能确认生成已经成功。保留同一 ID 重试 GET，不重新 POST。 |
| MOSS 提示停用 | 停用状态未独立复测；不是可推荐的 TTS | `MOSS-Audio-8B-Thinking` 当前元数据是语音识别/理解，不是同名 TTS。渠道配置启用不证明实际模型仍在线。 |
| laya / InfiniteTalk / Cosy / Spark 调同步接口不支持 | 包含错误入口/模型类型问题，文档也有责任 | laya 是决策模型，InfiniteTalk 是使用已有音频的数字人视频模型；Cosy/Spark 应走异步语音接口。但 Cosy/Spark 不能只把 URL 改成异步就保证成功，仍需完整模型参数。 |
| Gemini speech 报 not implemented | 确定的适配限制及公开文档矛盾 | 生产配置为 Gemini 类型，`ConvertAudioRequest` 直接返回未实现。主手册写原生 generateContent，但模型页和 TTS 汇总页仍有 speech 承诺。 |
| keyo-tts 异步报 Unknown model | 与当前目录一致 | 本机请求在本地目录检查时返回 400，假服务收到 0 次提交。不能通过把这个型号随意加入另一组模型目录修好协议问题。 |

## 明确的字段丢失路径

- `new-api/relay/helper/valid_request.go:60`：JSON 解析到固定 AudioRequest。
- `new-api/relaykit/dto/audio.go:11`：保留 input / voice / speed 等已声明字段，没有通用扩展字段容器。
- `new-api/relay/audio_handler.go:26`：复制请求、映射模型，再调用音频适配器。
- `new-api/relay/channel/openai/adaptor.go:377`：重新序列化 AudioRequest 后发送。

未声明字段不会随着原始 JSON 一起发出。`prompt_audio_url`、`prompt_audio`、`prompt_text`、`output_format`、`response_data_format` 以及 Index 的情绪参数均有这个问题。现有 `ref_audio` / `ref_text` 是其他协议字段，不能在没有合同依据时让用户改成这两个名字。

注意：标准字段 `response_format` / `voice` / `input` / `speed` 会保留；不是所有请求参数都丢失。仅保留标准参数也不足以兑现带参考音频的模型合同。该语音路径没有应用请求体 param_override，不能假定只改渠道参数覆盖就能修复。

## Qwen 结构及其他遗漏

留存的 Qwen3-TTS 型号专属参数资料要求 inputs 为数组，每项含 prompt、language；speaker 等为可选字段。与当前通用 OpenAPI 允许数组的形状一致，且能够解释用户报告的两类错误。

以下仅为资料支持的候选结构，未调用真实模型，不能标注为“已实测出音频”：

```json
{
  "model": "Qwen3-TTS",
  "output_format": "mp3",
  "inputs": [
    {
      "prompt": "你好，欢迎使用 KeyoAPI。",
      "language": "Chinese",
      "speaker": "Vivian"
    }
  ]
}
```

其他逐模型资料显示：CosyVoice3 需要 `prompt_wav_url` 和对应的 `prompt_text`；Index 需要 `prompt_audio_url`，并区分音频/文本情绪模式；Spark 标准生成模式列出 gender（默认 male），克隆模式另需参考音频。当前通用示例没有完整描述这些差异，不能继续把不同模型当作同一份最小请求合同。

**资料时效边界：** 当天重新 GET 的是通用 API schema、本站主手册、模型价格元数据和相关 SEO 页面。Qwen、Cosy、GLM、Index、Step 的详细型号参数来自本地原始资料缓存，文件最后修改时间为 2026-09-01；Spark 为 2026-10-05。缓存抓取时间没有独立证实，不能当作 2026-10-27 新发布的合同。当天旧公开型号页未能提供新的详细参数表。上述候选字段需要当前合同确认，不能用假服务返回的 202 宣称实际模型已经可用。

## 当前公开文档问题位置

- 主手册 `static/brand/keyo-api-ref.md:854`：以 GLM 为例但没有参考音频；`:983`：Qwen 使用纯字符串。
- 两份 model-contracts.json（服务端与控制台镜像）：同样存在纯字符串、仅 input/voice 的不完整样例。
- `static/seo/model/gemini-3.8-flash-tts.html` 与 `static/seo/tts-api.html`：仍推荐 speech，与主手册原生接口矛盾。已确认线上仍有该文案。
- Qwen、Cosy、Index 模型页与音色指南：同步存在上述不完整合同。
- 异步 gateway 没有检查每个型号与请求路径是否匹配。本机将 GLM/Step 发往异步入口也会转出；真实接口可能拒绝，应在本站给出明确的便宜校验错误，不能把假服务接受当成模型支持。

## 验证结果与原始证据

1. 实际 Go 请求解析、复制、映射、转换、HTTP 发送链：4 个顶层测试、26 个子测试、27 次本机 HTTP，全部通过。涵盖 22 个 Step voice、GLM/Index 扩展字段、eleven 输入与模型映射。
2. 真实异步 gateway 进程接本机假服务：10 种提交情形和一次查询断连，测试通过。数组和扩展字段在异步路径保留；keyo-tts 被本地目录拒绝；断连产生 task_query_unavailable。
3. 实际 Go DTO 独立转换：对 GLM/Index/Step 复现参考音频、格式、情绪参数丢失。
4. 只读线上渠道检查：工作流 40514216618 成功；相关同步模型为 type 1、没有对应参数覆盖；Gemini 为 type 24。只读配置本身不证明已部署二进制版本、模型实际可用性或音频效果。

原始文件（本地，不含真实 API Key 或用户音频）：

- `tmp/tts-protocol-readonly-20261027.json`
- `tmp/tts-audit-20261027/findings.md`
- `tmp/tts-audit-20261027/source-provenance.json`
- `tmp/tts-audit-20261027/gateway-wire-repro.mjs`
- `tmp/tts-audit-20261027/gateway-wire-results.json`
- `tmp/tts-audit-20261027/commands-and-results.txt`
- 仓库外 `E:/01来粉来粉/中转/tts-audit-20261027/speech_contract_test.go` 与 `readonly-findings.md`

此前仅按照通用 schema 认定异步基础样例一致的检查不充分。本次逐型号核实更正相关判断；不能继续宣称所有 TTS 示例均已验证可用，也不能在没有真实音频证据时承诺中文男声、激情风格或输出内容准确。
