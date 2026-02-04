# UX Redesign: Progressive Disclosure & Next Step Navigation — Issue Breakdown

> Source: UX Redesign proposal (2026-02-03)
> Scope: apps/web (CommittedCommitView, PendingCommitView, CanvasNodes, Diff)
> Total: 12 issues across 5 independent phases
>
> **实施进度：**
> - Issue 1 (CommittedCommitView 单栏): ❌ 未实施 → demo-sprint B-5
> - Issue 2 (Layer 2 折叠区域): ❌ 未实施 → demo-sprint B-5
> - Issue 3 (Layer 3 Advanced): ❌ 未实施 → demo-sprint B-5, B-15
> - Issue 4 (NextStepCard 组件): ❌ 未实施 → demo-sprint B-4
> - Issue 5 (PendingCommitView Page 1): ✅ 已实施 → demo-sprint B-6
> - Issue 6 (PendingCommitView Page 2): ✅ 已实施 → demo-sprint B-6
> - Issue 7 (Commit 成功页): ❌ 未实施 → demo-sprint B-7
> - Issue 8 (Canvas 节点简化): ❌ 未实施 → demo-sprint B-8
> - Issue 9 (Canvas NextStep 状态): ❌ 未实施 → demo-sprint B-4
> - Issue 10 (Diff 入口重构): ❌ 未实施 → demo-sprint B-15
> - Issue 11 (空状态引导): ✅ 已实施 → demo-sprint B-10
> - Issue 12 (设计规范文档): ✅ 已有（本文档及 progressive-disclosure-redesign.md）

---

## Issue 1: CommittedCommitView 三栏布局改为单栏布局

**Phase**: 1
**Priority**: High
**Labels**: `ui-redesign`, `committed-view`

### Background

当前 `CommittedCommitView` 使用三栏布局（左侧栏 Metadata/Lineage/Pins + 中间 3 个 Tab + 右侧栏 Constraints/History/Diff），一次性展示 8 个功能区域。新用户打开弹窗后无所适从，不知道该看哪里。

### Requirements

1. 移除左侧栏和右侧栏，改为单栏垂直滚动布局
2. 顶部 Header 展示 commit 标题、分支名、hash 缩写、时间戳
3. Layer 1 区域（始终可见）包含：
   - 句子列表（完整展示，不再是 Tab 之一）
   - 约束标签（must/mustn't badges，紧跟句子下方）
   - Next Step 卡片（见 Issue 4）
4. 移除中间区域的 3 个 Tab（Source Context / Source Excerpt / JSON），这些内容将在 Issue 2 和 Issue 3 中以折叠区域重新呈现

### Affected Files

| File | Change Level |
|------|-------------|
| `apps/web/src/components/canvas/NodeModal/CommittedCommitView.tsx` (768 lines) | **Rewrite** |
| `apps/web/src/components/canvas/NodeModal/shared.tsx` | **Moderate refactor** |

### Acceptance Criteria

- [ ] 弹窗打开后只看到句子列表、约束标签和 Next Step 按钮
- [ ] 无左右侧栏，单栏布局在不同屏幕宽度下正常显示
- [ ] 现有功能无丢失（只是重新分层，不是删除）

---

## Issue 2: CommittedCommitView Layer 2 折叠区域

**Phase**: 1
**Priority**: High
**Labels**: `ui-redesign`, `committed-view`, `progressive-disclosure`

### Background

Source Context、Source Excerpt、Pin 管理、Version History、Linked Leaves 这些功能对熟练用户有价值，但不应在默认视图占据空间。需要以折叠手风琴的形式呈现在 Layer 1 下方。

### Requirements

1. 在 Layer 1（句子+约束+Next Step）下方添加以下折叠区域：
   - **Source Context**: 句子到会话的映射关系（合并原来的 Source Context 和 Source Excerpt 两个 Tab）
   - **Pinned Memory**: Pin 管理（从左侧栏迁移），显示 pin 数量
   - **Version History**: 内联时间线（从右侧栏按钮+Sheet 改为折叠区域），每个历史条目带 "[see changes]" 链接（见 Issue 10）
   - **Linked Leaves**: 关联的 Leaf 列表（从独立 LeafPanel Sheet 改为折叠区域），显示 leaf 数量
