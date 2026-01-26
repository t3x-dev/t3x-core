# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

T3X is "Git for Meaning" — a semantic version control system for AI conversations. It provides evidence-backed, deterministic semantic extraction with versioning, branching, and merging capabilities similar to Git.

**Key philosophy**: The core deterministic layer never depends on LLMs. LLMs are optional plugins for enhancement (SummaryAgent, MergeAgent).

## Repository Structure

This is a pnpm monorepo managed by Turborepo:

```
t3x/
├── packages/
│   ├── core/           # @t3x/core - Deterministic semantic engine
│   ├── storage/        # @t3x/storage - PostgreSQL persistence (Drizzle ORM)
│   └── api-client/     # @t3x/api-client - TypeScript API client
├── apps/
│   ├── web/            # t3x-webui - Next.js 16 frontend (App Router + XYFlow)
│   ├── api/            # @t3x/api - Hono API server with OpenAPI
│   ├── runner/         # @t3x/runner - Grey-box agent evaluation engine
│   ├── cli/            # @t3x/cli - Command line interface
│   └── agent-demo/     # Demo agent for testing
├── biome.json          # Linting and formatting config
├── turbo.json          # Turborepo task config
└── docker-compose.yml
```

## Build Commands

### Monorepo (from root)
```bash
pnpm install                    # Install all dependencies
pnpm build                      # Build all packages
pnpm test                       # Run all tests
pnpm lint                       # Biome lint
pnpm lint:fix                   # Biome lint + auto-fix
pnpm check                      # Biome check (lint + format)
pnpm check:fix                  # Biome check + auto-fix
```

### Package-specific builds
```bash
pnpm build:core                 # Build @t3x/core
pnpm build:storage              # Build @t3x/storage
pnpm build:webui                # Build t3x-webui
pnpm build:api                  # Build @t3x/api
pnpm build:runner               # Build @t3x/runner

pnpm test:core                  # Test @t3x/core
pnpm test:storage               # Test @t3x/storage
pnpm test:webui                 # Test t3x-webui
```

### Development servers
```bash
pnpm dev:webui                  # Next.js dev server (port 3000)
pnpm dev:api                    # Hono API server (port 8000)
pnpm dev:agent                  # Demo agent (port 9000)
```

### Run single test
```bash
# From package directory
vitest run src/__tests__/some.test.ts           # Specific file
vitest run -t "creates a new project"           # By test name
```

### Docker
```bash
docker compose up -d --build               # Default: postgres + api + webui
docker compose --profile runner up -d      # Include runner
docker compose --profile n8n up -d         # Include n8n workflow engine
docker compose down
```

Ports: WebUI (3000), API (8000), PostgreSQL (5432), Runner (8080), Agent Demo (9000), n8n (5678)

## Architecture

### Package Dependencies

```
apps/web (t3x-webui)
  └─► packages/storage (@t3x/storage)
        └─► packages/core (@t3x/core)

apps/api (@t3x/api)
  ├─► packages/storage
  ├─► packages/core
  └─► apps/runner (@t3x/runner)

apps/cli (@t3x/cli)
  ├─► packages/core
  └─► packages/api-client (@t3x/api-client)
```

### Three-Layer Design

| Layer | Package | LLM Required? |
|-------|---------|---------------|
| **Framework Core** | `@t3x/core` | No (deterministic) |
| **Storage Layer** | `@t3x/storage` | No |
| **Agentic Layer** | SummaryAgent/MergeAgent plugins | Optional |
| **Product Layer** | `t3x-webui`, `@t3x/api`, `@t3x/runner` | No |

### Storage Architecture

T3X uses PostgreSQL (via Drizzle ORM):
- **PGLite** for local development (PostgreSQL WASM, data in `.t3x/database/`)
- **Postgres** for Docker/production
- **Supabase** adapter available

Key tables: `projects`, `conversations`, `turns_v2`, `branches`, `commits_v2`, `drafts_v2`, `commits_v3`, `segment_embeddings`, `merge_drafts`, `deploy_agents`, `runs`

### Hash Chains

- **Turn chain**: `parent_turn_hash → turn_hash` (SHA-256 of JCS-canonicalized JSON)
- **Commit chain**: DAG with `parent_hashes[]`, supports branching and merging

### Extractor Rings (t3x-core)

Semantic extraction happens in three rings:
- **Ring 1**: Keywords, entities, temporal anchors, preference tags
- **Ring 2**: Intent seeds, relations, facets
- **Ring 3**: Sentence-level segments

### Diff Engine (t3x-core)

