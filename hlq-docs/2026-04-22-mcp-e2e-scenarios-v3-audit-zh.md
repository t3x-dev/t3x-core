# T3X MCP E2E 场景 V3 审计结论

## 审计对象

- 被审文档：`/Users/heliuqi/Downloads/2026-04-22-mcp-e2e-scenarios-v3-zh.md`
- 审计目标：确认 V3 是否已经真正做到“按顺序照抄就能跑通当前 MCP”，并检查前两轮遗留问题是否已经全部收住。

## 总结结论

V3 比 V2 更接近可执行版本，前两轮很多问题已经确实修掉了：

- commit hash 的断言口径已经修正
- merge 混合流已经移出当前 E2E
- ancestry 查询已经移到未来能力
- merge `edit` 模式已经移到未来能力
- `t3x_diff` 是否上线的不确定项已经拿掉
- `@t3x-dev/local` 这种仓库外名词也已经移除

但这版**还不能直接判定“没问题”**。

当前仍有 4 个需要修正的点，其中前 3 个会直接影响团队后面按文档写 E2E：

1. A1 仍然把“conversation 续写”误写成“commit parent 线性传递”
2. A2 的 `t3x_diff` 调用参数名写错了
3. A3 把 `generate` 写进了“无新接口依赖”的闭环，但当前 MCP 没有创建 leaf 的路径
4. A5-a 对空字符串的失败类型写错了

## 审计发现

### 发现 1：A1 仍然错误假设“conversation 续写 = commit parent 线性传递”

原文位置：

- `2026-04-22-mcp-e2e-scenarios-v3-zh.md:47-58`

问题：

文档现在把跨 draft 演进写成：

- 第二轮 `t3x_extract({ project_id, text, conversation_id })` 产出新 draft B
- draft B 再 `edit -> commit`
- 最终断言 `v2.parents = [v1.hash]`

这一步和当前 MCP 真实实现不一致。

当前代码里：

- `t3x_commit` 的 parent 只来自 `draft.parent_commit_hash`
- `t3x_extract` 在创建新 draft 时，并没有把上一轮 commit hash 写进 `parent_commit_hash`
- `conversation_id` 只是用来续写对话上下文，不会自动建立 commit 链

也就是说，当前 MCP 下：

- `conversation_id` 能延续抽取语境
- 但它**不会自动让下一次 commit 继承上一条 commit 作为 parent**

所以文档里的这条断言：

> `v2.parents = [v1.hash]`

在当前实现下没有代码依据。

影响：

- 团队如果按这个写 E2E，会把当前实际行为误判为失败
- 这也会把“语义连续”误等同成“提交链连续”，两者在当前 MCP 里还不是同一回事

建议修订：

把 A1 拆清楚：

1. 当前 MCP 已支持的是“conversation 上下文连续”
2. 当前 MCP **未自动支持**的是“跨 extract 的 commit parent 自动传递”

如果要继续保留 `v2.parents = [v1.hash]` 这条断言，就必须先补出对应接口或 draft 初始化逻辑；否则这条应从 A 区移除。

参考代码：

- [packages/mcp/src/tools/core/extract.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/core/extract.ts)
- [packages/mcp/src/tools/core/commit.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/core/commit.ts)

### 发现 2：A2 的 `t3x_diff` 调用参数名写错了

原文位置：

- `2026-04-22-mcp-e2e-scenarios-v3-zh.md:68-72`

问题：

文档里写的是：

```text
t3x_diff({ source: commit_hash_v1, target: commit_hash_v2 })
```

但当前 `t3x_diff` 的真实入参不是 `source`，而是：

- `base`
- `target`

这是当前 tool schema 里已经明确写死的。

影响：

- 如果团队照文档直接抄调用，会在最基础的入参层面就失败
- 这和“按顺序照抄就能跑通当前 MCP”的文档承诺直接冲突

建议修订：

改成：

```text
t3x_diff({ base: commit_hash_v1, target: commit_hash_v2 })
```

参考代码：

- [packages/mcp/src/tools/advanced/diff.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/advanced/diff.ts)

### 发现 3：A3 把 `generate` 写进了当前闭环，但当前 MCP 没有创建 leaf 的路径

原文位置：

