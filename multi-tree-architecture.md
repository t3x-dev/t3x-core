# 多树知识架构设计

> 一个 Project = N 棵 YAML 树，每棵一个主题，树间有关系
> 用户自然聊天 → Drift 发现话题边界 → 用户决定分树 → 系统管理关系

---

## 一、核心理念

```
用户的心智模型:

  "我就是在聊天，聊到哪里算哪里"

系统的处理:

  聊天 → Drift 检测 → 新话题？ → 问用户 → 新建一棵树

  用户不需要理解 "实体"、"拆分"、"关系"
  他只需要在系统问 "新话题吗？" 时点一下

最终结果:

  Project
  ├── 📄 japan_trip_plan (15 slots)        ← 一棵 YAML 树
  ├── 📄 q3_product_roadmap (22 slots)     ← 另一棵
  ├── 📄 hiring_plan (8 slots)             ← 又一棵
  └── Relations:
        q3_roadmap ──contrasts──→ japan_trip
        hiring_plan ──depends──→ q3_roadmap
```

---

## 二、为什么一棵大树不行？

```
用户聊了 50 轮，涉及 3 个话题:

单树模式（问题）:
┌──────────────────────────────────────────────┐
│ knowledge_base:                               │
│   japan_trip:                                 │
│     destination: Japan                        │
│     budget: 5000                              │
│     cities: [Tokyo, Kyoto]                    │
│     dietary_restrictions:                     │
│       - allergy: shellfish                    │
│   product_roadmap:          ← 和旅行有什么关系？ │
│     q3_features:                              │
│       - user_analytics                        │
│       - api_v2                                │
│     deadline: 2026-06-30                      │
│   hiring:                   ← 为什么在这里？    │
│     positions:                                │
│       - senior_engineer                       │
│       - product_manager                       │
│   ...200 行...                                │
└──────────────────────────────────────────────┘

问题:
  ✗ YAML 越来越大，找东西难
  ✗ 不相关的话题混在一起
  ✗ Diff 时在 200 行里找 3 处变化
  ✗ 分享时对方看到所有东西
  ✗ 嵌套层级越来越深


多树模式（解法）:
┌──────────────────┐  ┌──────────────────┐  ┌──────────┐
│ japan_trip_plan  │  │ q3_product_roadmap│  │hiring_plan│
│                  │  │                   │  │           │
│ destination: ... │  │ features: ...     │  │positions: │
│ budget: 5000     │  │ deadline: ...     │  │ - ...     │
│ cities: [...]    │  │ team: [...]       │  │           │
│ dietary: [...]   │  │                   │  │           │
│                  │  │                   │  │           │
│ 15 slots, 可控   │  │ 22 slots, 可控    │  │ 8 slots   │
└──────────────────┘  └──────────────────┘  └──────────┘
        │                      │
        └──── contrasts ───────┘

每棵树: 专注一个话题，大小适中 (10-50 slots)
树之间: 显式关系
```

---

## 三、默认行为：一个 Project 一棵树

**关键设计决策：** 默认始终是一棵树。多树只在 Drift 触发 + 用户确认时才出现。

```
用户创建项目 → 开始聊天 → 一棵树逐渐长大

  japan_trip_plan:
    destination: Japan         ← Turn 1
    budget: 5000               ← Turn 2
    cities: [Tokyo, Kyoto]     ← Turn 3
    dietary: [shellfish]       ← Turn 4
    accommodation: [...]       ← Turn 5
    ...

树在一个话题内可以深度嵌套，用户喜欢这样。
系统不会主动拆分。

只有当 Drift Detector 检测到真正的新话题时才提问。
大多数对话 = 一棵树到底。这是正确的默认。
```

### 树的适中大小目标

```
目标: 每棵树 10-50 slots

小于 10:  太碎，不值得独立成树
10-30:    理想大小，一屏可读
30-50:    较大但仍可管理
大于 50:  提示用户 "这棵树比较大了，有些内容可以独立出去吗？"
          （提示，不强制）
```

---

## 四、Drift Detector 与多树创建

### 4.1 Drift 何时触发

