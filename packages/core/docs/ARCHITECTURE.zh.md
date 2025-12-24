# T3X 架构概览

**"Git for Meaning" — AI 对话的语义版本控制系统**

---

## 1. 产品愿景

> **T3X 是 "Git for Meaning"** — 让任何对话都可以像代码一样被版本化、追溯、验证和共享。
>
> LLM 是可插拔组件，而非核心。确定性层永远不依赖 LLM。

---

## 2. 三层架构

| 层级 | 包名 | 职责 | 需要 LLM? |
|------|------|------|-----------|
| **核心框架层** | `@t3x/core` | 确定性语义提取、Diff、Merge、哈希计算 | 否 |
| **存储层** | `@t3x/storage` | PostgreSQL 持久化 (PGLite/Postgres/Supabase) | 否 |
| **产品层** | `t3x-webui` | Next.js 15 WebUI + REST API + ReactFlow 画布 | 可选 |

### 包依赖关系

```
t3x-webui ──依赖──► @t3x/storage ──依赖──► @t3x/core
```

---

## 3. 仓库结构

```
t3x/
├── t3x-core/           # 确定性语义引擎 (TypeScript)
│   ├── src/
│   │   ├── common/     # 哈希、规范化工具
│   │   ├── diff/       # 两路/三路语义 Diff
│   │   ├── merge/      # 三路合并 + 冲突检测
│   │   ├── extractors/ # Ring 1/2/3 语义提取
│   │   ├── providers/  # NLP 和 Embedding 提供者接口
│   │   ├── llm/        # LLM 提供者接口
│   │   └── storage/    # 存储类型和纯工具函数
│   └── docs/           # 架构文档
│
├── t3x-storage/        # PostgreSQL 持久化层 (Drizzle ORM)
│   ├── src/
│   │   ├── adapters/   # PGLite, Postgres, Supabase 适配器
│   │   ├── queries/    # 所有实体的 CRUD 操作
│   │   └── schema.ts   # Drizzle 表定义
│   └── drizzle/        # 迁移文件
│
├── t3x-webui/          # Next.js 15 前端 (App Router + ReactFlow)
│   ├── src/
│   │   ├── app/        # Next.js App Router
│   │   │   ├── api/v1/ # REST API 路由
│   │   │   └── project/# 项目画布页面
│   │   ├── components/ # React 组件
│   │   ├── store/      # Zustand 状态管理
│   │   ├── hooks/      # 数据获取 hooks
│   │   └── lib/        # API 客户端、数据库单例
│   └── public/         # 静态资源
│
├── t3x-runner/         # Agent 评估引擎
├── agent-demo/         # 测试用演示 Agent
└── docker-compose.yml  # 容器编排
```

---

## 4. 核心框架设计 (`@t3x/core`)

### 4.1 核心职责

核心包提供确定性、可复现的语义操作：

- **哈希链**: SHA-256 哈希 + JCS 规范化用于 Turn 和 Commit
- **提取器环**: Ring 1 (关键词/实体)、Ring 2 (Facet)、Ring 3 (句段)
- **语义 Diff**: 基于 Embedding 相似度的两路和三路 Diff
- **三路合并**: 冲突检测 + 非冲突变更自动合并

### 4.2 提取器环 (Ring 1/2/3)

每个 Turn 经过三个提取环处理：

| 环 | 用途 | 输出 |
|----|------|------|
| **Ring 1** | 主题主轴 | 关键词、实体、时间锚点、极性标签 |
| **Ring 2** | 轻关系 | 意图种子、Facet、偏好 |
| **Ring 3** | 分句结构 | 句级片段用于 Diff/Merge |

```typescript
interface RingOutput {
  ring1: {
    keywords: Keyword[];      // 词形还原的关键词 + 极性
    entities: Entity[];       // 命名实体 (PERSON, ORG, GPE 等)
    timeAnchor: string | null;
    topic: string | null;
  };
  ring2: {
    facets: Facet[];          // 语义 Facet (目标、偏好、约束)
    intentSeed: string | null;
  };
  ring3: {
    segments: Segment[];      // 句级片段
  };
}
```

