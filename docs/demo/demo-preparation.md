# T3X Demo 准备方案

> 目标：明天给量化公司老板做首次产品展示，至少完整跑通一个流程。

## 当前状态

- Sprint 47/48 (98%)，3 轮排练全部通过
- seed 脚本可用，含 mock output fallback
- 已有量化动量策略 demo 剧本（`docs/demo/quant-momentum-demo.md`）

---

## 策略：双轨制（产品能力为主 + 量化场景加分）

核心思路：**产品能力 > 场景包装**。T3X 的语义提取、版本 DAG、Diff、Merge、Leaf 约束是通用能力，不需要量化场景来证明。用 seed 数据完整展示产品，口头将场景往量化方向关联即可。

| 轨道 | 内容 | 风险 | 作用 |
|------|------|------|------|
| A轨（主线） | `seed-demo.sh` 预灌 3 个项目，完整展示产品核心能力 | 低 | 稳定、已验证，展示全部功能 |
| B轨（加分） | 按 quant-momentum-demo.md 现场操作 | 中 | 如时间和气氛允许，现场跑一个量化场景 |

---

## 今天准备步骤

### 1. 构建验证
```bash
pnpm clean && pnpm install && pnpm build   # 8/8 tasks success
pnpm test                                   # 365+ tests pass
pnpm check                                  # 0 error
```

### 2. 启动服务 + Seed
```bash
# 终端 1
pnpm dev:api          # 等到 "T3X API server running on http://localhost:8000"

# 终端 2
pnpm dev:webui        # 等到 Next.js ready

# 终端 3
./scripts/seed-demo.sh
```

### 3. 完整浏览验证（打开 http://localhost:3000）

- [ ] 项目列表 3 个项目 + 统计数据
- [ ] Canvas 节点 + Next Step 按钮
- [ ] Commit 节点双击 -> 三栏视图
- [ ] Diff 入口 -> 语义差异展示
- [ ] Leaf 节点有内容（生成或 mock）
- [ ] Merge workspace 有冲突对
- [ ] Insights -> 真实数据
- [ ] 按 `?` -> 快捷键弹窗
- [ ] 亮色/暗色模式都正常

### 4. Quant Demo B 轨预跑

按 `quant-momentum-demo.md` 手动走一遍 Step 0-4：
1. 新建项目 `Demo - US Equity Momentum`
2. 新建对话，粘贴 V1 策略文本
3. Commit V1
4. 粘贴 V2 迭代文本
5. Commit V2 + 查看 Diff

**记录每步是否有问题，这是最后修复机会。**

### 5. 备份 + 代理检查
```bash
# 优雅停止 API (Ctrl+C)，然后备份
cp -r .t3x/database/ .t3x/database-backup/
```

检查 `.env` 中的 `HTTPS_PROXY` 设置 -- 明天演示时代理软件是否在运行？不确定就临时注释掉。

---

## 明日 Demo Day

### 前 2 小时
```bash
rm -rf .t3x/database/          # 清空
pnpm dev:api                   # 终端 1
pnpm dev:webui                 # 终端 2
./scripts/seed-demo.sh         # 终端 3
# 快速验证项目列表正常
```

### 前 30 分钟
- 关 DevTools、通知、无关标签页
- 浏览器缩放 100-110%
- 确认暗色/亮色模式
- 如计划跑 B 轨，准备好 4 段剪贴板文本（见下方）

### 演示流程（15-20 分钟）

**开场（1 分钟）**：项目列表，说明 T3X 是什么 -- "AI 对话产生的知识需要版本管理，T3X 就是做这件事的"

**第一幕 -- 产品核心能力展示（8-10 分钟，A轨，主线）**：
1. 点开 seed 项目（如 Customer Support Knowledge）
2. **Canvas 全景**：节点、连线、DAG 结构 -- "所有知识变更一目了然，像 Git 的 commit graph"
3. **Commit 详情**：双击节点 -> 三栏视图 -- "自然语言自动拆成可引用条目，每条追溯到原始对话"
4. **Diff**：点 Compare -> 语义差异展示 -- "不是文本 diff，是语义级别的变更检测，改了什么、加了什么、删了什么"
5. **Leaf 约束和输出** -- "可以对知识设规则：require 确保关键信息保留，exclude 排除不该出现的内容"
6. **Merge 冲突检测** -- "多人/多轮对话产生的知识冲突，自动识别，逐条解决"

