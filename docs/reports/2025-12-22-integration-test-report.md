# 集成测试报告 - 2025-12-22

## 今日结论

目标：验证周末重构（Vite→Next.js、SQLite→PGLite、新增 t3x-storage）通过端对端集成测试。

**结果：297 个测试全部通过。**

---

## 1. 已锁定周末重构改动范围

关键 commits：

| Commit | 说明 |
|--------|------|
| `d1bd1415` | Vite → Next.js 15 迁移 |
| `8216a241` | 移除 SQLite，使用 PGLite 作为本地存储 |
| `660a8e48` | 分离 3 种 storage 适配器（本地 PGLite、Docker PG、网站 Supabase） |

---

## 2. 已梳理主链路数据流

```
POST /api/v1/turns (t3x-webui/src/app/api/v1/turns/route.ts)
  ↓ getDB() from @/lib/db
  ↓ insertTurn() from @t3x/storage/pglite
      ↓ computeTurnHash() from @t3x/core (t3x-core/src/storage/utils.ts:48)
  ↓ PGLite (Drizzle ORM)
  → 返回 { turn_hash, parent_turn_hash, ... }
```

**关键一致性保证**：`API 返回 hash == Core 重算 hash == DB 存储 hash`

---

## 3. 本地基线测试结果

| 包 | 测试数 | 状态 |
|---|---|---|
| @t3x/core | 102 | ✅ 通过 |
| @t3x/storage | 151 | ✅ 通过 |
| t3x-webui | 44 | ✅ 通过 |
| **总计** | **297** | ✅ **全部通过** |

---

## 4. 已完成段对端（integration）验证

| API | 写入后 DB 可查 | Hash 一致性 |
|-----|----------------|-------------|
| POST /conversations | ✅ | N/A |
| POST /turns | ✅ | ✅ (新增) |
| POST /commits | ✅ (新增) | - |

---

## 5. 代码改动清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `t3x-webui/src/__tests__/api/commits.test.ts` | Commits API 集成测试（9 个测试） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `t3x-webui/src/__tests__/api/turns.test.ts` | +1 test: hash 一致性验证（API == Core == DB） |

---

## 6. 新增测试覆盖详情

### turns.test.ts - Hash 一致性测试（第 283-323 行）

```typescript
it('verifies hash consistency between API response, core computation, and database', async () => {
  // 1. 调 POST API 创建 turn
  // 2. 用 @t3x/core 的 computeTurnHash() 重算 hash
  // 3. 用 findTurnByHash() 从 DB 查询 turn
  // 4. 断言三者一致：API hash == Core hash == DB hash
});
```

### commits.test.ts - 9 个测试用例

1. GET 缺少 project_id 返回 400
2. GET 项目无 commits 时返回空列表
3. POST 缺少 project_id 返回 400
4. POST 缺少 turn_window/merge_parents 返回 400
5. POST 项目不存在返回 404
6. **POST 使用 turn_window 创建 commit** ✅
7. **POST 写入后 DB 可查** ✅
8. **POST 后 branch head 更新** ✅
9. GET 创建后返回 commits 列表

---

## 7. 执行过程记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 12:34 | 首次运行测试 | ❌ storage/webui 依赖加载失败 |
| 12:53 | npm install | ✅ 依赖安装成功 |
| 12:53 | npm run build (core + storage) | ✅ 构建成功 |
| 12:53 | 跑基线测试 | ✅ 287 tests 通过 |
| 12:57 | 添加 hash 一致性断言 | ✅ turns.test.ts 15/15 通过 |
| 12:59 | 新建 commits.test.ts | ✅ 9/9 通过 |
| 13:00 | 全量测试 | ✅ **297 tests 全部通过** |

---

## 8. 风险/阻塞点

| 状态 | 项目 |
|------|------|
| ✅ 已解决 | 依赖问题（需先 `npm install` + `npm run build` 才能跑测试） |
| ⚠️ 警告 | Vite CJS 废弃警告（不影响测试，可后续处理） |
| ⚠️ 轻微风险 | commits.test.ts 的 `'empty list'` 测试依赖执行顺序（当前安全但脆弱） |
| ℹ️ 建议 | 可补充 commit hash 一致性验证（与 core 重算对比） |

---

## 9. 复查确认

审计团队提出的两个复查点已确认：

| 复查点 | 状态 | 说明 |
|--------|------|------|
| computeTurnHash 入参结构 | ✅ 正确 | 函数签名就是 snake_case，与测试用法一致 |
| created_at 参与 hash | ✅ 安全 | 测试用的是 API 返回的同一个值，不是自己生成 |
| 测试隔离 | ✅ 安全 | 每个文件独立 PGLite 内存 DB，有 cleanup |
| 顺序依赖 | ⚠️ 轻微风险 | `'empty list'` 测试依赖执行顺序，当前安全但脆弱 |

---

## 10. 后续步骤

1. [ ] 补充 commit hash 一致性测试（类似 turns）
2. [ ] 处理 Vite CJS 废弃警告
3. [ ] CI 流水线验证
4. [ ] 修复 commits.test.ts 顺序依赖（可选）

---

*报告生成时间：2025-12-22 13:00*
