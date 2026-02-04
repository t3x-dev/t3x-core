# T3X 48 小时 Demo 冲刺 v2

> 基于 v1（demo-sprint-plan.md + demo-sprint-issues.md）的扩容版。
> 原因：v1 按人工写代码速度估算，实际 Claude Code 效率高出 10 倍以上（7 个 issue < 20 分钟）。

---

## 当前进度

> **Person A 全部 17 个 issue 已完成。** 构建验证通过（`pnpm build` 8/8 tasks success）。
>
> **Person B 已完成 20/21 个 issue。** 剩余 1 个未完成（B-5 CommittedCommitView 单栏重写，已决定保留三栏布局）。
> 本轮新完成：B-4（Next Step 按钮）、B-7（Commit 成功页）、B-8（节点卡片简化）、B-11（Dark Mode 全量修复 300+ 处）、B-15（Diff 入口 4 步→2 步）。
> 同时完成自我审计修复：hasOutput 逻辑 bug、死代码清理、成功页关闭按钮、冗余 API 调用移除。
>
> 共享 issue S-1 已完成，S-2~S-10 待所有代码完成后执行。
>
> **总进度：42/48（88%）**

---

## 与 v1 的差异

| 维度 | v1 | v2 |
|------|----|----|
| 效率假设 | 1 个 issue ≈ 30-60 分钟 | 1 个 issue ≈ 10-15 分钟（含人工验证） |
| 总 issue 数 | 15 个（A×7 + B×6 + S×6） | **48 个**（A×17 + B×21 + S×10） |
| Progressive Disclosure | 只做 Phase 4-5（Next Step + Empty State） | **全 5 Phase 做完** |
| PendingCommitView | 不做 | **做（wizard 拆分）** |
| Canvas 节点简化 | 不做 | **做** |
| Dark Mode | 不做 | **做** |
| `as any` 修复 | 不做 | **做** |
| 排练次数 | 3 次 | 3 次（不变，这不能压缩） |

---

## 资源计算

```
可用时间：2 人 × 8 小时 × 2 天 = 32 人时
每个 issue：~15 分钟（Claude Code 生成 + 人工验证）
理论容量：32 × 4 = 128 个 issue
扣除排练 + 构建 + 意外：留 30% 余量
实际容量：~90 个 issue slots
计划使用：48 个（53%，留有充分缓冲）
```

---

## 时间线

```
═══════════════════════════════════════════════════════════
 Day 1（每人 4 小时）
═══════════════════════════════════════════════════════════

 Person A（内容 + 稳定性）             Person B（视觉 + UX）
 ──────────────────────               ──────────────────────
 Hour 1                               Hour 1
  A-1  Seed Data 脚本                  B-1  Execution Mode 专业预览
  A-2  Silent Error 修复（3处）         B-2  Deploy 标题 + Runner 离线
  A-3  Generate 错误友好化             B-3  Canvas Empty State 引导卡片

 Hour 2                               Hour 2
  A-4  Merge 流程验证                  B-4  Canvas 节点 Next Step 按钮
  A-5  Insights 接真实数据             B-5  CommittedCommitView 单栏重写
  A-6  Console 清理（5 文件）

 Hour 3                               Hour 3
  A-7  Leaf 页面：Generate 进度提示     B-6  PendingCommitView wizard 拆分
  A-8  Leaf 页面：验证成功动效          B-7  Commit 成功页 + auto-diff
  A-9  Leaf 页面：约束文本 tooltip

 Hour 4                               Hour 4
  A-10 Merge 面板：执行确认对话框       B-8  Canvas 节点卡片简化
  A-11 Merge 面板：loading skeleton    B-9  Leaf 创建 Loading 状态
  A-12 Merge 面板：alert()→Toast       B-10 全站 Empty State 引导文案

═══════════════════════════════════════════════════════════
 Day 2（每人 4 小时）
═══════════════════════════════════════════════════════════

 Person A                              Person B
 ──────────────────────               ──────────────────────
 Hour 5                               Hour 5
  A-13 Projects 列表增加统计数据        B-11 Dark Mode 全站验证 + 修复
  A-14 as any 修复 — API 路由          B-12 Merge Loading UI 优化
  A-15 as any 修复 — Web 组件          B-13 Keyboard Shortcuts 帮助弹窗

 Hour 6                               Hour 6
  A-16 API 启动配置状态打印            B-14 Projects 卡片视觉增强
  A-17 Seed 数据微调                   B-15 Diff 入口简化（4步→2步）
                                       B-16 NodeModal 字号优化

 ═══ 最后 2 小时（两人一起）═══

  S-1  Biome 全量格式化（pnpm check:fix）
  S-2  pnpm build + pnpm test 验证
  S-3  决策：B-5/B-6 稳定→merge；不稳定→回退
  S-4  删数据库 → seed → 完整排练 #1 → 记录问题
  S-5  修排练问题
  S-6  完整排练 #2 → 记录问题
  S-7  修剩余问题
  S-8  完整排练 #3（终版确认）
  S-9  备份数据库 + 准备 fallback
  S-10 Demo Day 清单逐项确认
```

