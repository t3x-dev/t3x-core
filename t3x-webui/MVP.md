# T3X WebUI MVP 文档

## 根本要求

1. **必须使用真实的 core 数据**：所有数据来自后端 API，禁止使用模拟数据或假数据填充
2. **基于现有 WebUI 代码**：在现有组件上修改/重构，不新建平行组件或页面

**硬性约定**：
- 若必须接口/字段缺失，视为阻塞，不可用 mock 填充
- 所有新视图必须有显式的 loading/error 状态
- 调用失败降级为"功能不可用"或空白，不显示假数据

---

## 目标

以"**看清语义演化、低跳转、易操作**"为第一指标，兼顾分支/冲突可视化。

---

## 现有代码基础

### 复用的组件（修改/重构，不新建）

| 组件 | 文件 | 当前状态 | MVP 改动 |
|------|------|----------|----------|
| NodeModal | `NodeModal.tsx` | 已有 Manage/Commit 模式 | 重构为三步流，接通真实 turns |
| CanvasNodes | `CanvasNodes.tsx` | 已有三种节点类型 | 增加内联信息显示 |
| CanvasWorkspace | `CanvasWorkspace.tsx` | 已有 ReactFlow 画布 | 增加 Diff 抽屉入口 |
| LeafPanel | `LeafPanel.tsx` | 已有输出类型选择 | 保持现状（MVP 不改） |
| SelectableTextBlock | `SelectableTextBlock.tsx` | 已有文本选择功能 | 继续使用 |
| ConstraintsPanel | `ConstraintsPanel.tsx` | 已有约束显示 | 增加来源链显示 |

### 复用的 Store

| Store | 文件 | 说明 |
|-------|------|------|
| canvasStore | `canvasStore.ts` | 节点/边/加载状态管理 |
| projectStore | `projectStore.ts` | 项目列表管理 |

### 样式基础

- 在现有 `index.css` 基础上统一 CSS 变量
- 不新建独立样式文件
- 保留现有蓝/橙色彩体系

---

## 数据契约

### 必须接口（缺失视为阻塞）

| 接口 | 必须字段 | 用途 |
|------|----------|------|
| `GET /api/v1/projects` | project_id, name | 项目列表 |
| `GET /api/v1/conversations?project_id=` | conversation_id, project_id, title | 对话列表 |
| `GET /api/v1/turns?conversation_id=` | turn_hash, role, content, created_at | 对话内容显示、Turn Window 选择 |
| `GET /api/v1/branches?project_id=` | name, is_current | Step 1 分支下拉 |
| `GET /api/v1/commits?project_id=` | commit_hash, branch, parent_hashes, must_have, mustnt_have, facet_snapshot | Commit 列表、Constraints 来源链推导 |
| `POST /api/v1/commits` | 返回完整 Commit 对象 | 创建 Commit |
| `POST /api/v1/diff` | facet_changes, segment_changes | Diff 抽屉显示 |
| `POST /api/v1/agent/drafts` | validation.missing_keywords, validation.forbidden_keywords | Step 3 校验结果 |

### Draft API 调用契约

```
POST /api/v1/agent/drafts
{
  "project_id": string,        // 必填
  "conversation_id": string,   // 必填
  "bridge_id": "plan" | "summary" | "explain" | "clarify",  // 必填
  "intent": string,            // 必填
  "base_commit_hash": string,  // 可选
  "turn_anchor_hash": string   // 可选
}

Response.validation: {
  "passed": boolean,
  "missing_keywords": string[],
  "forbidden_keywords": string[]
}
```

### 排序契约

- `listTurns` 返回按 `created_at` 升序排列（oldest first）
- Turn Window 的 start/end 基于此顺序选择

### 已知限制

| 限制 | 说明 | MVP 处理 |
|------|------|----------|
| Leaf 无后端 API | 当前 Leaf 只存在于前端内存 | MVP 保持现状，不改 LeafPanel |
| Constraints 来源链仅支持单父 | 算法用 `parent_hashes[0]`，多父（merge）会不准确 | 声明"仅支持单父线性历史；多父暂不支持来源链" |
| Edge Diff 仅支持父子关系 | Base 默认为 parent | 若节点无 parent，Diff 按钮禁用 |

---

## 设计方向

### 主视图：ReactFlow Graph（保留现有 CanvasWorkspace）