### 4.3 哈希计算

所有哈希使用 JCS (JSON 规范化方案) + SHA-256：

```typescript
// Turn 哈希包含所有语义内容 + schema 版本
function computeTurnHash(data: TurnPayload): string {
  return computeJCSHash({
    parent_turn_hash: data.parent_turn_hash,
    project_id: data.project_id,
    conversation_id: data.conversation_id,
    role: data.role,
    content: data.content,
    language: data.language,
    rings_json: data.rings_json,
    created_at: data.created_at,
    schema_version: 'turn_v1',  // 包含在哈希中
  });
}

// Commit 哈希包含完整 commit 数据 + schema 版本
function computeCommitHash(data: CommitPayload): string {
  return computeJCSHash({
    project_id: data.project_id,
    branch: data.branch,
    parents_json: data.parents_json,
    turn_window_json: data.turn_window_json,
    facet_snapshot_json: data.facet_snapshot_json,
    pipeline_config_json: data.pipeline_config_json,
    draft_id: data.draft_id,
    draft_text_hash: data.draft_text_hash,
    signature_json: data.signature_json,
    created_at: data.created_at,
    schema_version: 'commit_v1',  // 包含在哈希中
  });
}
```

### 4.4 Diff 引擎

Diff 引擎使用 Embedding 相似度比较 Ring 3 片段：

```typescript
interface DiffResult {
  baseId: string;
  targetId: string;
  segmentDiffs: SegmentDiff[];
  stats: DiffStats;
}

enum DiffType {
  UNCHANGED = 'unchanged',
  MODIFIED = 'modified',
  ADDED = 'added',
  DELETED = 'deleted',
}
```

### 4.5 Merge 引擎

三路合并 + 自动冲突检测：

```typescript
interface MergeResult {
  baseId: string;
  sourceId: string;
  targetId: string;
  autoMerged: AutoMergedFacet[];   // 非冲突变更
  conflicts: MergeConflict[];       // 需要解决的冲突
  mergedSegments: Segment[];        // 最终合并内容
  conflictCount: number;
}

enum ConflictType {
  BOTH_MODIFIED = 'both_modified',
  SOURCE_DELETED = 'source_deleted',
  TARGET_DELETED = 'target_deleted',
}
```

### 4.6 提供者接口

提供者可插拔，支持 NLP、Embedding 和 LLM 功能：

```typescript
// NLP 提供者 (用于 Ring 提取)
interface NLPProvider {
  analyze(text: string): Promise<NLPAnalysis>;
}

// Embedding 提供者 (用于 Diff/Merge 相似度)
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  similarity(a: number[], b: number[]): number;
}

// LLM 提供者 (可选，用于 SummaryAgent/MergeAgent)
interface LLMProvider {
  generate(prompt: string, options?: LLMGenerateOptions): Promise<string>;
}
```

---

## 5. 存储层设计 (`@t3x/storage`)

### 5.1 数据库后端

T3X 通过 Drizzle ORM 支持多种 PostgreSQL 后端：

| 后端 | 使用场景 | 配置 |
|------|----------|------|
| **PGLite** | 本地开发 | `createPGLiteStorage({ dataDir: '.t3x/database' })` |
| **PostgreSQL** | Docker/生产 | `createPostgresStorage({ connectionString })` |
| **Supabase** | 云部署 | `createSupabaseStorage({ connectionString })` |

### 5.2 数据库表

```sql
-- 核心表
projects          -- 顶层容器
conversations     -- 项目内的 Turn 容器
turns_v2          -- 带哈希链的单个 Turn
branches          -- Git 风格的分支
commits_v2        -- 语义快照 (DAG 结构)
drafts_v2         -- LLM 生成的草稿
merge_results     -- 缓存的合并计算结果
segment_embeddings -- Ring 3 片段的预计算向量
```

### 5.3 关键数据结构

**Turn 记录:**
```typescript
interface Turn {
  turnHash: string;           // 主键 (sha256:...)
  parentTurnHash: string | null;
  projectId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  language: string | null;
  ringsJson: string | null;   // JSON 编码的 RingOutput
  createdAt: Date;
}
```