```
用户发消息
    │
    ▼
Drift Detector 评估:
    │
    ├── 消息内容与现有所有树的主题比较
    │
    ├── 匹配到已有树 → same_topic → 直接 delta 更新那棵树
    │   例: "把预算改成 3000" → 匹配 japan_trip → 更新
    │
    ├── 不匹配任何树 → drift_detected → 问用户
    │   例: "我女儿下月要考试" → 无匹配 → 提问
    │
    └── 模糊 → 倾向 same_topic（宁可迟钝，不要过度打扰）
```

### 4.2 四个选择项

```
┌────────────────────────────────────────────────────┐
│ 看起来你在聊「女儿升学考试」，和现有话题不太相关       │
│                                                     │
│ ① 切换到这个新话题（停止日本旅行的提取）               │
│ ② 这还是日本旅行的一部分（继续归入现有树）             │
│ ③ 两个都保留 — 在这个项目里新建一棵树                  │
│ ④ 另开一个项目来聊这个新话题                          │
│                                                     │
│ 默认的:                                              │
│   大多数用户选 ② 或 ③                                │
│   ② = "我跑题了，但其实还是同一个话题"                 │
│   ③ = "确实是新话题，但和这个项目有关联"                │
└────────────────────────────────────────────────────┘
```

### 4.3 选 ③ 后发生什么

```
用户选 ③ "两个都保留"
    │
    ▼
系统创建新的 root frame（第二棵树）
    │
    ▼
Extractor 对新消息提取 → delta 写入新树
    │
    ▼
RelationDetector (轻量 LLM Agent):
  "这两棵树有关系吗？"
  输入: 两棵树的类型 + 摘要
  输出: relation 或 "无关系"
    │
    ▼
YAML 面板:
  新增一棵树出现在主题列表中
  如有关系则显示连线
```

### 4.4 已有树之间的切换（不是 Drift）

```
重要区别:

用户: "把预算改成 3000"
  → LLM 看到 japan_trip 有 budget slot
  → Delta target: f_001 (japan_trip)
  → 不触发 Drift

用户: "对了 Q3 加个 dark mode"
  → LLM 看到 q3_roadmap 有 features slot
  → Delta target: f_002 (q3_roadmap)
  → 也不触发 Drift！（q3_roadmap 已是一棵树）

用户: "下个月我女儿要考试"
  → LLM 看到现有所有树都不匹配
  → 触发 Drift → 问用户

规则:
  已有树之间切换 = Delta 路由（自动，不打断用户）
  全新话题       = Drift 提问（需要用户决策）
```

### 4.5 Drift 准确度调优

```
Drift Detector 是这个体系的生死线:

  太敏感: 用户每说一句话都被问 "新话题？" → 烦死了
  太迟钝: 不相关内容混进已有树 → 树质量下降

调优策略:

  1. 宁迟钝不敏感（默认）
     → 只有明确的话题转换才触发
     → "对了" "另外" "说个别的" 等显式转折词增加权重
     → 模糊时归入最相关的已有树

  2. 有上下文窗口
     → 不只看最后一条消息
     → 看最近 3 条消息的趋势
     → 单次偏题不触发，连续偏题才触发

  3. Confidence 阈值
     → drift_confidence < 0.7 → same_topic（不打断）
     → drift_confidence ≥ 0.7 → 提问
     → 阈值可在项目设置中调整

  4. LLM 失败时默认 same_topic
     → 不打断用户
```

---

## 五、多树更新机制

### 5.1 LLM 自动路由到正确的树

```
Extractor 的 Delta 模式已经天然支持:

输入给 LLM:
  snapshot (多棵树):
    f_001: japan_trip_plan { budget: 5000, cities: [...] }
    f_002: q3_product_roadmap { features: [...], deadline: ... }
    f_003: hiring_plan { positions: [...] }

  新消息: "把预算改成 3000"

LLM 输出:
  {
    changes: [
      { action: "update", target: "f_001", slots: { budget: 3000 } }
    ]
  }

target: "f_001" 天然定位到 japan_trip 树。
不需要额外路由逻辑。Delta 已有机制完美支持。
```

### 5.2 一条消息影响多棵树

