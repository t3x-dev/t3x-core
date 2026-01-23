# t3x-webui

T3X 的 Web 前端，基于 Next.js 的画布式语义版本控制界面。

**Last Updated:** 2026-01-22 (Merge Workspace + A/B Test Compare + V4 Leaves)

## 技术栈

| 类别 | 当前使用 |
|------|---------|
| 框架 | Next.js 16 + React 19 (App Router) |
| 画布 | xyflow v12 (ReactFlow) |
| 样式 | Tailwind CSS v4 + shadcn/ui |
| 状态 | Zustand |
| 动画 | Framer Motion |
| 布局 | ELK.js (自动布局) |

## 目录结构

```
src/
├── app/                      # Next.js App Router
│   ├── page.tsx              # 首页（项目列表）
│   ├── layout.tsx            # 根布局
│   ├── project/[projectId]/  # 项目画布页
│   │   └── merge/[mergeId]/  # Merge Workspace 页面 (NEW)
│   ├── agent-demo/           # Agent Demo 页面
│   ├── api/                  # API 代理路由
│   ├── deploy/               # 部署页面 (A/B Test Compare)
│   ├── dev/                  # 开发调试路由
│   ├── eval/                 # 评估页面
│   ├── health/               # 健康检查页面
│   └── insights/             # 洞察页面
├── components/
│   ├── canvas/               # 画布相关组件
│   │   ├── CanvasWorkspace.tsx   # 主画布容器
│   │   ├── CanvasNodes.tsx       # 节点渲染器
│   │   ├── NodeModal.tsx         # 节点详情弹窗
│   │   ├── AnimatedEdge.tsx      # 动画边
│   │   └── ...
│   ├── merge/                # Merge UI 组件 (NEW)
│   │   ├── MergeWorkspace.tsx    # 主 merge 工作区
│   │   ├── MergePanel.tsx        # 决策面板
│   │   ├── MergeSimilarPairCard.tsx  # 相似句对卡片
│   │   ├── WordDiffDisplay.tsx   # 词级 diff 展示
│   │   └── ...
│   ├── optimiser/            # Agent Optimiser 组件 (NEW)
│   │   ├── RunsTable.tsx         # Runs 列表
│   │   ├── E2ETestCard.tsx       # E2E 测试卡片
│   │   └── ...
│   ├── ui/                   # shadcn/ui 组件
│   ├── Sidebar.tsx           # 侧边栏
│   └── CommandPalette.tsx    # 命令面板
├── store/
│   ├── canvasStore.ts        # 画布状态（节点、边、选中）
│   ├── projectStore.ts       # 项目状态（列表、当前项目）
│   ├── agentDemoStore.ts     # Agent Demo 状态
│   ├── mergeWorkspaceStore.ts # Merge Workspace 状态 (NEW)
│   └── optimiserStore.ts     # Agent Optimiser 状态 (NEW)
├── lib/
│   ├── api.ts                # API 客户端
│   ├── bridgeQueries.ts      # Bridge template query 定义
│   ├── db.ts                 # 数据库工具
│   ├── elkLayout.ts          # ELK 自动布局
│   ├── motion.ts             # 动画配置
│   ├── theme.ts              # 主题工具
│   ├── utils.ts              # 通用工具
│   └── providers/            # Provider 封装
├── utils/
│   └── tokenizer.ts          # 文本 tokenizer 工具
├── hooks/
│   ├── useApi.ts             # 数据获取 hook
│   └── useReducedMotion.ts   # 动画偏好 hook
└── types/
    ├── nodes.ts              # 节点类型定义
    ├── display-spec.ts       # 显示规范类型
    ├── semantic.ts           # 语义数据类型
    └── merge.ts              # Merge 类型定义 (NEW)
```

## API 连接

WebUI 通过 `lib/api.ts` 调用独立的 Hono API 服务：

| 环境 | API 地址 |
|------|---------|
| 开发 | `http://localhost:8000/api/v1` |

## 状态管理

| Store | 用途 |
|-------|------|
| `canvasStore` | 节点、边、选中状态、画布操作 |
| `projectStore` | 项目列表、当前项目、CRUD 操作 |
| `agentDemoStore` | Agent Demo 页面状态 |
| `mergeWorkspaceStore` | Merge Workspace 状态（决策、预览）(NEW) |
| `optimiserStore` | Agent Optimiser 状态（runs、filter）(NEW) |

## 启动

```bash
# 需要同时启动 API 服务
pnpm dev:api     # Terminal 1 - API (port 8000)
pnpm dev:webui   # Terminal 2 - WebUI (port 3000)
```

## 测试

```bash
pnpm --filter t3x-webui test
```

## 模块边界

修改以下导出接口前需评估影响面：

### lib/api.ts（高稳定）
- **类型定义**：`Project`, `Conversation`, `Turn`, `Commit`, `Branch`, `Draft`, `DiffResult`, `MergeResult`
- **CommitV3 API 类型**：`CommitV3`, `CommitV3Sentence`, `CommitV3Constraint`, `CommitV3Author`, `CommitV3ListData`
- **CommitV3 API 函数**：`listCommitsV3()`, `getCommitV3()`
- **Anchor API 类型**：`ApiAnchorCandidate`, `ApiConfirmedAnchor`, `ApiSentenceWithAnchors`, `ApiCommitAnchors`
- **转换函数**：`parseApiAnchorCandidates()`, `parseApiConfirmedAnchor()`, `parseApiSentenceWithAnchors()`, `parseApiCommitAnchors()`
- **API 函数签名**：所有 `export async function xxx()` 的参数和返回类型

### store/canvasStore.ts（中稳定）
- **State 字段**：`nodes`, `edges`, `projectId`, `loading`, `openNodeId`, `modalViewMode`
- **公开 Actions**：`loadProjectData`, `addNode`, `updateNode`, `onNodesChange`, `onEdgesChange`, `onConnect`, `openNodeModal`, `closeNodeModal`

### store/projectStore.ts（中稳定）
- **State 字段**：`projects`, `loading`
- **公开 Actions**：`fetchProjects`, `addProject`, `deleteProject`

### store/mergeWorkspaceStore.ts（中稳定）(NEW)
- **State 字段**：`draftId`, `prepared`, `decisions`, `preview`
- **公开 Actions**：`loadMergeDraft`, `setDecision`, `updatePreview`, `commitMerge`

### store/optimiserStore.ts（中稳定）(NEW)
- **State 字段**：`runs`, `filters`, `configurations`
- **公开 Actions**：`fetchRuns`, `setFilter`, `compareConfigurations`

### types/nodes.ts（高稳定）
- **节点类型**：`NodeKind`, `CanvasNodeData`, `LeafType`, `BranchType`
- **CommitV3 类型**：`CommitV3Display`, `SentenceDisplay`, `ConstraintDisplay`, `AuthorDisplay`
- **Anchor 类型**：`AnchorType`, `AnchorConstraint`, `AnchorCandidate`, `ConfirmedAnchor`, `SentenceWithAnchors`, `CommitAnchors`
- **Pending 类型**：`PendingCommitSource`, `PendingCommitSentence`

### types/merge.ts（高稳定）(NEW)
- **Merge 类型**：`MergeDraft`, `MergeSimilarPair`, `MergeDecision`, `MergePreview`
- **Word Diff 类型**：`WordDiffSegment`, `WordDiffType`

---

内部实现（非导出函数、私有 helper）可自由重构。
