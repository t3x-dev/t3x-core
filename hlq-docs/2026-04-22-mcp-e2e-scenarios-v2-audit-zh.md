# T3X MCP E2E 场景 V2 审计结论

## 审计对象

- 被审文档：`/Users/heliuqi/Downloads/2026-04-22-mcp-e2e-scenarios-v2-zh.md`
- 审计目标：确认 V2 是否真正做到“当前可做的 E2E 全部对得上仓库里的真实 MCP 接口”，并找出仍然会误导排期和测试设计的内容。

## 总结结论

这版 V2 比上一轮明显更收敛，几个关键改动方向是正确的：

- 已经把 `web_url`、merge 批量 `decisions`、ancestry 查询、merge `edit` 模式等未来能力移出当前 E2E 主体
- 已经把 merge 五步流写回了当前 MCP 真实接口
- 已经把 diff、失败路径、可断言指标这些内容保留下来

但这版还没有完全达到“只写当前 MCP 真能做的事”。

当前还剩 6 个需要修正的问题，其中最重要的 3 个是：

1. `A1 连续迭代` 的主链路本身按当前 MCP 是走不通的
2. `A5-b` 把“期望中的错误结构”写成了“当前现状”
3. `A1` 里有一条依赖 `yops_log` 的断言，当前 MCP 根本没有观测面

如果这 3 个点不改，团队后面很容易出现两种偏差：

- 按文档去写 E2E，但一上手就发现流程本身跑不通
- 把规范建议误当成当前实现承诺，最后测试和代码互相对不上

## 审计发现

### 发现 1：A1 的主链路在首个 commit 后就无法继续

原文位置：

- `2026-04-22-mcp-e2e-scenarios-v2-zh.md:41-47`

问题：

文档把连续迭代写成了：

`extract -> commit -> (query draft -> edit -> commit)×N`

这条链路和当前 MCP 的真实行为不一致，原因有两个：

1. `t3x_extract` 当前不会返回 `revision=1`，只返回 `draft_id` 等摘要信息
2. `t3x_commit` 会把 draft 状态改成 `committed`

一旦 draft 已经 `committed`，当前这个 draft 后面就不能再：

- `t3x_edit`
- `t3x_commit`

所以文档里写的“同一个 draft 持续 query/edit/commit 多轮”在当前 MCP 上跑不到第二轮。

影响：

- 团队如果照这个主链路去拆 E2E，第二轮就会直接撞状态错误
- 这不是测试写得不对，而是文档里的业务流程本身和当前接口不一致

建议修订：

把 A1 明确改成下面两种写法之一：

1. 如果坚持写“当前可做的 E2E”，那就不要把连续多轮 edit/commit 建立在同一个已提交 draft 上
2. 如果确实想表达“从 commit 继续演进”，那要明确标成“需先补 MCP 上的继续工作能力”

换句话说，当前文档不能再把这条链路写成现成可跑的主路径。

参考代码：

- [packages/mcp/src/tools/core/extract.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/core/extract.ts)
- [packages/mcp/src/tools/core/commit.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/core/commit.ts)

### 发现 2：A5-b 把期望中的错误结构写成了当前现状

原文位置：

- `2026-04-22-mcp-e2e-scenarios-v2-zh.md:126`

问题：

文档要求 `edit` 失败时必须返回：

- 当前 revision
- 预期 revision
- 下一步建议，例如重新 query draft

这在产品设计上是合理的，但它不是当前 MCP 的真实返回。

当前真实行为是：

- `if_revision` 省略时不会失败，而是直接回退到 draft 当前 revision
- 真正发生 revision 冲突时，底层 `ConflictError` 会被 MCP 统一包装成通用错误文本
- 当前返回里没有结构化的 `current revision / expected revision / next_steps`

影响：

- 这条如果写成“当前实现上直接可跑的失败路径标准”，测试会天然失败
- 团队会把“未来应该补的错误设计”误看成“当前已经承诺的行为”

建议修订：

把这条改成两层表述：

1. 当前可测现状
   验证 revision 冲突会失败，并且能返回冲突信息
2. 建议改进目标
   未来把错误结构补成包含 revision 上下文和 re-query 提示

这条建议可以保留，但不能再写成“当前 MCP 已经如此”。

参考代码：

- [packages/mcp/src/tools/core/edit.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/core/edit.ts)
- [packages/storage/src/queries/drafts.ts](/Users/heliuqi/t3x/packages/storage/src/queries/drafts.ts)
- [packages/mcp/src/server.ts](/Users/heliuqi/t3x/packages/mcp/src/server.ts)

### 发现 3：A1 的 `yops_log` 断言当前没有 MCP 观测面

原文位置：

- `2026-04-22-mcp-e2e-scenarios-v2-zh.md:53`

问题：

文档要求：

> 第 K 轮 edit 只写节点 X 的 YOps，则该轮 `yops_log` 中不得出现节点 X 之外的写操作

但当前 MCP 并没有提供这条断言所需的观测面。

当前真实情况是：

- `t3x_extract` 明确说明 MCP 版 extraction 不持久化 `yops_log`
- `t3x_edit` 只做验证和更新 draft，不会把本轮操作写成可供 MCP 查询的 `yops_log`
- 当前 MCP 也没有提供“查询这一轮 yops_log”的 tool 或 resource

影响：

- 这条断言无法作为 MCP E2E 落地
- 它最多只能作为 API / storage 层测试，或者未来 MCP 增强后的断言

建议修订：

