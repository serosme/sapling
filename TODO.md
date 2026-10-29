# sapling 待办

> 对应规格：[docs/设计文档.md](docs/设计文档.md)（v2.0）。此处只列**可执行的动作**，不重复设计论证。
> 现状（2026-10-29）：7 次提交、8 个源文件、约 135 行；`eslint` / `nuxt typecheck` 均 exit 0。
> 已确认缺陷的取证见 [docs/项目分析报告.md](docs/项目分析报告.md)。

**唯一下一步**：`M0-1`（一行改动，立刻消除无限工具循环）。

---

## 0. 阻断项：先决策，再动 M2 之后

结论先说：**M0 不被任何决策阻塞，今晚就能开工**。M1 只被 `D1`（会话模型）轻度影响（建表时留不留 `conversation_id`），M2 起才真正需要拍板。

| # | 待确认 | 推荐 | 影响 |
| --- | --- | --- | --- |
| D1 | 会话模型 | 每天一条 + 允许自由新建 | M1 建表 / M2 摘要切分 |
| D2 | 上下文预算 | 16k 起步 | M2 |
| D3 | 流式形态 | 裸 chunked 文本，不上 SSE | M0-3 / M4 |
| D4 | 消息合并位置 | 下沉到客户端 | M0-3 |
| D5 | 推送 | Android 用 FCM，M3 就上 | M3 |
| D6 | 心情表示 | `valence/arousal` + 派生标签 | M3 |
| D7 | 旁路提取频率 | 每 10 轮或每段对话结束 | M3 |
| D8 | 记忆衰减半衰期 | 14 天 | M1 |

已闭合、无需再议：客户端 = Kotlin Multiplatform（`sapling-app` 已存在，androidApp + desktopApp + shared）；iOS/PWA 与 Web Push 分支删除；identity 现留代码、M1 末迁入 DB 并留 fallback。

---

## M0　地基修复（不依赖任何决策）

目标：现有代码不再有"自我挖坑"故障，且生产真的能部署上去。

建议顺序：`M0-1` → `M0-2` → **`M0-4`（schema 先落地）** → `M0-3`（要用到新字段）→ `M0-5` / `M0-6` / `M0-7` → `M0-8`。

- [ ] **M0-1　给工具循环加上限**
      `server/api/chat.post.ts:43` 现在是 `stopWhen: isLoopFinished()`，而它等价于 `() => false`，同时**替换**掉了默认的 `isStepCount(1)` —— 工具循环没有代码级上限。
      改为 `import { stepCountIs } from 'ai'` + `stopWhen: stepCountIs(5)`。
      *验收*：故意让模型连续调用 `current_time`，第 5 步后停止，`usage` 正常返回。

- [ ] **M0-2　上下文预算最小版**
      `server/db/chat-messages.ts:18-29` 的 `listChatMessages()` 无 `LIMIT`，`chat.post.ts:26` 每轮全量重放 7 天历史。
      加 `limit`（先按条数，M2 再换 token 预算）；`chat.post.ts:35` 补 `maxOutputTokens`。
      *验收*：塞 500 条历史，请求仍成功，`usage.promptTokens` 不随历史线性爆炸。

- [ ] **M0-3　改成流式 + 状态机**（依赖 M0-4 的字段）
      当前 `chat.post.ts:27` 先落 user 消息、`:46` 后落 assistant，且是 `generateText` 一次性返回，中间失败就留下孤儿。
      按设计 7.3 / 7.7 改：`streamText` + `createTextStreamResponse({ stream })` 返回裸 chunked 文本；**落库挂 `onEnd`**（不是 `onFinish`，v7 里它已 deprecated）；user 行先写 `status='pending'`，`onEnd` 成功→写 assistant 行 + user 置 `ok`；失败→`onAbort`/`onError` 里把 user 置 `failed` 并返回明确错误码；断线时 `event.waitUntil(result.consumeStream())` 让生成跑完。
      *验收*：把 provider baseURL 改成无效地址，库里只出现一条 `failed` 的 user 行，不再有"有问无答且状态正常"的行；正常流式时客户端能边收边显示。

