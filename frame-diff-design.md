# Frame Diff 设计：三层递归 Diff 算法

> 基于帧模型（Frame Model）的 Diff 算法设计，替代当前句子级别的 Jaccard + Hungarian 匹配。

---

## 一、为什么 Frame Diff 比 Sentence Diff 更好？

```
Sentence Diff（当前 V4，即将退役）:
  "User prefers dark chocolate"  ←→  "User loves dark chocolate"

  怎么判断相似？Jaccard？LCS？模糊匹配？
  算法在猜测。概率性的。

Frame Diff（V5，新方案）:
  { type: "preference", item: "dark_chocolate", sentiment: "prefers" }
  { type: "preference", item: "dark_chocolate", sentiment: "loves" }

  按 type + item 精确匹配，比较 slot 值。
  算法确定性执行。不猜测。
```

---

## 二、核心思想：三层 Diff

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  Layer 1: Frame 级别 — 哪个帧变了？                           │
│           匹配方式: 按帧 ID 匹配（确定性，O(N)）               │
│                                                              │
│  Layer 2: Slot 级别  — 帧内哪个字段变了？                      │
│           匹配方式: 按 KEY 匹配（确定性，O(K)）                │
│                                                              │
│  Layer 3: 词级别    — 长文本 slot 里哪些词变了？                │
│           匹配方式: LCS word diff（复用已有算法）               │
│                                                              │
│  嵌套结构: 递归处理，深度不影响算法逻辑                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

对比当前 Sentence Diff 的复杂度：

```
当前 Sentence Diff:                    Frame Diff:
  1. Exact match (O(N+M))               1. 按 ID 匹配 (O(N))
  2. Jaccard filter (>= 0.3)            2. 按 KEY 比较 slot 值
  3. Hungarian/Greedy 匹配 (O(N*M))      3. 长文本走 LCS word diff
  4. LCS word diff per pair             4. 递归处理嵌套
  5. 分类剩余项

  5 步，含概率性匹配                      4 步，全确定性
```

---

## 三、Slot 值类型与 Diff 策略

```
Slot 值类型              Diff 策略              示例
──────────────────────────────────────────────────────────────
string (短, < 20字符)    整体替换                "Japan" → "China"
string (长, ≥ 20字符)    词级别 LCS diff          "A relaxing trip" → "An adventurous trip"
number                  整体替换                5000 → 3000
boolean                 整体替换                true → false
array (基本类型)         集合 diff (增/删)        ["Tokyo"] → ["Tokyo", "Osaka"]
array (InlineFrame)     按 ID/type 匹配后递归    见下文
InlineFrame             递归 diffFrame()         进入下一层
SlotRef                 比较 ref 目标             { ref: "f_001" } → { ref: "f_002" }
```

---

## 四、排序问题

### 核心规则：排序是展示问题，不是数据问题

```
┌──────────────┬──────────────────────────────────────────┐
│ 层面          │ 排序规则                                  │
├──────────────┼──────────────────────────────────────────┤
│ 存储          │ 无序（JSON object）                       │
│ Diff 比较     │ 按 ID/KEY 匹配（忽略顺序）                │
│ 展示          │ 按 source turn 排序（确定性）              │
│ YAML 渲染     │ 跟展示排序一致                             │
└──────────────┴──────────────────────────────────────────┘

Diff 算法完全不受排序影响。
```

### 数组排序：Set vs List

```yaml
# 这两个是否相同？
cities: [Tokyo, Kyoto]
cities: [Kyoto, Tokyo]
```

```
默认: Set 语义（无序，上面两个相同）
  适用: 城市列表、偏好、标签、功能列表

可选: List 语义（有序，上面两个不同）
  适用: 行程日程、优先级排名、操作步骤

通过 slot metadata 声明:
  array_order: 'set' | 'list'    // 默认 'set'
```

---

## 五、递归 Diff 算法

### 伪代码