把这条从当前 MCP E2E 指标里移出去，降级到下面两类之一：

1. API / storage 层测试
2. 未来 MCP 能力增强后再恢复

当前版本不应继续把它列在 A 类“可直接纳入 E2E”的指标里。

参考代码：

- [packages/mcp/src/tools/core/extract.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/core/extract.ts)
- [packages/mcp/src/tools/core/edit.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/core/edit.ts)

### 发现 4：A4 仍然混用了当前 merge 面上不存在的字段名

原文位置：

- `2026-04-22-mcp-e2e-scenarios-v2-zh.md:114-116`

问题：

文档这里仍然写了：

- `autoKept`
- `similarPairs`
- `onlyInSource`
- `onlyInTarget`

但当前 MCP merge 的真实返回/读模型不是这个口径。

当前真实情况是：

- `prepare` 的直接返回里，summary 字段是：
  - `auto_kept`
  - `conflicts`
  - `only_in_source`
  - `only_in_target`
- 如果通过 merge draft 资源去读取详细 prepared 结构，对应字段是：
  - `autoKept`
  - `conflicts`
  - `onlyInSource`
  - `onlyInTarget`

当前并没有 `similarPairs` 这个字段。

影响：

- 实现者会以为当前 merge 还是旧的 `similarPairs` 心智模型
- 测试设计时会直接对错字段做断言

建议修订：

把 A4 的术语统一成当前真实模型，不要再混用历史命名。

更稳妥的写法是：

- 如果说的是 `prepare` 的直接返回，就用 `auto_kept / conflicts / only_in_source / only_in_target`
- 如果说的是 merge draft 资源里的详细结构，就用 `autoKept / conflicts / onlyInSource / onlyInTarget`

但不要再出现 `similarPairs`。

参考代码：

- [packages/mcp/src/tools/advanced/merge.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/advanced/merge.ts)
- [packages/mcp/src/read-models/index.ts](/Users/heliuqi/t3x/packages/mcp/src/read-models/index.ts)

### 发现 5：A2 对 `t3x_diff` 是否上线的保留判断已经过时

原文位置：

- `2026-04-22-mcp-e2e-scenarios-v2-zh.md:67`

问题：

文档仍然保留了一段不确定判断：

> 如果 `t3x_diff` 尚未上线，A2 需要降级为 B 类

但这已经不是当前仓库现状。

当前真实情况是：

- `packages/mcp/src/tools/advanced/diff.ts` 已经实现了 `t3x_diff`
- `createMcpServer` 在启用 `advanced` toolset 时会注册它
- 仓库根 `.mcp.json` 当前配置的就是 `T3X_TOOLSETS=core,advanced`

影响：

- 会把已经可直接进入 E2E 的能力写成“不确定”
- 容易让团队错误降级 A2，影响优先级判断

建议修订：

直接把 A2 写成当前可做，不要再加“是否已上线”的保留句。

参考代码：

- [packages/mcp/src/tools/advanced/diff.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/advanced/diff.ts)
- [packages/mcp/src/server.ts](/Users/heliuqi/t3x/packages/mcp/src/server.ts)
- [/.mcp.json](/Users/heliuqi/t3x/.mcp.json)

### 发现 6：文末引入了仓库里不存在的发布对象，容易让讨论失焦

原文位置：

- `2026-04-22-mcp-e2e-scenarios-v2-zh.md:168`

问题：

文档最后把 A1–A5 的冒烟闸口绑定到了：

- `@t3x-dev/local`

但当前公开仓库里并没有这个包，也没有相应的包定义或发布流程可供对照。

前文一直在强调：

> 只承诺对得上仓库真实实现

这里突然引入一个仓库里不存在的发布对象，会把讨论从“当前 MCP E2E 范围”带偏到另一条还没落地的打包方案。

影响：

- 团队讨论容易被带到仓库外的方案细节
- 排期范围会失焦，不利于现在先把 MCP E2E 收敛

建议修订：

直接改成更稳的表述：

> 作为 MCP 发布前的冒烟闸口

不要绑定当前仓库里不存在的包名。

## 当前最稳的结论

如果这份 V2 是要继续作为团队讨论稿，我建议按下面这个口径修：

### 可以保留为当前 MCP E2E 的内容

- A2：版本 diff
- A4：merge 基础五步
- A5 中和当前接口真实一致的失败路径
  - merge 缺 `reasoning`
  - merge 未全部 resolve 就 execute
  - merge conflict `index` 越界

### 需要改写后才能继续保留的内容

- A1：连续迭代
  - 现在的主链路不能直接成立
- A5-b：revision mismatch
  - 现在把“改进目标”写成了“现状承诺”
- A1 里的 `yops_log` 断言
  - 当前 MCP 无法观测

### 不该再保留为“不确定项”的内容

- `t3x_diff` 是否已上线
  - 当前已经上线，不需要继续保留模糊判断

### 需要改成更严格现状术语的内容

- A4 merge 字段名
  - 不能再混用 `similarPairs`

### 需要去掉仓库外名词的内容

- `@t3x-dev/local`

## 推荐的改写方向

建议下一版直接按下面三条原则收口：

1. 任何 A 类场景，必须保证“按文档顺序真的能跑通”
2. 任何失败路径，必须区分“当前真实返回”和“未来建议返回”
3. 任何断言，都只能依赖当前 MCP 真实能读到的数据面

如果按这三条改，下一版就会比现在稳很多，也更适合直接拿去拆任务。
