# Pipeline 调优指南：如何让多 Agent 提取稳定可控

> 针对当前 Meaning Pipeline 不稳定问题的分析与解决方案

---

## 一、为什么不稳定？

当前 Pipeline 有 5 个 LLM 调用串联，每个都有不确定性：

```
FrameExtractor (LLM)        ← 核心提取，输出不稳定 → 下游全部受影响
    ↓
OutputRegulator (CODE)       ← 确定性，没问题
    ↓
DedupChecker (LLM)           ← 有时误判重复，合并不该合并的帧
    ↓
Nester (CODE)                ← 确定性，没问题
    ↓
TopicNamer (LLM)             ← 有时起奇怪名字
    ↓
TopicEvolver (LLM)           ← 有时不必要地改名
    ↓
SlotPolisher (LLM)           ← 有时过度清理，改变语义
    ↓
Reviewer (LLM)               ← 有时误修复，改坏已经好的结构
```

**核心问题：5 次 LLM 调用 = 5 次赌博。方差叠加，不是相加。**

更致命的是：**你调不了你看不到的东西。** 当 YAML 看起来不对时，程序员不知道是哪个 Agent 搞砸的。

---

## 二、三个调优层次

```
Level 1: 可观测性 — "哪里出了问题？"
Level 2: 可控性   — "怎么减少出错？"
Level 3: 可迭代   — "怎么持续改进？"
```

---

## 三、Level 1：可观测性 — 看清每一步

### 3.1 Step 快照可视化

Pipeline 已有 step snapshots 机制（每个 Agent 运行后记录快照 + 质量分），但需要在 UI 中可视化：

```
Pipeline 调试面板（开发者视图）:

┌───────────────────────────────────────────────────┐
│  Pipeline Run #42 — 2026-03-17 15:30              │
│  质量: 72 → 85 → 83 → 88 → 85 → 87              │
│  耗时: 4.2s | Tokens: 3,847                       │
│                                                    │
│  ┌─────────────┬─────────┬────────┬──────────┐    │
│  │ 阶段         │ 质量分   │ Tokens │ 状态     │    │
│  ├─────────────┼─────────┼────────┼──────────┤    │
│  │ Extractor   │ 72      │ 2,100  │ ✓        │    │
│  │ Regulator   │ 85      │ 0      │ ✓        │    │
│  │ DedupChecker│ 83      │ 450    │ ⚠ -2pts  │    │
│  │ Nester      │ 88      │ 0      │ ✓        │    │
│  │ TopicNamer  │ 85      │ 180    │ ⚠ -3pts  │    │
│  │ Polisher    │ 87      │ 620    │ ✓        │    │
│  │ Reviewer    │ 87      │ 497    │ ✓ pass   │    │
│  └─────────────┴─────────┴────────┴──────────┘    │
│                                                    │
│  [点击任意阶段查看前后对比]                           │
└───────────────────────────────────────────────────┘
```

### 3.2 每个 Agent 的前后对比

点击某个 Agent 可以看到它做了什么：

```
DedupChecker 详情:

┌─────────────────────────┬─────────────────────────┐
│ Before (输入)            │ After (输出)             │
├─────────────────────────┼─────────────────────────┤
│ 6 frames                │ 5 frames                │
│                         │                         │
│ f_003: travel_budget    │ (已合并到 f_001)         │
│   budget: 5000          │                         │
│                         │                         │
│ f_005: trip_cost        │ (已合并到 f_001)         │
│   estimated_cost: 5000  │                         │
│                         │                         │
│ f_001: trip_details     │ f_001: trip_details     │
│   destination: Japan    │   destination: Japan    │
│                         │   budget: 5000          │ ← 合并进来了
│                         │                         │
│ 决策: "f_003 和 f_005    │                         │
│  与 f_001 语义重复"       │                         │
│                         │                         │
│ ⚠ 质量分下降 2 分         │                         │
└─────────────────────────┴─────────────────────────┘
```