Semantic diff engine for comparing commits:
- **Two-way diff**: Compare Draft vs parent Commit (self-check scenario)
- **Three-way diff**: Merge preview with conflict detection (merge scenario)

Algorithm: Encodes sentences as vectors, calculates cosine similarity, classifies as SAME/MODIFIED/ADDED/REMOVED/CONFLICT based on threshold (default 0.70).

### Merge System (t3x-core)

Two-phase merge process:
1. **prepareMerge**: Analyzes source/target commits, returns `Merge2WayResult` with:
   - `identical`: Auto-kept sentences (no user action)
   - `similarPairs`: User must choose source or target
   - `onlyInSource`/`onlyInTarget`: User can keep or discard
2. **executeMerge**: Applies user decisions, generates merged commit

### Runner (apps/runner)

Grey-box agent evaluation engine:
- **Observer**: Captures agent I/O traces (LLM calls, tool invocations)
- **EvalEngine**: Runs test steps against traces using rule-based assertions
- **n8n Integration**: Workflow execution and trace collection

```typescript
// Usage pattern
import { observer, evalEngine } from '@t3x/runner';

observer.registerAgent({ id: 'my-agent', endpoint: 'http://...', type: 'http' });
const runId = observer.startRun('my-agent', { input: { query: 'hello' } });
observer.recordLLMCall(runId, prompt, response, 'gpt-4', 500);
const trace = observer.completeRun(runId, output, 'completed');
const result = await evalEngine.evaluate({ trace, test_steps: [...] });
```

## WebUI Architecture (apps/web)

```
src/
├── app/                    # Next.js App Router
│   ├── api/v1/            # REST API routes (snake_case JSON)
│   └── project/[projectId]/ # Project canvas page
├── components/            # React components
├── store/                 # Zustand state management
│   └── canvasStore.ts     # Canvas nodes/edges state
├── hooks/                 # React hooks
├── lib/
│   ├── api.ts             # API client functions
│   └── db.ts              # Database singleton
└── __tests__/             # API route tests
```

### API Response Format
```json
{ "success": true, "data": {...} }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

API uses snake_case for JSON fields, internal code uses camelCase.

### Canvas State (Zustand)
- **Nodes**: Conversations, commits (pending/committed), leaf nodes
- **Edges**: Data flow connections
- **Locking**: Committed commits and upstream nodes are immutable

## Testing

All packages use **vitest** with PGLite for isolated test databases:

```typescript
// Test setup pattern
import { setupTestDB, testData } from '../setup';

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));
```

## Key Data Formats

### Turn Record
```json
{
  "turn_hash": "sha256:...",
  "parent_turn_hash": "sha256:...",
  "project_id": "proj_...",
  "conversation_id": "conv_...",
  "role": "user|assistant|system|tool",
  "content": "...",
  "created_at": "ISO8601"
}
```

### CommitV3 Record (Current)
```json
{
  "hash": "sha256:...",
  "schema": "commit/v3",
  "parents": ["sha256:..."],
  "author": { "name": "user", "identity": "...", "verification": "none|device|verified" },
  "committed_at": "ISO8601",
  "content": {
    "sentences": [
      { "id": "s1", "text": "...", "source": { "turn_hash": "...", "start_char": 0, "end_char": 50 } }
    ],
    "constraints": [
      { "type": "require", "id": "c1", "value": "...", "match": "exact|semantic", "source_sentence_id": "s1" },
      { "type": "exclude", "id": "c2", "value": "...", "match": "exact|semantic", "reason": "..." }
    ]
  },
  "project_id": "proj_...",
  "message": "...",
  "branch": "main"
}
```

**Field Classification:**
- **First-class (in hash)**: `hash`, `schema`, `parents`, `author`, `committed_at`, `content`
- **Second-class (not in hash)**: `project_id`, `message`, `branch`, `positionX`, `positionY`

### Legacy Commit Record (V2)
```json
{
  "commit_hash": "sha256:...",
  "parent_hashes": ["sha256:..."],
  "branch": "main",
  "turn_window": { "start_turn_hash": "...", "end_turn_hash": "..." },
  "facet_snapshot": [...],
  "source_refs": [{ "type": "conversation", "conversation_id": "..." }]
}
```

## Important Design Constraints

1. **Determinism**: Core algorithms must be 100% reproducible — same inputs always produce same outputs
2. **Append-only**: Hash chains are immutable; any modification breaks integrity
3. **Plugin architecture**: Extractors and embedders are pluggable
4. **Evidence-backed**: Every semantic finding traces to source turns with confidence scores

## Environment Variables

Copy `.env.example` to `.env`:

- `NEXT_PUBLIC_API_URL`: T3X API server URL (default: http://localhost:8000)
- `DATABASE_URL`: PostgreSQL connection string (production/Docker)
- `ANTHROPIC_API_KEY`: For Claude API access (optional, for LLM features)
- `GOOGLE_AI_STUDIO_KEY`: For Google AI features (optional)
- `N8N_BASE_URL`: n8n workflow engine URL (default: http://localhost:5678)
- `RUNNER_BASE_URL`: Runner service URL (default: http://localhost:8080)

## ID Conventions

T3X uses prefixed IDs for type safety:
- `proj_` - Project IDs
- `conv_` - Conversation IDs
- `s_` or `s1`, `s2` - Sentence IDs (within commits)
- `c_` or `c1`, `c2` - Constraint IDs (within commits)
- `mc1`, `mc2` - Merged constraint IDs (generated during merge)

## API Naming Conventions

- **API/Database/TypeScript types**: `snake_case` (e.g., `turn_hash`, `project_id`, `committed_at`)
- **JavaScript variables**: `camelCase` (e.g., `turnHash`, `projectId`, `committedAt`)
- **API responses**: Return `null` for absent optional fields
- **TypeScript interfaces**: Use `?` for optional fields (maps to `undefined`)

## V4 Architecture Parallel Development Rules

> Status: Active (Phase 1 in progress)
> Related docs: docs/specification/semantic-layer-architecture.md, docs/specification/memory-pin-system-design.md

### Contract Files (Single Source of Truth)

| File | Purpose | Can Modify Alone? |
|------|---------|-------------------|
| packages/core/src/types/v4/index.ts | TypeScript types | ❌ No |
| packages/storage/src/schema-v4.ts | Database schema | ❌ No |
| apps/api/src/schemas/v4-contracts.ts | API contracts | ❌ No |

Rule: Contract = Law, Implementation = Freedom

- ✅ Implement according to contracts freely
- ❌ Do NOT modify contract files without team agreement
- If contract needs change → discuss first → modify together → both review PR

### Import Rules

```typescript
// ✅ Correct: Import from @t3x/core
import { CommitV4, Leaf, Pin, Constraint } from '@t3x/core';