2. 所有区域默认折叠，点击标题展开
3. 展开方式 TBD：手风琴（同时只展开一个）或独立展开

### Affected Files

| File | Change Level |
|------|-------------|
| `CommittedCommitView.tsx` | **同 Issue 1 一起 rewrite** |
| `CommitHistoryPanel.tsx` | **Moderate** — 从 Sheet 组件改为内联折叠组件 |

### Acceptance Criteria

- [ ] 4 个折叠区域在 Layer 1 下方正确渲染
- [ ] 默认全部折叠，标题旁显示计数（如 "Pinned Memory (3 pins)"）
- [ ] 展开后内容完整，功能与迁移前一致
- [ ] Version History 中每条记录有 "[see changes]" 入口

---

## Issue 3: CommittedCommitView Layer 3 "Advanced" 区域

**Phase**: 1
**Priority**: Medium
**Labels**: `ui-redesign`, `committed-view`, `advanced`

### Background

Diff 比较、Raw JSON、Merge 操作是专家级功能，不应在默认视图中占据显眼位置。当前 Diff 操作需要 4 次点击（选目标 → Run Diff → 小预览 → Open Full Diff），对于一个 "Git for Meaning" 产品来说体验太差。

### Requirements

1. 在 Layer 2 折叠区域下方添加 "Advanced" 区域
2. 包含三个文字链接按钮（不是大按钮，视觉优先级低）：
   - **Compare Versions**: 打开 DiffFullScreen，带 commit 选择器
   - **Raw JSON**: 打开弹窗或展开区域，展示格式化 JSON
   - **Merge**: 仅对分支 commit 可见，启动 merge 流程
3. 移除原右侧栏中的 Diff 4 步操作链（select → run → preview → fullscreen）
4. `DiffFullScreen` 组件本身不做修改

### Affected Files

| File | Change Level |
|------|-------------|
| `CommittedCommitView.tsx` | **同 Issue 1/2 一起 rewrite** |
| `DiffFullScreen.tsx` | **None** — 组件不变，只是入口改变 |

### Acceptance Criteria

- [ ] Advanced 区域在页面底部，视觉优先级低
- [ ] Compare Versions 直接打开 DiffFullScreen（不再经过 mini preview）
- [ ] Merge 按钮仅在分支 commit 上可见
- [ ] Raw JSON 正常展示完整 commit 数据

---

## Issue 4: "Next Step" 状态机组件

**Phase**: 1 + 4
**Priority**: High
**Labels**: `ui-redesign`, `navigation`, `new-component`

### Background

当前用户 commit 后没有任何引导，不知道下一步该做什么。"Conversation → Commit → Leaf → Output" 这条路径需要用户已经了解系统才能走通。Next Step 组件解决这个问题——根据当前状态，始终展示一个明确的下一步操作按钮。

### Requirements

1. 创建可复用的 `NextStepCard` 组件
2. 接受当前状态作为输入，根据状态机渲染不同内容：

   **CommittedCommitView 中的状态：**

   | State | Label | Action |
   |-------|-------|--------|
   | 已提交，无 Leaf | "Create Output →" | 打开 LeafPanel |
   | 已提交，有 Leaf（未运行） | "Preview Output →" | 导航到 Leaf 详情 |
   | 已提交，Leaf 完成 | "Export →" | 打开导出操作 |
   | 已提交，分支上（最新） | "Merge to Main →" | 启动 merge 流程 |

   **Canvas 节点卡片中的状态（Issue 9 实现具体逻辑）：**

   | State | Label | Action |
   |-------|-------|--------|
   | Staging，空会话 | "Start Conversation →" | 打开 ConversationView |
   | Staging，有会话内容 | "Create Commit →" | 打开 PendingCommitView |
   | Committed，无 Leaf | "Create Output →" | 打开 LeafPanel |
   | Committed，有 Leaf（未运行） | "Preview Output →" | 导航到 Leaf 详情 |
   | Committed，Leaf 完成 | "Export →" | 导出操作 |

