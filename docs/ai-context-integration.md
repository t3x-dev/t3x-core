# T3X AI 上下文能力与库选型

## 结论

T3X 已经具备较完整的 AI 基础，包括多模型调用、流式对话、结构化输出、上下文组装、来源追踪、Embedding 和 MCP。当前更需要统一上下文编排和模型调用边界，而不是引入一套新的大型 AI 框架。

推荐方向：

1. 建立统一的 `ContextPlan`，集中处理上下文选择、预算、来源和裁剪原因。
2. 逐步使用 Vercel AI SDK Core 统一模型调用、流式输出、结构化输出和工具调用。
3. 保留并升级 MCP，使外部 AI 能安全读取 T3X 状态并调用提议、验证和回放工具。
4. 数据规模增长后使用 pgvector 完成带结构化过滤的语义检索。
5. 只有出现长时间运行、暂停恢复和多 Agent 编排需求时，再考虑 LangGraph。

## 现有 AI 能力

### 多模型与结构化输出

项目已有 OpenAI、Claude 和 Gemini Provider，能够执行普通文本生成和结构化生成：

- `packages/core/src/providers/llm/openai.ts`
- `packages/core/src/providers/llm/claude.ts`
- `packages/core/src/providers/llm/gemini.ts`

### 流式对话

`packages/api/src/routes/chat.openapi.ts` 已提供普通对话和流式对话，并包含：

- Thinking 与 Web Search 能力控制
- SSE 流式传输
- 用量记录
- 推理执行记录
- 错误、中断和部分结果处理

### 上下文与来源

`packages/core/src/context/builder.ts` 已能组合：

- 当前知识基线
- 固定会话
- 历史结果和经验
- 来源材料

`packages/api/src/lib/context-manifest.ts` 会分别生成对话上下文和抽取上下文，并保留 evidence、guidance 和 provenance。

### Embedding 与 MCP

项目已有 OpenAI、Google AI 和 Ollama Embedding Provider，也已经使用 MCP SDK 暴露工具、资源和提示词。

## 推荐架构

```text
状态、来源和用户请求
        ↓
ContextPlan 确定性选择上下文
        ↓
模型生成 Proposal / Effect / YOps
        ↓
Replay 与 Validation
        ↓
人工或规则 Decision
        ↓
Commit
```

模型只能提出变化，不能成为确定性状态变更路径的一部分。最终结果仍应遵循：

```text
Propose -> Verify* -> Decide -> Commit?
```

## 推荐的库

### 1. Vercel AI SDK Core

项目 Web 端已经依赖 `ai`，目前主要使用其中的消息类型。可以逐步将它用于后端公共模型能力：

- 多 Provider 统一调用
- `streamText` 流式输出
- Schema 校验的结构化输出
- Tool Calling
- Usage 与 Telemetry
- MCP Client

接入方式应为现有 `LLMProvider` 和 inference runtime 后面的适配层。T3X 的上下文、权限、回执和协议模型继续作为真实边界。

参考：[AI SDK Core](https://ai-sdk.dev/docs/ai-sdk-core/overview)

### 2. Model Context Protocol

MCP 与 T3X 的对应关系如下：

| MCP | T3X |
| --- | --- |
| Resource | 已提交 State、Schema、Context Manifest、来源材料 |
| Tool | propose、extract、validate、replay、diff |
| Prompt | Compose、Review、Extraction 等协作模板 |

Commit 和 Merge 仍需经过 T3X Decision 与授权，不应成为普通模型工具的直接副作用。

参考：[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

### 3. pgvector

当 workspace 中积累大量来源、对话、Commit 和文档切片时，可以使用 pgvector 扩展现有 PostgreSQL：

```text
项目、分支、权限和来源过滤
          ↓
关键词或结构化过滤
          ↓
向量相似度排序
          ↓
ContextPlan 预算裁剪
          ↓
带来源的模型上下文
```

向量检索只负责排序，不能替代 revision、权限、provenance 和来源约束。

参考：[pgvector](https://github.com/pgvector/pgvector)

### 4. LangGraph

暂时不建议把 LangGraph 引入核心层。它的 graph state、checkpoint、tool lifecycle 和持久化模型与 T3X 已有的 Transition、Decision 和 Commit 存在较多重叠。

只有出现以下需求时才建议评估：

- 跨小时或跨天运行的任务
- 等待外部审批后恢复
- 多 Agent 分工与循环修订
- 复杂分支、重试和恢复

即使采用，也应放在应用编排层，由它调用 T3X，而不是替代 T3X 协议内核。

参考：[LangGraph](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)

## 建议新增 `ContextPlan`

```ts
interface ContextPlan {
  baseline: ContextItem[];
  evidence: ContextItem[];
  guidance: ContextItem[];
  conversation: ContextItem[];

  budget: {
    maximumTokens: number;
    reservedOutputTokens: number;
    estimatedInputTokens: number;
  };

  omitted: Array<{
    id: string;
    reason: string;
  }>;

  provenance: ContextProvenance[];
  digest: string;
}
```

`ContextPlan` 应负责：

1. 根据 workspace、branch、revision、pins 和用户请求选择上下文。
2. 记录加入和排除的内容及其原因。
3. 生成稳定 digest，并写入 inference receipt。
4. 分别输出 chat context 和 extraction context。
5. 管理输入预算，并记录模型返回的实际 token usage。

## 当前需要改进的问题

- Context Builder 与 Context Manifest 存在部分重复选择逻辑。
- 来源材料目前存在固定字符数裁剪。
- `字符数 / 4` 的 token 估算不适合中文和不同模型。
- AI SDK 已安装，但尚未真正统一后端 Provider 和流式生成。
- 相似度检索在数据量扩大后不适合继续全部放在应用内存中。
- MCP 应安排独立升级，但不需要重写现有业务能力。

## 实施顺序

1. 将上下文选择策略收敛为 `ContextPlan`。
2. 选择一条 Compose 流式链路接入 AI SDK，并保持现有语义不变。
3. 统一 structured output、streaming、tool calling、usage 和 telemetry。
4. 升级 MCP，并明确 Resource、Tool 和 Prompt 的权限边界。
5. 数据规模达到需要时引入 pgvector。
6. 出现明确的持久化 Agent 工作流需求后，再评估 LangGraph。

## 不建议的方向

当前不建议全局引入 LangChain 或 LlamaIndex。它们会带来另一套消息、上下文、工具、状态和持久化抽象，容易削弱 T3X 已有的可验证上下文、确定性执行和审计能力。