**有了这个，程序员 10 秒就能定位问题：**
- YAML 不对 → 打开调试面板 → 找到质量下降的 Agent → 看它做了什么 → 修 prompt 或关掉它

---

## 四、Level 2：可控性 — 减少出错

### 4.1 减少 LLM 调用次数

不是每次提取都需要运行全部 Agent：

```
场景分析：

首次提取（完整对话 → 首次 YAML）:
  FrameExtractor  ← 必须
  Regulator       ← 必须（CODE，无风险）
  DedupChecker    ← 需要（首次可能产生重复）
  Nester          ← 需要（CODE，无风险）
  TopicNamer      ← 需要（首次命名）
  TopicEvolver    ← 跳过（首次无需演化）
  Polisher        ← 需要（首次清理）
  Reviewer        ← 需要（首次审查）
  = 5 个 LLM 调用

增量提取（用户多说了几句 → 更新 YAML）:
  FrameExtractor  ← 必须（delta 模式）
  Regulator       ← 按需（CODE）
  DedupChecker    ← 通常跳过（增量很少产生重复）
  Nester          ← 按需（CODE）
  TopicNamer      ← 跳过（已有名字）
  TopicEvolver    ← 按需（话题可能变化）
  Polisher        ← 跳过（已打磨过）
  Reviewer        ← 可跳过（质量 > 85 时）
  = 1-2 个 LLM 调用 ← 大部分情况

大部分不稳定发生在首次提取。增量提取本来就比较稳定。
```

### 4.2 Agent 开关

让开发者可以独立开关每个 Agent（最简单最有效的调试手段）：

```typescript
// Pipeline 配置
pipeline.config = {
  agents: {
    output_regulator: true,    // CODE — 基本没风险，保持开启
    dedup_checker: true,       // LLM — 可关闭调试
    nester: true,              // CODE — 基本没风险，保持开启
    topic_namer: true,         // LLM — 可关闭调试
    topic_evolver: true,       // LLM — 可关闭调试
    slot_polisher: false,      // ← 关掉！怀疑它在搞事
    reviewer: true,            // LLM — 可关闭调试
  }
}
```

**调试流程：**
```
YAML 不对
  → 全部关闭 LLM Agent，只留 Extractor + CODE Agent
  → YAML 对了？说明某个 LLM Agent 有问题
  → 逐个开启 LLM Agent
  → 找到搞事的那个
  → 修它的 prompt
```

这比盲调 prompt 有效 100 倍。5 行代码就能实现。

### 4.3 分级质量门控

当前：质量下降 > 20 分才回滚（太宽松）。

建议按 Agent 风险分级：

```
┌─────────────┬──────────┬─────────────────────────────┐
│ Agent       │ 回滚阈值  │ 理由                        │
├─────────────┼──────────┼─────────────────────────────┤
│ DedupChecker│ -5 分     │ 误合并很严重，丢失信息        │
│ TopicNamer  │ -10 分    │ 名字差不影响结构，容忍度高     │
│ TopicEvolver│ -10 分    │ 同上                        │
│ Polisher    │ -3 分     │ 打磨不应让质量下降            │
│ Reviewer    │ -5 分     │ "修复"不应变差               │
└─────────────┴──────────┴─────────────────────────────┘

Polisher 最严格（-3）：它应该只美化不改语义。
TopicNamer 最宽松（-10）：名字不影响数据质量。
```

### 4.4 锁定 LLM 参数