3. 视觉设计：卡片样式，带明显的 CTA 按钮，是所在区域中最醒目的元素
4. 状态派生逻辑放在 `canvasStore.ts` 或独立 hook 中

### Affected Files

| File | Change Level |
|------|-------------|
| 新建: `apps/web/src/components/ui/NextStepCard.tsx` | **New** |
| `CommittedCommitView.tsx` | 集成 NextStepCard |
| `CanvasNodes.tsx` | 集成 NextStepCard（Phase 4） |
| `canvasStore.ts` | 添加状态派生 helpers |

### Acceptance Criteria

- [ ] 组件根据不同状态正确渲染对应的 label 和 action
- [ ] 点击按钮正确触发对应操作
- [ ] 在 CommittedCommitView 和 Canvas 节点卡片中均可复用
- [ ] 状态优先级正确（如同时有 Leaf 和分支时，优先显示哪个）

---

## Issue 5: PendingCommitView 拆分 — Page 1 Configure

**Phase**: 2
**Priority**: High
**Labels**: `ui-redesign`, `pending-view`, `wizard`

### Background

当前 `PendingCommitView` 是一个 1560 行的单体组件，Step 1（配置）和 Step 2（编辑）同时展示在侧栏+编辑器布局中。配置面板和源内容编辑器争抢水平空间。需要拆分为分页向导，每次只展示一页。

### Requirements

1. 添加顶部进度指示器：`① Configure → ② Curate → ③ Success`
2. Page 1 "Configure" 全宽布局，包含：
   - **Layer 1（默认可见）**：
     - 意图文本框："What do you want to extract?"
     - 分支选择下拉框
   - **Layer 2（折叠，"Advanced Settings"）**：
     - Template 选择（prose 等）
     - 余弦阈值设置
3. 底部导航：`[Next →]` 按钮，进入 Page 2
4. 从 `PendingCommitView.tsx` 中提取 Page 1 相关逻辑到独立子组件
5. 在 `NodeModal.tsx` 中添加向导页面路由逻辑

### Affected Files

| File | Change Level |
|------|-------------|
| `PendingCommitView.tsx` (1560 lines) | **Split** — 提取配置逻辑 |
| 新建: `PendingConfigPage.tsx` | **New** |
| `NodeModal.tsx` | **Small** — 添加页面路由 |

### Acceptance Criteria

- [ ] Page 1 全宽显示，无侧栏
- [ ] 默认只看到意图输入和分支选择
- [ ] Template 和余弦阈值在 "Advanced Settings" 折叠内
- [ ] 点击 Next 正确切换到 Page 2
- [ ] 进度指示器正确反映当前步骤

---

## Issue 6: PendingCommitView 拆分 — Page 2 Curate

**Phase**: 2
**Priority**: High
**Labels**: `ui-redesign`, `pending-view`, `wizard`

### Background

当前源内容编辑器（文本选择+关键词标记）与侧栏共享水平空间，编辑区域受限。拆分到独立页面后，编辑器获得全宽空间。

### Requirements

1. Page 2 "Curate" 全宽布局，包含：
   - 全宽源内容编辑器（文本选择 + 关键词标记功能与现有一致）
   - 底部统计栏：`Selected: 5 sentences · 3 must-have · 1 mustn't-have`
   - 导航按钮：`[← Back]` 返回 Page 1，`[Commit →]` 执行提交
2. 从 `PendingCommitView.tsx` 中提取编辑器和 curate 逻辑到独立子组件
3. 页面间状态通过父组件或共享 state 传递（配置参数从 Page 1 带到 Page 2）

### Affected Files

| File | Change Level |
|------|-------------|
| `PendingCommitView.tsx` | **Split** — 提取编辑逻辑 |
| 新建: `PendingCuratePage.tsx` | **New** |

