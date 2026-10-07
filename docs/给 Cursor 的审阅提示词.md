# 给 Cursor 的审阅提示词

请先阅读以下文件：

1. `docs/接入文档审计.md`
2. `docs/客户接入一页纸.md`
3. `static/brand/keyo-docs.html`
4. `services/apimart-passthrough/video-contracts.mjs`
5. `services/apimart-passthrough/server.mjs`
6. `services/apimart-passthrough/task-responses.mjs`
7. `services/gitee-passthrough/server.mjs`
8. `services/creem-moderation-proxy/server.mjs`
9. `services/creem-moderation-proxy/video-routing.mjs`

请做一次纯静态审阅，不要运行任何模型，不要发送真实 API 请求，不要猜测不存在的接口。

重点检查：

- 文档中的路径、请求方法、请求头、Content-Type 是否与代码一致；
- 音频、视频模型的字段名、字段类型、必填项、互斥条件和取值范围；
- 异步任务创建、任务 ID 提取、轮询路径和完成状态；
- 同步/异步 TTS 的 `input` 与 `inputs` 区别，以及向量、重排和内容审核接口；
- 本地文件上传、媒体 URL、过期时间和错误码；
- 客户文档是否暴露内部供应链、成本、代理或上游信息；
- 网页文档、Markdown 文档、模型目录和实际校验逻辑之间是否一致。

请按以下格式输出：

| 严重程度 | 文件和行号 | 问题 | 用户会看到的错误 | 建议修复 |
|---|---|---|---|---|

严重程度使用：

- P0：几乎必然导致调用失败或错误扣费；
- P1：特定模型或特定字段组合会失败；
- P2：文档误导、兼容性问题或排错困难。

完成审阅后，只修改确实会导致用户失败或误解的内容。修改前先列出计划，修改后再次检查文档和代码是否一致。不要改动价格、鉴权、计费或模型目录，除非能从代码或配置中直接证明它们错误。