```
减少随机性的参数设置：

temperature: 0            ← 已设置（好）
seed: 固定值               ← OpenAI 支持，尽量用
max_tokens: 按 Agent 限制  ← 防止输出过长
model: 固定                ← 不要在 Agent 间混用不同模型

┌─────────────┬──────────────┬──────────────────────────┐
│ Agent       │ 建议 max_tokens│ 理由                     │
├─────────────┼──────────────┼──────────────────────────┤
│ Extractor   │ 4096         │ 需要空间输出完整 frames    │
│ DedupChecker│ 512          │ 只需判断 merge/keep        │
│ TopicNamer  │ 64           │ 只输出一个名字             │
│ TopicEvolver│ 64           │ 只输出一个名字             │
│ Polisher    │ 2048         │ 需要输出完整 frame         │
│ Reviewer    │ 1024         │ 审查报告 + 修复建议         │
└─────────────┴──────────────┴──────────────────────────┘
```

---

## 五、Level 3：可迭代 — 持续改进

### 5.1 Prompt 版本管理

每个 Agent 的 prompt 应该有版本号和变更记录：

```typescript
const FRAME_EXTRACTION_PROMPT = {
  version: "v3.2",
  updated_at: "2026-03-17",
  changelog: "Added array grouping rule, reduced frame target to 3-8",
  system: "You are a semantic frame extractor..."
}

const SLOT_POLISHER_PROMPT = {
  version: "v1.3",
  updated_at: "2026-03-16",
  changelog: "Added rule: don't change values that are already clean",
  system: "You clean up slot names..."
}
```

Pipeline 运行记录 prompt 版本：

```json
{
  "pipeline_run": {
    "prompt_versions": {
      "extractor": "v3.2",
      "dedup_checker": "v1.0",
      "topic_namer": "v2.1",
      "polisher": "v1.3",
      "reviewer": "v2.0"
    }
  }
}
```

**追溯能力：** "上周的提取比这周好" → 检查 prompt 版本差异 → 找到哪个 prompt 的改动导致退化。

### 5.2 A/B 对比运行

同一个对话，运行两次 Pipeline（不同配置），对比结果：

```
Run A: 默认配置（全部 Agent 开启）
Run B: 关闭 SlotPolisher

┌─────────────────────────┬─────────────────────────┐
│ Run A                   │ Run B                   │
├─────────────────────────┼─────────────────────────┤
│ quality: 87             │ quality: 91             │
│ frames: 5               │ frames: 5               │
│ topic: "japan_trip"     │ topic: "japan_trip"     │
│                         │                         │
│ slot "budget":          │ slot "budget":          │
│   "approximately 5000"  │   5000                  │
│   ← Polisher 改了       │   ← 没改，更简洁         │
│                         │                         │
│ slot "cities":          │ slot "cities":          │
│   ["tokyo", "kyoto"]   │   ["Tokyo", "Kyoto"]   │
│   ← Polisher 改了大小写  │   ← 保留原始大小写       │
│                         │                         │
│ 结论: Polisher 的 "清理" │                         │
│ 反而降低了质量            │                         │
└─────────────────────────┴─────────────────────────┘
```

### 5.3 Golden 基准 + 回归检测

（已在 Foundation 规格中设计，这里补充调优视角）

```
5 个参考对话，覆盖不同场景：

1. travel-planning    ← 结构化信息（日期、预算、地点）
2. tech-discussion    ← 技术概念（API、架构、工具）
3. finance-planning   ← 数字密集（金额、比率、期限）
4. health-preferences ← 约束密集（过敏、偏好、限制）
5. creative-project   ← 模糊信息（想法、灵感、情感）

每个场景测试不同维度的提取能力。
当 prompt 变更时，这 5 个用例自动告诉你哪个场景退化了。

调优循环：
  修改 Prompt → 跑 Golden 测试
  → 4 个通过，1 个退化
  → 分析退化场景
  → 调整 Prompt
  → 再跑
  → 5 个通过
  → 提交
```

---

## 六、常见不稳定问题与解法

### 问题 1："提取出太多碎帧"

