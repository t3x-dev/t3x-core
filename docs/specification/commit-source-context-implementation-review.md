# Commit Source Context 实现状态分析与优化建议

> 文档版本: 1.0
> 分析日期: 2026-01-29
> 相关规范: `docs/specification/commit-source-context-presentation.md`

---

## 一、概述

本文档对 T3X 项目中 **Commit Source Context Presentation** 功能的实现状态进行全面分析，并提出优化建议。

### 核心设计理念

**"Source as Anchor, Commit as Lens"** — 源对话是真相，Commit 是高亮选中内容的"镜头"，而非抽取转换。用户应始终能够在熟悉的对话文本中看到哪些部分被选中。

---

## 二、当前实现状态

### 2.1 核心组件清单

| 组件 | 路径 | 行数 | 职责 |
|------|------|------|------|
| `CommitSourceContext` | `components/canvas/CommitSourceContext.tsx` | 763 | 主组件：完整模式显示 commit 与源对话 |
| `TruncatedCommitView` | `components/canvas/TruncatedCommitView.tsx` | 542 | Canvas 紧凑预览模式 |
| `TurnBubble` | `components/shared/TurnBubble.tsx` | 186 | 共享：对话气泡 + 高亮渲染 |
| `DiffDisplayView` | `components/diff/DiffDisplayView.tsx` | 600 | Diff 视图（Side-by-Side / Unified）|
| `DiffSourceContextModal` | `components/diff/DiffSourceContextModal.tsx` | 123 | Diff 中的源追踪 Modal |
| `MergeConflictView` | `components/merge/MergeConflictView.tsx` | 112 | Merge 冲突主视图 |
| `ConflictSide` | `components/merge/ConflictSide.tsx` | 109 | 冲突两侧显示 |
| `ConflictSourceContext` | `components/merge/ConflictSourceContext.tsx` | 255 | 冲突源上下文（截断版）|
| `ConflictResolutionButtons` | `components/merge/ConflictResolutionButtons.tsx` | 88 | Keep A/B/Both/Edit 按钮 |
| `WordDiffDisplay` | `components/merge/WordDiffDisplay.tsx` | 54 | 词级别 Diff 渲染 |
| `diffUtils` | `lib/diffUtils.ts` | 253 | Diff 算法（Jaccard + LCS）|

### 2.2 规范实现对照表

| 规范阶段 | 要求 | 状态 | 实现位置 |
|----------|------|------|----------|
| **Phase 1** | 源文本 + 绿色高亮 | ✅ | `CommitSourceContext` + `TurnBubble` |
| | 高亮范围合并 | ✅ | `TurnBubble:61-82` |
| | 内容完整性检查 | ✅ | `CommitSourceContext:126-159` |
| | 长文本智能截断 | ✅ | `CommitSourceContext:711-741` |
| | "View Source" 跳转到对话 | ⚠️ 部分 | 仅显示上下文窗口 |
| **Phase 2** | 紧凑 Canvas 预览 | ✅ | `TruncatedCommitView` |
| | "+N more" 指示器 | ✅ | `TruncatedCommitView:524-527` |
| | 词边界感知截断 | ✅ | `findWordBoundary()` |
| **Phase 3** | Side-by-Side 视图 | ✅ | `DiffDisplayView` |
| | Unified 视图 | ✅ | `DiffDisplayView` |
| | 红/绿/琥珀颜色编码 | ✅ | `SideBySideRow`, `UnifiedRow` |
| | 词级别 Diff | ✅ | `WordDiffDisplay` + `wordDiff()` |
| | "Trace to Source" | ✅ | `DiffSourceContextModal` |
| **Phase 4** | 两列冲突布局 | ✅ | `MergeConflictView` |
| | 内联源上下文 | ✅ | `ConflictSide` → `ConflictSourceContext` |
| | Keep A/B/Both/Edit 按钮 | ✅ | `ConflictResolutionButtons` |
| | 自定义编辑面板 | ✅ | `ConflictEditPanel` |

