# Gitee 透传上线（大白话）

## 这是干什么的？

有些模型（抠图、超分、数字人、异步语音等）走的是特殊地址。  
网站大门（Caddy）以前只认识普通窗口，所以那些模型“挂了名却打不通”。

**透传** = 再雇一个小服务员（端口 3010），专门接待这些特殊请求，转给模力方舟，并从客户余额扣钱。

## 上线后长什么样？

```
客户 → https://www.keyoapi.xyz
         ├─ 特殊路径（检测/抠图/异步…）→ 透传 :3010 → 模力方舟
         └─ 其它（聊天/出图/ASR…）    → 审核代理 :3001 → New API :3000
```

客户仍然只用一个地址：`https://www.keyoapi.xyz/v1`，不用记第二个端口。

## 怎么装（阿里云 Workbench）

1. 本机先生成安装命令：

```bat
node scripts/print-vps-gitee-passthrough-install.mjs
```

2. 打开生成的 `scripts/vps-gitee-passthrough-one-liner.txt`，**全选复制**
3. 登录阿里云 → 你的 ECS → **Workbench 远程连接**
4. 粘贴回车，等到出现 `DONE_GITEE_PASSTHROUGH`
5. 自测健康检查（在 VPS 上）：

```bash
curl -sS http://127.0.0.1:3010/healthz
```

应看到 `"ok":true` 且 `"gitee_key":true`。

## 客户怎么用特殊模型（例子）

抠图（RMBG）：

```bash
curl https://www.keyoapi.xyz/v1/images/mattings \
  -H "Authorization: Bearer 你的sk令牌" \
  -F model=RMBG-2.0 \
  -F image=@photo.png
```

异步任务查结果：

```bash
curl https://www.keyoapi.xyz/v1/task/任务ID \
  -H "Authorization: Bearer 你的sk令牌"
```