> 口头关联量化场景："比如你们的策略研究笔记、回测参数迭代，每次修改都有语义版本，变了什么一眼看到"

**第二幕 -- 量化场景现场操作（5-8 分钟，B轨，可选加分）**：

> 如果第一幕结束后气氛好、时间够，继续 B 轨；否则跳过直接收场。

- Step 0: 新建项目 + 对话（30秒）
- Step 1: 粘贴 V1 策略（10秒）
- Step 2: Commit V1（1分钟）-- 展示语义提取
- Step 3: 粘贴 V2 迭代（10秒）
- Step 4: Commit V2 + Diff（2分钟）-- **核心高光**
- Step 5: 创建 Leaf + 约束（如时间允许）

**收场（2 分钟）**：Canvas 全景 DAG，一句话总结

### 话术要点

| 场景 | 说法 |
|------|------|
| 产品定位 | "AI 对话越来越多，产生的知识散落在各处，T3X 让这些知识可追溯、可比较、可协作" |
| Sentence 提取 | "自然语言自动拆成可引用条目，每条追溯原文出处" |
| Diff | "不是改文档，是产生新语义版本，变了什么一目了然" |
| Leaf 约束 | "对知识设硬约束 -- require 确保关键规则保留，exclude 排除不该出现的内容" |
| Merge | "多源知识的语义冲突检测，自动识别、逐条解决" |
| 量化关联（口头） | "比如你们的策略迭代、参数调优记录，每次变更都有据可查" |

---

## 故障应急

| 故障 | 恢复 |
|------|------|
| API 启动失败 | `rm -rf .t3x/database/` -> 重启 |
| PGLite 损坏 | `cp -r .t3x/database-backup/ .t3x/database/` -> 重启 |
| Leaf Generate 失败 | 切到 seed 项目的 mock leaf |
| Commit 提取 0 条 | 切回 seed 项目已有 Commit |
| Diff 出错 | 切到 seed 的 merge draft |
| 代理超时 | 注释 `.env` 中 HTTPS_PROXY，重启 API |
| **全挂** | 只用 seed 数据做纯浏览式 demo |

---

## 剪贴板（B 轨用，演示前存好）

**1 - 项目名**：`Demo - US Equity Momentum`

**2 - 对话名**：`Research: Momentum v1`

**3 - V1 策略文本**：
```
策略：美股大盘股动量策略，每周调仓一次。
标的池：S&P500 成分股；剔除最近 20 日平均成交额低于 2000 万美元的股票。
信号：过去 60 个交易日收益率排序，取前 10% 做多、后 10% 做空（等权）。
风控：单只股票最大权重 2%；组合目标波动率 12% 年化；若组合回撤超过 8% 则降杠杆至 0.5。
交易成本：双边 10bp；滑点 5bp。
预期：在 2016–2024 区间年化收益 12–18%，最大回撤 < 15%。
风险点：震荡市动量反转，可能在 2020Q1 出现回撤尖峰；需要做市场状态过滤。
```

**4 - V2 迭代文本**：
```
调整 1：加入市场状态过滤：当 SPY 的 20 日收益率 < 0 且 VIX > 25 时，策略降仓到 30%。
调整 2：动量窗口从 60 日改为 120 日，减少震荡反转敏感度。
调整 3：空头腿从 Bottom10% 改为 Bottom5%，降低挤空风险。
回测更新：2016–2024 年化收益 11–16%，最大回撤从 18% 降到 13%，2020Q1 回撤明显改善。
```

---

## 关键文件

- `scripts/seed-demo.sh` -- 保底数据脚本
- `docs/demo/quant-momentum-demo.md` -- 完整量化 demo 剧本 + FAQ
- `docs/demo-sprint-v2.md` -- Sprint 状态 + Demo Day 清单
- `.env` -- API key + 代理配置

## 验证方式

1. 今天跑完准备步骤 1-5 后，确认所有 checklist 项通过
2. B 轨预跑（步骤 4）顺利完成 = demo 可以跑通
3. 明天 demo 前 2 小时重新 seed + 快速验证
