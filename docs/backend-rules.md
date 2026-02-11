# T3X 后端开发规范

> 状态：生效中
> 最后更新：2026-02-10
> 范围：packages/core、packages/storage、apps/api、apps/runner
> 目的：后端开发对齐——架构约束、API 设计规范、存储规范、测试模式。
> 真实来源：代码库分析。前端规范见 `docs/frontend-rules.md`。

---

## 目录

1. [产品基因（后端视角）](#1-产品基因后端视角)
2. [架构规则（强制）](#2-架构规则强制)
3. [API 设计规范](#3-api-设计规范)
4. [存储层规范](#4-存储层规范)
5. [Core 层规范](#5-core-层规范)
6. [Runner 规范](#6-runner-规范)
7. [错误处理](#7-错误处理)
8. [测试规范](#8-测试规范)
9. [中间件架构](#9-中间件架构)
10. [已知缺口（后端专属）](#10-已知缺口后端专属)

---

## 1. 产品基因（后端视角）

前端规范从 UI 视角映射了 8 个参考产品。后端需要从**数据、接口、基础设施**视角理解同样的映射。

### 1.1 参考产品对后端的要求

| 参考产品 | 后端模块 | 核心要求 | 当前状态 |
|---------|---------|---------|---------|
| **GitHub** | Merge API + Checks | 质量门 API：约束验证、证据链完整性检查 | ⚠️ Merge API 完整，Checks 端点缺失 |
| **GitHub** | Webhook 系统 | 事件触发：commit.created、merge.completed、eval.finished | ❌ 未实现 |
| **Figma** | 无直接后端需求 | Canvas 是纯前端 | — |
| **Notion** | 模板 CRUD + 搜索 | 模板存储、分类筛选、全文搜索 | ❌ 未实现（Core 模板引擎已有） |
| **Notion** | 分享 Token | Token 生成/验证/撤销 + 实体解析 | ❌ 未实现 |
| **dbt** | 溯源查询 | Sentence → Turn 字符级定位、血缘图查询 | ✅ 已完整 |
| **Dagster** | Report 资产化 | Run 元数据扩展、对比快照持久化 | ⚠️ runs 表已有，缺 title/tags |
| **n8n** | Webhook 注册 + 工作流触发 | 通用 webhook 注册机制 | ⚠️ 仅 Runner-n8n 集成 |
| **Vercel** | 预览/分享基础设施 | 只读 Token + 实体序列化 | ❌ 与 Notion 分享相同 |
| **LangChain** | Pin/Context API | 上下文组装 + Token 估算 | ✅ 已完整 |
| **全部** | 认证系统 | 用户身份、API Key、访问控制 | ❌ 零代码 |
| **全部** | 限流 | 请求频率控制 | ❌ 零代码 |

### 1.2 开发时的思维模型

```
写 Merge/Branch/Commit 代码  → 想 GitHub（DAG 完整性、哈希不可变、质量门）
写 Runs/Trace/Eval 代码      → 想 Dagster（每次运行 = 一等资产、输入可追溯、结果可对比）
写 Leaf/Template 代码        → 想 dbt + Notion（约束 = 数据测试、模板 = 可复用资产）
写 Pin/Context 代码          → 想 LangChain（记忆选择、上下文组装、Token 预算）
写 Share/Webhook 代码        → 想 Vercel + n8n（Token 即访问、事件即触发）
写中间件/基础设施             → 想 GitHub API（认证、限流、审计日志）
```

---

## 2. 架构规则（强制）

### 规则 1：三层确定性

```
@t3x/core（确定性层）    → 纯函数，无 I/O，无副作用，100% 可重现
@t3x/storage（持久化层）  → 数据库操作，事务边界在这里
apps/api（接口层）        → HTTP 入口，验证在这里，业务逻辑不在这里
apps/runner（执行层）     → 灰盒评估，与外部服务（n8n、LLM）交互
```

**规则**：
- Core 层禁止导入 Storage/API/Runner
- Storage 层只能导入 Core
- API 层导入 Storage + Core，但**不包含业务逻辑**（逻辑放在 Core 或 Storage queries）
- LLM 调用永远是可选的，核心流程不依赖 LLM

### 规则 2：契约即法律

三个契约文件是全系统的单一真实来源：

| 文件 | 内容 | 修改流程 |
|------|------|---------|
| `packages/core/src/types/v4/index.ts` | TypeScript 类型 | 后端修改，前端 Review |
| `packages/storage/src/schema-v4.ts` | 数据库 Schema | 后端独占 |
| `apps/api/src/schemas/v4-contracts.ts` | API Zod 契约 | 后端修改，前端 Review |

**实现可以自由发挥，但契约不能单方面修改。**

### 规则 3：哈希链不可变

```
Turn 链: parent_turn_hash → turn_hash（SHA-256 of JCS 规范化 JSON）
Commit 链: parents[] → hash（DAG 结构）
```

- 已提交的数据不可修改（append-only）
- 任何修改哈希链的操作 = 系统级错误
- 所有写入操作必须验证哈希完整性

### 规则 4：API 和 WebUI 分离

```
apps/api（端口 8000）    → Hono REST API，独立进程
apps/web（端口 3000）    → Next.js 前端，通过 HTTP 调用 API
```

- 前端不直接访问数据库
- API 是唯一的数据入口/出口
- 本地开发用 PGLite（零配置），生产用 PostgreSQL

---

## 3. API 设计规范

### 3.1 技术选型

| 类别 | 必须使用 | 禁止使用 |
|------|---------|---------|
| 框架 | Hono + @hono/zod-openapi | Express、Fastify、Koa |
| 验证 | Zod（通过 @hono/zod-openapi） | Joi、Yup、手动验证 |
| ORM | Drizzle ORM | TypeORM、Prisma、Sequelize |
| 数据库 | PostgreSQL（PGLite 开发 / Postgres 生产） | SQLite、MongoDB |
| API 文档 | OpenAPI 3.1（自动生成） | Swagger 手写、Postman 文档 |
| 文档 UI | Scalar（@scalar/hono-api-reference） | Swagger UI |

### 3.2 路由定义模式

所有新路由**必须**使用 OpenAPI 模式（`createRoute` + `openapi`）：

```typescript
// ✅ 正确：OpenAPI 路由（自动生成文档 + 运行时验证）
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';

const getLeafRoute = createRoute({
  method: 'get',
  path: '/v1/leaves/{id}',
  tags: ['Leaves'],
  summary: 'Get leaf by ID',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(LeafResponse) } },
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

routes.openapi(getLeafRoute, async (c) => {
  // handler...
});

// ❌ 错误：普通 Hono 路由（无文档、无验证）
routes.get('/v1/leaves/:id', async (c) => { ... });
```

**例外**：`health.ts` 和 `status.ts` 可以用普通路由（不属于业务 API）。

### 3.3 响应格式

**成功**：

```json
{ "success": true, "data": { ... } }
```

**列表**：

```json
{ "success": true, "data": [ ... ] }
```

**错误**：

```json
{
  "success": false,
  "error": {
    "code": "LEAF_NOT_FOUND",
    "message": "Leaf not found: leaf_abc123"
  }
}
```

**规则**：
- 所有端点统一使用 `{ success, data/error }` 包装
- 使用 `SuccessResponseSchema(dataSchema)` 和 `ErrorResponseSchema`
- 缺失的可选字段返回 `null`，不返回 `undefined`

### 3.4 命名规范

| 位置 | 规范 | 示例 |
|------|------|------|
| URL 路径 | kebab-case | `/v1/deploy-agents`, `/v1/leaf-history` |
| URL 参数 | camelCase | `{projectId}`, `{runId}` |
| Query 参数 | snake_case | `?project_id=xxx&commit_hash=yyy` |
| JSON 字段（请求/响应） | **snake_case** | `commit_hash`, `created_at`, `project_id` |
| TypeScript 变量 | camelCase | `commitHash`, `createdAt`, `projectId` |
| Drizzle 列名 | camelCase（映射到 snake_case 列） | `commitHash` → `commit_hash` |
| 错误码 | SCREAMING_SNAKE_CASE | `LEAF_NOT_FOUND`, `RATE_LIMITED` |

### 3.5 分页

所有列表端点必须支持分页：

```typescript
// Query schema
const query = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
```

### 3.6 路由文件结构

每个路由文件遵循统一结构：

```
1. 文件头注释（端点列表）
2. import 声明
3. const routes = new OpenAPIHono({ defaultHook: zodErrorHook })
4. 响应转换函数（toApiXxx）
5. 路由定义（createRoute）
6. 路由处理器（routes.openapi）
7. export
```

### 3.7 Storage → API 转换

Storage 层返回的对象（`undefined` 表示缺失）和 API 响应（`null` 表示缺失）之间需要转换：

```typescript
// 每个路由文件必须有 toApiXxx 转换函数
function toApiLeaf(leaf: Leaf) {
  return {
    id: leaf.id,
    commit_hash: leaf.commit_hash,
    title: leaf.title ?? null,        // undefined → null
    output: leaf.output ?? null,       // undefined → null
    assertions: leaf.assertions ?? null,
    // ...
  };
}
```

---

## 4. 存储层规范

### 4.1 Schema 定义

```typescript
// 表定义用 pgTable
export const leaves = pgTable('leaves', {
  id: text('id').primaryKey(),                              // 前缀 ID
  commitHash: text('commit_hash').notNull(),                // camelCase → snake_case 列
  type: text('type').notNull(),
  title: text('title'),                                     // nullable（没有 .notNull()）
  constraints: jsonb('constraints').$type<Constraint[]>(),  // JSONB 类型安全
  config: jsonb('config').$type<LeafConfig>(),
  projectId: text('project_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

**规则**：
- 主键用 `text`，不用自增 `serial`（前缀 ID 系统）
- JSONB 字段用 `.$type<T>()` 标注 TypeScript 类型
- 时间字段用 `timestamp`，API 层序列化为 ISO8601 字符串
- 外键用 `.references()`（确保引用完整性）

### 4.2 ID 前缀

| 实体 | 前缀 | 生成函数 |
|------|------|---------|
| Project | `proj_` | `generateProjectId()` |
| Conversation | `conv_` | `generateConversationId()` |
| Sentence | `s_` | `generateSentenceId()` |
| Constraint | `cst_` | `generateConstraintId()` |
| Assertion | `ast_` | `generateAssertionId()` |
| Leaf | `leaf_` | `generateLeafId()` |
| LeafHistory | `lhist_` | `generateLeafHistoryId()` |
| Pin | `pin_` | `generatePinId()` |
| Commit | `sha256:` | 哈希计算（非随机） |
| Turn | `sha256:` | 哈希计算（非随机） |

**新实体必须添加 ID 前缀和生成函数到 `@t3x/core`。**

### 4.3 Query 函数模式

```typescript
// 标准 CRUD 函数签名
export async function createLeaf(db: AnyDB, input: CreateLeafInput): Promise<Leaf>;
export async function findLeafById(db: AnyDB, id: string): Promise<Leaf | null>;
export async function findLeavesByProject(db: AnyDB, projectId: string, opts?: ListOptions): Promise<Leaf[]>;
export async function updateLeaf(db: AnyDB, id: string, input: UpdateLeafInput): Promise<Leaf | null>;
export async function deleteLeaf(db: AnyDB, id: string): Promise<boolean>;
```

**规则**：
- 第一个参数始终是 `db: AnyDB`（支持 PGLite 和 PostgreSQL）
- 输入类型从 `@t3x/core` 导入
- 返回类型是 Core 类型（不是数据库 Row 类型）
- 内部用 `rowToXxx()` 函数做 camelCase → snake_case 转换
- 创建函数负责生成 ID（调用 Core 的 `generateXxxId()`）
- 查找单个 → 返回 `T | null`
- 查找列表 → 返回 `T[]`
- 更新 → 返回 `T | null`（null = 未找到）
- 删除 → 返回 `boolean`

### 4.4 数据库适配

```typescript
// AnyDB 类型支持两种数据库
import type { AnyDB } from '../adapters';

// PGLite（本地开发）：数据在 .t3x/database/
// PostgreSQL（生产/Docker）：通过 DATABASE_URL 连接
```

所有 query 函数必须兼容两种数据库——不使用 PGLite 或 PostgreSQL 特有功能。

---

## 5. Core 层规范

### 5.1 确定性要求

Core 层的所有函数必须满足：
- **相同输入 → 相同输出**（无随机性、无时间依赖）
- **纯函数**（无 I/O、无数据库、无网络）
- **无副作用**（不修改传入参数）

**例外**：ID 生成函数使用随机数（`crypto.randomUUID`），但这是设计决策，不影响哈希确定性。

### 5.2 模块结构

```
packages/core/src/
├── types/v4/index.ts        ← 契约类型（全系统共享）
├── commit/                  ← Commit 构建器（V3/V4）
├── diff/                    ← 词级 Diff 引擎
├── merge/                   ← 二路/三路合并
├── leaf/                    ← 模板引擎 + 约束验证 + 生成
│   ├── template.ts          ← 模板渲染
│   ├── templates/defaults.ts ← 8 个默认模板
│   ├── generate.ts          ← LLM 输出生成
│   └── validate-constraints.ts ← 约束验证（精确 + 语义）
├── context/                 ← 上下文组装器（BuiltContext）
├── extractors/              ← Ring 1/2/3 语义提取
├── common/                  ← JCS 规范化、SHA-256、工具函数
└── providers/               ← NLP/Embedding/LLM 提供者接口
```

### 5.3 Provider 插件模式

```typescript
// Provider 是接口，实现是可替换的
interface Embedder {
  embed(text: string): Promise<number[]>;
  similarity(a: number[], b: number[]): number;
}

// 使用时注入，不硬编码
async function validateConstraints(opts: {
  output: string;
  constraints: Constraint[];
  embedder: Embedder;   // ← 注入
}): Promise<ValidationResult>;
```

---

## 6. Runner 规范

### 6.1 架构

```
apps/runner（端口 8080）
  ├── Observer    → 捕获 Agent I/O Trace（LLM 调用、工具调用）
  ├── Evaluator   → 规则断言引擎（operators: contains, regex, json_path...）
  ├── Asserter    → LLM 断言生成（可选）
  └── n8n 集成    → Webhook 触发 + 回调 + Trace 映射
```

### 6.2 数据流

```
Engine (apps/api)
  → POST /runs（创建 run 记录）
    → Runner → n8n（触发工作流）
      → n8n 回调 Runner
        → Runner 获取完整 Trace
          → Runner 运行 Eval + LLM Assertions
            → Runner POST /api/v1/runs/ingest（回传结果）
```

### 6.3 Trace 存储策略

由 `TRACE_POLICY` 环境变量控制：

| 策略 | 说明 |
|------|------|
| `always` | 始终存储完整 Trace |
| `on_failure` | 仅在 run 失败时存储（默认） |
| `on_violation` | 仅在断言违规时存储 |

`trace_summary_json` 始终存储（轻量摘要）。

---

## 7. 错误处理

### 7.1 错误码体系

所有错误码定义在 `apps/api/src/lib/errors.ts`，使用 SCREAMING_SNAKE_CASE：

| 类别 | 错误码 | HTTP 状态码 |
|------|--------|-----------|
| 验证 | `INVALID_REQUEST`, `VALIDATION_FAILED` | 400 |
| 版本 | `COMMIT_VERSION_UNSUPPORTED` | 400 |
| 引用 | `PARENT_NOT_FOUND`, `REFERENCE_NOT_FOUND` | 400 |
| 未找到 | `PROJECT_NOT_FOUND`, `LEAF_NOT_FOUND`, `PIN_NOT_FOUND`... | 404 |
| 冲突 | `DUPLICATE_PIN`, `HASH_CONFLICT`, `MAIN_ROOT_EXISTS` | 409 |
| 限流 | `RATE_LIMITED` | 429 |
| 服务器 | `CREATE_FAILED`, `INTERNAL_ERROR`, `DATABASE_ERROR` | 500 |

### 7.2 错误响应模式

```typescript
// 使用 errorResponse 辅助函数（自动映射 HTTP 状态码）
import { errorResponse } from '../lib/errors';

// ✅ 正确
return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);

// ❌ 错误：手动构造错误响应
return c.json({ success: false, error: { code: 'NOT_FOUND', message: '...' } }, 404);
```

### 7.3 新增错误码流程

1. 在 `ErrorCodes` 对象中添加常量
2. 在 `ErrorStatusCodes` 中映射 HTTP 状态码
3. 导出 `ErrorCode` 类型自动包含

### 7.4 Zod 验证错误

由 `zodErrorHook` 自动处理——不需要在 handler 中手动验证：

```typescript
// OpenAPIHono 创建时注入
const routes = new OpenAPIHono({ defaultHook: zodErrorHook });

// 自动返回格式化的验证错误
// { "success": false, "error": { "code": "INVALID_REQUEST", "message": "sentences: Required" } }
```

---

## 8. 测试规范

### 8.1 测试文件位置

| 包 | 位置 | 框架 |
|---|------|------|
| apps/api | `src/__tests__/*.test.ts` | Vitest |
| packages/core | `src/__tests__/*.test.ts` | Vitest |
| packages/storage | `src/__tests__/*.test.ts` | Vitest |
| apps/runner | `src/__tests__/*.test.ts` | Vitest |

当前 API 测试覆盖：27 个测试文件。

### 8.2 API 路由测试模式

```typescript
import { Hono } from 'hono';
import { setupTestDB, testData } from './setup';

// 1. Mock 数据库模块
let mockDB: PGLiteDB;
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// 2. 导入路由（在 mock 之后）
import { leavesRoutes } from '../routes/leaves.openapi';

describe('Leaves Routes', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', leavesRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();   // PGLite 测试数据库
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('creates a leaf', async () => {
    const res = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ... }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toMatch(/^leaf_/);
  });
});
```

### 8.3 Storage 测试模式

```typescript
import { setupTestDB, testData } from '../setup';

describe('Leaves Queries', () => {
  let db: PGLiteDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(() => cleanup());

  it('creates and retrieves a leaf', async () => {
    const leaf = await createLeaf(db, {
      commit_hash: 'sha256:test',
      type: 'tweet',
      project_id: 'proj_test',
    });
    expect(leaf.id).toMatch(/^leaf_/);

    const found = await findLeafById(db, leaf.id);
    expect(found).not.toBeNull();
    expect(found!.type).toBe('tweet');
  });
});
```

### 8.4 Core 测试模式

```typescript
// Core 是纯函数，测试最简单
describe('prepareMerge', () => {
  it('detects identical sentences', () => {
    const result = prepareMerge(sourceCommit, targetCommit);
    expect(result.identical).toHaveLength(3);
  });
});
```

### 8.5 Runner 测试

```typescript
// Mock pino 消除日志噪音
vi.mock('pino', () => ({ default: () => ({ info: vi.fn(), error: vi.fn(), ... }) }));
```

### 8.6 测试命名

```
describe('[模块名]')
  describe('[函数名/端点]')
    it('[动词] [预期行为]')

// 示例
describe('Leaves Routes')
  describe('POST /v1/leaves')
    it('creates a leaf with valid input')
    it('returns 400 for missing commit_hash')
    it('returns 404 when referenced commit not found')
```

---

## 9. 中间件架构

### 9.1 当前中间件

| 中间件 | 文件 | 功能 |
|--------|------|------|
| CORS | `middleware/cors.ts` | localhost 允许、可配置 CORS_ORIGINS |
| Logger | `middleware/logger.ts` | 基础 Hono 日志 |

### 9.2 中间件执行顺序

```typescript
// index.ts 中的注册顺序
app.use('*', corsMiddleware);    // 1. CORS（最外层）
app.use('*', loggerMiddleware);  // 2. 日志
// 业务路由...
app.notFound(handler);           // 兜底 404
app.onError(handler);            // 兜底错误
```

### 9.3 待建中间件（见已知缺口）

新中间件必须：
- 放在 `apps/api/src/middleware/` 目录
- 导出为 Hono 中间件函数
- 在 `index.ts` 中按正确顺序注册
- 有独立的测试文件

---

## 10. 已知缺口（后端专属）

这些是后端需要独立建设的基础设施，不依赖前端，但影响产品上线。

### P0（产品上线前提）

| 缺口 | 参考产品 | 当前状态 | 说明 |
|------|---------|---------|------|
| **认证系统** | 全部 8 个 | ❌ 零代码 | 没有认证，任何人可以访问任何 API。分享链接也无法区分"有权限"和"无权限"。**v0 方案**：API Key 中间件（Header: `Authorization: Bearer xxx`），不做用户系统，不做 OAuth。每个项目一个 API Key |
| **分享 Token 后端** | Notion / Vercel | ❌ 零代码 | schema + queries + API 路由。已在 `collaboration-protocol.md` 定义了完整契约 |

### P1（体验与规模）

| 缺口 | 参考产品 | 当前状态 | 说明 |
|------|---------|---------|------|
| Merge Checks API | GitHub | ❌ 端点不存在 | `GET /v1/merge/drafts/:id/checks` 返回约束验证 + 证据链检查结果 |
| Report 元数据扩展 | Dagster | ⚠️ runs 表缺字段 | title, description, tags 字段 + `PATCH /v1/runs/:runId` |
| 模板 CRUD API | Notion | ❌ API 不存在 | templates 表 + CRUD + 搜索/筛选端点 |
| 对比快照持久化 | Dagster | ❌ 不存在 | saved_comparisons 表 + CRUD |

### P2（增长与生态）

| 缺口 | 参考产品 | 当前状态 | 说明 |
|------|---------|---------|------|
| API 限流 | 全部 | ❌ 零代码 | Hono 限流中间件，per-key 或 per-IP |
| Webhook 注册系统 | GitHub / n8n | ❌ 零代码 | 通用 webhook：注册 URL + 事件类型 → 触发 POST 回调 |
| 全文搜索 | Notion / GitHub | ❌ 零代码 | PostgreSQL `tsvector` 或 pg_trgm，覆盖 commits、leaves、conversations |
| 事件通知 | GitHub / Notion | ❌ 零代码 | SSE 或 WebSocket，推送 commit/merge/eval 事件到前端 |

### P3（可运维）

| 缺口 | 参考产品 | 当前状态 | 说明 |
|------|---------|---------|------|
| 监控/APM | Dagster / Vercel | ❌ 零代码 | Prometheus metrics + 错误追踪（Sentry） |
| 审计日志 | GitHub | ❌ 零代码 | 谁在什么时间做了什么操作 |
| 数据库迁移工具 | 全部 | ❌ 使用 Drizzle 自动同步 | 生产环境需要正式的 migration 文件 |

### 后端空闲期推荐顺序

当前端在做纯前端任务（Merge Review Dialog、Developer Mode、术语替换）时，后端应按此顺序推进：

```
1. 写 Phase 0 分享 Token 契约并实现 → 前端 3.0.3 依赖
2. 认证中间件 v0（API Key） → 产品上线前提
3. 写 Phase 1 Merge Checks API 契约 → 前端 4.3 依赖
4. 写 Phase 2 Report 元数据契约 → 前端 5.2 依赖
5. 补充后端测试覆盖
```