```
症状: 用户说了 5 个城市，出现 5 个独立的 city_recommendation 帧
原因: Extractor prompt 未强调数组分组规则
解法:
  ├── 检查 OutputRegulator 是否运行（应该合并这些）
  ├── 如果 Regulator 没合并 → 检查它的 shouldRun 条件
  └── 如果 Extractor 就不该拆开 → 强化 prompt 中的数组规则
```

### 问题 2："主题名太通用"

```
症状: topic 被命名为 "conversation" 或 "discussion"
原因: TopicNamer prompt 对 "具体性" 的要求不够明确
解法:
  ├── 加负面示例: "NEVER use generic names like conversation, discussion, chat"
  ├── 加正面示例: "japan_trip_plan, product_roadmap, engineering_hiring"
  └── 检查 Reviewer 是否检测到并修复了（如果没有 → 也修 Reviewer prompt）
```

### 问题 3："Polisher 改变了语义"

```
症状: "around $5000" 被改成 "5000"（丢失了 "大约" 的语义）
原因: Polisher prompt 过于激进地 "清理"
解法:
  ├── 加规则: "Preserve hedging language (around, about, approximately)"
  ├── 或者: 降低 Polisher 的回滚阈值到 -3（更严格地守护质量）
  └── 或者: 关闭 Polisher（如果整体效果是负面的）
```

### 问题 4："DedupChecker 误合并不相关的帧"

```
症状: "工作预算" 和 "旅行预算" 被合并为一个帧
原因: DedupChecker 基于类型相似性判断，但语义不同
解法:
  ├── 强化 prompt: "Only merge if semantically identical, not just type-similar"
  ├── 加规则: "If frames have different parent context, keep separate"
  └── 降低回滚阈值到 -5（合并后质量稍降就回滚）
```

### 问题 5："增量提取覆盖了之前的内容"

```
症状: 用户更新了预算，但之前的城市列表消失了
原因: Extractor 在 delta 模式下生成了 full replacement 而不是 slot update
解法:
  ├── 检查 delta prompt: 是否明确要求 "only output CHANGES"
  ├── 检查 frameDeltaParser: 是否正确处理了 delta vs full output
  └── 加 RegressionChecker (Validate 阶段): 如果 >30% 内容被丢弃 → 标记为可能的提取错误
```

---

## 七、优先级与行动计划

```
立刻做（成本低，效果大）:
══════════════════════

  1. Agent 开关
     5 行代码。程序员可以逐个关闭 Agent 定位问题。
     实现: config 对象 + shouldRun 中检查开关。

  2. 分级质量门控阈值
     改几个数字。防止 Agent "好心做坏事"。
     实现: 每个 Agent 的 rollback threshold 配置化。

  3. Step 快照前后对比（简单版）
     日志中输出每个 Agent 的前后帧数 + 质量分变化。
     不需要 UI，console.log 就够调试用。


接下来做（中等投入）:
════════════════════

  4. Prompt 版本管理
     结构化记录每个 prompt 的版本和变更。
     实现: prompt 对象加 version/changelog 字段。

  5. Golden 基准测试
     5 个参考对话 + 期望 YAML。
     实现: 已在 Foundation 规格中设计。

  6. 调试面板 UI（简单版）
     在提取面板中显示 Pipeline 阶段列表 + 质量分。
     实现: 读取已有的 stepSnapshots 数据，渲染表格。


未来做（高投入）:
════════════════

  7. A/B 对比运行
     同一对话两种配置运行，对比结果。
     需要: 新 UI + 后端运行两次的能力。

  8. 完整调试面板
     点击每个阶段查看前后帧对比、prompt 输入输出、Token 消耗。
     需要: 新页面 + 存储 prompt I/O。
```

---

## 八、一句话总结

```
程序员抱怨不稳定，通常不是因为某一个 Agent 有 bug，
而是因为看不到哪里出了问题。

给他们三个工具：
  1. Agent 开关     → 定位问题
  2. 质量门控       → 防止恶化
  3. 前后对比       → 理解变化

剩下的他们自己就能搞定。
```