### Acceptance Criteria

- [ ] 编辑器获得全宽空间，无侧栏
- [ ] 文本选择和关键词标记功能与迁移前完全一致
- [ ] 底部统计栏实时更新选中内容的计数
- [ ] Back 按钮返回 Page 1 时保留之前的配置
- [ ] Commit 按钮触发提交流程

---

## Issue 7: Commit 成功页面 + 自动 Diff 摘要

**Phase**: 3
**Priority**: Medium
**Labels**: `ui-redesign`, `pending-view`, `diff`

### Background

当前提交成功后直接跳到 CommittedCommitView，用户没有得到明确的成功反馈，也不知道刚才的提交改了什么。需要一个专门的成功页面，自动展示变更摘要，并引导下一步操作。

### Requirements

1. Page 3 "Success" 页面，提交成功后展示：
   - 成功标志和提交摘要（句子数、约束数、分支名）
   - **自动 Diff 摘要**（如果存在父 commit）：
     - 调用 diff API（当前 commit vs 父 commit）
     - 展示变更统计：`+ 2 sentences added / ~ 1 sentence modified / - 0 sentences removed`
     - `[View full diff]` 链接打开 DiffFullScreen
   - **Next Step 卡片**："Create Output →"
   - 次要操作链接：`▸ View commit details`、`▸ Create another commit`
2. 如果没有父 commit（第一个 commit），跳过 diff 摘要部分
3. 可能需要在 `api.ts` 中添加轻量 diff 摘要接口（只返回 added/modified/removed 计数，不返回完整 diff 数据）

### Affected Files

| File | Change Level |
|------|-------------|
| 新建: `CommitSuccessPage.tsx` | **New** |
| `apps/web/src/lib/api.ts` | **Small** — 可能需要 diff 摘要 helper |

### Acceptance Criteria

- [ ] 提交成功后显示专门的成功页面（不直接跳到 CommittedCommitView）
- [ ] 变更摘要自动生成，无需用户操作
- [ ] Next Step 正确引导到创建 Leaf
- [ ] 第一个 commit（无父 commit）时优雅处理，不显示 diff 区域

---

## Issue 8: Canvas 节点卡片简化

**Phase**: 4
**Priority**: Medium
**Labels**: `ui-redesign`, `canvas`

### Background

当前 Canvas 节点卡片默认展示大量信息：句子列表（最多 3 条）、约束 badges、作者 badge、hash、V4 标记、Leaves 区域及其状态。在画布概览场景下信息密度过高。

### Requirements

1. 卡片 Layer 1（默认可见）只展示：
   - Commit 标题 + 分支标签
   - 统计摘要：`5 sentences · 3 constraints`
   - Next Step 按钮（最醒目的元素）
2. 卡片 Layer 2（折叠区域）：
   - `▸ 3 sentences preview`：展开显示前 3 条句子
   - `▸ 2 leaves attached`：展开显示关联 Leaf 列表
3. 以下信息移到展开/弹窗视图（点击卡片打开 NodeModal 后才能看到）：
   - Hash 值
   - Author badge
   - V4 badge
4. 卡片尺寸应比现有设计更紧凑

### Affected Files

| File | Change Level |
|------|-------------|
| `apps/web/src/components/canvas/CanvasNodes.tsx` | **Moderate** — 布局重构 |

### Acceptance Criteria

- [ ] 卡片默认只显示标题+统计+Next Step
- [ ] 折叠区域点击正确展开
- [ ] 画布整体视觉更清爽，卡片更紧凑
- [ ] 不影响卡片的拖拽、连线等 canvas 交互功能

---

## Issue 9: Canvas 节点 Next Step 状态派生逻辑

**Phase**: 4
**Priority**: Medium
**Labels**: `ui-redesign`, `canvas`, `state-management`

### Background

Canvas 级别的 Next Step 按钮需要根据节点的完整生命周期状态来决定展示内容。这需要在 canvasStore 中添加状态派生逻辑。

### Requirements