```
用户: "旅行延到 7 月，这样不影响 Q3 deadline 了"

LLM 输出:
  {
    changes: [
      { action: "update", target: "f_001",
        slots: { timing: "July 2026" } },
    ],
    remove_relations: [
      { from: "f_002", to: "f_001", type: "contrasts" }
    ],
    new_relations: [
      { from: "f_001", to: "f_002", type: "follows" }
    ]
  }

一条消息 → 更新一棵树 + 更新树间关系。
全在已有 Delta 结构内。
```

---

## 六、数据模型：零变更

```
当前 SemanticContent（不需要改）:
  {
    frames: Frame[],         ← 多个 root frame = 多棵树
    relations: Relation[]    ← 包含树内关系 + 树间关系
  }

单主题（默认，一棵树）:
  frames: [
    { id: "f_001", type: "japan_trip", slots: { ...大嵌套... } }
  ]
  relations: []

多主题（drift 后，多棵树）:
  frames: [
    { id: "f_001", type: "japan_trip", slots: { ... } },
    { id: "f_002", type: "q3_roadmap", slots: { ... } },
    { id: "f_003", type: "hiring_plan", slots: { ... } }
  ]
  relations: [
    { from: "f_002", to: "f_001", type: "contrasts" },
    { from: "f_003", to: "f_002", type: "depends" }
  ]

区别只是 frames[] 里有几个 root frame。
Diff、Merge、存储、API、Hash — 全部不受影响。
```

---

## 七、树的生命周期管理

### 7.1 完整 CRUD

| 操作 | 触发方式 | 行为 |
|------|---------|------|
| **创建** | Drift → 用户选 ③ | 新 root frame 加入 frames[] |
| **更新** | 用户继续聊 | Delta 自动路由到正确的树 |
| **重命名** | 用户在 YAML 面板编辑树标题 | 修改 root frame 的 type |
| **删除** | 用户右键 → 删除此树 | 从 frames[] 移除 + 清理相关 relations |
| **合并** | 用户拖一棵树到另一棵上 | 将 source 树的 slots 合入 target 树 |
| **拆分** | 用户选中部分 slots → "拆为新树" | 选中 slots 移到新 root frame |
| **移动** | 用户右键 → 移到另一个 Project | 将 root frame 移到另一个 project 的 frames[] |
| **归档** | 用户右键 → 归档 | 标记为 archived，不在默认视图显示 |

### 7.2 手动纠正 Drift 误判

```
场景 A: Drift 该触发但没触发（不相关内容混入了一棵树）

  用户发现 japan_trip 树里有公司招聘的内容:

  japan_trip_plan:
    destination: Japan
    budget: 5000
    hiring_needs:        ← 不属于这里！
      - senior_engineer

  修正方式: 选中 hiring_needs → 右键 → "拆为新树"
  → 系统创建新树 hiring_plan
  → japan_trip 移除 hiring_needs slots


场景 B: Drift 触发了但不该触发（用户被错误地分了树）

  项目里出现了两棵树:
    japan_trip_plan
    japan_accommodation   ← 其实就是旅行的一部分

  修正方式: 拖 japan_accommodation → 放到 japan_trip_plan 上
  → 系统合并两棵树
  → accommodation slots 嵌套到 japan_trip_plan 下
```

### 7.3 树大小提示

```
不强制拆分，只在树过大时轻提示:

树 < 30 slots:  无提示
树 30-50 slots: 无提示（仍可管理）
树 > 50 slots:  轻提示
  ┌──────────────────────────────────────────────┐
  │ 💡 这棵树已有 52 个条目                        │
  │    有些内容可能适合独立成树                      │
  │    [查看建议] [忽略]                            │
  └──────────────────────────────────────────────┘

点击 "查看建议":
  系统分析树内容，建议哪些 slots 可以拆出
  用户决定是否拆分
  不强制。
```

---

## 八、Share & Diff 在多树下的表现

### 8.1 Share 更精准

```
分享选项:

  ○ 分享整个项目（3 棵树 + 关系）
  ● 分享单棵树:
    ☑ japan_trip_plan
    ☐ q3_product_roadmap
    ☐ hiring_plan

  → "看看我的日本旅行计划"
  → 对方只看到一棵树，不会被不相关内容干扰

Fork 也按树:
  → "我只想 fork 你的旅行计划"
  → Fork 单棵树到我的项目 ✓
```