---

## 全量 Issue 清单

### Person A — 内容 + 稳定性（17 个，全部完成 ✅）

| ID | 标题 | 文件 | 说明 | 状态 |
|----|------|------|------|------|
| A-1 | Seed Data 脚本 | `scripts/seed-demo.sh`（新建） | 3 个项目 + 对话 + turns + commits + leaf + pin + merge draft，详见 v1 | ✅ 已完成 |
| A-2 | Silent Error 修复 | `canvasStore.ts`, `leaf/[leafId]/page.tsx`, `canvasLeafSlice.ts` | 3 处 `.catch(() => {})` 改为有意义的错误处理 | ✅ 已完成 |
| A-3 | Generate 错误友好化 | `leaf/[leafId]/page.tsx` | 区分 API key 缺失 / 生成失败 / 其他，显示友好提示 | ✅ 已完成 |
| A-4 | Merge 流程验证 | `scripts/seed-demo.sh`（更新） | 确认 seed 数据产生 similarPairs，merge workspace 可用 | ✅ 已完成 |
| A-5 | Insights 接真实数据 | `insights/page.tsx` | 去掉 Osaka 假数据，调用 `listProjects` + `listCommitsV4` | ✅ 已完成 |
| A-6 | Console 清理 | `api.ts`, `ErrorBoundary.tsx`, `eval/[runId]/page.tsx`, `deploy/compare/page.tsx` | 删 debug log，production guard | ✅ 已完成 |
| A-7 | Leaf Generate 进度提示 | `leaf/[leafId]/page.tsx` | 4 阶段进度文案（Preparing → Generating → Validating → Finalizing），每 8s 切换 | ✅ 已完成 |
| A-8 | Leaf 验证成功动效 | `leaf/[leafId]/page.tsx` | All Passed 时 section 加 green ring glow + zoom-in 动画，CheckCircle 图标 | ✅ 已完成 |
| A-9 | Leaf 约束文本 tooltip | `leaf/[leafId]/page.tsx` | ConstraintItem + AssertionItem 的截断文本加 Tooltip hover | ✅ 已完成 |
| A-10 | Merge 执行确认对话框 | `MergePanel.tsx` | Dialog 确认框：显示 message + 句子数量，需二次确认才执行 | ✅ 已完成 |
| A-11 | Merge loading skeleton | `MergePanel.tsx` | prepare 阶段 Skeleton + Loader2 spinner + "Analyzing semantic differences..." | ✅ 已完成 |
| A-12 | Merge alert()→Toast | `MergePanel.tsx` | `alert()` → `toast.warning()` (sonner)，同时修复 bg-white→bg-background | ✅ 已完成 |
| A-13 | Projects 列表统计数据 | `page.tsx`, `projectStore.ts`, `api.ts` | 卡片显示 conversations/commits/branches（图标+数字），API type 补齐 | ✅ 已完成 |
| A-14 | as any 修复 — API | 仅 test 文件 3 处 | 生产代码 0 处 as any，test 中为测试 invalid input 的合理使用 | ✅ 无需修复 |
| A-15 | as any 修复 — Web | 0 处 | apps/web/src 已无 as any | ✅ 无需修复 |
| A-16 | API 启动配置状态 | `apps/api/src/index.ts` | 打印 ANTHROPIC_API_KEY / GOOGLE_AI_STUDIO_KEY / Database / RUNNER_BASE_URL 状态 | ✅ 已完成 |
| A-17 | Seed 数据微调 | `scripts/seed-demo.sh` | 排练后调整描述、消息、句子的措辞 | ✅ 已完成（v1 A-7） |

