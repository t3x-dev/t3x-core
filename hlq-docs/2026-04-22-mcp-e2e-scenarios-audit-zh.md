# T3X MCP E2E 场景审计结论

## 审计对象

- 原审阅稿：`/Users/heliuqi/Downloads/2026-04-22-mcp-e2e-scenarios-review-zh.md`
- 审计目标：检查该文档是否与当前仓库里的真实 MCP 能力一致，避免团队讨论时把“未来想做的能力”和“当前可落地的 E2E 范围”混在一起。

## 总结结论

这份审阅稿整体方向是对的，尤其是下面几件事值得保留：

- 把场景优先级往“连续迭代”和“版本 diff”倾斜
- 把通过标准从软描述改成可断言指标
- 明确提出要补失败路径，而不是只测 happy path

但文档里有 4 个关键问题需要修正。它们的共同问题是：

**把当前 MCP 面上还不存在的能力，写成了像是已经可直接纳入 E2E 的现状。**

如果不修，团队后面会在两个地方跑偏：

1. 会把一些其实还没实现的能力，当成明天就该写的 E2E。
2. 会把本来正确的实现，按照错误断言判成失败。

## 审计发现

### 发现 1：Commit hash 的断言条件写错了

原文位置：

- `2026-04-22-mcp-e2e-scenarios-review-zh.md:102-103`

问题：

文档把 `commit.hash` 的自洽条件写成了：

> 对 `commit.content` 做 JCS + SHA-256 后应等于 hash

这和当前仓库实现不一致。当前 commit hash 覆盖的是整组一等字段，不是只覆盖 `content`。

当前真实规则是：

- `schema`
- `parents`
- `author`
- `committed_at`
- `content`

一起进入 hash 计算。

影响：

- 如果团队按文档实现测试，会把正确的 commit 误判为失败。
- 这会直接污染 E2E 的可信度，因为断言基础本身就是错的。

建议修订：

把原来的断言改成：

> 对 commit 的一等字段整体做规范化和 SHA-256，结果应与 `commit.hash` 一致。

参考代码：

- [packages/core/src/commit/hash.ts](/Users/heliuqi/t3x/packages/core/src/commit/hash.ts)
- [packages/core/src/commit/types.ts](/Users/heliuqi/t3x/packages/core/src/commit/types.ts)

### 发现 2：Merge 混合流程假设了当前 MCP 并不存在的接口

原文位置：

- `2026-04-22-mcp-e2e-scenarios-review-zh.md:145-153`

问题：

文档把 merge 流程写成了这种形式：

- `prepare` 返回 `web_url`
- 低冲突场景走 `resolve(decisions) -> execute`
- 高冲突场景跳 Web，再回 MCP

但这不是当前 MCP 的真实接口形态。

当前仓库里的真实情况是：

- `t3x_merge.prepare` 返回的是 `draft_id`、`summary`、`next_steps`
- 没有 `web_url`
- `resolve` 不是批量 `decisions`，而是单条冲突逐个处理：
  `draft_id + index + resolution + reasoning`

影响：

- 团队会误以为 Web 跳转能力已经在 MCP 面上存在
- 团队会误以为 merge resolve 支持一次性批量提交 decisions
- 后续如果按这个文档写 E2E，测试设计会直接脱离当前实现

建议修订：

把这部分明确改成两层：

1. 当前可测的 MCP 实际流程
   `prepare -> show_conflict -> resolve(逐条) -> execute`
2. 未来可扩展方向
   可以讨论 `web_url` 或 Web 承接复杂冲突，但要明确标记为“未来能力”，不是当前 E2E 前提

参考代码：

- [packages/mcp/src/tools/advanced/merge.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/advanced/merge.ts)
- [packages/mcp/src/resources/index.ts](/Users/heliuqi/t3x/packages/mcp/src/resources/index.ts)

### 发现 3：“决策因果追溯”场景依赖的 ancestry 查询当前不在 MCP 面上

原文位置：

- `2026-04-22-mcp-e2e-scenarios-review-zh.md:184-185`

问题：

文档把 P1 的一个场景定义成：

> 多 commit 之间的 ancestry 查询

但当前 MCP 的 `t3x_query` 并不支持 commit ancestor chain / history 查询。

当前 MCP 支持的是：

- `project / draft / agent_draft / commit / leaf / pin / conversation`
- 以及这些资源的列表查询