### 8.2 Diff 更清晰

```
Commit Diff 两级导航:

  Level 1: 哪棵树变了？
  ┌─────────────────────────────────────┐
  │ japan_trip_plan:      2 changes     │
  │ q3_product_roadmap:   1 change      │
  │ hiring_plan:          no changes    │
  └─────────────────────────────────────┘

  Level 2: 树内什么变了？（点击展开）
  ┌─────────────────────────────────────┐
  │ japan_trip_plan:                     │
  │   ~ budget: 5000 → 3000            │
  │   + cities: Osaka                   │
  │                                     │
  │ q3_product_roadmap:                  │
  │   + features: dark_mode             │
  └─────────────────────────────────────┘

  Level 3: 长文本词级别 diff（如果 slot 值是长文本）

  比在一棵 200 行的大树里找变化清晰 100 倍。
```

### 8.3 Merge 更安全

```
两人同时工作:

  Alice 改了 japan_trip 树 (budget: 5000 → 3000)
  Bob 改了 q3_roadmap 树 (+ dark_mode feature)

  → 不同的树，零冲突，干净合并 ✓

冲突只在两人改同一棵树的同一个 slot 时:

  Alice: japan_trip.budget → 3000
  Bob:   japan_trip.budget → 4000
  → 冲突！用户解决。

多树减少冲突概率: 每棵树更小，同时改到同一 slot 的概率更低。
```

---

## 九、YAML 面板展示

### 9.1 单树（默认，大多数情况）

```
和现在一样，无任何变化:

  japan_trip_plan:
    destination: Japan
    budget: 5000
    cities:
      - Tokyo
        days: 5
      - Kyoto
        days: 4
    dietary_restrictions:
      - allergy: shellfish
```

### 9.2 多树（drift 后）

```
  ┌─ 主题树列表 ──────────────────────────┐
  │                                        │
  │  📄 japan_trip_plan (15 slots)    [▼]  │ ← 点击展开/折叠
  │  📄 q3_product_roadmap (22 slots) [▶]  │
  │  📄 hiring_plan (8 slots)        [▶]  │
  │                                        │
  │  ┈┈ Relations ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈    │
  │  q3_roadmap ──contrasts──→ japan_trip  │
  │  hiring ──depends──→ q3_roadmap       │
  │                                        │
  └────────────────────────────────────────┘

  展开 japan_trip_plan:

  ┌─ japan_trip_plan ─────────────────────┐
  │                                        │
  │  destination: Japan                    │
  │  budget: 5000                          │
  │  cities:                               │
  │    - Tokyo                             │
  │      days: 5                           │
  │    - Kyoto                             │
  │      days: 4                           │
  │  dietary_restrictions:                 │
  │    - allergy: shellfish                │
  │                                        │
  │  ↳ contrasts: q3_product_roadmap       │
  │                                        │
  └────────────────────────────────────────┘

  每棵树内部: 用户喜欢的大嵌套 YAML ✓
  树列表: 简洁导航 ✓
  关系: 不干扰阅读 ✓
```

---

## 十、完整数据流示例

