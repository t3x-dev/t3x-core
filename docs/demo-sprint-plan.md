# T3X 48 小时 Demo 冲刺 — 最终方案

> **⚠️ 本文档为 v1 版本，已被 [`demo-sprint-v2.md`](./demo-sprint-v2.md) 取代。** v2 扩展至 48 个 issue，当前进度 38/48（79%）。以下内容仅供参考。

> 2 人 + Claude Code，16 工时（每人每天 4 小时 × 2 天）。目标：老板看到一个完整、专业、易懂的产品。

## 项目现状

| 指标 | 状态 |
|------|------|
| 构建 | 全绿 |
| 测试 | 1,156 个全通过 |
| Lint | 265 error + 125 warning（`pnpm check:fix` 自动修复） |
| API | V4 全流程可用（project → conversation → turns → commit → leaf → generate → validate → pin → merge） |
| WebUI | 功能完整，视觉基础好，但信息密度高、空状态弱、个别页面有假数据 |

## 效率基准

Claude Code 实际效率：**一个 issue ≈ 10-15 分钟**（含生成 + 人工验证）

| 资源 | 数量 |
|------|------|
| 可用工时 | 2 人 × 8 小时 = 16 人时 |
| 每个 issue | ~15 分钟 |
| 理论容量 | ~64 个 issue |
| 实际容量（留余量） | ~45-50 个 issue |

## 老板关注的四件事

```
1. "这个产品解决了什么问题？"    ← 数据 + 叙事
2. "它能跑通吗？"               ← 稳定性
3. "它看起来像真产品吗？"        ← 视觉专业度
4. "我一看就懂吗？"             ← UX 简洁性（渐进披露）
```

## 分工原则

```
Person A：内容 + 稳定性 + 后端面
Person B：视觉 + UX + 前端面
```

## 时间线

```
═══════════════════════════════════════════════════════════
 Day 1（每人 4 小时）
═══════════════════════════════════════════════════════════

 Person A                              Person B
 ──────────────────                    ──────────────────
 A-1  Seed Data 脚本                   B-1  Execution Mode 专业预览
 A-2  Silent Error 修复（3处）          B-2  Deploy 标题 + Runner 离线
 A-3  Generate 错误友好化              B-3  Canvas Empty State 引导卡片
 A-4  Merge 流程验证                   B-4  Canvas 节点 Next Step 按钮
 A-5  Insights 接真实数据              B-5  CommittedCommitView 单栏重写
 A-6  Console 清理（5 文件）            B-6  PendingCommitView wizard 拆分
 A-7  Leaf 页面体验优化                B-7  Canvas 节点卡片简化
      (进度条/成功动效/tooltip)         B-8  Commit 成功页 + auto-diff
 A-8  Merge 面板体验优化               B-9  Leaf 创建 Loading 状态
      (确认对话框/loading)              B-10 全站 Empty State 引导文案

═══════════════════════════════════════════════════════════
 Day 2（每人 4 小时）
═══════════════════════════════════════════════════════════

 Person A                              Person B
 ──────────────────                    ──────────────────
 A-9  Projects 列表增加统计数据         B-11 Dark Mode 验证 + 修复
 A-10 as any 类型修复（23处）           B-12 Merge 面板 Loading skeleton
 A-11 API 启动配置状态打印             B-13 Keyboard Shortcuts 帮助弹窗
 A-12 Seed 数据微调                    B-14 Projects 卡片视觉增强
 A-13 Biome 全量格式化                 B-15 Diff 入口简化（4步→2步）

 ═══ 最后 2 小时（两人一起）═══
 S-1  pnpm build + pnpm test + pnpm check
 S-2  删数据库 → seed → 完整排练 #1
 S-3  修排练发现的问题
 S-4  完整排练 #2
 S-5  完整排练 #3 + 备份数据库
```

## Demo 脚本（15-18 分钟）

| 阶段 | 时长 | 操作 | 要点 |
|------|------|------|------|
| 1. 开场 | 2min | 项目列表（3 个项目+统计数据） | "AI 和客户聊了 1000 轮，它'知道'什么？" |
| 2. 知识图谱 | 3min | Canvas → 缩放 → 双击已提交节点 | 单栏布局直接看到知识+约束，Next Step 引导 |
| 3. 分支合并 | 4min | 触发 merge → 冲突解决 → 执行 | "不同对话各自积累，合并时自动检测冲突" |
| 4. 输出验证 | 4min | 创建 leaf → 约束 → Generate & Verify | "输出不是黑盒——有约束、有验证、有溯源" |
| 5. 部署监控 | 2min | Deploy 页面 | "验证通过的知识部署到生产" |
| 6. 收尾 | 2min | 总结 | "核心 100% 确定性，1,156 测试，Docker 一键部署" |

## 风险应对

| 风险 | 恢复方案 |
|------|----------|
| API 启动失败 | 检查端口 → 删 `.t3x/database/` → `docker compose up` |
| Generate 失败 | 切到 seed 预生成的 leaf 结果 |
| Merge 报错 | 确认 seed 数据 → 口头解说 |
| CommittedCommitView 重写不稳定 | 回退到旧版三栏布局 |
| PendingCommitView wizard 不稳定 | 回退到旧版两步布局 |
| PGLite 数据损坏 | 从备份恢复 |
| 老板点 Insights | 已接真实数据 |
| 老板点 Execution mode | 已有专业预览 |
| 无 API key | Seed 脚本预写 mock output |

## Demo Day 清单

### 前一天
- [ ] `pnpm clean && pnpm install && pnpm build`
- [ ] `pnpm test` 全通过
- [ ] `pnpm check` 零 error
- [ ] `.env` 有 `ANTHROPIC_API_KEY` + `NEXT_PUBLIC_API_URL`

### 前 2 小时
- [ ] 删 `.t3x/database/` → 重启 API → `./scripts/seed-demo.sh`
- [ ] 项目列表 3 个项目 + 统计数据
- [ ] Canvas 有节点 + Next Step 按钮
- [ ] 双击已提交节点 → 单栏视图
- [ ] Leaf → Generate & Verify 正常（或友好报错）
- [ ] Merge workspace 有冲突数据
- [ ] Execution mode → 专业预览
- [ ] Insights → 真实数据
- [ ] Deploy → 温和离线提示
- [ ] 备份：`cp -r .t3x/database/ .t3x/database-backup/`

### 前 30 分钟
- [ ] 关 DevTools、无关 tab、通知
- [ ] 1920x1080+，zoom 100-110%，勿扰模式
- [ ] Console 无 warning
