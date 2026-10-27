# TTS 参数与文档修复（2026-10-27）

用户报告参考音频始终为空、Qwen 输入格式反复报错，以及部分页面引导到未实现的语音接口。本次修复请求转发与型号合同，未调用真实模型，也没有把音色、朗读内容或情绪效果标为已实测。

## 变更

- 同步 speech DTO 保留 `prompt_audio`、`prompt_audio_url`、`prompt_text`、`output_format`、`response_data_format` 与 Index 的 `emo_audio_prompt_url`、`emo_alpha`、`emo_text`、`use_emo_text`。明确的零、false、空串不会丢失，不做无依据的字段更名。
- 没有填写 voice 时不额外生成空字符串音色字段；显式填写的空串仍保留。MiniMax / Volcengine 的现有默认行为不变，并对无 voice 的文档请求做真实本机 HTTP 回归。
- Qwen 异步使用规范数组 `inputs:[{prompt,language,...}]`；兼容旧 `input` / `inputs` 字符串或单对象，并应用该型号的 Chinese 默认语言。不会改变其他型号的输入结构。
- 错误数组条目、超出 1–5 条、缺参考字段、型号与异步 speech 入口不匹配，在扣费与提交前返回 400。请求必须在 JSON 中带 model；尾斜杠、编码与路径后缀不能绕过校验。
- 控制台与公开模型复制合同一致，补充 Cosy、Index、Spark 各自的必需参数和参考 URL 替换说明；Qwen / Cosy 旧元数据修正脚本使用异步路径。
- 双语手册、七语言快速接入、模型页面、TTS / 克隆汇总页面及生成源同步修正。Gemini 仅给原生 generateContent 及 JSON 音频解码流程。七语言运行时文档链接也已校正。
- 任务查询错误保留“查询原任务、避免重复提交”的处理原则；本次未声称已经定位原 task_query_unavailable 的生产原因。
- keyo-tts 和未确认型号继续标注合同待确认；不虚构可用入口、声音名称或恢复时间。没有变更模型计价或余额。

## 验证

- Go 使用真实解析、复制、模型映射、适配器与 HTTP 发送链，只连接本机模拟服务；修复前复现丢字段，修复后通过。另执行 relaykit 独立测试与 `GOWORK=off go build ./...`。
- 异步网关完整本地测试 61/61；使用临时钱包确认非法请求不会扣费、记录使用或向模拟服务提交。
- 控制台定向测试 10/10、typecheck 通过。
- 文档测试 26/26，覆盖七语言 49 个 speech 复制示例、七个轮询示例、双语手册、生成器重建与 Windows PowerShell 18 次本机回环请求。
- SEO 检查 17/17；发布门禁还包含现有代理、视频合同、任务响应与部署回滚测试。
- 新增发布后公共 GET 验收脚本 `scripts/check-public-tts-release.mjs`，核对线上文档与审查文件内容一致，不提交生成任务。

## 发布记录

发布由控制台镜像、专用异步服务、模型元数据代理和静态页面四个现有工作流执行。镜像在构建服务器编译，VPS 保留现有环境、挂载和回滚机制。同步业务修复只有新后端容器成功替换后才算上线。

**当前状态：修复已提交、测试通过、后端镜像已构建，但尚未上线。**

- 业务与文档修复提交：`d4ac5e75d9de540f08ea0e5a86a1cd604e15a154`。
- CI 依赖准备补充提交：`f947b171c85537574edb424ca6d71648356bfc7f`。优先使用已安装的音频工具，并限制包安装等待时间；没有修改业务合同。
- 后端镜像：`ghcr.io/kopsail521-ui/keyo-new-api:sha-d4ac5e7`，构建成功。

| 工作流 | 验证/构建 | 部署结果 |
| --- | --- | --- |
| [控制台及后端 40527319051](https://github.com/kopsail521-ui/ai-relay/actions/runs/40527319051) | Go / relaykit / 文档 / 安全检查通过，镜像构建成功 | SSH banner exchange 超时，exit 255 |
| [静态文档 40527319010](https://github.com/kopsail521-ui/ai-relay/actions/runs/40527319010) | Linux 与 Windows 文档检查通过 | 同一 SSH 超时，exit 255 |
| [模型元数据代理 40527318986](https://github.com/kopsail521-ui/ai-relay/actions/runs/40527318986) | 发布验证通过 | 同一 SSH 超时，exit 255 |
| [异步服务 40528433732](https://github.com/kopsail521-ui/ai-relay/actions/runs/40528433732) | 网关回归与安全部署测试通过 | 同一 SSH 超时，exit 255 |

较早的异步工作流 40527318929 卡在安装测试依赖阶段，已取消并由 40528433732 替代；后者全部测试通过，仍在 SSH 部署阶段失败。所有这些部署均未通过 SSH 握手，本次发布没有在 VPS 执行替换容器或重载页面的命令。

准备发布前，网站 HTTPS 请求和两次远程 SSH 检查已出现超时。2026-10-27 23:12 左右的公共 GET 验收中，12 个文档路径全部连接失败，无法确认线上新文档。该问题早于本次修复推送，不能用代码测试通过代替上线成功。

共享排障记录 `docs/releases/2026-10-27-2224-disk-io-outage.md` 及云平台诊断文本显示：22:24 系统盘出现 I/O 延迟过长或达到 IOPS 上限；恢复流程停在云平台身份验证，尚未确认重启完成。该记录由同时进行的服务器排障流程维护。本次只读查看已打开控制台的尝试被界面工具中止（无法可靠识别当前浏览器网址），没有继续操作窗口或安全验证。

## 恢复连接后的剩余工作

1. 确认服务器恢复且 SSH 正常，核对当前主分支与发布期间新增的运维变更。
2. 重跑上述四个工作流的失败部署作业；无需再次提交生成请求或重新获取用户授权。
3. 确认后端使用 `sha-d4ac5e7` 或包含同一修复的更新镜像；异步服务 build 标识为 `tts-model-contracts-2026-10-27`。
4. 执行 `node scripts/check-public-proxy-release.mjs` 与 `node scripts/check-public-tts-release.mjs`，全部为公共 GET；通过后再标记上线完成。

真实音色效果、Step 乱码、eleven 无关内容及此前任务查询 502 的具体原因，仍没有音频/生产现场证据；本次没有宣称这些问题已被模型生成实测解决。
