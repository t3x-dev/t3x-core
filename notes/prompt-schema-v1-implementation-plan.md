# Prompt Schema v1 实施计划

## 1. 目标

在现有 PRD Schema 和 Skill Schema 基础上增加第三个内置 Schema Family：
`t3x/prompt v1`。

Prompt Schema 用来版本化“一次模型调用如何组装、编译和验收”，包括：

- 输入变量及其类型契约；
- 有序消息模板；
- 上下文和静态资源的加载策略；
- 可移植的运行能力要求；
- 输出格式和解析策略；
- 确定性检查和非确定性评测；
- Schema、Workspace、Commit 和 Run 之间的版本与来源信息。

完整目标链路：

```text
选择 Prompt Schema
  -> 绑定 Workspace
  -> 从 Sources 生成 Prompt candidate
  -> YSchema 基础验证
  -> Prompt 领域规则验证
  -> 确定性编译预览
  -> Review
  -> Commit
  -> 后续接入 Run / Evals
```

## 2. 产品边界

三类 Schema 的职责保持清晰：

| Schema | 职责 |
| --- | --- |
| PRD | 描述最终要形成的产品需求状态 |
| Prompt | 描述一次模型调用如何组装、执行和校验 |
| Skill | 描述多个能力模式如何路由、组合资源和完成交付 |

Prompt v1 不包含：

- 自动触发边界；自动触发属于 Skill `activation`；
- 多步骤工作流；编排属于 Skill `workflows`；
- 平台安装信息、slash command 和 Host metadata；这些属于 release adapter；
- A/B variant 容器；不同变体使用不同 Commit 或分支；
- 多模态消息和完整 tool-call transcript；首版只支持文本消息；
- 真实模型调用；P0 先交付确定性的验证和编译预览。

## 3. 核心设计决策

### 3.1 命名

仓库已经存在 `PromptContract`，它表示“由任意 YSchema 生成、提供给模型的约束摘要”，
不是 Prompt 资产本身。

新增 Prompt 领域类型使用以下命名，避免冲突：

- `PromptArtifact`
- `PromptDefinition`
- `PromptCompileInput`
- `CompiledPrompt`
- `PromptCompileIssue`
- `PromptRenderModel`

### 3.2 Portable Core 与 Adapter 分离

Prompt Commit 保存可移植核心：

- messages；
- variables；
- contexts；
- resources；
- output contract；
- portable runtime requirements；
- checks 和 evals。

Provider、model ID、reasoning effort、采样参数和角色转换策略进入 adapter 或 Run
provenance。每次实际 Run 保存最终解析后的完整配置，以支持复现。

### 3.3 Checks 与 Evals 分离

- `checks` 是确定性的，可以阻止编译、导出或提交；
- `evals` 是模型行为或质量信号，不进入 YOps mutation gate；
- 相同 Prompt candidate 和相同编译输入必须得到相同 `CompiledPrompt`。

### 3.4 Schema Registry 与 Prompt Editor 分离

Schemas 页面只负责：

- Schema Family 发现；
- 版本浏览；
- Structure、Relations、Rules、Canonical YAML 和 Changes；
- Workspace Schema binding。

真实 Prompt 内容、变量解析和编译预览放在 Workspace State 页面。

## 4. Prompt Schema v1 结构

推荐顶层结构：

```yaml
manifest: {}
contract: {}
variables: {}
messages: {}
contexts: {}
runtime: {}
output: {}
resources: {}
dependencies: {}
checks: {}
evals: {}
```

节点职责：

| 节点 | 职责 |
| --- | --- |
| `manifest` | 稳定名称和能力摘要 |
| `contract` | 目标、输入、输出、非目标和事实策略 |
| `variables/*` | 模板变量、类型、来源和缺失策略 |
| `messages/*` | 有序的 system/developer/user/assistant 文本消息 |
| `contexts/*` | 检索内容、历史消息和外部材料的加载策略 |
| `runtime` | 可移植的执行能力要求 |
| `output` | 响应格式、Schema 和解析失败策略 |
| `resources/*` | few-shot、模板、数据、输出 Schema 和测试 fixture |
| `dependencies/*` | tool、MCP、runtime、plugin 和 package 依赖 |
| `checks/*` | 编译、fixture render 和 output parse 等确定性检查 |
| `evals/*` | behavior、quality、safety 和 regression 评测 |