1. 在 `canvasStore.ts` 中添加 helper 函数，根据节点数据派生 Next Step 状态：

   ```typescript
   function deriveNextStep(node: CanvasNode): NextStepState {
     // Staging + 空会话 → "Start Conversation"
     // Staging + 有会话内容 → "Create Commit"
     // Committed + 无 Leaf → "Create Output"
     // Committed + 有 Leaf（未运行） → "Preview Output"
     // Committed + Leaf 完成 → "Export"
   }
   ```

2. 状态判断所需数据：
   - 节点类型（staging / committed）
   - 会话是否有内容（turn 数量 > 0）
   - 是否有关联 Leaf
   - Leaf 运行状态
3. 将 `NextStepCard` 组件（Issue 4）集成到 Canvas 节点卡片中

### Affected Files

| File | Change Level |
|------|-------------|
| `apps/web/src/store/canvasStore.ts` | **Small** — 添加派生函数 |
| `CanvasNodes.tsx` | 集成 NextStepCard |

### Acceptance Criteria

- [ ] 状态派生逻辑正确覆盖所有 5 种状态
- [ ] 节点数据变化时 Next Step 自动更新
- [ ] 有单元测试覆盖状态派生逻辑

---

## Issue 10: Diff 入口点重构

**Phase**: 1 + 3
**Priority**: Medium
**Labels**: `ui-redesign`, `diff`

### Background

当前 Diff 是 "Git for Meaning" 产品的核心功能之一，但被埋在右侧栏的 4 步操作链中。需要按三层模型重新设计入口点，让最常见的 diff 场景（"刚才改了什么？"）零点击可见。

### Requirements

1. **Layer 1 — 被动展示（0 clicks）**：
   - 在 Commit 成功页面（Issue 7）自动展示变更摘要
   - 这是最常见的 diff 场景，无需用户操作

2. **Layer 2 — 从 Version History 进入（2 clicks）**：
   - 在 CommittedCommitView 的 Version History 折叠区域（Issue 2）中
   - 每条历史记录旁有 `[see changes]` 链接
   - 点击直接打开 `DiffFullScreen`，自动设置 base=父commit, target=当前commit
   - 对比当前的 4 次点击，减少到 2 次

3. **Layer 3 — 任意比较（2 clicks）**：
   - CommittedCommitView 底部 Advanced 区域（Issue 3）的 "Compare Versions" 链接
   - 打开 DiffFullScreen 并带 commit 选择器
   - 允许选择任意两个 commit 进行比较

4. **移除**：
   - 右侧栏中的 "select target → Run Diff → mini preview → Open Full Diff" 4 步流程
   - mini diff preview 组件（不再需要中间态）

### Affected Files

| File | Change Level |
|------|-------------|
| `CommittedCommitView.tsx` | 配合 Issue 1-3 的 rewrite |
| `CommitSuccessPage.tsx` | 配合 Issue 7 |
| `DiffFullScreen.tsx` | **None** — 组件本身不变 |

### Acceptance Criteria

- [ ] 成功页面自动展示变更摘要（零点击）
- [ ] Version History 中 "[see changes]" 直接打开 DiffFullScreen（2 次点击）
- [ ] Advanced 区域 "Compare Versions" 打开带选择器的 DiffFullScreen
- [ ] 原 4 步操作链完全移除

---

## Issue 11: 空状态和错误引导系统

**Phase**: 5
**Priority**: Medium
**Labels**: `ui-redesign`, `ux`, `new-component`

### Background

当前空状态和错误场景只显示简单文本或禁用按钮，新用户完全不知道该怎么办。每个空/错误状态都应该变成一个教学机会，提供可操作的引导。

### Requirements

1. 创建可复用组件：
   - `EmptyState`: 接受 title、description、action（可选按钮/链接）
   - `ErrorGuidance`: 接受 error context、guidance text、retry action