当前不支持的是：

- commit history
- ancestor chain

仓库里虽然已经有 API 路由：

- `/v1/commits/:hash/history`

但这还不是当前 MCP tool surface 的一部分。

影响：

- 团队讨论时会误把 API 能力当成 MCP 已暴露能力
- 这个场景暂时无法作为“当前 MCP E2E”直接落地

建议修订：

把这个场景拆开：

1. 如果坚持作为当前 MCP 场景保留，就改写成不依赖 ancestry 查询的版本
2. 如果必须强调 ancestry / history 价值，就明确标成“API 已有、MCP 未暴露、需先补 MCP 能力”

参考代码：

- [packages/mcp/src/tools/core/query.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/core/query.ts)
- [packages/api/src/routes/commits.openapi.ts](/Users/heliuqi/t3x/packages/api/src/routes/commits.openapi.ts)

### 发现 4：失败路径 C 建立在不存在的 merge `edit` 分支上

原文位置：

- `2026-04-22-mcp-e2e-scenarios-review-zh.md:126-129`

问题：

文档把失败路径 C 写成了：

> 用户选择 `edit`（自定义文本），但文本非法或为空

但当前 `t3x_merge.resolve` 并没有 `edit` 这个 resolution 分支。

当前真实支持的 resolution 只有：

- `source`
- `target`
- `both`

并且当前也没有“自定义文本”字段可供校验。

影响：

- 这个失败路径在当前实现里根本无法落成测试
- 讨论时会把一个未来能力错放进当前 E2E 目标

建议修订：

把这个失败路径分成两种表达方式之一：

1. 当前版改成真实存在的失败路径
   例如：
   - `index` 越界
   - `reasoning` 缺失
   - conflict 未全部 resolve 就 execute
2. 如果想保留 `edit` 这个方向，就明确标注为未来 merge 能力，不纳入当前 E2E

参考代码：

- [packages/mcp/src/tools/advanced/merge.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/advanced/merge.ts)

## 当前最稳的结论

如果这份文档是给团队讨论“明天开始哪些 E2E 可以做”，建议把内容分成两栏，而不是混写。

### A. 当前 MCP 已支持，可直接纳入 E2E

这些内容已经和当前 MCP 面一致：

- `create_project -> extract -> query(draft) -> edit -> commit`
- 多轮 `query -> edit -> commit`
- `commit v1 -> commit v2 -> diff`
- `merge.prepare -> show_conflict -> resolve(逐条) -> execute`
- 失败路径里和当前接口真实一致的部分
  - revision mismatch
  - merge resolve 缺少 reasoning
  - merge execute 前未全部 resolve
  - conflict index 越界

### B. 有价值，但属于未来能力，不能写成当前前提

这些方向值得做，但要单独标明为后续扩展：

- MCP 直接返回 `web_url`
- MCP 与 Web 的标准化混合回流闭环
- merge 的批量 `decisions` 提交
- merge resolution 的 `edit` / 自定义文本模式
- commit ancestry / history 作为 MCP 查询能力

## 推荐的文档改写方式

建议你们把原审阅稿改成下面这种结构：

### 第一部分：当前版本可讨论的 E2E 范围

只写和当前 MCP 面一致的场景：

1. 起稿
2. 连续迭代
3. 版本 diff
4. merge 基础流程
5. 失败路径

### 第二部分：建议进入下一阶段的扩展能力

单独列成“未来能力候选”：

1. Web 详情链接
2. MCP + Web 混合 merge
3. ancestry 查询
4. merge edit 模式

这样团队在讨论时会清楚：

- 哪些是明天就能分工的
- 哪些是要先补协议/产品能力再谈测试的

## 我建议保留的方向

这份审阅稿里，下面几个方向仍然建议保留：

- 把 `连续迭代` 放到更高优先级
- diff 场景保留在 P0
- 所有通过标准尽量改成可断言条件
- 一定补失败路径

也就是说，问题不在“方向错了”，而在“边界没有收住”。

## 最终建议

如果你们下一步要产出给团队看的最终版，我建议直接按这三个原则改：

1. 只把当前 MCP 真正支持的能力写成当前 E2E 场景
2. 所有未来能力都单列，明确标注“需先补接口”
3. 每个场景至少给出 1 到 2 条当前可落地的可断言指标

这样最终文档会更稳，也更适合拿去做排期和分工。