```typescript
function diffFrame(base: Frame, target: Frame): FrameChange {
  const slotChanges: SlotChange[] = [];

  // 所有出现过的 key 的并集
  const allKeys = union(Object.keys(base.slots), Object.keys(target.slots));

  for (const key of allKeys) {
    const oldVal = base.slots[key];
    const newVal = target.slots[key];

    if (oldVal === undefined) {
      // Slot 新增
      slotChanges.push({ key, action: 'added', newValue: newVal });

    } else if (newVal === undefined) {
      // Slot 删除
      slotChanges.push({ key, action: 'removed', oldValue: oldVal });

    } else if (isInlineFrame(oldVal) && isInlineFrame(newVal)) {
      // 嵌套帧 → 递归
      const nested = diffFrame(oldVal, newVal);
      if (nested.slotChanges.length > 0) {
        slotChanges.push({ key, action: 'modified', nested });
      }

    } else if (isArray(oldVal) && isArray(newVal)) {
      // 数组 → diffArray
      const arrayDiff = diffArray(oldVal, newVal, key);
      if (arrayDiff.length > 0) {
        slotChanges.push({ key, action: 'modified', arrayChanges: arrayDiff });
      }

    } else if (isLongString(oldVal) && isLongString(newVal)) {
      // 长文本 → 词级别 diff
      const words = wordDiff(oldVal, newVal);   // 复用已有 LCS
      slotChanges.push({ key, action: 'modified', oldValue: oldVal, newValue: newVal, wordDiff: words });

    } else if (oldVal !== newVal) {
      // 基本类型（短 string, number, boolean）→ 整体替换
      slotChanges.push({ key, action: 'modified', oldValue: oldVal, newValue: newVal });
    }
  }

  return { frameId: base.id, slotChanges };
}

function diffArray(base: SlotValue[], target: SlotValue[], key: string): ArrayChange[] {
  if (allInlineFrames(base) && allInlineFrames(target)) {
    // InlineFrame 数组 → 按 ID 或 type 匹配，递归
    return diffFrameArray(base, target);
  } else {
    // 基本类型数组 → 集合 diff（默认 set 语义）
    return diffPrimitiveArray(base, target);
  }
}

function isLongString(val: SlotValue): boolean {
  return typeof val === 'string' && val.length >= 20;
}
```

### 顶层入口

```typescript
function diffCommits(base: Commit, target: Commit): FrameDiffResult {
  const baseFrames = indexById(base.content.frames);
  const targetFrames = indexById(target.content.frames);

  const allIds = union(baseFrames.keys(), targetFrames.keys());
  const frameChanges: FrameChange[] = [];

  for (const id of allIds) {
    const baseFrame = baseFrames.get(id);
    const targetFrame = targetFrames.get(id);

    if (!baseFrame) {
      frameChanges.push({ frameId: id, action: 'added', frame: targetFrame });
    } else if (!targetFrame) {
      frameChanges.push({ frameId: id, action: 'removed', frame: baseFrame });
    } else {
      const diff = diffFrame(baseFrame, targetFrame);
      if (diff.slotChanges.length > 0) {
        frameChanges.push({ frameId: id, action: 'modified', ...diff });
      }
    }
  }

  return { frameChanges };
}
```

---

## 六、完整例子

### 输入：两个版本的 YAML

```yaml
# Base（原版）
japan_trip_plan:
  trip_details:
    destination: Japan
    budget: 5000
    description: "A relaxing two-week trip focusing on traditional culture"
    cities:
      - name: Tokyo
        days: 5
        attractions:
          - Senso-ji Temple
          - Shibuya Crossing
      - name: Kyoto
        days: 4
        attractions:
          - Fushimi Inari

# Target（用户更新后）
japan_trip_plan:
  trip_details:
    destination: Japan
    budget: 3000
    description: "An adventurous two-week trip focusing on modern and traditional culture"
    cities:
      - name: Tokyo
        days: 7
        attractions:
          - Senso-ji Temple
          - Shibuya Crossing
          - TeamLab
      - name: Kyoto
        days: 4
        attractions:
          - Fushimi Inari
  dietary_restrictions:
    - type: allergy
      item: shellfish
```

### 递归过程