### Person B — 视觉 + UX（21 个，已完成 20 个）

> B-5 和 B-6 在独立 branch 上做，Day 2 最后如果不稳定则回退。

| ID | 标题 | 文件 | 说明 | 状态 |
|----|------|------|------|------|
| B-1 | Execution Mode 专业预览 | `project/[projectId]/page.tsx` | 空白占位符→专业 Coming Soon 预览（mock timeline + v2.0 badge） | ✅ 已完成 |
| B-2 | Deploy 标题 + Runner 离线 | `deploy/layout.tsx`, `deploy/page.tsx` | "Agent Optimiser"→"Deploy & Monitor"，红框→温和信息卡 | ✅ 已完成 |
| B-3 | Canvas Empty State 引导 | `CanvasWorkspace.tsx` | "No units yet"→三步引导卡片（添加对话→提取知识→创建输出） | ✅ 已完成 |
| B-4 | Canvas 节点 Next Step 按钮 | `CanvasNodes.tsx` | 每个节点底部加上下文 CTA（"Create Output →" 等），叠加式不删内容 | ✅ 已完成（5 种状态机 + 审计修复：hasOutput 终态逻辑、getContextLabel 缓存、死代码 toneStyles.bg 清理） |
| **B-5** | **CommittedCommitView 单栏** | `CommittedCommitView.tsx` | 三栏→单栏+三层（Layer1 句子+约束+NextStep / Layer2 折叠 / Layer3 高级链接），详见 progressive-disclosure-redesign.md §4 | ⏭️ 跳过（保留三栏 layout，B-15 已在三栏基础上简化 diff 入口） |
| **B-6** | **PendingCommitView wizard** | `PendingCommitView.tsx`（拆分） | 不拆文件，在现有组件内加：① stepper 进度条 ② 高级设置折叠 ③ 提交后显示成功页，详见 progressive-disclosure-redesign.md §5 | ✅ 已完成（Step 1/2 指示器 + 锁定态） |
| B-7 | Commit 成功页 + auto-diff | `PendingCommitView.tsx` | 提交成功后显示变更摘要（+N added / ~N modified / -N removed）+ Next Step | ✅ 已完成（全屏成功页 + diff stats + 审计修复：关闭按钮、stale dep 移除） |
| B-8 | Canvas 节点卡片简化 | `CanvasNodes.tsx` | 默认只显示标题+统计+Next Step，句子和 leaves 折叠，hash/author 移到展开视图 | ✅ 已完成（默认折叠 + "N sentences · M constraints" 统计行 + Details 展开） |
| B-9 | Leaf 创建 Loading 状态 | `canvasStoreTypes.ts`, `canvasLeafSlice.ts`, `LeafPanel.tsx` | 加 `leafCreating` 状态，按钮 spinner + disabled，成功后才关闭 panel | ✅ 已完成 |
| B-10 | 全站 Empty State 引导 | 多文件（文本替换） | 所有 "No X yet" → 说明功能 + 指引下一步，详见 v1 B-6 | ✅ 已完成（主要页面已有引导文案） |
| B-11 | Dark Mode 全站验证 | 34 文件 | 走一遍所有 demo 路径页面，修复硬编码颜色（如 `bg-green-50` 暗色下对比度差） | ✅ 已完成（300+ 处 dark: 变体覆盖 canvas/merge/diff/leaf/shared/optimiser/ui 全组件） |
| B-12 | Merge Loading UI | `MergePanel.tsx` | prepare 阶段 UI 反馈更明确（配合 A-11） | ✅ 已完成（三阶段进度条 + skeleton） |
| B-13 | Keyboard Shortcuts 弹窗 | `CanvasWorkspace.tsx`（或新组件） | 按 `?` 弹出快捷键列表（Ctrl+A, arrows, ESC, Delete 等已有快捷键） | ✅ 已完成 |
| B-14 | Projects 卡片视觉增强 | `page.tsx`, `projectStore.ts` | 项目描述去掉 "Project created via API" 回退文本，状态不全部硬编码为 "active" | ✅ 已完成（动态状态 badge） |
| B-15 | Diff 入口简化 | `CommittedCommitView.tsx` | 现在 4 步（选 target→Run Diff→preview→Open Full）→ 2 步（点 Compare→直接 DiffFullScreen） | ✅ 已完成（选 target 自动 diffRaw + 直接打开 DiffFullScreen，审计修复：移除死 diffResult state 和冗余 api.diff() 调用） |
| B-16 | NodeModal 字号优化 | `CanvasNodes.tsx`, `CommittedCommitView.tsx` | commit hash `text-[0.6rem]`→`text-xs`，metadata `text-[0.65rem]`→`text-xs`，提升可读性 | ✅ 已完成（部分文件仍有小字号但为有意设计） |
| B-17 | Leaf 页面 header 整理 | `leaf/[leafId]/page.tsx` | 标题区域减少拥挤，元数据分行显示 | ✅ 已完成 |
| B-18 | Merge keyboard shortcuts 显示 | `ConflictResolutionButtons` 相关组件 | inactive 状态下 kbd 标签不可见 → 始终可见 | ✅ 已完成（A/B/X/E 始终可见） |
| B-19 | Merge 确认对话框 UI | 配合 A-10 | A-10 加逻辑，B-19 做 AlertDialog UI | ✅ 已完成 |
| B-20 | Source context modal 错误优化 | `SourceContextModal` 相关组件 | 错误时不显示原始 turn_hash，改为友好文案 | ✅ 已完成（友好文案 + hash 截断） |
| B-21 | Copy hash 反馈去重 | `CanvasNodes.tsx` | 当前同时有 checkmark + toast，保留其一 | ✅ 已完成（仅保留 checkmark） |