- [ ] **M0-4　`messages` 一次迁移到位**
      加 `conversation_id`（默认 `'main'`）、`source`、`status`、`client_message_id`（唯一索引）、`parts_json`、`usage_json`；补 `(conversation_id, id)` 索引。
      用 `nuxt db generate` 生成，落到 `server/db/migrations/sqlite/`。
      *验收*：本地与远端各跑一次迁移；同一 `client_message_id` 重复插入被拒；两条会话的消息不串。

- [ ] **M0-5　修复部署链路**
      根 `wrangler.jsonc` 缺 `main`/`assets`，实测 `wrangler deploy --dry-run --keep-vars` 直接报 `Missing entry-point`。
      二选一：①补 `main: "./.output/server/index.mjs"`、`assets.directory`、`database_id`、`migrations_dir: "db/migrations/sqlite"`；②deploy 改走 `--config .output/server/wrangler.json`。
      顺带统一 `compatibility_date`（nuxt.config 与 wrangler.jsonc 现在是两个值）。
      *验收*：`pnpm deploy` 从零跑通；`wrangler deployments list` 能看到新版本。

- [ ] **M0-6　让生产环境变量有落地路径**
      `deploy` 只带 `--keep-vars`，从不上传 secrets；配置为空时 `isValidApiToken` 会让**全部请求 401**（静默）。
      写 README：4 个 `NUXT_*` 变量怎么设（`wrangler secret put`），迁移怎么跑。
      *验收*：新环境按 README 从零做到 `curl /api/chat` 返回 200。

- [ ] **M0-7　`useRuntimeConfig()` 传 `event`**
      `server/middleware/api-guard.ts:7` 与 `server/api/chat.post.ts:24` 都没传，拿到的是模块级冻结快照。现在恰好是常量所以能跑，一旦要按请求读绑定就会踩坑。
      *验收*：两处改为 `useRuntimeConfig(event)`，`typecheck` 通过。

- [ ] **M0-8　补 README**
      运行、环境变量、部署、迁移、数据备份（`pnpm db:backup`）—— 现在这些知识只存在于你的脑子里。

---

## M1　记忆系统

- [ ] **M1-0　先写记忆质量验收清单（前置，不写代码）**
      没有验收标准的记忆系统等于没做。清单至少覆盖 8 条：
      1. 能记住"我是做什么工作的"，并在后续对话里自然用上
      2. 能记住"上周说过讨厌香菜"，下次点餐话题不被重复问
      3. **不会**把"今天下午三点开会"这种一次性事件写进 `him`
      4. `replace` 后旧行 `archived_at` 置位且 `superseded_by` 指向新行，查询不再返回旧行
      5. 同一事实反复出现 3 次，不会变成 3 行重复记忆
      6. 她写的每一行都有非空 `source_message_id`，可反查到原话
      7. `before` 插错位置时能自我纠正（tool error → 重试成功）
      8. 重启进程/隔天再聊，记忆仍在且体现在 instructions 里

- [ ] **M1-1　`memories` 表 + 迁移**
      按设计 3.3；含 `triggers_json`、`weight`、`last_accessed_at`、`superseded_by`、`archived_at`。`id` 不要写死成单例（给多角色留口）。
      *验收*：插入 → 软删 → 再插，旧行仍在库、查询不可见。

- [ ] **M1-2　`buildInstructions()` 分层装配**
      按设计 4.1：`identity` / `self` / `him` / 摘要 四段拼接，**动态内容不许进这里**。
      放在独立模块（如 `server/ai/instructions.ts`），便于单测与后续加层。
      *验收*：改库里一条 him 记忆，下一次请求的 instructions 随之变化；同一状态下重复调用输出字节一致。

- [ ] **M1-3　`remember` 工具**
      按设计 5.3 的契约与错误契约；只开放 `self`/`him`；`identity` 拒绝写入。
      *验收*：走完 M1-0 的 1–7 条。

- [ ] **M1-4　衰减查询**
      `score = weight × 0.5^(days/14)`，查询时计算、批量回写 `last_accessed_at`；`identity` 不衰减。
      *验收*：把某行 `last_accessed_at` 改到 30 天前，它排序明显后移。

- [ ] **M1-5　identity 迁入 DB**
      种子迁移 + `version`；代码常量保留作 fallback（库里缺行时回退）。
      *验收*：删掉库里的 identity 行，服务仍能启动并回退到代码常量；重新插入后以 DB 为准。

---

## M2　上下文预算与摘要