```
Level 0: diffFrame(japan_trip_plan.base, japan_trip_plan.target)
│
├── slot "trip_details" → InlineFrame → 递归
│   │
│   Level 1: diffFrame(trip_details.base, trip_details.target)
│   │
│   ├── "destination": "Japan" === "Japan" → 无变化 ✓
│   ├── "budget": 5000 !== 3000 → CHANGED (整体替换)
│   ├── "description": 长文本 → 词级别 diff
│   │     "A [-relaxing][+adventurous] two-week trip focusing on
│   │      [+modern and ]traditional culture"
│   └── "cities": 数组 InlineFrame → diffFrameArray
│       │
│       Level 2: 按 name 匹配
│       │
│       ├── Tokyo ↔ Tokyo → 递归 diffFrame
│       │   │
│       │   Level 3: diffFrame(Tokyo.base, Tokyo.target)
│       │   ├── "name": "Tokyo" === "Tokyo" → 无变化 ✓
│       │   ├── "days": 5 !== 7 → CHANGED
│       │   └── "attractions": diffArray
│       │       ├── "Senso-ji Temple" ✓
│       │       ├── "Shibuya Crossing" ✓
│       │       └── "TeamLab" → ADDED
│       │
│       └── Kyoto ↔ Kyoto → 递归 → 无变化 ✓
│
└── slot "dietary_restrictions" → 整块 ADDED
    └── [{ type: allergy, item: shellfish }]
```

### Diff 结果

```typescript
{
  frameChanges: [
    {
      frameId: "f_001",
      action: "modified",
      slotChanges: [
        {
          key: "trip_details",
          action: "modified",
          nested: {
            slotChanges: [
              // Layer 2: Slot 级别
              {
                key: "budget",
                action: "modified",
                oldValue: 5000,
                newValue: 3000
                // 短值，无 wordDiff
              },
              // Layer 3: 词级别
              {
                key: "description",
                action: "modified",
                oldValue: "A relaxing two-week trip...",
                newValue: "An adventurous two-week trip...",
                wordDiff: [
                  { type: "equal", text: "A" },
                  { type: "removed", text: "relaxing" },
                  { type: "added", text: "adventurous" },
                  { type: "equal", text: "two-week trip focusing on" },
                  { type: "added", text: "modern and" },
                  { type: "equal", text: "traditional culture" }
                ]
              },
              // 嵌套数组内的变化
              {
                key: "cities",
                action: "modified",
                arrayChanges: [
                  {
                    matchedBy: "name:Tokyo",
                    nested: {
                      slotChanges: [
                        { key: "days", action: "modified", oldValue: 5, newValue: 7 },
                        { key: "attractions", action: "modified",
                          arrayChanges: [
                            { action: "added", value: "TeamLab" }
                          ]
                        }
                      ]
                    }
                  }
                ]
              }
            ]
          }
        },
        // 整个帧新增
        {
          key: "dietary_restrictions",
          action: "added",
          newValue: [{ type: "allergy", item: "shellfish" }]
        }
      ]
    }
  ]
}
```

---

## 七、TypeScript 类型定义

```typescript
// ===== Diff 结果类型 =====

interface FrameDiffResult {
  frameChanges: FrameChange[];
}

interface FrameChange {
  frameId: string;
  framePath?: string;                     // "trip_details.cities[Tokyo]"
  action: 'added' | 'removed' | 'modified';
  frame?: Frame;                          // 当 added/removed 时，完整帧
  slotChanges?: SlotChange[];             // 当 modified 时
}

interface SlotChange {
  key: string;
  path?: string;                          // 完整路径 "trip_details.budget"
  action: 'added' | 'removed' | 'modified';
  oldValue?: SlotValue;
  newValue?: SlotValue;
  wordDiff?: WordDiff[];                  // Layer 3 — 仅长文本 slot
  nested?: { slotChanges: SlotChange[] }; // InlineFrame 递归
  arrayChanges?: ArrayChange[];           // 数组变更
}

interface ArrayChange {
  action: 'added' | 'removed' | 'modified';
  index?: number;
  matchedBy?: string;                     // "name:Tokyo" — 匹配键
  value?: SlotValue;                      // added/removed 时
  nested?: { slotChanges: SlotChange[] }; // InlineFrame 数组项变更
}

interface WordDiff {
  type: 'equal' | 'added' | 'removed';
  text: string;
}
```

---

## 八、YAML 展示效果

### 方式 A: 路径列表（概览模式）

```
变更摘要: 3 处修改, 1 处新增

  ~ trip_details.budget: 5000 → 3000
  ~ trip_details.description: "A [-relaxing][+adventurous] two-week trip
      focusing on [+modern and ]traditional culture"
  ~ trip_details.cities[Tokyo].days: 5 → 7
  + trip_details.cities[Tokyo].attractions: "TeamLab"
  + dietary_restrictions: [{ type: allergy, item: shellfish }]
```