推荐关系：

```yaml
relation_types:
  precedes:
    from: messages/*
    to: messages/*
    acyclic: true

  uses_variable:
    from: messages/*
    to: variables/*

  uses_resource:
    from: messages/*
    to: resources/*

  provides_context:
    from: contexts/*
    to: messages/*

  requires:
    from: messages/*
    to: dependencies/*

  verifies_message:
    from: checks/*
    to: messages/*

  verifies_output:
    from: checks/*
    to: output

  evaluates:
    from: evals/*
    to: messages/*
```

`uses_variable` 应由模板占位符确定性解析并校验，不能只依赖模型生成关系。

## 5. 确定性规则

现有 YSchema 已经执行以下基础约束：

- `type`、`enum` 和 `const`；
- `minimum` 和 `maximum`；
- `minLength`、`maxLength` 和 `maxWords`；
- `pattern`；
- required node/slot；
- provenance；
- relation endpoint、重复关系和环检测。

当前 `rules` 仍是保留结构，不能把 Prompt 的关键正确性只写成英文描述。

Prompt v1 增加可执行的 namespaced rules：

```yaml
rules:
  - id: prompt.placeholders_declared
  - id: prompt.required_variables_used
  - id: prompt.message_sequence_unique
  - id: prompt.resources_resolvable
  - id: prompt.output_schema_resolvable
  - id: prompt.blocking_check_required
```

建议错误码：

- `UNDECLARED_VARIABLE`
- `UNRESOLVED_PLACEHOLDER`
- `UNUSED_REQUIRED_VARIABLE`
- `DUPLICATE_MESSAGE_SEQUENCE`
- `MISSING_RESOURCE`
- `INVALID_OUTPUT_SCHEMA`
- `ADAPTER_CAPABILITY_MISMATCH`

每个错误至少返回：

- `code`；
- 精确的 YSchema path；
- 面向用户的 message；
- 可选 details；
- 是否 blocking。

## 6. 实施顺序

采用纵向闭环，不先堆完页面再补运行时。

### 阶段 1：Schema 契约与 Fixtures

实现：

1. 新增 `packages/yschema/examples/t3x-prompt.yschema.yaml`。
2. 新增 `packages/yschema/src/p0/t3xPromptFixture.ts`。
3. 提供 ready、gap、hard error 和 relation fixtures。
4. 从 `packages/yschema/src/p0/index.ts` 和包入口导出 fixture。
5. 更新 export surface snapshot。
6. 增加 Prompt Schema 解析、规范化、PromptContract 生成和 validateTree 测试。

验收门槛：

- canonical YAML 可以被 `parseYSchema()` 解析；
- ready fixture 的 `valid` 和 `ready` 都为 `true`；
- 基础类型、enum、pattern 和 required 错误具有稳定快照；
- 包导出面测试通过。

建议提交：

```text
Add t3x/prompt v1 schema contract
```

### 阶段 2：Prompt 领域验证与编译器

建议新增：

```text
packages/core/src/prompt/
  types.ts
  validate.ts
  compile.ts
  placeholders.ts
  index.ts
  __tests__/
```

编译顺序：

```text
Prompt candidate
  -> YSchema 基础验证
  -> Prompt 领域规则
  -> 解析 variables
  -> 解析 contexts/resources
  -> 渲染 message templates
  -> 验证 output contract
  -> 生成 CompiledPrompt
```

P0 编译器不得调用 LLM、网络或不确定性工具。

验收门槛：

- 相同输入产生字节稳定或深度相等的结果；
- 未声明和未解析变量阻止编译；
- message sequence 重复阻止编译；
- 缺失资源和无效输出 Schema 阻止编译；
- 所有问题都能定位到 Workspace State 中的字段路径。

建议提交：

```text
Add deterministic prompt validation and compiler
```

### 阶段 3：后端注册与 Compile Preview API

实现：

1. 在 built-in registry 注册 `t3x/prompt v1`。
2. 扩展 legacy display-name fallback，识别 Prompt Schema。
3. 复用 exact canonical name + version 解析。
4. 复用现有 YSchema validation 路径。
5. 增加 Prompt compile-preview route 和 OpenAPI contract。
6. 返回 compiled messages、variable usage、resource usage 和 blocking issues。