```
┌─────────────────────────────────────────────────────────────────┐
│  项目: xxx                    [Editor] [Execution]              │
├────────────────┬────────────────────────────────────────────────┤
│                │                                                │
│   对话列表      │              Graph 区域（ReactFlow）           │
│                │                                                │
│   [Conv A] ●───┼───→ [Commit 1] ──+2/-0/~1──→ [Commit 2]       │
│                │          │                      │              │
│   [Conv B] ●───┼───→ [Pending]              就地展开            │
│                │     (显示步骤进度)                              │
│   + 新对话      │                                                │
│                │                                                │
├────────────────┼────────────────────────────────────────────────┤
│                │   [Diff 抽屉 - 从右侧滑入]                      │
└────────────────┴────────────────────────────────────────────────┘
```

### 核心交互

- **节点点击** → NodeModal 内联展开详情
- **Diff 操作** → CanvasWorkspace 右侧抽屉
- **Constraints** → NodeModal 中显示来源链
- **Execution 模式** → 显示选中 commit 的 facet_snapshot（真实数据）

---

## 实施步骤

### 1. 稳定性 & 数据打通

**目标**：现有功能正常使用，数据真实

**NodeModal 对话加载**：
- [ ] 调用 `listTurns(projectId, conversationId)` 获取真实对话
- [ ] 按 `created_at` 排序显示
- [ ] 显示 loading 状态
- [ ] 空对话显示"暂无对话内容"
- [ ] API 错误显示错误信息，不用假数据填充

**Manage 模式汇总文本**：
- [ ] 从 `listTurns` 结果拼接 content 字段
- [ ] 传递给 ManageMode 组件的 `text` prop
- [ ] 不使用静态 summary 或 placeholder

**其他稳定性**：
- [ ] 修复 Canvas 加载/删除/锁定/连线问题
- [ ] 确保 position 持久化正常工作

### 2. 样式收口

**目标**：在现有 index.css 基础上统一

- [ ] 定义 CSS 变量（`--color-primary`, `--spacing-*`, `--radius-*`）
- [ ] 统一按钮样式（primary/secondary/ghost）
- [ ] 统一卡片/面板样式
- [ ] 统一 loading skeleton 样式
- [ ] 统一 error 提示样式

### 3. 节点内联信息

**目标**：节点一眼能看到关键信息（在 CanvasNodes.tsx 上增量修改）

**Commit 节点**：
- [ ] 显示分支名（从 `commit.branch`）
- [ ] 显示 hash 短码（`commit_hash` 前 8 位）
- [ ] 显示 facet 计数（从 `facet_snapshot` 计算）
- [ ] 状态徽章（committed/pending）

**Pending 节点**：
- [ ] 显示当前步骤（1/3, 2/3, 3/3）
- [ ] 显示约束统计（从 `must_have`/`mustnt_have` 计算）

### 4. Pending Commit 三步流

**目标**：清晰的提交工作流（在 NodeModal.tsx 内重构）

```
┌─────────────────────────────────────────────────────────────────┐
│  Pending Commit: from Conv A                              [×]   │
├─────────────────────────────────────────────────────────────────┤
│  ● Step 1   ○ Step 2   ○ Step 3                                 │
│  Configure    Refine     Validate                               │
└─────────────────────────────────────────────────────────────────┘
```

**Step 1: Configure（配置）**
```
┌─────────────────────────────────────────────────────────────────┐
│  Branch:        [main ▼]    ← 调用 listBranches 获取真实列表    │
│  Parent Commit: [选择或留空 ▼]                                   │
│  Turn Window:   [start ▼] to [end ▼]  ← 从 listTurns 获取选项   │
│                                                                 │
│  来源预览（从 turns 拼接，真实数据）：                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ User: 我想找一台轻薄本...                                │    │
│  │ Assistant: 好的，请问预算是多少？                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                    [Proceed →]  │
└─────────────────────────────────────────────────────────────────┘
```

**Step 2: Refine（精修）**
```
┌─────────────────────────────────────────────────────────────────┐
│  Source Excerpt（复用 SelectableTextBlock）：                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ [浅绿=包含] 我想找一台轻薄本                              │    │
│  │ [浅红=排除] 这个不太重要                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Constraints（可编辑）：                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ✓ must_have: 轻薄, 预算                                  │    │
│  │ ✗ mustnt_have: 游戏本                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                            [← Back] [Proceed →] │
└─────────────────────────────────────────────────────────────────┘
```

