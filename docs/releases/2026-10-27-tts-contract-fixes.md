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

发布由控制台镜像、专用异步服务、模型元数据代理和静态页面四个现有工作流执行。控制台 Go 与前端镜像在 GitHub 构建服务器编译，两个 Node 服务沿用现有 VPS Docker 构建流程；VPS 保留现有环境、挂载和回滚机制。

**当前状态：已于北京时间 2026-10-27 23:36 完成四项部署，并通过发布后只读验收。**

- 业务与文档修复提交：`d4ac5e75d9de540f08ea0e5a86a1cd604e15a154`。
- CI 依赖准备补充提交：`f947b171c85537574edb424ca6d71648356bfc7f`。优先使用已安装的音频工具，并限制包安装等待时间；没有修改业务合同。
- 后端镜像：`ghcr.io/kopsail521-ui/keyo-new-api:sha-d4ac5e7`，构建成功。

| 工作流 | 验证/构建 | 部署结果 |
| --- | --- | --- |
| [控制台及后端 40527319051](https://github.com/kopsail521-ui/ai-relay/actions/runs/40527319051) | Go / relaykit / 文档 / 安全检查通过，镜像构建成功 | 第 2 次执行成功；23:34 替换后端，健康及路由检查通过 |
| [静态文档 40527319010](https://github.com/kopsail521-ui/ai-relay/actions/runs/40527319010) | Linux 与 Windows 文档检查通过 | 第 2 次执行成功；公开文档内容验收通过 |
| [模型元数据代理 40527318986](https://github.com/kopsail521-ui/ai-relay/actions/runs/40527318986) | 发布验证通过 | 第 2 次执行成功；进程、源码与公共 GET 验收通过 |
| [异步服务 40528433732](https://github.com/kopsail521-ui/ai-relay/actions/runs/40528433732) | 网关回归与安全部署测试通过 | 第 2 次执行成功；23:36 完成版本、源码、端口归属与稳定性检查 |

较早的异步工作流 40527318929 卡在安装测试依赖阶段，已取消并由 40528433732 替代。上述四个工作流首次部署均在 SSH 握手阶段超时，未执行远端变更；服务器恢复后，仅重跑失败部署作业，复用已通过的门禁与已构建镜像。

准备发布前，网站 HTTPS 请求和两次远程 SSH 检查已出现超时。2026-10-27 23:12 左右的公共 GET 验收中，12 个文档路径全部连接失败，无法确认线上新文档。该问题早于本次修复推送，不能用代码测试通过代替上线成功。

共享排障记录 `docs/releases/2026-10-27-2224-disk-io-outage.md` 及云平台诊断文本显示：22:24 系统盘出现 I/O 延迟过长或达到 IOPS 上限。另一个服务器排障流程完成重启，23:18 后恢复；本次继续发布前确认网站与 SSH 均已正常。该故障的具体触发进程尚未定位，TTS 发布成功不代表磁盘故障根因已修复。

## 线上验收证据

1. [发布后只读诊断 40532677258](https://github.com/kopsail521-ui/ai-relay/actions/runs/40532677258) 成功。运行中的后端镜像索引 `sha256:36f999521755b6c9029e89ebde43ecd2d6ea77ee105e488e1f3ec2abc39a8725` 与本次构建、拉取日志一致，对应修复提交 `d4ac5e7`。核对时区分 OCI 镜像索引与配置摘要，未把两者误当作版本差异。
2. 公开登录页加载本次构建产物 `/static/js/index.eb356fb1ce.js`，文件名与 CI 构建日志一致，资源 GET 为 200。
3. 异步服务 build 为 `tts-model-contracts-2026-10-27`，运行镜像与部署回执一致；四个源码文件摘要与审查提交完全一致，监听进程归属及两次稳定性检查通过。
4. 北京时间 23:36:58（UTC 15:36:58）：3000 / 3001 / 3010 / 3011 四处本机健康 GET 均 200。后端与异步容器 running、无重启循环、OOMKilled=false。
5. `node scripts/check-public-proxy-release.mjs` 通过：120 个公开型号元数据、注册、登录、模型页面入口均符合验收条件。
6. 扩展后的 `node scripts/check-public-tts-release.mjs` 通过：13 份公开页面（包括 HTML 手册的 NOSCRIPT 内容）与本地审查版本 SHA-256 一致；9 个必需 TTS 型号全部在目录中，另检查免费双胞胎和待确认型号，完整入口集合、方法、内容类型、轮询路径及合同状态均一致。没有将目录元数据验收当作真实生成实测。
7. `/keyoapi-docs.html` 独立 GET 返回 404，未宣称该构建镜像文件拥有公开路由；实际公开入口 `/brand/keyo-docs.html` 已纳入上述精确验收。

本地脱敏证据：`tmp/tts-live-runtime-verified.json`、`tmp/tts-console-public-asset.json`、`tmp/tts-public-proxy-release.json`、`tmp/tts-public-release-expanded.json`。验证只使用公共 GET、运行状态与本地模拟服务，真实模型调用数为 0。

真实音色效果、Step 乱码、eleven 无关内容及此前任务查询 502 的具体原因，仍没有音频/生产现场证据；本次没有宣称这些问题已被模型生成实测解决。