- `2026-04-22-mcp-e2e-scenarios-v3-zh.md:84-99`

问题：

文档把 A3 写成一个“无新接口依赖”的闭环：

`create_project -> extract -> query -> edit -> commit -> generate`

但当前 MCP 的 `t3x_generate` 要求的输入是：

- `leaf_id`

而当前 MCP tool surface 里：

- 没有 `create_leaf`
- `t3x_admin` 也没有创建 leaf 的 action
- `t3x_query` 只能读取已有 leaf，不能从 commit 生成 leaf

所以这条链路在当前 MCP 上并不完整。

换句话说，`generate` 不是“从 commit 自然接下去就能调用”的一步，而是依赖一个当前 MCP 并未提供创建路径的 leaf 对象。

除此之外，文档里的这条断言也过强：

> 若调用 `generate`，产出文本必须引用 commit 中已存在的节点 `key`，不允许幻觉新节点

当前 `t3x_generate` 的真实保证是：

- 基于 leaf + commit 做生成
- 做约束校验

但它并没有提供一个通用规则，保证输出文本一定显式引用 commit 节点 `key`。这更像是一个业务层额外规范，不是当前 MCP 通用现状。

影响：

- 团队如果把 A3 当成“当前可直接写 E2E”的闭环，会卡在没有 `leaf_id` 来源这一步
- 即使手工塞一个 leaf，后面的“必须引用 node key”断言也不一定代表当前 MCP 真实承诺

建议修订：

把 A3 拆成两种写法之一：

1. 当前版只写到 `commit` 为止，把 `generate` 拿掉
2. 如果一定要保留 `generate`，就明确前置条件：
   必须已存在可查询的 `leaf_id`

同时，把“输出必须引用节点 key”改成更贴近当前实现的断言，例如：

- `generate` 必须成功返回 output
- assertions / score 字段结构完整
- 输出与 leaf 约束校验结果一致

参考代码：

- [packages/mcp/src/tools/core/generate.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/core/generate.ts)
- [packages/mcp/src/tools/advanced/admin.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/advanced/admin.ts)

### 发现 4：A5-a 对“空字符串”的失败类型写错了

原文位置：

- `2026-04-22-mcp-e2e-scenarios-v3-zh.md:145`

问题：

文档写的是：

> 输入是空字符串或纯符号时，返回 "No extractable content found..."

这和当前 `t3x_extract` 的真实行为不完全一致。

当前实现里：

- 如果 `text` 为空字符串，先命中的是参数校验：
  `"text" is required.`
- 只有当 `text` 非空、但抽取后 `snapshot.trees.length === 0` 时，才会走：
  `"No extractable content found..."`

所以“空字符串”和“非空但不可抽取内容”是两种不同失败路径，不应该合写成一个。

影响：

- 团队如果照文档写用例，会把空字符串测成错误的预期结果
- 这会让错误路径测试从一开始就不稳定

建议修订：

把 A5-a 拆成两条：

1. `text = ""`
   断言 `"text" is required.`
2. `text` 非空但不可抽取
   断言 `"No extractable content found..."`

参考代码：

- [packages/mcp/src/tools/core/extract.ts](/Users/heliuqi/t3x/packages/mcp/src/tools/core/extract.ts)

## 当前最稳的结论

如果这版 V3 要继续作为“当前 MCP E2E 讨论稿”，我建议这样处理：

### 可以直接保留

- A4：merge 基础五步
- A5-b / A5-c / A5-d / A5-e 中与当前实现真实一致的失败路径
- B 区与 C 区的分层方式

### 需要修订后再保留

- A1：去掉“跨 extract 自动 parent 传递”的断言
- A2：把 `source` 改成 `base`
- A3：把 `generate` 从默认闭环里移除，或补充“已存在 leaf_id”前置条件
- A5-a：拆开“空字符串”和“不可抽取内容”两种失败

## 推荐的下一步

建议不要再靠纯文档来回审了，直接做一个最小 MCP 冒烟骨架去反证文档：

1. 先按 A1 / A2 / A4 / A5 写最小 vitest 骨架
2. 跑一遍真实 MCP
3. 把跑出来和文档不一致的地方直接回写

到这一步，文档才会真正变成闸口，而不是只停留在推测层面。