建议响应摘要：

```ts
interface PromptCompilePreviewResponse {
  compiled: boolean;
  schemaName: 't3x/prompt';
  schemaVersion: 'v1';
  messages: CompiledPromptMessage[];
  variables: PromptVariableResolution[];
  resources: PromptResourceResolution[];
  output: CompiledPromptOutput;
  issues: PromptCompileIssue[];
}
```

只有完成这一阶段后，前端才能显示 `runtime available`。

验收门槛：

- `t3x/prompt v1` 可以精确解析；
- 不存在的版本返回明确的 `INVALID_REQUEST`；
- API 对相同 candidate 和 fixture 返回稳定结果；
- 路由测试覆盖成功、validation error 和 unavailable runtime。

建议提交：

```text
Register prompt schema runtime and preview API
```

### 阶段 4：Schema Registry 前端

更新 Family Tabs：

```text
PRD Schema v2 | Skill Schema v1 | Prompt Schema v1
```

实现：

1. 在 `apps/web/src/data/schemaReleases.ts` 添加 Prompt release 和 family。
2. 在 Schema 类型中增加 `SchemaRulePreview`。
3. 在 release detail 中增加 `Rules` view。
4. 新增 `SchemaRulesView.tsx`。
5. Structure 按顶层 node 折叠，避免 Prompt 和 Skill 形成超长平面表格。
6. Constraint 使用 `enum`、`pattern`、`blocking`、`executable` 等可识别标签。
7. 保持不同 family 的 selected release 状态独立。

Prompt 选中态显示：

| 字段 | 值 |
| --- | --- |
| Schema | Prompt Schema |
| Current version | v1 |
| Root | prompt |
| Usage | commits / workspaces |

验收门槛：

- Prompt Family 可被选择；
- Structure、Relations、Rules、Canonical YAML 和 Changes 均可访问；
- Rules 区分 executable 与 descriptive；
- Family Tabs 在窄屏可滚动；
- Tabs、折叠行和状态都支持键盘与屏幕阅读器语义。

建议提交：

```text
Add Prompt Schema registry views
```

### 阶段 5：Workspace Binding

复用现有绑定语义：

```text
Apply Prompt Schema
  -> 保存 schemaBindings[0]
  -> candidate 标记 stale
  -> 清空旧 YOps draft
  -> review 标记 needs_review
  -> 从原 Sources 重新生成
  -> 使用 t3x/prompt v1 验证
```

必须保持：

- 绑定不会重写已有 Commit；
- Project default 只影响新 Workspace；
- pinned/draft override 不被 project default 覆盖；
- active 且 runtime available 的 release 才能绑定；
- canonical name、version 和完整 hash 随 binding 保存。

验收门槛：

- 刷新后绑定仍存在；
- 绑定切换会使旧 candidate stale；
- regeneration 成功后使用 Prompt root；
- regeneration 失败时保留可恢复的错误状态；
- 历史 Commit 继续使用原 Schema 版本。

建议提交：

```text
Connect Prompt Schema workspace binding
```

### 阶段 6：Workspace StatePromptReader

State 路由规则：

```text
t3x/prd    -> StatePrdReader
t3x/skill  -> StateSkillReader
t3x/prompt -> StatePromptReader
other      -> generic structured state
```

Prompt Reader 首版页面：

```text
Overview | Messages | Variables | Context & Resources | Output | Checks & Evals | YAML
```

默认 Messages 页面展示：

- sequence；
- role；
- template；
- 使用的 variables/resources；
- validation 状态；
- source provenance 和最近 YOp。

Variables 页面展示：

- variable key；
- type；
- required；
- source；
- default；
- missing behavior。

Checks & Evals 必须分区展示：

- blocking checks；
- non-blocking quality evals。

验收门槛：

- messages 按 sequence 稳定排序；
- 变量和资源关系可以跳转；
- validation issue 显示在准确字段上；
- execute-only 和 output-only 资源不会伪装成模型上下文；
- generic State fallback 仍然可用。

建议提交：

```text
Add Prompt workspace state reader
```

### 阶段 7：Compiled Preview

在 Prompt Workspace 增加 `Compile preview`，打开右侧 Drawer。