- [ ] **M2-1　token 预算引擎**：按设计 4.3，**以"轮"为最小单位**从最早丢起，绝不切断 user/assistant 配对。
- [ ] **M2-2　`usage_json` 落库**
      ① 先给 `createOpenAICompatible` 加 `includeUsage: true` —— **不加这个，流式下 usage 恒为空**，后面所有预算调参都是瞎猜；② 从 `onEnd` 的聚合 `usage` 写入 `usage_json`。
      *验收*：每轮都能查到非零的 prompt/completion/cached token。
- [ ] **M2-3　`summaries` 表 + 每日摘要**：3–5 行时间线，注入 3–7 条；按 `message_id_from/to` 防重复。
- [ ] **M2-4　cron `30 22 * * *`**（= 次日 06:30 Asia/Shanghai）：建当天会话 + 生成前一天摘要。

*M2 验收*：构造 3 天、每天 200 条的历史 —— 请求不超窗；`usage` 曲线平稳；摘要条数稳定不膨胀。

---

## M3　状态与主动唤醒

- [ ] **M3-1　`events` 表 + 闭合判定**：只允许宿主基于明确证据关闭，模型只能新建（设计 3.4 / 6.2）。
- [ ] **M3-2　`mood_state` + 更新/回落**：两类外力（对话、时间）+ 向基线回拉（设计 6.1）。
- [ ] **M3-3　旁路提取管线**：每 10 轮或每段结束，输出 `{ mood_delta, new_events, memory_hits, scene_triggers }`；低置信度只记不说。
- [ ] **M3-4　cron 决策管线**
      落地要改四处，缺一不可：① `nuxt.config.ts` 加 `nitro.experimental.tasks = true`；② `server/tasks/<name>.ts` 定义任务；③ `nitro.scheduledTasks` 映射 cron → task；④ 根 `wrangler.jsonc` 手写 `triggers.crons`（**Nitro 不会生成这一项**）。**不要**写 `export default { scheduled }`，preset 入口已拥有它。
      逻辑：`0 */2 * * *` 收集信号 → 判断 → **该说才写消息**（`source=proactive`）。
      *验收*：`wrangler deployments` 后 cron 真被触发（看 logs）；90% 回合静默。
- [ ] **M3-5　打扰预算**：安静时段 23:00–08:00、最小间隔 3 小时、每日 1–2 条上限。
- [ ] **M3-6　FCM 推送 + `devices` 表**：Android 走 FCM HTTP v1（service account JWT + token 缓存），Desktop 不推送。

*M3 验收*：连续 24 小时手动触发 cron —— 90% 以上回合静默；构造一个到期 event，能在安静时段外收到一条推送。

---

## M4　客户端对接（Kotlin）

- [ ] **M4-1　冻结流式契约**：消息 id 走响应头（`X-Message-Id` / `X-Client-Message-Id`），body 是纯文本增量、流关闭即结束；`Content-Type: text/plain; charset=utf-8`（设计 7.3）。**不发明帧格式**。
- [ ] **M4-2　`GET /api/messages?after_id=X`**：严格单调游标，主动消息与回复合并返回。
- [ ] **M4-3　断线补偿**：`consumeStream()` 保证断线也生成完；客户端重连按 `after_id` 补齐。
- [ ] **M4-4　设备级 token + `devices` 表**：替换单一全局 token。
- [ ] **M4-5　Kotlin 端**：`shared` 网络层（ktor + 流式读取）→ `androidApp` UI → `desktopApp`。

*M4 验收*：真机断网 30 秒再恢复，消息不丢不重；两设备同时在线不串会话。

---

## 明确不做（防止范围蔓延）

消息删除 / outbox 表 / 推送标记 / "她想了但没说"的日志 / 向量库 / 会话列表 / 已读同步 / 常驻 WS 长连接 / 提前建摘要表 / `created_at` 单独索引 / 请求体大小限制 / message 长度上限 / CI。

理由见设计文档第十节。

---

## 每次提交前

1. `pnpm eslint .` 与 `pnpm typecheck` 全绿
2. 动了 schema → 本地迁移跑一遍，远端迁移跟着跑
3. 动了鉴权/部署 → `curl` 一次 `/api/chat` 确认 200 与 401 两条路径都对
4. 动了上下文装配 → 检查静态段字节是否仍然稳定（缓存命中率不塌）