2. 覆盖以下场景：

   | Scenario | Current | New |
   |----------|---------|-----|
   | 新单元，空会话 | 空白弹窗 | "Start a conversation to capture knowledge. Type your first message below." |
   | Draft，无 source 连接 | "No source content" | "Connect an upstream conversation or commit to provide source material." + [How to connect] 链接 |
   | Committed，无 Leaf | 无提示 | Next Step: "Create Output →" + 副标题 "Outputs let you publish, evaluate, or deploy your knowledge." |
   | Diff，仅 1 个 commit | "Compare with..." 按钮禁用 | 隐藏 Diff 入口（没有可比较的对象） |
   | 提交失败 | 侧栏中的错误文字 | 全宽错误 banner + 具体引导 + [Retry] 按钮 |
   | History，单个 commit | 空时间线 | "This is the first commit on this branch. Future commits will appear here as a timeline." |

3. 在 ConversationView、PendingCommitView、CommittedCommitView 中集成这些组件

### Affected Files

| File | Change Level |
|------|-------------|
| 新建: `apps/web/src/components/ui/EmptyState.tsx` | **New** |
| ConversationView / PendingCommitView / CommittedCommitView | **Small** — 替换现有空/错误状态 |

### Acceptance Criteria

- [ ] 所有 6 种场景有对应的引导文案和操作按钮
- [ ] 组件可复用，接受配置化的 title/description/action
- [ ] 引导文案准确且有帮助，不是泛泛的 "Something went wrong"

---

## Issue 12: 三层能力模型设计规范文档

**Phase**: 0 (前置)
**Priority**: Low
**Labels**: `docs`, `design-system`

### Background

三层渐进式披露模型（Layer 1 Default / Layer 2 Proficient / Layer 3 Expert）是本次重新设计的核心原则。需要将功能分配表正式文档化，作为后续所有 Issue 实现时的参考标准。

### Requirements

1. 在 `docs/frontend-design-principles.md` 中补充三层能力模型章节，包括：
   - 三层定义（受众、默认可见性、包含功能）
   - 完整的功能分配表（所有现有功能 + 层级 + 当前位置 + 新位置）
   - 设计决策原则：
     - 每个视图必须回答三个问题：Where am I? / What's next? / Stuck?
     - 默认展示 Layer 1，Layer 2 折叠，Layer 3 藏在 Advanced
     - Next Step 是每个视图中最醒目的元素
2. 功能分配表：

   | Feature | Layer | Visible by Default? |
   |---------|-------|---------------------|
   | 句子列表 | 1 | Yes |
   | 约束标签 | 1 | Yes |
   | Next Step 按钮 | 1 | Yes |
   | Source Context 映射 | 2 | No (折叠) |
   | Pin 管理 | 2 | No (折叠) |
   | Version History | 2 | No (折叠) |
   | Linked Leaves | 2 | No (折叠) |
   | Diff 比较 | 3 | No (Advanced) |
   | Raw JSON | 3 | No (Advanced) |
   | Merge 操作 | 3 | No (Advanced) |
   | Metadata/Lineage | 3 | No (Advanced) |

3. 作为后续 Issue 1-11 实现时的设计依据

### Affected Files

| File | Change Level |
|------|-------------|
| `docs/frontend-design-principles.md` | **Moderate** — 添加新章节 |

### Acceptance Criteria

- [ ] 三层模型定义清晰，功能分配无歧义
- [ ] 后续 Issue 实现时可直接参考此文档判断功能归属

---

## Phase 依赖关系

```
Phase 0: Issue 12 (设计规范文档)
         ↓ (参考，非硬依赖)
Phase 1: Issue 1 + 2 + 3 + 4(部分) + 10(部分)  — CommittedCommitView 重写
Phase 2: Issue 5 + 6                             — PendingCommitView 拆分
Phase 3: Issue 7 + 10(部分)                      — Commit 成功页 + 自动 Diff
Phase 4: Issue 8 + 9 + 4(部分)                   — Canvas 卡片简化
Phase 5: Issue 11                                — 空状态引导系统
```

> 每个 Phase 产出独立可部署的 PR，Phase 之间无硬依赖。