**Commit 记录:**
```typescript
interface Commit {
  commitHash: string;         // 主键 (sha256:...)
  projectId: string;
  branch: string;
  message: string | null;
  parentsJson: string;        // 父 Commit 哈希的 JSON 数组
  turnWindowJson: string;     // { start_turn_hash, end_turn_hash }
  facetSnapshotJson: string;  // 语义提取结果
  sourceRefsJson: string | null; // 多源引用
  createdAt: Date;
}
```

### 5.4 哈希链

- **Turn 链**: `parent_turn_hash → turn_hash` (每个对话内的链表)
- **Commit 链**: `parent_hashes[] → commit_hash` (支持分支/合并的 DAG)

---

## 6. 产品层设计 (`t3x-webui`)

### 6.1 技术栈

- **框架**: Next.js 15 (App Router)
- **状态管理**: Zustand
- **画布**: ReactFlow
- **样式**: Tailwind CSS

### 6.2 REST API 路由

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/projects` | GET, POST | 列出/创建项目 |
| `/api/v1/conversations` | GET, POST | 列出/创建对话 |
| `/api/v1/turns` | GET, POST | 列出/创建 Turn |
| `/api/v1/commits` | GET, POST | 列出/创建 Commit |
| `/api/v1/branches` | GET, POST | 列出/创建分支 |
| `/api/v1/drafts` | GET, POST | 列出/创建草稿 |
| `/api/v1/diff/two-way` | POST | 两路 Diff |
| `/api/v1/diff/three-way` | POST | 三路 Diff |
| `/api/v1/merge` | POST | 执行合并 |
| `/api/v1/export/cfpack` | GET | 导出为 .cfpack |

### 6.3 API 响应格式

```typescript
// 成功响应
{ success: true, data: { ... } }

// 错误响应
{ success: false, error: { code: string, message: string } }
```

API 使用 snake_case 作为 JSON 字段名，内部代码使用 camelCase。

---

## 7. Agent 层 (可选)

### 7.1 SummaryAgent

从语义发现生成叙事摘要：

- **输入**: 对话 Diff、Facet 快照、证据索引
- **输出**: 带引用的叙事草稿
- **提供者**: OpenAI、Claude、本地 LLM 或基于模板

### 7.2 MergeAgent

为三路合并建议冲突解决方案：

- **输入**: Base/Source/Target Commit、冲突列表
- **输出**: 带置信度分数的解决建议
- **人机协作**: 用户批准/拒绝建议

---

## 8. 开发设置

### 前置要求

- Node.js 18+
- npm 9+

### 快速开始

```bash
# 克隆并安装
git clone https://github.com/t3x-dev/t3x
cd t3x
npm install

# 构建包
npm run build:core
npm run build:storage
npm run build:webui

# 运行测试
npm run test:core     # 169 测试
npm run test:storage  # 160 测试
npm run test:webui    # 165 测试

# 启动开发服务器
cd t3x-webui
npm run dev           # http://localhost:3000
```

### Docker

```bash
docker-compose up     # 启动所有服务
```

端口: WebUI (3000), Core API (8000), Runner API (8080), Demo Agent (9000)

---

## 9. 设计原则

1. **确定性优先**: 核心层 100% 可复现
2. **LLM 作为插件**: 核心永不依赖特定 LLM
3. **证据支撑**: 每个语义发现都可追溯到源 Turn
4. **Git 风格 UX**: 熟悉的版本控制心智模型
5. **渐进增强**: 离线可用，有模型时更强
6. **最小核心**: 小而精的内核，通过插件扩展

---

## 10. 关键指标

### 技术指标

- 确定性可复现性: **100%**
- 测试覆盖: **3 个包共 477 个测试**
- 哈希链完整性: **密码学验证**

### 架构指标

- 包数量: **3 个主包 + 2 个辅助包**
- API 端点: **27 个路由**
- 数据库表: **8 个表**

---

_文档版本: 3.0_
_最后更新: 2025-12-23_
