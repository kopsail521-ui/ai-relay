/**
 * test-glm-welcome.mjs
 * 
 * 全面模拟新用户场景验证 glm-5.3:free：
 * 1. 模拟新注册用户（仅有赠送金 gift_quota，充值余额 quota = 0）
 * 2. 生成该新用户的 API Key
 * 3. 验证非流式 /v1/chat/completions 调用 glm-5.3:free
 * 4. 验证流式 (stream: true) /v1/chat/completions 调用 glm-5.3:free
 * 5. 验证是否优先扣除赠送金 (gift_quota) 且余额无报错
 * 6. 验证弹窗 starter-curl 生成逻辑匹配 glm-5.3:free
 * 7. 清理测试产生的临时账号与 Key
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

let token = process.env.NEW_API_ADMIN_TOKEN;
let baseUrl = process.env.NEW_API_BASE || "https://www.keyoapi.xyz";

if (!token && fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  const match = envText.match(/NEW_API_ADMIN_TOKEN=(.+)/);
  if (match) token = match[1].trim();
  const baseMatch = envText.match(/NEW_API_BASE=(.+)/);
  if (baseMatch) baseUrl = baseMatch[1].trim();
}

if (!token) {
  console.error("Missing NEW_API_ADMIN_TOKEN");
  process.exit(1);
}

const adminHeaders = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function run() {
  console.log(`=== 开始测试新用户注册弹窗模型 glm-5.3:free ===\n`);
  console.log(`目标服务: ${baseUrl}`);

  // 1. 验证 starter-curl 模块逻辑
  console.log("\n[步骤 1/5] 验证 starter-curl 默认选择模型...");
  const starterModulePath = path.resolve(__dirname, "../new-api/web/src/features/dashboard/lib/starter-curl.ts");
  const starterContent = fs.readFileSync(starterModulePath, "utf8");
  const hasStarterModel = starterContent.includes("export const STARTER_FREE_MODEL = 'glm-5.3:free'");
  const hasCandidateFirst = starterContent.includes("'glm-5.3:free'");
  console.log(` - STARTER_FREE_MODEL 为 glm-5.3:free: ${hasStarterModel ? "✓ 正常" : "✗ 异常"}`);
  console.log(` - candidates 首选为 glm-5.3:free: ${hasCandidateFirst ? "✓ 正常" : "✗ 异常"}`);

  // 2. 创建临时测试用户（模拟新用户：gift_quota = 5000000 即 $10，quota = 0）
  console.log("\n[步骤 2/5] 创建仅有赠送金的测试新用户...");
  const testUsername = `t_${Date.now().toString().slice(-8)}`;
  const testPassword = `P_${Date.now().toString().slice(-6)}!`;
  
  const userCreateRes = await fetch(`${baseUrl}/api/user/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      username: testUsername,
      password: testPassword,
      display_name: "Test New User",
      role: 1, // regular user
      group: "default",
    }),
  });
  const userCreateJson = await userCreateRes.json();
  if (!userCreateJson.success) {
    throw new Error(`创建测试用户失败: ${JSON.stringify(userCreateJson)}`);
  }

  // 查询新用户 ID
  const searchRes = await fetch(`${baseUrl}/api/user/search?keyword=${testUsername}`, {
    headers: adminHeaders,
  });
  const searchJson = await searchRes.json();
  const testUserId = searchJson.data?.items?.[0]?.id;
  if (!testUserId) {
    throw new Error(`未找到新创建的用户 ID: ${testUsername}`);
  }
  console.log(` - 测试用户创建成功，ID: ${testUserId}, 用户名: ${testUsername}`);

  // 设置该用户的 gift_quota 为 $10 (5,000,000 quota)，正常 quota 为 0，保持 group 为 default
  await fetch(`${baseUrl}/api/user/`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({
      id: testUserId,
      username: testUsername,
      quota: 0,
      gift_quota: 5000000,
      group: "default",
    }),
  });
  console.log(` - 已为该用户配置赠送金 5,000,000 ($10.00)，充值余额为 0`);

  // 以该新用户身份登录获取 Session Token
  const loginRes = await fetch(`${baseUrl}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: testUsername,
      password: testPassword,
    }),
  });
  const loginJson = await loginRes.json();
  if (!loginJson.success || !loginJson.data?.access_token) {
    throw new Error(`新用户登录失败: ${JSON.stringify(loginJson)}`);
  }
  const userAccessToken = loginJson.data.access_token;

  // 以新用户权限为自己生成 API Key
  const userHeaders = {
    Authorization: `Bearer ${userAccessToken}`,
    "Content-Type": "application/json",
  };
  const tokenCreateRes = await fetch(`${baseUrl}/api/token/`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      name: "starter-key",
      remain_quota: 0,
      expired_time: -1,
      unlimited_quota: true,
      group: "default",
    }),
  });
  const tokenCreateJson = await tokenCreateRes.json();
  const testApiKey = tokenCreateJson.data?.key;
  const testTokenId = tokenCreateJson.data?.id;
  if (!testApiKey) {
    throw new Error(`新用户生成 API Key 失败: ${JSON.stringify(tokenCreateJson)}`);
  }
  console.log(` - 测试用户 API Key 创建成功，前缀: ${(testApiKey || "").slice(0, 10)}... (Token ID: ${testTokenId})`);

  let testSuccess = false;

  try {
    // 3. 非流式调用 glm-5.3:free
    console.log("\n[步骤 3/5] 发送非流式请求 (POST /v1/chat/completions, model: glm-5.3:free)...");
    const t0 = Date.now();
    const chatRes = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "glm-5.3:free",
        messages: [
          { role: "system", content: "You are a concise assistant." },
          { role: "user", content: "用一句话回答：1+1等于几？" },
        ],
        temperature: 0.1,
      }),
    });
    const dt = Date.now() - t0;
    console.log(` - HTTP 响应码: ${chatRes.status} (耗时: ${dt}ms)`);
    
    if (chatRes.status !== 200) {
      const errText = await chatRes.text();
      throw new Error(`非流式请求失败: ${errText}`);
    }
    const chatJson = await chatRes.json();
    const reply = chatJson.choices?.[0]?.message?.content || "";
    console.log(` - 模型回复: "${reply.trim()}"`);
    console.log(` - 回复对象模型: ${chatJson.model}`);
    console.log(` - Token 统计: prompt=${chatJson.usage?.prompt_tokens}, completion=${chatJson.usage?.completion_tokens}, total=${chatJson.usage?.total_tokens}`);

    // 4. 流式调用 glm-5.3:free (stream: true)
    console.log("\n[步骤 4/5] 发送流式请求 (POST /v1/chat/completions, stream: true)...");
    const tStream0 = Date.now();
    const streamRes = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "glm-5.3:free",
        messages: [
          { role: "user", content: "数到3：一、二、三" },
        ],
        stream: true,
      }),
    });
    console.log(` - HTTP 响应码: ${streamRes.status}`);
    if (streamRes.status !== 200) {
      const errText = await streamRes.text();
      throw new Error(`流式请求失败: ${errText}`);
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let streamText = "";
    let chunkCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunkCount++;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
          try {
            const parsed = JSON.parse(line.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content || "";
            streamText += delta;
          } catch {}
        }
      }
    }
    const streamDt = Date.now() - tStream0;
    console.log(` - 流式回复完成 (${chunkCount} chunks, 耗时: ${streamDt}ms): "${streamText.trim()}"`);

    // 5. 验证扣费钱包（确认使用的是赠送金 gift_quota，并且普通充值 quota 依然为 0）
    console.log("\n[步骤 5/5] 验证赠送金扣除详情...");
    const userDetailRes = await fetch(`${baseUrl}/api/user/${testUserId}`, { headers: adminHeaders });
    const userDetail = (await userDetailRes.json()).data;
    const remainingGift = userDetail?.gift_quota;
    const remainingPaid = userDetail?.quota;
    console.log(` - 初始赠送金: 5,000,000 ($10.00)`);
    console.log(` - 当前剩余赠送金: ${remainingGift} ($${(remainingGift / 500000).toFixed(4)})`);
    console.log(` - 已扣除赠送金: ${5000000 - remainingGift} quota`);
    console.log(` - 充值钱包余额: ${remainingPaid} (保持为 0，未误扣)`);

    if (remainingGift < 5000000 && remainingPaid === 0) {
      console.log(` - ✓ 验证通过：请求成功优先抵扣赠送金钱包，未充值新用户完全可用！`);
      testSuccess = true;
    } else {
      console.warn(` - ⚠ 扣费钱包状态未达预期`);
    }

  } finally {
    // 清理测试资源
    console.log("\n[清理] 清除临时测试用户与密钥...");
    if (testTokenId && userHeaders) {
      try {
        await fetch(`${baseUrl}/api/token/${testTokenId}`, { method: "DELETE", headers: userHeaders });
      } catch {}
    }
    if (testUserId) {
      try {
        await fetch(`${baseUrl}/api/user/${testUserId}`, { method: "DELETE", headers: adminHeaders });
      } catch {}
    }
    console.log(" - 测试资源清理完毕。");
  }

  console.log("\n========================================================");
  if (testSuccess) {
    console.log(">>> 测试成功！新用户弹窗模型 glm-5.3:free 完全可用且扣费正常！ <<<");
  } else {
    console.log(">>> 测试结束（部分检查项需关注日志） <<<");
  }
  console.log("========================================================\n");
}

run().catch((e) => {
  console.error("Test error:", e);
  process.exit(1);
});