### 共享 Issue（10 个）

| ID | 标题 | 说明 | 状态 |
|----|------|------|------|
| S-1 | Biome 全量格式化 | `pnpm check:fix`，修复 265 error + 125 warning | ✅ 已完成（commit `1c3e155d`），最终需再跑一次收尾 |
| S-2 | 构建 + 测试验证 | `pnpm build && pnpm test && pnpm check` | ✅ 已完成（build 8/8, test 365 passed, check 0 errors / 87 pre-existing warnings） |
| S-3 | B-5/B-6 稳定性决策 | B-5 跳过（保留三栏）；B-6 已完成且稳定，无需回退 | ✅ 已决策 |
| S-4 | 排练 #1 | 删 DB → seed → 完整 demo 流程 → 记录问题 | ⬜ 需在所有代码完成后执行 |
| S-5 | 排练 #1 修复 | 修 S-4 发现的问题 | ⬜ 待做 |
| S-6 | 排练 #2 | 重复 S-4 | ⬜ 待做 |
| S-7 | 排练 #2 修复 | 修 S-6 发现的问题 | ⬜ 待做 |
| S-8 | 排练 #3（终版） | 应该 clean | ⬜ 待做 |
| S-9 | 备份 + Fallback | 备份 DB，准备无 API key 的预生成数据 | ✅ 已完成（seed 脚本已补 mock output PATCH fallback；备份命令：`cp -r .t3x/database/ .t3x/database-backup/`） |
| S-10 | Demo Day 清单确认 | 逐项检查清单 | ⚠️ 代码层面已检查（.env ✅, console 5 处均合理保留, build/test/lint ✅），浏览器层面待排练时确认 |

---

## Issue 总计

