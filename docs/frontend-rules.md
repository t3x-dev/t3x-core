# T3X 前端开发规范

> 状态：生效中
> 最后更新：2026-02-09
> 范围：apps/web (t3x-webui)
> 目的：团队前端开发对齐——约定、模式、设计约束。
> 真实来源：代码库分析 + `docs/frontend-design-principles.md`。

---

## 目录

1. [产品基因](#1-产品基因)
2. [设计规则（强制）](#2-设计规则强制)
3. [架构规则](#3-架构规则)
4. [代码规范](#4-代码规范)
5. [已知缺口](#5-已知缺口)

---

## 1. 产品基因

T3X 不是单一范式的产品，它融合了多个参考产品的设计基因。开发者必须理解每个模块对应哪种范式，才能做出正确的设计决策。

### 1.1 参考产品映射

| 参考产品 | T3X 模块 | 落地程度 | 核心借鉴 |
|---------|---------|---------|---------|
| **GitHub** | Diff / Merge / Branch / Commit DAG | 完整 | 三路合并、词级 Diff、分支过滤、提交历史面板 |
| **Figma** | Canvas 画布工作空间 | 完整 | XYFlow 节点编辑、Minimap、Zoom Slider、ELK 自动布局、空间导航 |
| **n8n** | Runner + Leaf 执行 + 节点连线 | 完整 | 拖拽创建节点、动画 Edge、Leaf 触发执行、n8n 工作流集成 |
| **Dagster** | Trace 可视化 + Eval 断言 | 完整 | TraceTimeline 层级 Span、维度评分、灰盒评估引擎 |
| **Vercel** | Deploy 面板 + A/B 对比 | 完整 | Deploy Agent 管理、RunsTable、MetricsDelta 对比、配置版本比较 |
| **dbt** | 溯源链 + 约束验证 | 完整 | 句子→Turn 字符级溯源、Constraint 即数据质量测试、Assertion 即测试结果 |
| **LangChain** | Pin 上下文 + Agent 记忆 | 完整 | Pin 选择记忆源、BuiltContext 组装 LLM 提示词、对话级上下文裁剪 |
| **Notion** | 空状态引导 + 命令面板 + 简洁 UX | 部分 | EmptyState 组件、Cmd+K、TurnBubble 对话展示。**无富文本编辑器** |

### 1.2 开发时的思维模型

```
写 Canvas 代码      → 想 Figma（空间交互、节点拖拽、缩放层级）
写 Diff/Merge 代码  → 想 GitHub（三路合并、冲突解决、统一/并排视图）
写 Leaf/Deploy 代码 → 想 Vercel + n8n（部署预览、执行触发、状态仪表盘）
写 Trace/Eval 代码  → 想 Dagster + dbt（Span 层级、断言、维度评分）
写 Pin/Context 代码 → 想 LangChain（记忆管理、上下文组装、Token 估算）
写通用交互          → 想 Notion（渐进披露、空状态引导、80% 非技术用户优先）
```

---

## 2. 设计规则（强制）

这些规则来自 `docs/frontend-design-principles.md`，必须在 Code Review 中强制执行。

### 规则 1：两类用户，一个界面

| 用户群 | 占比 | 默认语言 | 触达方式 |
|--------|------|---------|---------|
| 普通用户 | 80% | 保存 / 对比 / 合并（**禁止 Git 术语**） | 默认界面，点击操作 |
| 技术用户 | 20% | Commit / Branch / Merge / Diff | 开发者模式、Cmd+K、快捷键 |

**术语映射表**（所有用户可见文字必须遵守）：

| Git 概念 | 默认模式（80% 用户） | 开发者模式（20% 用户） | 理由 |
|---------|--------------------|--------------------|------|
| Branch | 变体 / 实验版 | Branch | "让我试一个不同的版本" 是自然语言 |
| Commit | 快照 / 保存 | Commit | "Commit" 对非技术用户毫无意义 |
| Merge | 合并 / 整合 | Merge | "把这两个版本合起来" 不言自明 |
| Diff | 对比 / 变化 | Diff | "这两个版本之间改了什么？" |
| HEAD | 最新版 / 当前版 | HEAD | Git 之外没人知道 HEAD 是什么 |
| Merge Conflict | 需要你做决定 | Merge Conflict | 框架为"选择"，而非"问题" |
| Hash | （隐藏） | Hash | 默认模式下永远不展示哈希值 |

实施要点：
- UI 标签、按钮文字、Tooltip、空状态、Toast 消息必须使用"默认模式"列。
- "开发者模式"列仅在用户主动开启开发者模式后展示（尚未实现，见已知缺口）。
- 代码层面的变量名、API 字段、Store state 可以继续使用 Git 术语（如 `branch`、`commit_hash`）。此映射仅适用于**用户可见文字**。
- 权威来源：`docs/frontend-design-principles.md` 第 2.1 节。

**验证方法**：默认路径中出现 commit hash、merge conflict、HEAD 等 Git 术语 = Bug。

### 规则 2：Orange → Blue 状态叙事

```
Orange/Amber = 待处理（草稿 / 变体 / 进行中）
Blue         = 已提交（稳定 / 主线 / 不可变）
Indigo       = 对话
Emerald      = Leaf（输出）
```

颜色即状态，状态即颜色。节点不需要读文字就能判断阶段。

### 规则 3：三层能力模型

每个视图必须遵守此分层：

| 层 | 可见性 | 展开方式 | 包含内容 |
|---|--------|---------|---------|
| Layer 1 | **始终可见** | 无需操作 | 核心工作流：句子、约束、下一步 CTA |
| Layer 2 | **折叠** | 单击展开 | Source Context、Pin、版本历史、关联 Leaf |
| Layer 3 | **隐藏** | "高级" 链接或开发者模式 | Diff 工具、Raw JSON、Metadata、相似度分数 |

实现模式：

```tsx
// Layer 2：折叠区域，默认关闭
<CollapsibleSection title="Source Context" defaultOpen={false}>
  {/* Layer 2 内容 */}
</CollapsibleSection>

// Layer 3：仅在高级模式下渲染
{showAdvanced && <AdvancedSection />}
```

### 规则 4：每个视图必须回答三个问题

| 问题 | UI 元素 | 示例 |
|------|--------|------|
| **我在哪？** | 标题 / 面包屑 | "快照 abc123 · 主线" |
| **下一步？** | 最醒目的 CTA | "生成输出 →" 按钮（蓝色渐变） |
| **卡住了？** | 错误提示 / 空状态 / 帮助链接 | "尚未连接数据源。[如何连接]" |

### 规则 5：空状态 = 教学机会

每个空状态必须包含三要素：

1. **什么**——缺什么（"还没有对话"）
2. **为什么**——为什么重要（"对话是知识提取的来源"）
3. **行动**——操作按钮（"添加对话" + 可选 "了解更多" 链接）

复用现有的 `EmptyState` 和 `EmptyStateInline` 组件，禁止自建临时空状态标记。

反模式：仅显示 "暂无数据" 或一个无说明的禁用按钮。

### 规则 6：动画克制

| 适合动画 | 不适合动画 |
|---------|----------|
| 节点创建/删除（scaleIn/fadeOut） | 节点内容更新 |
| Edge 连接流动动画 | 筛选结果变化 |
| 合并决策反馈过渡 | 频繁实时数据刷新 |
| 状态变化（待处理 → 已提交） | 列表排序/翻页 |

所有动画必须：
- 检查 `useReducedMotion()` Hook
- 使用 `lib/motion.ts` 中的预设（springConfig、variants）
- 不能阻塞信息获取

### 规则 7：Canvas 是一等公民

Canvas 是主操作界面，不是装饰性可视化。

- 性能目标：拖拽 60fps，100 节点布局 < 500ms
- 节点位置有意义（ELK 层级布局 = 时间线）
- 主线居左/居中，变体向右延伸
- 所有操作必须可在 Canvas 上完成（不依赖独立页面）

### 规则 8：溯源链不能断

```
Leaf 断言失败
  → 点击"查看来源"
    → 跳到 Commit 句子
      → 点击句子溯源链接
        → 跳到 Turn 原文（字符级高亮）
```

链条中任一环节断裂，T3X 的"证据驱动"价值主张就会减损。涉及句子、约束、断言的功能，必须端到端验证溯源完整性。

### 规则 9：证据链与血缘链是同等公民

规则 8 覆盖语义链（Commit → Sentence → Turn）。当 Runner/Deploy/Eval 报告资产化后，血缘链同样不能断：

```
Runner Report
  → 点击某条断言
    → 定位到所用的 Commit + Sentence
      → 回到 Turn 原文（字符级高亮）

Lineage 图上的每个节点
  → 必须可点击进入证据链
  → 否则图只是装饰，不是可信依据
```

验收标准：任何 Report（Runner、Deploy、Eval）都必须能反向定位到 commit + sentence + turn。Lineage 视图中每个节点必须可点击回到证据链。

### 规则 10：内容编辑不是富文本，是结构化编辑

T3X 不做 Notion 式富文本编辑器（Prosemirror/Tiptap/Slate），但 80% 非技术用户仍需要"简单到像 Notion"的编辑体验。

T3X 的内容编辑器是**结构化编辑器**：

| 编辑对象 | 交互方式 | 参考体验 |
|---------|---------|---------|
| Leaf 约束 | Chips/Tags 选择 + 从句子高亮选取 | Notion 数据库属性 |
| 提示词模板 | 带变量插槽的文本区域 | Notion 模板占位符 |
| 合并决策 | 单选/多选卡片 | Figma 分支审查 |
| 上下文选择 | Pin 勾选 + 拖拽排序 | Notion 侧栏筛选 |

原则：不用富文本，但要做到"像 Notion 一样简单"。如果一个交互需要用户理解 JSON 结构才能完成，那就是 Bug。

---

## 3. 架构规则

### 3.1 技术选型约束

| 类别 | 必须使用 | 禁止使用 |
|------|---------|---------|
| 框架 | Next.js 16 App Router | Pages Router |
| 状态管理 | Zustand | React Context、Redux、Jotai、Valtio |
| 样式 | Tailwind v4 + shadcn/ui + `cn()` | CSS Modules、styled-components、Emotion |
| 动画 | Framer Motion（通过 `lib/motion.ts`） | 原始 CSS animation（globals.css 中已有的除外） |
| 数据请求 | `lib/api.ts` 自封装 fetch | SWR、React Query、Axios |
| 画布 | XYFlow v12 | 直接操作 DOM、其他画布库 |
| 布局引擎 | ELK.js | D3-force、dagre |
| 命令面板 | cmdk | 自建实现 |
| 图标 | lucide-react | 其他图标库 |
| 代码质量 | Biome | ESLint、Prettier |

### 3.2 Server / Client 组件

项目实质上是一个 **Client-Side 应用**。当前架构：

```
layout.tsx（唯一的 Server Component — metadata、字体）
  → ClientLayout.tsx（'use client' — 注册 toast、提供 Sidebar）
      → page.tsx（'use client' — 全部 14 个页面都是 Client 组件）
```

所有 page.tsx 和组件都使用 `'use client'`。除非团队明确决定迁移，否则不要引入 Server Component 数据获取模式。

### 3.3 节点类型系统（Canvas 核心）

```typescript
type NodeKind = 'unit' | 'leaf';

// Unit = 对话 + 提交 的组合卡片（288px 宽）
//   staging   → 可编辑（虚线边框，灰色）
//   committed → 不可变（实线边框，蓝/琥珀）

// Leaf = 输出/执行 目标节点（160px 宽）
type LeafType =
  | 'deploy_agent' | 'eval'                    // Runner 类
  | 'tweet' | 'weibo' | 'wechat'              // 社交类
  | 'email' | 'article' | 'slack';            // 内容类

// 连线规则
const connectionMatrix = {
  unit: ['unit', 'leaf'],  // Unit 可连接到 Unit 或 Leaf
  leaf: [],                // Leaf 是终端节点，无出边
};
```

新增节点类型需要更新：
1. `types/nodes.ts`（类型定义）
2. `canvasStoreUtils.ts`（connectionMatrix）
3. `CanvasNodes.tsx`（渲染）
4. `NodePalette.tsx`（面板）

### 3.4 Leaf 模板库

> 参考：Notion（Template Gallery + 一键复制 + 分享链接）
> 状态：已规划（Milestone A）

模板库是 T3X 开源增长的核心引擎，让用户从已验证的 Leaf 配置起步，而非从零开始。

#### 什么是模板

模板是预配置的 Leaf 结构：

```typescript
interface LeafTemplate {
  id: string;                          // template_xxx
  title: string;                       // "产品需求文档"
  description: string;                 // 卡片摘要
  category: TemplateCategory;          // 'product' | 'research' | 'engineering' | ...
  leaf_type: LeafType;                 // 'article' | 'deploy_agent' | ...
  constraints: Constraint[];           // 预填的 require/exclude 规则
  config: {
    prompt_template: string;           // 预填的提示词
    model?: string;
    max_tokens?: number;
  };
  tags: string[];                      // 搜索/筛选用
  preview_image?: string;              // 卡片缩略图
}
```

#### 架构规则

| 方面 | 规则 |
|------|------|
| 文件位置 | `components/templates/`（新建目录） |
| 路由 | `/templates`（列表页）+ 预览 Modal |
| Store | `templateStore.ts`（新建，内联模式，无中间件） |
| 数据源 | 初期打包 JSON，后期 API 驱动 |
| 导出格式 | JSON / Markdown / Prompt 文本 |

#### UX 规则

| 规则 | 详情 |
|------|------|
| 一键使用 | "使用此模板" 直接创建预填好约束和配置的新 Leaf，无多步向导 |
| 使用前预览 | 点击卡片弹出预览 Modal，展示约束、提示词模板、示例输出 |
| 搜索与筛选 | 按 category 和 leaf_type 筛选，title + description + tags 全文搜索 |
| 空状态 | 模板库页面永远不能为空，首发内置 10-20 个跨行业模板 |
| 贡献路径 | 模板是纯 JSON 文件，外部贡献者可通过 PR 提交（类似 shadcn/ui registry） |

#### 禁止事项

- v1 不做模板编辑器。用户通过导出已有 Leaf 来创建模板，而非填写表单。
- 模板不绑定特定项目或提交，是项目无关的。
- 浏览模板不需要登录。Gallery 必须公开可见，便于传播。

### 3.5 Zustand Store 规则

| Store | 中间件 | 模式 | 说明 |
|-------|--------|------|------|
| canvasStore | 无 | **Slice 组合** | 唯一使用 Slice 模式的 Store：MergeSlice + LeafSlice |
| projectStore | 无 | 内联 | |
| pinsStore | 无 | 内联 | |
| mergeWorkspaceStore | 无 | 内联 | |
| optimiserStore | **persist** | 内联 | 唯一使用 persist 中间件的 Store |
| agentDemoStore | 无 | 内联 | |

辅助文件（仅 canvasStore 有）：
- `canvasStoreTypes.ts` — 共享类型
- `canvasStoreUtils.ts` — 纯函数（不依赖 Zustand）
- `canvasMergeSlice.ts` — 合并领域 Slice
- `canvasLeafSlice.ts` — Leaf 领域 Slice

**消费模式**（代码库中两种都在用）：

```typescript
// 读取 1-2 个字段 → 使用 selector（防止无关重渲染）
const loading = useCanvasStore((s) => s.loading);

// 读取多个字段 → 解构（大量使用，允许）
const { nodes, edges, loading } = useCanvasStore();

// 跨 Store 调用 / 事件处理 → getState()
useCanvasStore.getState().loadProjectData(projectId);
```

**规则：**
- 禁止引入 React Context。全局状态统一走 Zustand。
- Store 超过 ~500 行时考虑拆分为 Slice。
- 当前未使用 devtools 中间件。

### 3.6 API 层

`lib/api.ts` 有三层 fetch 架构：

| 层 | 函数 | 职责 |
|---|------|------|
| L1 | `fetchOnce(url, opts, timeout)` | 原生 fetch + AbortController，默认 10s 超时 |
| L2 | `fetchWithTimeout(url, opts, timeout)` | GET 自动重试 3 次（指数退避：500ms、1s、2s），非 GET 不重试 |
| L3 | `handleResponse<T>(res)` | 解包 `{ success, data }` 格式，失败抛 `ApiError` |

自定义错误类：

```typescript
class ApiError extends Error {
  code: string;      // 'TIMEOUT' | 'ABORTED' | 'SERVER_ERROR' | ...
  details?: Record<string, unknown>;
}
```

API 响应格式：

```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }
```

### 3.7 自定义 Hook 标准

所有数据获取 Hook 必须返回：

```typescript
{ data: T | null, loading: boolean, error: Error | null, refetch: () => void }
```

基础要求：
- 使用 `mountedRef` 防止卸载后更新 state
- catch 错误存入 state，不向外 throw
- 始终提供 `refetch` 函数

数据层能力要求（不引入 SWR/React Query，但必须在 Hook 层补齐）：

| 能力 | 说明 | 状态 |
|------|------|------|
| 请求去重 | 相同 key 的并发请求只发一次 | 待补齐 |
| Stale-While-Revalidate | 先返回缓存数据，后台静默刷新 | 待补齐 |
| 分页/无限滚动 | 列表类 Hook 支持 offset/cursor 分页 | 待补齐（配合虚拟滚动） |
| 乐观更新 | 写操作即时反映到 UI，失败后回滚 | 待补齐 |

理由：我们禁用了第三方数据请求库（SWR/React Query），但借鉴的 GitHub/Notion/Figma 体验高度依赖这些能力。不补齐 = 长期体验债。

已有 Hook：`useApiCall`（通用）、`useBranchCommits`（业务）、`useReducedMotion`（浏览器偏好）。

### 3.8 错误处理

12 个 Store 文件的统一模式：

```typescript
try {
  const data = await api.someCall();
  set({ data, loading: false });
  notify?.('操作成功', 'success');
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  set({ error, loading: false });
  notify?.(error.message, 'error');
}
```

- `notifyCallback` 由 `ClientLayout` 启动时注入到所有 Store
- `ErrorBoundary` 组件兜底渲染错误 + hydration 错误自动恢复
- 禁止静默吞掉错误

---

## 4. 代码规范

### 4.1 Biome 格式化（强制）

| 配置项 | 值 |
|--------|---|
| 行宽 | 100 |
| 缩进 | 2 空格 |
| 引号 | 单引号 |
| 分号 | 始终加 |
| 尾逗号 | ES5 |
| import 排序 | 自动（`organizeImports: on`） |

### 4.2 Biome Linter（关键规则）

| 规则 | 级别 | 说明 |
|------|------|------|
| `useImportType` | **warn** | 类型导入必须使用 `import type {}` |
| `noExplicitAny` | **warn** | 优先用 `unknown`；`any` 不是 error 但应避免 |
| `noUnusedImports` | **warn** | |
| `noUnusedVariables` | **warn** | |
| `useExhaustiveDependencies` | **off** | 未强制（自定义 Hook 模式） |
| `noConsole` | **off** | Biome 允许 console.log；但提交 PR 前应清理 |
| `noStaticElementInteractions` | **off** | |
| `useKeyWithClickEvents` | **off** | |
| `useButtonType` | **warn** | |

### 4.3 文件命名

| 目录 | 规则 | 示例 |
|------|------|------|
| `components/ui/`（shadcn 原始组件） | kebab-case | `button.tsx`、`scroll-area.tsx` |
| `components/` 其它目录 | PascalCase | `CanvasWorkspace.tsx`、`DiffDisplayView.tsx` |
| 工具/辅助文件 | 小写 | `helpers.tsx`、`shared.tsx`、`index.ts` |
| `hooks/` | camelCase + `use` 前缀 | `useApi.ts`、`useBranchCommits.ts` |
| `store/` | camelCase + `Store` 后缀 | `canvasStore.ts`、`pinsStore.ts` |
| `lib/` | camelCase | `api.ts`、`motion.ts`、`diffUtils.ts` |

**注意**：自写复合组件应放在功能目录（如 `components/canvas/`），不要放在 `components/ui/`。`ui/` 目录仅用于 shadcn/ui 原始组件。

### 4.4 组件导出模式

```typescript
// 标准：命名导出 + function 声明（95.9% 的组件）
export function MyComponent({ title }: Props) { ... }

// 仅 page.tsx：default 导出（Next.js 要求）
export default function ProjectPage() { ... }

// 仅 ref 转发时：
export const MyInput = forwardRef<HTMLInputElement, Props>(...)

// 禁止：普通组件使用 default 导出
// 禁止：箭头函数定义组件（export const X = () => ...）
// 禁止：class 组件（ErrorBoundary 是唯一例外）
```

### 4.5 TypeScript

| 规则 | 做法 |
|------|------|
| 类型导入 | **必须**使用 `import type {}`（Biome 强制） |
| 对象形状 | 用 `interface`（代码库中 interface:type = 6:1） |
| 联合/工具类型 | 用 `type` |
| API 响应字段 | snake_case（`project_id`、`committed_at`）——**直接使用，无转换层** |
| 组件 Props | camelCase（`onSave`、`projectId`） |
| API 缺失字段 | `string \| null`（不用 `undefined`） |
| 可选 Props | `saving?: boolean`（映射为 `undefined`） |

### 4.6 样式

```typescript
// 标准：cn() + Tailwind 类
<div className={cn('px-4 py-2 rounded-lg', isActive && 'ring-2 ring-blue-400')} />

// 仅动态值用 inline style
<div style={{ left: `${position.x}px` }} />

// 禁止：静态样式用 inline style
// 禁止：新增 CSS 文件（全局只有一个 globals.css）
// 禁止：!important（Biome: noImportantStyles: warn）
```

`globals.css` 中的 CSS 变量体系（591 行，唯一 CSS 文件）：
- 75+ 设计 Token（颜色、排版、间距、圆角、阴影、Canvas 尺寸）
- 暗色模式通过 `.dark` 类覆盖
- ReactFlow 定制样式
- 关键词高亮样式
- 减弱动效媒体查询

### 4.7 测试

| 类型 | 框架 | 位置 | 环境 |
|------|------|------|------|
| 单元测试 | Vitest | `src/__tests__/` | `node`（Hook 测试通过 `// @vitest-environment jsdom` 使用 jsdom） |
| E2E 测试 | Playwright | `e2e/` | Chromium |

单元测试模式：

```typescript
// Mock API 层
vi.mock('@/lib/api', () => ({ listTurns: vi.fn() }));

// Mock 数据库
vi.mock('@/lib/db', () => ({ getDB: vi.fn() }));
```

E2E 测试模式：

```typescript
// 流程测试必须串行
test.describe.configure({ mode: 'serial' });

// 通过 API 准备数据，不通过 UI
test.beforeAll(async ({ request }) => {
  // 创建测试数据
});

// 测试后清理
test.afterAll(async ({ request }) => {
  // 删除测试数据
});
```

提交前必须运行：

```bash
pnpm check          # Biome lint + format
pnpm test:webui     # 单元测试
```

---

## 5. 已知缺口

以下不是当前规则，而是需要关注的待建设项。**P0 项是规则能被严格执行的前提**。

### P0（规则前提，必须先做）

| 缺口 | 参考产品 | 当前状态 | 为什么是 P0 |
|------|---------|---------|------------|
| 开发者模式切换 | GitHub / Notion | 未实现。规则 1 已添加术语表，但 UI 切换尚不存在 | **规则 1 的执行前提**：没有 Developer Mode，技术信息要么污染默认路径（违反规则 1），要么藏太深（技术用户不满）。任何技术信息的 UI 入口必须带"高级 / Developer Mode"门槛 |
| Merge Review v0 | GitHub / Figma | 未实现。当前合并是直接执行 | **策略核心**：GitHub/Figma 借鉴的核心是治理闭环，不做 = 永远无法形成"团队可信赖的合并流程"。v0 最小范围：合并摘要（人话）+ Checks（constraints OK / evidence chain OK / 可选 eval OK）+ "确认合并" 两步操作（哪怕只是本地状态） |
| 预览/分享链接 v0 | Vercel / Notion | 未实现 | **增长机制前提**：Notion/Vercel 的传播靠分享。v0 方案：同实例内只读 token（不跨域、不上云、不需要 Server Component 改造）。前端规则：ShareLink 入口属于 Layer 2（折叠但可见），raw token/metadata 属于 Layer 3 |
| 语义缩放 | Figma | 未实现 | 设计文档已规划，Canvas 一等公民的体验基础 |

### P1

| 缺口 | 参考产品 | 当前状态 |
|------|---------|---------|
| 长列表虚拟滚动（50+ 项） | Notion / GitHub | 未实现（设计文档已规划） |
| Runner 报告资产化（物化、可比较、可分享） | Dagster / dbt | 部分。RunsTable + 详情页已有，但报告不是一等资产（Milestone C） |
| Hook 层数据能力（请求去重、SWR、分页、乐观更新） | GitHub / Notion / Figma | 未实现。禁用了第三方库但未补齐自建能力（见 3.7 节） |

### P2

| 缺口 | 参考产品 | 当前状态 |
|------|---------|---------|
| 工作流配方 / Webhook 触发 | n8n | 未实现。n8n 集成仅用于 Runner（Milestone C） |
| Canvas 键盘导航（Tab/方向键切换节点） | Figma / GitHub | 未实现 |
| 节点右键上下文菜单 | n8n / Figma | 仅 SelectableTextBlock 有 |
| `sr-only` 无障碍文本 | Notion | 仅 1 处（Sidebar） |
| 颜色 + 图标双通道（色盲友好） | GitHub | 部分（节点有图标，Diff 缺 +/-/~ 图标） |

### P3 / 不做

| 缺口 | 当前状态 |
|------|---------|
| `components/ui/` 命名不一致 | PinButton 等 PascalCase 放在 ui/ 中，应迁至功能目录 |
| 富文本编辑 | 无计划——产品定位不同，见规则 10（结构化编辑器） |