Drawer 展示：

- fixture 或输入来源；
- adapter；
- 最终 compiled messages；
- 已解析和未解析变量；
- context budget；
- resource resolution；
- output format；
- blocking issues。

前端只显示后端编译结果，不复制 placeholder 或 output-schema 编译逻辑。

交互要求：

- issue 可跳转到 Message、Variable、Resource 或 Output；
- candidate 变化后 preview 自动失效；
- stale candidate 禁止执行，但可以查看上次结果并明确标记 stale；
- loading、empty、error 和 unavailable runtime 都有独立状态；
- 编译失败不能只用颜色表达。

验收门槛：

- Workspace 更新后 preview 可以重新获取；
- unresolved variable 与缺失资源具有行级定位；
- API 请求失败不会清空用户当前 State；
- 窄屏 Drawer 能正常重排和关闭。

建议提交：

```text
Add compiled prompt preview
```

### 阶段 8：真实 Run 与 Evals

这一阶段不属于 Prompt Schema P0 的阻塞项。

后续实现：

- 选择或解析运行 Adapter；
- 调用模型；
- 解析输出；
- 执行 blocking checks；
- 执行 behavior/quality/safety evals；
- 保存 Run provenance。

每次 Run 至少记录：

- Prompt Commit ID；
- Schema canonical name、version 和 hash；
- provider 和 model；
- 最终运行参数；
- compiled messages hash；
- 输入、上下文和输出引用；
- checks 和 evals 结果。

建议提交：

```text
Add prompt runs and evaluations
```

## 7. 前端状态模型

Schema Registry 至少覆盖：

- family loading；
- no family；
- release selected；
- current release；
- draft/historical release；
- view only；
- runtime available；
- binding pending/success/error。

Prompt Workspace 至少覆盖：

- no candidate；
- candidate generating；
- candidate stale；
- valid but not ready；
- hard validation error；
- compile pending；
- compile ready；
- compile failed；
- runtime unavailable。

状态文案必须明确区分：

- Schema 是否合法；
- candidate 是否 ready；
- Prompt 是否能编译；
- 当前 release 是否能运行；
- eval 是否通过。

## 8. 测试矩阵

### YSchema

- example 与 fixture 等价；
- ready candidate；
- required gaps；
- type/enum/pattern errors；
- relation endpoint 和 cycle；
- export surface。

### Core Compiler

- placeholder parsing；
- variable type/default/missing behavior；
- message ordering；
- resource resolution；
- output schema resolution；
- deterministic result；
- stable error paths。

### API

- registry exact version resolution；
- legacy display-name fallback；
- validation route；
- compile-preview success/error；
- workspace regeneration；
- unavailable runtime。

### WebUI

- Prompt Family tab；
- release selection isolation；
- Rules view；
- Structure grouping；
- binding actions；
- Prompt State routing；
- messages/variables/output rendering；
- compile preview loading/success/error/stale；
- keyboard and responsive behavior。

### 集成验证

```text
选择 Prompt Schema
  -> Apply to Workspace
  -> candidate stale
  -> regeneration
  -> validation
  -> StatePromptReader
  -> Compile preview
  -> Commit
  -> reload 后版本和内容不变
```

## 9. 完成定义

Prompt Schema UI P0 完成需要同时满足：

1. `t3x/prompt v1` 是可解析、可验证的 built-in Schema。
2. Prompt 关键规则由确定性代码执行，而不是只给 AI 阅读。
3. Schema Registry 可以浏览 Prompt 的 Structure、Relations、Rules 和 YAML。
4. 只有后端支持的 active release 显示 `runtime available`。
5. Prompt Schema 可以绑定 Project default 和当前 Workspace。
6. Workspace 绑定变化会使旧 candidate stale，并触发重新生成。
7. Prompt candidate 使用 `StatePromptReader` 展示。
8. Compile Preview 来自后端确定性编译器。
9. 未解析变量、缺失资源和无效输出 Schema 会阻止编译。
10. 历史 Commit 保留其原始 Schema 版本和 hash。
11. 相关 package test、WebUI test、`pnpm check` 和 build 通过。

真实模型 Run 和完整 Evals 可以在 P0 合并后继续实施，不阻塞 Prompt Schema 的浏览、
绑定、生成、验证和编译闭环。