```
Turn 1-5: 聊日本旅行
━━━━━━━━━━━━━━━━━━━

  Pipeline.run() × 5
    → Drift: same_topic (只有一棵树，直接归入)
    → Extractor: 更新 f_001 (japan_trip_plan)
    → 结果: 一棵树，15 slots

  YAML 面板: 一棵树，和现在体验一样


Turn 6: "对了，Q3 产品路线图要更新一下"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Pipeline.run()
    → Drift: drift_detected (产品路线图 ≠ 日本旅行)
    → 返回 paused + 4 个选项
    → 用户选 ③ "两个都保留"

  Pipeline.resume()
    → 创建 f_002 (q3_product_roadmap) 作为新 root frame
    → Extractor: 提取到 f_002
    → RelationDetector: "q3_roadmap contrasts japan_trip"

  YAML 面板: 两棵树出现，有关系标注


Turn 7-10: 继续聊 Q3 路线图
━━━━━━━━━━━━━━━━━━━━━━━━━━

  Pipeline.run() × 4
    → Drift: same_topic (匹配到 q3_roadmap 树)
    → Extractor: delta target: f_002
    → 结果: q3_roadmap 树更新，japan_trip 不变


Turn 11: "把旅行预算改成 3000"
━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Pipeline.run()
    → Drift: same_topic (匹配到 japan_trip 树的 budget slot)
    → 注意: 不触发 Drift！从 q3_roadmap 切回 japan_trip 是自然的
    → Extractor: delta target: f_001, slots: { budget: 3000 }
    → 结果: japan_trip 更新，q3_roadmap 不变


Turn 12: "旅行延到 7 月，这样不和 Q3 冲突了"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Pipeline.run()
    → Drift: same_topic (涉及 japan_trip)
    → Extractor:
        changes: [{ target: f_001, slots: { timing: "July" } }]
        remove_relations: [{ f_002 contrasts f_001 }]
        new_relations: [{ f_001 follows f_002 }]
    → 结果: 更新 japan_trip + 更新树间关系


Turn 15: "下个月我女儿要考试"
━━━━━━━━━━━━━━━━━━━━━━━━━━

  Pipeline.run()
    → Drift: drift_detected (不匹配任何现有树)
    → 用户选 ④ "另开一个项目"
    → API 创建新 project + 新对话
    → 当前 session 不变
```

---

## 十一、与已有 Spec 的关系

```
Pipeline Spec (agentic-pipeline-architecture):
  Drift Detector → 4 个选项 → ③ "两个都保留"
  → 完美对接多树创建 ✓
  → 无需修改 Pipeline 设计

Cross-Platform Spec (share-fork):
  Share 单棵树 → 更精准
  Fork 单棵树 → 更有意义
  → 完美对接 ✓

Foundation Spec (stabilization):
  Commit = frames[] + relations[]
  多棵树 = 多个 root frame
  → 零数据模型变更 ✓

Frame Diff:
  三层递归 Diff 按 ID 匹配
  多棵树 = 多个 root frame，算法完全不受影响
  → Diff 结果按树分组展示 ✓
```

---

## 十二、评分与已知 Gap

**设计评分: 8.5/10**

```
得分:
  架构优雅度 9/10   — 零数据模型变更，自然涌现
  产品直觉  9/10   — 用户驱动拆分，不强加概念
  技术可行  9/10   — 大部分复用已有能力
  工程成本  8/10   — Drift + RelationDetector + UI 需新建

扣分 (-1.5):
  Gap 1: 未经真实用户验证 (-0.5)
  Gap 2: Drift 准确度是生死线 (-0.5)
  Gap 3: 树生命周期 CRUD 需实现 (-0.5)
```

### 补齐 Gap 的路径

```
Gap 1 → Golden 测试加一个 "多话题对话" 场景验证

Gap 2 → Drift 三重保险:
  1. 宁迟钝不敏感（confidence ≥ 0.7 才触发）
  2. 用户可手动拆分/合并树（事后纠正）
  3. 树大小提示（> 50 slots 时轻提示）

Gap 3 → 树的完整生命周期:
  创建(Drift) / 更新(Delta) / 重命名 / 删除 /
  合并(拖拽) / 拆分(选中→新树) / 移动 / 归档
```

---

## 十三、实现优先级

```
Phase 1: 单树完善（不改任何东西）
═══════════════════════════════
  现有体验: 一个 project 一棵 YAML 树
  确保: 单树的提取、diff、merge 完美可靠
  这是基础，多树建立在此之上

Phase 2: Drift + 多树创建
═══════════════════════════
  Drift Detector: 检测 + 4 选项
  选 ③ 时: 创建第二棵树
  RelationDetector: 自动发现树间关系
  YAML 面板: 主题列表 + 展开/折叠

Phase 3: 多树管理
═══════════════════
  树 CRUD: 重命名、删除、合并、拆分
  手动纠正: 拆分过大的树、合并误拆的树
  大小提示: > 50 slots 轻提示
  Diff 按树分组展示

Phase 4: 多树增强
═══════════════════
  Share 单棵树
  Fork 单棵树
  树间关系可视化（Mermaid 或轻量图）
  归档/移动到其他 Project
```
