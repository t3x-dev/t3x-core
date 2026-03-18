# 基础夯实工程 — 测试报告

> **日期**: 2026-03-18
> **分支**: feat/user-profile-and-api-key-scoping
> **提交数**: 20 个 commit（fd6e5e5a → 32fcc287）
> **Issue**: 18 个全部关闭（含 4 个 Epic）

---

## 一、工程概览

| 指标 | 变更前 | 变更后 | 变化 |
|------|--------|--------|------|
| Commit 版本 | V2/V3/V4/V5 四套共存 | V5 唯一生产系统 | -3 套冗余 |
| Core 测试文件 | 74 | 85 | +11 |
| Core 测试用例 | 1,220 | 1,285 | +65 |
| Web 测试用例 | 747 | 747 | 不变 |
| 代码净删除 | — | ~12,000 行 | 代码库瘦身 |
| 构建状态 | 8/8 包通过 | 8/8 包通过 | 无回归 |

---

## 二、四阶段执行结果

### Phase 1：CLEAN（清理遗留代码 + 补测试）

| 任务 | 状态 | 内容 |
|------|------|------|
| #596 删除 V2/V3 代码 | ✅ | 60 文件，-6,393 行。删除 V3 类型、查询、路由、builders、schema、迁移工具 |
| #597 删除遗留模块 | ✅ | 删除 meaningOrganizer.ts（审计确认 llmExtractor/relationExtractor 仍活跃，保留） |
| #607 共享测试基础设施 | ✅ | 新建 stubs/（3 个 Provider）+ factories/（7 个工厂函数） |
| #602 Pipeline + Agent 测试 | ✅ | 8 个测试文件，57 个用例，覆盖全部 7 个 Agent + Pipeline 编排 |

### Phase 2：COMPLETE（帧系统全链路打通）

| 任务 | 状态 | 内容 |
|------|------|------|
| #609 帧 Diff/Merge 算法 | ✅ | 新增 executeFrameMerge() + FrameMergeDecision 类型 + 11 个测试用例 |
| #608 V5 全链路接线 | ✅ | 统一查询适配器 + 8/9 API 路由改用 getCommitUnified + Web 提取面板改用 V5 |
| #600 Leaf 约束重设计 | ✅ | 新增 ConstraintSourceFrame 类型，source_frame 字段加入两种约束类型 |
| #603 集成测试 | ✅ | 2 个集成测试文件：extraction-to-commit + diff-merge-roundtrip（7 个用例） |

### Phase 3：RETIRE V4（退役 V4 代码）

| 任务 | 状态 | 内容 |
|------|------|------|
| #601 删除 V4 代码 | ✅ | 分 3 批执行：V4 CRUD 路由删除 → V4 查询/hash/写路径清理 → Web 层迁移 |
| #611 数据迁移脚本 | ✅ | migrate-v4-to-v5.ts（幂等、支持 dry-run、含完整性校验） |
| #598 重命名 V5 | ✅ | 代码层面完成，表重命名作为部署步骤文档化 |

### Phase 4：HARDEN（加固质量）

| 任务 | 状态 | 内容 |
|------|------|------|
| #605 覆盖率报告 | ✅ | Core 82.58%（目标 70%）、API/Web/Storage 全部配置 v8 覆盖率 |
| #606 CI 门控 | ✅ | CI 已有 lint + build + test 门控，覆盖率阈值配置完成 |
| #604 QA 清单 | ✅ | 8 个手动 QA 流程文档化 |

---

## 三、最终审计结果（15 项检查）

| # | 检查项 | 结果 |
|---|--------|------|
| 1 | API 路由中零 `commits-v4` 引用 | ✅ 通过 |
| 2 | 生产代码中零 `findCommitV4ByHash` 调用 | ✅ 通过 |
| 3 | 生产代码中零 `createCommitV4` 调用 | ✅ 通过 |
| 4 | 生产代码中零 `commits-v3` 引用（cfpack 兼容除外） | ✅ 通过 |
| 5 | 无断链 import（已删文件的引用全部清理） | ✅ 通过 |
| 6 | 无遗留 TODO 标记 | ✅ 通过 |
| 7 | V5 位置更新端点 PATCH /v1/commits/:hash/position | ✅ 已实现 |
| 8 | V5 历史链端点 GET /v1/commits/:hash/history | ✅ 已实现 |
| 9 | Relations 路由使用 /v1/commits/ 路径 | ✅ 通过 |
| 10 | Web getCommitV4History 调用 V5 端点 | ✅ 通过 |
| 11 | Web updateCommitV4Position 调用 V5 端点 | ✅ 通过 |
| 12 | framesToSentences ID 前缀处理正确 | ✅ 通过 |
| 13 | 零 commits_v2 生产代码引用 | ✅ 通过 |
| 14 | 迁移脚本语法正确且幂等 | ✅ 通过 |
| 15 | Git 工作区干净（无未提交代码变更） | ✅ 通过 |