### 方式 B: YAML 内联高亮（详细模式）

```yaml
japan_trip_plan:
  trip_details:
    destination: Japan
    budget: 3000                                  # ← 黄色 (was: 5000)
    description: "An adventurous two-week trip     # ← adventurous 绿色
      focusing on modern and traditional culture"  #    modern and 绿色
                                                   #    (was: relaxing 红色删除线)
    cities:
      - name: Tokyo
        days: 7                                    # ← 黄色 (was: 5)
        attractions:
          - Senso-ji Temple
          - Shibuya Crossing
          - TeamLab                                # ← 绿色 (新增)
      - name: Kyoto
        days: 4
        attractions:
          - Fushimi Inari
  dietary_restrictions:                            # ← 整块绿色 (新增帧)
    - type: allergy
      item: shellfish
```

---

## 九、三方合并

三方合并复用同一个递归结构，只是在每个层比较三个版本而不是两个：

```
threeWayMerge(base, source, target):

  for each slot:
    sourceChanged = (base[slot] !== source[slot])
    targetChanged = (base[slot] !== target[slot])

    if !sourceChanged && !targetChanged → 保持 base
    if sourceChanged  && !targetChanged → 取 source
    if !sourceChanged && targetChanged  → 取 target
    if sourceChanged  && targetChanged  →
      if source[slot] === target[slot]  → 取任一（相同变更）
      else                              → CONFLICT（用户决定）
```

示例：

```
Base:    budget: 5000,  cities: [Tokyo, Kyoto]
Source:  budget: 3000,  cities: [Tokyo, Kyoto]         ← 改了预算
Target:  budget: 5000,  cities: [Tokyo, Kyoto, Osaka]  ← 加了城市

合并:
  budget: Source 改了, Target 没改 → 取 Source → 3000 ✓
  cities: Target 改了, Source 没改 → 取 Target → [Tokyo, Kyoto, Osaka] ✓

结果:    budget: 3000, cities: [Tokyo, Kyoto, Osaka]   ← 干净合并
```

冲突只发生在**同一路径两边都改了且值不同**：

```
Source: budget: 3000
Target: budget: 4000
→ CONFLICT on trip_details.budget
→ 用户在合并工作区选择
```

嵌套帧的合并同样递归处理，逻辑完全一样。

---

## 十、实现优先级

```
Phase 1: 基础 Frame Diff
  □ diffCommits() — 帧级别匹配 (按 ID)
  □ diffFrame() — slot 级别比较 (按 KEY)
  □ 基本类型 slot diff (string, number, boolean)
  □ 数组 diff (set 语义)
  □ 测试: 扁平帧的 diff

Phase 2: 嵌套 + 词级别
  □ InlineFrame 递归 diff
  □ 词级别 diff (复用已有 LCS word diff)
  □ 长文本阈值 (≥ 20 字符)
  □ 数组内 InlineFrame 匹配 (按 ID 或 type)
  □ 测试: 深度嵌套帧的 diff

Phase 3: 三方合并
  □ threeWayMerge() — 递归三方比较
  □ 冲突检测 (同路径两边都改)
  □ 冲突结果类型定义
  □ 测试: 干净合并 + 冲突场景

Phase 4: 展示
  □ 路径列表视图 (概览)
  □ YAML 内联高亮视图 (详细)
  □ 合并工作区 UI (冲突解决)
```

---

## 十一、对比总结

```
                    Sentence Diff (V4)        Frame Diff (V5)
                    ──────────────────        ─────────────────
匹配方式            Jaccard 概率匹配           按 ID/KEY 确定匹配
复杂度              O(N*M) Hungarian          O(N) ID lookup
嵌套支持            ❌ 扁平句子列表            ✓ 递归任意深度
精度               句子级                     slot 级 + 词级
长文本 diff         ✓ LCS                     ✓ 复用同一个 LCS
数组处理            N/A                       set/list 语义可选
结果可读性          "句子变了"                 "budget: 5000→3000"
确定性              概率性（相似度阈值）        确定性（ID 匹配）

结论: Frame Diff 更简单、更精确、更适合嵌套结构。
已有的 LCS word diff 直接复用，不需要重写。
```