### 2.3 数据流架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        数据模型层                                │
├─────────────────────────────────────────────────────────────────┤
│  CommitV3/V4 Sentence:                                          │
│  {                                                               │
│    id: "s1",                                                    │
│    text: "OAuth 2.0 for authentication",                        │
│    source: {                                                    │
│      turn_hash: "sha256:abc...",                               │
│      start_char: 16,    ← 相对于 turn.content 的位置           │
│      end_char: 44                                               │
│    }                                                            │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API 层                                    │
├─────────────────────────────────────────────────────────────────┤
│  fetchTurnContext(turn_hash, options) → TurnContextData         │
│  {                                                               │
│    target_turn: { turn_hash, role, content, created_at },       │
│    context: TurnWithContext[],                                  │
│    conversation_id, conversation_title                          │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        渲染层                                    │
├─────────────────────────────────────────────────────────────────┤
│  TurnBubble.renderContent():                                    │
│  1. 收集所有高亮 (highlight + highlights[])                     │
│  2. mergeHighlights() - 合并重叠/相邻范围                       │
│  3. 构建 React 节点:                                            │
│     [普通文本] [<mark>高亮文本</mark>] [普通文本]               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、需要优化的问题

### 3.1 功能性问题

#### 问题 1: "View Source" 缺少对话页面跳转

**当前状态**: 点击后仅显示上下文窗口，无法跳转到完整对话页面

**规范要求**:
```
┌─────────────────────────────────────────┐
│ Commit: abc123              [View Source →] │
├─────────────────────────────────────────┤
│ ...highlighted text...                  │
└─────────────────────────────────────────┘

点击 "View Source" 应跳转到对话页面，定位到具体位置
```

**影响范围**:
- `CommitSourceContext.tsx`
- `TruncatedCommitView.tsx`

**优化建议**:
```typescript
// 添加跳转功能
interface ViewSourceLinkProps {
  conversationId: string;
  turnHash: string;
  startChar?: number;
  endChar?: number;
}

function ViewSourceLink({ conversationId, turnHash, startChar, endChar }: ViewSourceLinkProps) {
  const href = `/conversation/${conversationId}?turn=${turnHash}&highlight=${startChar}-${endChar}`;
  return (
    <Link href={href} className="text-blue-600 hover:underline">
      View Source →
    </Link>
  );
}
```

**优先级**: 中等
**工作量**: 2-3 小时

---

#### 问题 2: Diff 视图缺少内联源上下文

**当前状态**: 需要点击 "Trace to Source" 按钮打开 Modal 查看上下文

**规范要求**:
```
┌─ Commit A ────────────────────────┐  ┌─ Commit B ────────────────────────┐
│ Rate limiting is set to           │  │ Rate limiting is set to           │
│ [100 req/min] per user.           │  │ [200 req/min] per user.           │
│                                   │  │                                   │
│ 💬 From: API Discussion (Turn 3)  │  │ 💬 From: Load Test Review (Turn 7)│
│ ...surrounding context...         │  │ ...surrounding context...         │
└───────────────────────────────────┘  └───────────────────────────────────┘
```

**影响范围**:
- `DiffDisplayView.tsx`
- `SideBySideRow` 组件

**优化建议**:
1. 在每个 Diff 行下方添加可折叠的内联上下文区域
2. 默认折叠，点击展开
3. 复用 `ConflictSourceContext` 组件的截断逻辑

**优先级**: 低
**工作量**: 4-6 小时

---

### 3.2 代码质量问题

#### 问题 3: 截断算法重复实现

**当前状态**: 三个地方各自实现了类似的截断逻辑

| 位置 | 函数名 | 功能 |
|------|--------|------|
| `CommitSourceContext.tsx:711` | `truncateLongContent()` | 长 turn 截断 |
| `TruncatedCommitView.tsx:124` | `truncateWithHighlights()` | Canvas 预览截断 |
| `ConflictSourceContext.tsx:59` | `truncateWithHighlight()` | 冲突上下文截断 |

**问题**:
- 代码重复，维护困难
- 算法略有差异，可能导致不一致行为
- 参数命名不统一 (`contextChars` vs `TRUNCATION_CONTEXT`)

**优化建议**:
```typescript
// lib/truncationUtils.ts

export interface TruncationOptions {
  maxLength?: number;          // 默认 2000
  contextChars?: number;       // 默认 100
  preserveWordBoundary?: boolean; // 默认 true
}

export interface TruncatedSegment {
  type: 'text' | 'highlight' | 'ellipsis';
  content: string;
}

/**
 * 统一的智能截断算法
 * - 保留高亮区域完整可见
 * - 在词边界处截断
 * - 支持多个高亮范围
 */
export function truncateWithHighlights(
  content: string,
  highlights: Array<{ start: number; end: number }>,
  options?: TruncationOptions
): TruncatedSegment[];

/**
 * 截断后调整高亮位置
 */
export function adjustHighlightsForTruncation(
  highlights: Array<{ start: number; end: number }>,
  originalContent: string,
  truncatedContent: string,
  options?: TruncationOptions
): Array<{ start: number; end: number }>;

/**
 * 找到最近的词边界
 */
export function findWordBoundary(
  text: string,
  position: number,
  direction: 'left' | 'right'
): number;
```

**优先级**: 中等
**工作量**: 3-4 小时

---

#### 问题 4: 高亮合并逻辑重复

**当前状态**: 两处实现了相同的高亮合并算法

| 位置 | 函数名 |
|------|--------|
| `TurnBubble.tsx:61` | `mergeHighlights()` |
| `TruncatedCommitView.tsx:94` | `mergeHighlightRanges()` |

**优化建议**:
```typescript
// lib/highlightUtils.ts

export interface HighlightRange {
  start: number;
  end: number;
}

/**
 * 合并重叠或相邻的高亮范围
 * 相邻定义: start <= previousEnd + 1
 */
export function mergeHighlightRanges(ranges: HighlightRange[]): HighlightRange[];

/**
 * 检查两个范围是否重叠
 */
export function rangesOverlap(a: HighlightRange, b: HighlightRange): boolean;

/**
 * 计算高亮覆盖率
 */
export function calculateHighlightCoverage(
  contentLength: number,
  highlights: HighlightRange[]
): number;
```

**优先级**: 低
**工作量**: 1-2 小时

---

#### 问题 5: 类型定义分散

**当前状态**: 相同的类型在多处重复定义

```typescript
// CommitSourceContext.tsx:57
interface CommitSentence {
  id: string;
  text: string;
  source?: { turn_hash: string; start_char: number; end_char: number; };
}

// TruncatedCommitView.tsx:30
interface CommitSentence {
  id: string;
  text: string;
  source?: { turn_hash: string; start_char: number; end_char: number; };
}

// DiffDisplayView.tsx:37
interface SentenceWithSource extends DiffableSentence {
  source?: { turn_hash: string; start_char: number; end_char: number; };
}
```

**优化建议**:
```typescript
// types/sourceContext.ts

/**
 * 句子的源引用信息
 */
export interface SourceRef {
  turn_hash: string;
  start_char: number;
  end_char: number;
}

/**
 * 带源引用的句子（用于显示）
 */
export interface SentenceWithSource {
  id: string;
  text: string;
  source?: SourceRef;
}

/**
 * 高亮范围
 */
export interface HighlightRange {
  start: number;
  end: number;
}

/**
 * Turn 气泡数据
 */
export interface TurnBubbleData {
  turn_hash: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
  is_target?: boolean;
  highlight?: HighlightRange;
  highlights?: HighlightRange[];
}

/**
 * 截断后的文本段
 */
export interface TruncatedSegment {
  type: 'text' | 'highlight' | 'ellipsis';
  content: string;
}
```

**优先级**: 中等
**工作量**: 2-3 小时

---

### 3.3 性能问题

#### 问题 6: 多个 Turn 的 API 请求未优化

**当前状态**: `CommitSourceContext` 为每个 turn_hash 单独发起 API 请求

```typescript
// CommitSourceContext.tsx:292-344
await Promise.all(
  hashesToFetch.map(async (turnHash) => {
    const context = await api.fetchTurnContext(turnHash, { before: 0, after: 0 });
    // ...
  })
);
```

**问题**:
- N 个 turn 发起 N 次请求
- 无请求缓存
- 无请求去重

**优化建议**:
```typescript
// 方案 1: 批量 API
// POST /api/v1/turns/batch-context
// Body: { turn_hashes: ["sha256:a", "sha256:b", ...] }

// 方案 2: 客户端缓存 (已在 MergeWorkspaceStore 中部分实现)
// 扩展到 CommitSourceContext

// 方案 3: SWR/React Query 集成
import useSWR from 'swr';

function useTurnContext(turnHash: string) {
  return useSWR(
    turnHash ? `/api/v1/turns/${turnHash}/context` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
}
```

**优先级**: 中等
**工作量**: 4-6 小时

---

#### 问题 7: 内容完整性检查开销

**当前状态**: 每次渲染都重新计算 Jaccard 相似度

```typescript
// CommitSourceContext.tsx:165-192
function calculateSimilarity(a: string, b: string): number {
  // 分词 + Set 操作
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  // ...
}
```

**优化建议**:
1. 使用 `useMemo` 缓存计算结果
2. 考虑移到 Web Worker 处理大文本
3. 或在 API 层预先计算并返回

**优先级**: 低
**工作量**: 1-2 小时

---

### 3.4 用户体验问题

#### 问题 8: 缺少键盘导航支持

**当前状态**: 冲突解决按钮仅支持鼠标点击

**规范暗示**: 用户应能快速操作

**优化建议**:
```typescript
// 添加键盘快捷键
// A = Keep A (Source)
// B = Keep B (Target)
// X = Keep Both
// E = Edit

useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key.toLowerCase()) {
      case 'a': onResolve('source'); break;
      case 'b': onResolve('target'); break;
      case 'x': onResolve('both'); break;
      case 'e': onResolve('edit'); break;
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [onResolve]);
```

**优先级**: 低
**工作量**: 1 小时

---

#### 问题 9: 长对话加载状态不够友好

**当前状态**: 只有简单的 Spinner

**优化建议**:
1. 添加骨架屏 (Skeleton) 加载状态
2. 显示加载进度 (如 "Loading 2/5 turns...")
3. 分批渲染已加载的内容

**优先级**: 低
**工作量**: 2-3 小时

---

#### 问题 10: 移动端响应式不足

**当前状态**: MergePanel 固定 `w-96` 宽度

```typescript
// MergePanel.tsx:62
<div className="fixed right-0 top-0 h-full w-96 ...">
```

**优化建议**:
```typescript
<div className="fixed right-0 top-0 h-full w-full sm:w-96 ...">
```

同样需要调整 `MergeConflictView` 的两列布局在移动端变为单列。

**优先级**: 低
**工作量**: 1-2 小时

---

## 四、优化优先级汇总

### 高优先级 (建议立即处理)

| # | 问题 | 工作量 | 理由 |
|---|------|--------|------|
| - | (无高优先级问题) | - | 核心功能已完成 |

### 中等优先级 (建议近期处理)

| # | 问题 | 工作量 | 理由 |
|---|------|--------|------|
| 1 | View Source 跳转 | 2-3h | 提升可追溯性，符合规范 |
| 3 | 截断算法统一 | 3-4h | 减少代码重复，降低维护成本 |
| 5 | 类型定义统一 | 2-3h | 提高代码一致性 |
| 6 | API 请求优化 | 4-6h | 提升加载性能 |

### 低优先级 (可后续处理)

| # | 问题 | 工作量 | 理由 |
|---|------|--------|------|
| 2 | Diff 内联上下文 | 4-6h | 增强功能，非阻塞性 |
| 4 | 高亮合并统一 | 1-2h | 小范围重复 |
| 7 | 完整性检查优化 | 1-2h | 性能影响有限 |
| 8 | 键盘导航 | 1h | 增强型功能 |
| 9 | 加载状态优化 | 2-3h | 用户体验增强 |
| 10 | 移动端响应式 | 1-2h | 移动端使用场景较少 |

---

## 五、建议实施路线

### 阶段 1: 代码重构 (约 1 天)

1. 创建 `lib/truncationUtils.ts` 统一截断算法
2. 创建 `lib/highlightUtils.ts` 统一高亮合并
3. 创建 `types/sourceContext.ts` 统一类型定义
4. 更新各组件引用新的共享模块

### 阶段 2: 功能完善 (约 0.5 天)

1. 实现 "View Source" 跳转功能
2. 添加对话页面的 URL 参数解析 (`?turn=xxx&highlight=start-end`)
3. 实现跳转后的滚动定位和高亮

### 阶段 3: 性能优化 (约 1 天)

1. 实现 Turn Context 批量 API
2. 客户端请求缓存/去重
3. 可选：集成 SWR/React Query

### 阶段 4: UX 增强 (可选，约 0.5 天)

1. 键盘快捷键
2. 骨架屏加载状态
3. 移动端响应式调整

---

## 六、相关文件索引

### 核心组件

```
apps/web/src/
├── components/
│   ├── canvas/
│   │   ├── CommitSourceContext.tsx    # 主显示组件
│   │   ├── TruncatedCommitView.tsx    # Canvas 紧凑预览
│   │   └── NodeModal/                 # 集成点 (split into sub-components)
│   │       ├── NodeModal.tsx          # Shell routing
│   │       ├── CommittedCommitView.tsx # Committed commit view
│   │       └── shared.tsx             # Shared sections (source context etc.)
│   ├── shared/
│   │   └── TurnBubble.tsx             # 对话气泡渲染
│   ├── diff/
│   │   ├── DiffDisplayView.tsx        # Diff 主视图
│   │   └── DiffSourceContextModal.tsx # 源追踪 Modal
│   └── merge/
│       ├── MergePanel.tsx             # Merge 主面板
│       ├── MergeConflictView.tsx      # 冲突视图
│       ├── ConflictSide.tsx           # 冲突侧显示
│       ├── ConflictSourceContext.tsx  # 冲突源上下文
│       ├── ConflictResolutionButtons.tsx
│       └── WordDiffDisplay.tsx
├── lib/
│   ├── api.ts                         # fetchTurnContext
│   └── diffUtils.ts                   # Diff 算法
└── types/
    └── nodes.ts                       # SentenceDisplay 类型
```

### 测试文件

```
apps/web/src/__tests__/components/canvas/CommitSourceContext.test.tsx
apps/web/e2e/source-context-fix.spec.ts
apps/web/e2e/diff-display-full.spec.ts
```

### 规范文档

```
docs/specification/commit-source-context-presentation.md
```

---

## 七、总结

T3X 的 Commit Source Context 功能已基本完成规范定义的四个阶段:

- **Phase 1 (Commit Display)**: ✅ 完成
- **Phase 2 (Compact Canvas)**: ✅ 完成
- **Phase 3 (Diff with Context)**: ✅ 完成
- **Phase 4 (Merge Conflict)**: ✅ 完成

主要待优化点集中在:

1. **功能完善**: View Source 跳转到对话页面
2. **代码质量**: 统一截断/高亮/类型定义
3. **性能优化**: API 请求批量化和缓存

建议按照上述实施路线分阶段进行优化，预计总工作量约 3 天。