// ❌ Wrong: Redefine types locally
interface Leaf { ... }  // DON'T DO THIS
```

### Naming Conventions

| Layer | Convention | Example |
|-------|------------|---------|
| TypeScript types | snake_case | commit_hash, selected_pin_ids |
| DB columns | snake_case | commit_hash, selected_pin_ids |
| API JSON | snake_case | { "commit_hash": "..." } |
| JS variables | camelCase | const commitHash = ... |

### ID Prefixes

| Entity | Prefix | Example |
|--------|--------|---------|
| Sentence | s_ | s_abc123 |
| Constraint | cst_ | cst_def456 |
| Assertion | ast_ | ast_ghi789 |
| Leaf | leaf_ | leaf_jkl012 |
| Pin | pin_ | pin_mno345 |

### V4 Architecture Summary

```
CommitV4 = Sentences only (pure knowledge, NO constraints)
Leaf = Constraints + Output + Validation (application layer)
Pin = Source selection (for commit sources + conversation context)
```

### Track Assignment

- Track A (Storage/Core): commits-v4.ts, leaves.ts, pins.ts queries, context builder
- Track B (API/UI): /v1/leaves, /v1/pins routes, WebUI stores, components

## 文档索引

新对话开始时，根据任务类型阅读相关文档：

| 任务类型 | 应阅读的文档 |
|---------|-------------|
| V4 架构开发 | `docs/specification/semantic-layer-architecture.md`, `docs/specification/memory-pin-system-design.md` |
| API 开发 | `apps/api/README.md`, `apps/api/src/schemas/v4-contracts.ts` |
| WebUI 开发 | `apps/web/README.md`, `apps/web/src/store/` |
| Core 算法 | `packages/core/README.md`, `packages/core/src/types/` |
| Storage 层 | `packages/storage/README.md`, `packages/storage/src/schema-v4.ts` |
| Runner/Eval | `apps/runner/README.md` |

## 开发工作流

用户可能不熟悉代码细节。Claude 应主动探索，用户只做决策：

1. **收到需求后**：先搜索相似代码/组件，找到现有模式
2. **修改前**：分析影响面，列出会改动的文件/接口
3. **有多种方案时**：列出选项，问用户选哪个
4. **不确定时**：问具体的决策问题，而不是让用户解释代码

用户只需要：描述目标 → 回答决策问题 → 验收结果

### 代码复用原则

**优先级：复用 > 修改 > 新建**

1. **优先复用**：先搜索项目中是否已有类似功能/组件/工具函数，能复用就直接用
2. **其次修改**：如果现有代码不完全匹配，考虑在原有版本上扩展或修改
3. **最后新建**：只有当复用和修改都不可行时，才考虑新创造

在动手写代码前，必须先回答：项目里有没有类似的东西？

## 已知陷阱

| 问题 | 原因 | 正确做法 |
|------|------|----------|
| DELETE 路由 404 | `index.ts` import 了 `projects.ts` 而非 `projects.openapi.ts` | 检查 import 路径是否指向正确文件 |
| API 调用失败 | 假设 API 在 Next.js 中（旧架构） | API 在 `apps/api`（端口 8000），WebUI 在 `apps/web`（端口 3000） |
| 测试找不到模块 | 没有先 build 依赖包 | 先跑 `pnpm build:core && pnpm build:storage` |
| Tailwind 样式不生效 | `globals.css` 中全局样式（如 `button { background: none }`）不在 `@layer` 中，优先级高于 Tailwind 工具类 | 全局 reset 样式必须放在 `@layer base` 中，或删除冲突属性 |
| PGLite 重启后数据丢失 | 直接关闭终端或 `kill -9` 导致数据库非正常关闭，文件损坏 | 用 `pnpm stop:api` 优雅停止，或 `kill -TERM $(lsof -ti:8000)` |

## 禁止事项

- **不要猜测代码位置**：先用 Grep/Glob 搜索
- **不要假设架构**：2025-12 迁移后 API 和 WebUI 分离
- **不要急于修改**：先读代码、理解上下文、确认影响面
- **不要跳过验证**：改完必须跑相关测试

## Commit Message 规范

项目使用 Conventional Commits 格式：

```
<type>(<scope>): <description> [Track].(#issue)

# 示例
feat(api): add V4 leaves endpoint [B1].(#123)
fix(web): resolve canvas node drag issue [B2].(#124)
test(storage): add commits-v4 query tests [A1].(#125)
docs: update CLAUDE.md with workflow rules
```

| type | 用途 |
|------|------|
| feat | 新功能 |
| fix | Bug 修复 |
| test | 测试相关 |
| docs | 文档更新 |
| refactor | 重构（不改变行为） |
| chore | 构建/工具链变更 |

Track 标记：`[A1]`, `[A2]` = Track A (Storage/Core)，`[B1]`, `[B2]` = Track B (API/UI)

## 快速调试命令

```bash
# 检查端口占用
lsof -i :8000                    # API 端口
lsof -i :3000                    # WebUI 端口

# 查看 API 日志（实时）
pnpm dev:api 2>&1 | tee api.log

# 数据库状态（PGLite 文件）
ls -la .t3x/database/

# 清理重建
pnpm clean && pnpm install && pnpm build

# 单独测试一个文件
cd apps/api && pnpm vitest run src/__tests__/leaves.test.ts

# 测试特定用例
cd apps/api && pnpm vitest run -t "should create leaf"
```

## 依赖构建顺序

修改底层包后，需要重新构建依赖链：

```
@t3x/core 改动后：
  pnpm build:core && pnpm build:storage && pnpm build:api

@t3x/storage 改动后：
  pnpm build:storage && pnpm build:api

apps/api 改动后：
  pnpm build:api（或直接 pnpm dev:api 热重载）
```

**测试依赖 build**：跑测试前确保相关包已构建

## PR 提交检查清单

提交 PR 前确认：

- [ ] `pnpm check` 通过（lint + format）
- [ ] 相关测试通过（`pnpm test:xxx`）
- [ ] 新增代码有对应测试
- [ ] 没有引入 `console.log`（调试用的删掉）
- [ ] 类型正确（没有 `any` 逃逸）
- [ ] API 变更更新了 OpenAPI schema
- [ ] 破坏性变更在 PR 描述中说明

## 常用搜索模式

```bash
# 找某个 API 路由的实现
Grep: "router.post.*leaves"  glob: "apps/api/**/*.ts"

# 找某个类型的定义
Grep: "interface.*Leaf"  glob: "packages/core/**/*.ts"

# 找某个函数的所有调用
Grep: "createLeaf\\("  （不限 glob）

# 找数据库 schema
Grep: "export const.*Table"  glob: "packages/storage/**/*.ts"

# 找 Zustand store
Grep: "create\\(.*\\).*=>"  glob: "apps/web/src/store/**/*.ts"
```