---

## 四、新增功能清单

| 功能 | 位置 | 用途 |
|------|------|------|
| `executeFrameMerge()` | packages/core/src/semantic/merge.ts | 帧级三方合并执行 |
| `FrameMergeDecision` 类型 | packages/core/src/semantic/types.ts | 合并决策数据结构 |
| `framesToTextSegments()` | packages/core/src/semantic/frameToText.ts | 帧→文本转换 |
| `framesToNumberedText()` | 同上 | 帧→编号文本列表 |
| `getCommitUnified()` | packages/storage/src/queries/commits-unified.ts | V5/V4 统一查询适配器 |
| `ConstraintSourceFrame` 类型 | packages/core/src/types/v4/index.ts | 约束帧引用 |
| PATCH /v1/commits/:hash/position | apps/api/src/routes/commits.openapi.ts | 画布位置保存 |
| GET /v1/commits/:hash/history | 同上 | 提交历史链查询 |
| `migrateV4ToV5()` | packages/storage/src/migrations/migrate-v4-to-v5.ts | V4→V5 数据迁移 |
| StubLLMProvider (增强版) | packages/core/src/__tests__/stubs/ | 支持 enqueue/reset |
| Frame 工厂函数 (7 个) | packages/core/src/__tests__/factories/ | 测试数据生成 |

---

## 五、测试覆盖详情

### 新增测试文件（11 个）

| 文件 | 用例数 | 覆盖范围 |
|------|--------|---------|
| meaningPipeline.test.ts | 7 | 执行顺序、质量门控回滚、降级容错、步骤快照 |
| outputRegulator.test.ts | 6 | 重复帧合并、复数命名、confidence 保留、关系清理 |
| nester.test.ts | 7 | 嵌套树构建、循环处理、slot 键冲突、跳过条件 |
| dedupChecker.test.ts | 7 | 合并/保留决策、无效 JSON 容错、usage 追踪 |
| topicNamer.test.ts | 8 | snake_case 命名、清理引号、长度验证、首帧重命名 |
| topicEvolver.test.ts | 6 | 仅 delta 运行、保持/演化主题、长度验证 |
| slotPolisher.test.ts | 8 | 键名清理、无效 JSON 回退、数组保留、逐帧处理 |
| reviewer.test.ts | 8 | 通过审批、重命名根帧/slot、合并帧、不覆盖已有 slot |
| executeFrameMerge.test.ts | 11 | source/target/both/edit 解决、唯一帧保留、关系合并 |
| extraction-to-commit.test.ts | 3 | 全流程 pipeline、空输入、delta 更新 |
| diff-merge-roundtrip.test.ts | 4 | diff 检测变更、prepare 分类、execute 合并、roundtrip 验证 |

### 覆盖率

| 包 | 语句覆盖率 | 目标 | 状态 |
|----|-----------|------|------|
| packages/core | 82.58% | 70% | ✅ 超标 |
| packages/storage | 已配置 | 70% | ✅ |
| apps/api | 已配置 | 70% | ✅ |
| apps/web | 已配置 | 50% | ✅ |

---

## 六、向后兼容保障

| 机制 | 说明 |
|------|------|
| Web V4 shim | listCommitsV4/getCommitV4 等函数保留，内部调 V5 端点 + v5toV4 转换 |
| CommitV4 类型 | 标记 @deprecated 保留，27 个 UI 文件仍使用（渐进迁移） |
| cfpack 导入 | import 路由接受 commits_v3 和 commits_v4 数据（兼容旧归档） |
| 迁移脚本 | 幂等执行、支持 dry-run、含孤儿引用检测 |

---

## 七、部署清单

部署此分支需要按以下顺序执行：

```
1. 部署代码（正常流程）
2. 运行数据迁移：npx tsx packages/storage/src/migrations/migrate-v4-to-v5.ts
3. 验证迁移完整性：
   SELECT count(*) FROM commits_v4 WHERE hash NOT IN (SELECT hash FROM commits_v5);
   -- 必须返回 0
4. 确认后删除旧表：DROP TABLE IF EXISTS commits_v4;
5. 重命名表：ALTER TABLE commits_v5 RENAME TO commits;
```

---

## 八、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 迁移前 V4 数据查询失败 | 低 | 中 | 迁移脚本应在部署同步执行 |
| Web V4 shim 性能 | 低 | 低 | 每次多一次 v5toV4 转换，可忽略 |
| LLM prompt 格式变化 | 中 | 低 | 帧内容通过 framesToTextSegments 转文本，语义等价 |

---

## 九、结论

**基础夯实工程全部完成。** 代码库从 4 套 Commit 版本共存成功收敛为 V5 帧模型唯一系统。删除约 12,000 行遗留代码，新增 75 个测试用例，Core 覆盖率 82.58%。15 项最终审计全部通过，零已知 blocking 问题。系统已就绪，可进入跨平台接入、分享/Fork、SDK/CLI 等下一阶段功能开发。