**Step 3: Validate（验证/提交）**
```
┌─────────────────────────────────────────────────────────────────┐
│  提交预览：                                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Branch: main                                            │    │
│  │ Turn window: 5 turns                                    │    │
│  │ Constraints: 2 must_have, 1 mustnt_have                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [Generate Draft] → 调用 POST /api/v1/agent/drafts              │
│                                                                 │
│  校验结果（从 response.validation 获取，不可伪造）：             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Loading...  或                                          │    │
│  │ ✓ Validation passed  或                                 │    │
│  │ ✗ Missing: keyword1, keyword2                           │    │
│  │ ✗ Forbidden: keyword3                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [← Back] [Commit ✓]  ← 校验失败时 Commit 按钮禁用              │
└─────────────────────────────────────────────────────────────────┘
```

**节点 ID 策略**：
- 提交成功后，保持 ReactFlow 内部节点 ID 不变
- 另存 `commit_hash` 字段到节点 data 中
- 更新边的引用时使用内部 ID，避免断边

**错误处理**：
- Draft API 调用失败：显示错误信息，Commit 按钮禁用
- Commit API 调用失败：保持 pending 状态，显示错误

### 5. Constraints 来源链

**目标**：看清约束从哪来、被谁改过（在 NodeModal 或 ConstraintsPanel 中显示）

**推导算法**（仅支持单父线性历史）：
```
1. 获取当前 pending 的 must_have/mustnt_have
2. 获取 parent commit（parent_hashes[0]）的 must_have/mustnt_have
3. 对比：
   - 在当前有，在 parent 无 → "来源: 本次添加"
   - 在当前有，在 parent 也有，值相同 → "来源: 继承自 {parent_hash}"
   - 在当前有，在 parent 也有，值不同 → "来源: 继承自 {parent_hash}，本次修改"
   - 在 parent 有，在当前无 → "来源: 继承自 {parent_hash}，本次删除"
```

**多父情况**：显示"多父 commit 暂不支持来源追溯"