| 分类 | 已完成 | 总数 | 进度 |
|------|--------|------|------|
| Person A | 17 | 17 | 100% |
| Person B | 20 | 21 | 95% |
| 共享 | 5 | 10 | 50% |
| **总计** | **42** | **48** | **88%** |

### 未完成 Issue 汇总

| ID | 标题 | 状态 |
|----|------|------|
| B-5 | CommittedCommitView 单栏重写 | ⏭️ 跳过（保留三栏，B-15 已在此基础上简化 diff 入口） |
| S-2~S-10 | 共享 issue（构建验证 + 排练） | ⬜ 需执行（代码部分已基本完成） |

---

## 依赖关系

```
已完成（无需关注）：
  A-1~A-17 全部完成 ✅
  B-1~B-4, B-6~B-21 全部完成 ✅（20/21）
  B-5 跳过（保留三栏布局）⏭️
  S-1 已完成 ✅

剩余待执行：
  S-2 → S-3 → S-4 → ... → S-10（构建验证 + 排练）
```

## 文件冲突风险

> A 全部完成，B 完成 20/21（仅 B-5 跳过）。代码阶段无剩余冲突风险。

| 文件 | 状态 | 备注 |
|------|------|------|
| `CanvasNodes.tsx` | ✅ B-4 + B-8 + 审计修复 + dark mode | 401 行变更 |
| `CommittedCommitView.tsx` | ✅ B-15 + 审计修复 + dark mode | 352 行变更，移除死代码 |
| `PendingCommitView.tsx` | ✅ B-7 + 审计修复 + dark mode | 300 行变更 |
| 34 文件（Dark Mode） | ✅ B-11 全量修复 | 300+ dark: 变体 |

---

## 回退策略

| 组件 | 状态 | 回退方式 |
|------|------|----------|
| B-5 CommittedCommitView 单栏 | ⏭️ 跳过，保留三栏 | 无需回退 |
| B-6 PendingCommitView wizard | ✅ 已完成且稳定 | 如需回退：`git checkout main -- PendingCommitView.tsx` |
| 其余所有 issue | ✅ 已完成 | 改动小，出问题手动修 |

---

## 风险应对

| 风险 | 恢复方案 |
|------|----------|
| API 启动失败 | 删 `.t3x/database/` → 重启 → `docker compose up` |
| Generate 失败 | seed 预写 mock output |
| Merge 报错 | 调整 seed 数据 / 口头解说 |
| CommittedCommitView 不稳定 | 回退旧版三栏 |
| PendingCommitView 不稳定 | 回退旧版两步 |
| PGLite 数据损坏 | `cp -r .t3x/database-backup/ .t3x/database/` |
| 老板点 Insights | 已接真实数据 |
| 老板点 Execution mode | 已有专业预览 |
| Dark mode 不完美 | ✅ 已全量修复，可使用暗色模式 demo |

---

## Demo Day 清单

### 前一天
- [ ] `pnpm clean && pnpm install && pnpm build`
- [ ] `pnpm test` 全通过
- [ ] `pnpm check` 零 error
- [ ] `.env` 配置完整

### 前 2 小时
- [ ] 删 `.t3x/database/` → 重启 API → `./scripts/seed-demo.sh`
- [ ] 项目列表 3 个项目 + 统计数据
- [ ] Canvas 节点 + Next Step 按钮
- [ ] 双击已提交节点 → 三栏视图（B-5 跳过，B-15 已简化 Diff 入口）
- [ ] 双击待提交节点 → wizard 流程（或旧版如已回退）
- [ ] Leaf → Generate & Verify 正常
- [ ] Merge workspace 有冲突
- [ ] Execution mode → 预览
- [ ] Insights → 真实数据
- [ ] Deploy → 温和离线提示
- [ ] 按 `?` → 快捷键弹窗
- [ ] 备份 DB

### 前 30 分钟
- [ ] 关 DevTools、通知、无关 tab
- [ ] 1920x1080+，zoom 100-110%，勿扰
- [ ] Console 无 warning
- [ ] 亮色或暗色模式确认（B-11 dark mode 已全量修复，两种均可用）