**UI 展示**：
```
┌─────────────────────────────────────────────────────────────────┐
│  Constraints 来源                                               │
├─────────────────────────────────────────────────────────────────┤
│  must_have:                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ✓ "轻薄"                                                │    │
│  │   └─ 来源: 本次添加                                      │    │
│  │ ✓ "预算"                                                │    │
│  │   └─ 来源: 继承自 abc12345                              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 6. 基础 Diff 抽屉

**目标**：就地查看两个 commit 的差异（在 CanvasWorkspace 中增加右侧抽屉）

**入口**：
- 选中 Commit 节点 → 操作菜单中的 "Diff" 按钮
- 若节点无 parent（`parent_hashes` 为空），Diff 按钮禁用

**Base/Target 规则**：
- Base = `parent_hashes[0]`（第一个父）
- Target = 当前节点
- 不支持手选（MVP 限制）

**数据来源**：
- 调用 `POST /api/v1/diff` 获取真实数据
- 显示 loading 状态
- 调用失败显示"无法加载 Diff"，不显示假数据

**UI**：
```
┌─────────────────────────────────────────────────────────────────┐
│  Diff: abc123 → def456                                    [×]   │
├─────────────────────────────────────────────────────────────────┤
│  [Loading...]  或                                               │
│                                                                 │
│  Facets:                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ + [added] user prefers dark mode                        │    │
│  │ - [removed] user prefers light mode                     │    │
│  │ ~ [modified] budget: 3000 → 5000                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Segments:                                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ + 2 added                                               │    │
│  │ - 1 removed                                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  或 [Error: 无法加载 Diff]                                      │
└─────────────────────────────────────────────────────────────────┘
```

### 7. Edge Diff 标注（可选）

**目标**：边上显示简要变更统计

```
[Commit A] ──+2/-1/~0──→ [Commit B]
```

**触发时机**：
- 选中节点时，请求该节点与其 parent 的 diff
- 缓存结果，避免重复请求
- 不全图批量请求

**降级**：
- 请求失败或节点无 parent：不显示标注（边保持空白）
- 不使用假计数

---

## Execution 模式

MVP 阶段 Execution 模式做基础展示：

- [ ] 显示选中 commit 的 `facet_snapshot`（来自真实 commit 数据）
- [ ] 显示关联的 Leaf 节点（来自 canvasStore 中的节点数据）
- [ ] 若无选中 commit，显示"请选择一个 Commit 查看"
- [ ] 不做复杂的执行流可视化

---

## 验收场景

### 场景 1: 创建 Commit

1. 打开一个有对话的项目
2. 从 Conversation 创建 Pending Commit
3. Step 1: 选择分支（从真实 API 获取）和 Turn Window
4. Step 2: 编辑 source，调整约束
5. Step 3: 生成 Draft（调用真实 API），查看校验结果，提交
6. 验证 Commit 出现在画布上

**验收标准**：
- [ ] 所有下拉选项来自真实 API
- [ ] 校验结果来自 Draft API 返回
- [ ] 操作步数 ≤ 10
- [ ] 无 mock 数据

### 场景 2: 查看 Diff

1. 选中一个有 parent 的 Commit 节点
2. 点击 "Diff" 按钮
3. 在抽屉中查看差异

**验收标准**：
- [ ] Diff 数据来自 `/api/v1/diff` 调用
- [ ] 有 loading 状态
- [ ] 无 parent 时按钮禁用
- [ ] 操作步数 ≤ 5

### 场景 3: 查看 Constraints 来源

1. 打开一个 Pending Commit
2. 进入 Step 2 或查看 Constraints 面板
3. 能看到每个约束的来源

**验收标准**：
- [ ] 来源基于真实的 parent commit 数据推导
- [ ] 多父 commit 明确提示不支持

---

## 交付迭代

### 迭代 1：稳定性 + 样式

**范围**：
- 步骤 1（稳定性 & 数据打通）
- 步骤 2（样式收口）

**硬性要求**：
- NodeModal 必须显示真实对话内容
- 若 listTurns API 不可用，视为阻塞
- 不可用 mock/placeholder 填充

**验收**：
- [ ] 打开 NodeModal 能看到真实对话
- [ ] 样式统一，无明显视觉问题

### 迭代 2：节点增强 + 三步流

**范围**：
- 步骤 3（节点内联信息）
- 步骤 4（Pending Commit 三步流）

**硬性要求**：
- Step 1 分支下拉必须来自 listBranches API
- Step 3 校验必须来自 Draft API
- 不可硬编码分支列表或伪造校验结果

**验收**：
- [ ] 能完成"创建 Commit"场景
- [ ] 所有数据来自真实 API

### 迭代 3：Constraints + Diff

**范围**：
- 步骤 5（Constraints 来源链）
- 步骤 6（基础 Diff 抽屉）

**硬性要求**：
- Diff 数据必须来自 `/api/v1/diff`
- 调用失败降级为"功能不可用"，不显示假数据

**验收**：
- [ ] 能完成"查看 Diff"场景
- [ ] 能完成"查看 Constraints 来源"场景

### 迭代 4：Edge 标注 + Polish

**范围**：
- 步骤 7（Edge Diff 标注）
- 整体 UX polish
- 边界场景处理

**验收**：
- [ ] 三个验收场景全部通过
- [ ] 边界情况有合理处理（loading/error/empty）

---

## 文件改动预估

| 文件 | 改动类型 | 迭代 | 说明 |
|------|----------|------|------|
| NodeModal.tsx | 重构 | 1,2 | 聊天加载 + 三步流 |
| CanvasNodes.tsx | 增量修改 | 2,4 | 节点内联信息 + edge 标注 |
| CanvasWorkspace.tsx | 增量修改 | 3 | Diff 抽屉入口 |
| canvasStore.ts | 修改 | 1,2 | 数据加载 + 提交逻辑 |
| ConstraintsPanel.tsx | 增量修改 | 3 | 来源链显示 |
| index.css | 修改 | 1 | 样式收口，定义 CSS 变量 |
| 新增 DiffDrawer.tsx | 新增 | 3 | Diff 抽屉组件（嵌入 CanvasWorkspace） |

---

## 不在 MVP 范围

- ❌ Merge 抽屉（冲突解决）
- ❌ 分支创建/切换 UI
- ❌ 导出功能
- ❌ 搜索和过滤
- ❌ 手选 Diff base/target
- ❌ 多父 commit 的来源链
- ❌ LeafPanel 改动
- ❌ Agent Demo 页面
- ❌ Insights 页面
- ❌ 移动端适配
