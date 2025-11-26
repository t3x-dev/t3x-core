# ContextFlow 架构总览（中文版）

**从语义框架到 Agentic 层：边界化设计**

---

## 1. 产品愿景与定位（确定）

### 一句话定义

> **ContextFlow 是“语义版 Git”** —— 让任何对话/讨论都能像代码一样被版本化、归档、校验与共享。
>
> 大语言模型（LLM）只是可插拔组件，而非产品核心。

---

## 2. 三层架构概览（确定）

| 层级 | 名称 | 职责 | 依赖 LLM 吗？ |
|------|------|------|----------------|
| **底层：Framework Core** | `contextflow-core` | 决定论抽取 + 证据 + 存储/版本：哈希、抽取 findings、持久化 turn（SQLite+JSONL）、diff、merge、commit、`.cfpack` 导出 | ❌ 不依赖 |
| **中层：Agentic Layer** | `contextflow-agents` | 可插拔 SummaryAgent / MergeAgent（可接 LLM 或纯规则） | ✅ 可选 |
| **顶层：Product Layer** | `contextflow.app` | CLI + WebUI（由外部项目实现，本仓库仅提供接口）用于交互、可视化与共享 | ❌（可加成） |

---

## 3. Framework Core（决定论层）

### 3.1 核心职责（确定）

> **术语说明**：本文使用 `Finding` 指“单条语义抽取结果”（例如一段句子、一个关键词），`Findings` 指该阶段输出的集合；下文若未特别说明，均指集合语义。

- **Conversation → Findings（Ring 1–3）→ Draft/Commit → Merge → .cfpack export**
- 保证整条语义流水线 **可重放、可验证、可导出**，并由本地存储兜底
- 核心算法/组件：
  - **哈希链**：采用可复现的 JSON 规范化（当前实现为 JCS）+ SHA-256，为每个 turn / commit 生成内容哈希，并按顺序链接成哈希链
  - **提取器环**：Ring 1（表层关键词/实体）、Ring 2（轻关系 / Facet）、Ring 3（分句结构）由可插拔抽取插件生成（rule-based、spaCy、Stanza、自定
义），Ring 1 在此阶段就输出词形归一 + polarity
  - **证据/相似度评分**：嵌入插件暴露统一接口 `encode(text[])` / `similarity(vec, vec)`，默认内置 MiniLM / bge-small 等轻量模型；Draft 筛句与验证共用同一套评分逻辑，并可通过配置切换模型
  - **Findings 归一/聚合**：跨 turn 去重、同义词归并、极性校验，输出 Must-Have / Mustn’t-Have 清单供 Draft/Commit 验证
  - **存储**：所有 turn / conversation / draft / commit / merge / diff 写入 `.contextflow/` 下的 JSONL 作为语义账本，同时同步到 SQLite 作为查询索引；SQLite 可随时从 JSONL 重建
- **版本操作**：在 snapshot（draft / commit）之间执行 diff / merge，生成带哈希链的 commit，并预留签名字段（默认不开启，可接 Ed25519 等实现）
- **元数据记录**：在 commit / merge 中保存配置快照（提取器插件版本、嵌入模型、评分权重与阈值等），保障可复现与审计

### 3.1.1 Conversation → Turn Rings（新增）

每条对话严格按 turn 流水编号（`turn-1` 用户提问、`turn-2` LLM 回答……），并为每个 turn 构建三层 “Ring” 表示，供 diff / merge / commit 使用：

| Ring | 含义 | 产出方式 | 示例字段 |
|------|------|----------|----------|
| **Ring 1：主题主轴** | 关键词、实体、时间、偏好标签 | 抽取插件（默认：spaCy，可切换 Stanza / 规则等）负责实体/关键词提取，并在这一阶段完成词形归一与极性标注，便于后续区分 Must-Have / Mustn’t-Have | `keywords`, `time_anchor`, `topic`, `preference_keywords` |
| **Ring 2：轻关系 / Facet** | intent seed、时间窗口、软偏好、未知槽位等 | 抽取插件（可自选依存解析器）把依存结构映射成 facet 标签 | `intent_seed`, `time_window`, `preference_soft`, `unknown_slot` |
| **Ring 3：分句结构** | 将 turn 拆成句级片段 `s1-1`, `s1-2`... | 抽取插件（默认句子分割器） | `segments: ["s1-1","s1-2"]` |

> **约束：** Ring 1/2/3 必须由同一套抽取插件管线生成（默认：spaCy + 可选 Stanza）以确保决定性；所有 Ring 数据随 turn 存档，供后续 diff/merge/commit。

### 3.2 提取器与嵌入插件（确定）

- **Extractor Plugins**：所有 turn rings（关键词、关系、分句）都通过统一的纯函数接口生成，可选实现包括 rule-based YAML、spaCy、Stanza、自定义 pipeline（默认用 spaCy）。配置示例：
  ```yaml
  extractors:
    keywords:
      plugin: spacy
      model: en_core_web_sm
    segments:
      plugin: rule_based
  ```
  Ring 1 插件必须输出词形归一后的关键词，并附带 polarity 标注，确保后续 diff/merge 统一。
- **Embedding / Similarity Plugins**：暴露 `encode(text[]) -> vectors` 与 `similarity(vecA, vecB)` 接口，Draft 筛句与证据评分共用。示例：
  ```yaml
  sentence_encoder:
    plugin: minilm
    model: sentence-transformers/all-MiniLM-L6-v2
  evidence_scoring:
    plugin: bge_small
  ```
  MiniLM / bge-small 只是默认，实现可在配置里切换。原则：可插拔、可配置、开箱可用。

### 3.3 存储层（Ledger + 索引）（确定）

ContextFlow 的数据持久化分为两层：
	1.	JSONL 主账本（Ledger）
所有具有审计意义、必须可复现的状态（例如 Turn 链、Commit DAG）都会以 JSON Lines 形式写入 .contextflow/ 目录下的若干文件中。
	•	每条记录采用 JCS 规范化 + SHA-256 哈希，生成稳定的 *_hash 字段。
	•	Turn 使用 turn_hash + parent_turn_hash 形成只追加的哈希链；
	•	Commit 使用 commit_hash + parent_hashes[] 形成语义版本 DAG（多父节点即 Merge）。
	•	Draft 等中间产物可以根据需要选择持久化，以保证 Draft → Commit 过程可重放。
具体的 JSONL 路径、字段列表与哈希输入规则见 docs/STORAGE_ARCHITECTURE.md 与对应 JSON Schema。
	2.	SQLite 索引层（Index）
本地 SQLite 数据库仅用于 查询加速、关联与缓存，可以在任意时刻从 JSONL 主账本完整重建，不被视为“唯一真相来源”。
	•	projects / conversations：记录项目与对话容器的元数据（名称、标题、创建时间等）。
	•	turns：为每个 turn_hash 建索引，保存其 conversation_id、角色、时间戳以及对应的 JSONL 位置，方便按项目/对话快速查询历史。
	•	drafts（推荐增强）：索引 Draft Ledger，存储 base commit、bridge 配置、must-have/mustn’t-have 列表、LLM 配置等，便于重现 Draft → Commit 的生成过程。
	•	commits：为每个 commit_hash 建索引，记录其所在项目/分支、父列表、turn 窗口、facet 快照与 pipeline 配置等，是“语义版本历史”的主要入口。
	•	diffs（缓存）：按 (base_commit_hash, target_commit_hash, algo_version) 缓存结构化语义 diff 结果，可随时清空并从 Commit Ledger 重算。
SQLite 层不会引入复杂事务或业务逻辑，只负责提供统一的查询接口；将来如迁移到 Postgres / 其他 KV 存储，只需复用同一套 Ledger JSON 结构与哈希规则，对外契约保持不变。

### 3.4 可复现性定义（确定）

每个 commit 都携带完整溯源元数据（采用 JCS 规范化 + SHA-256 计算 `commit_hash`，并记录父指针）。`turn_refs` 必须引用各个 turn 的内容哈希（即对 turn payload 做 JCS + SHA-256 后的结果）：

```json
{
  "commit_hash": "sha256:commit_tip",
  "parent_hashes": ["sha256:commit_prev"],
  "created_at": "2025-10-22T12:00:00Z",
  "turn_refs": [
    {"hash": "turn-sha256-aa...", "role": "user"},
    {"hash": "turn-sha256-bb...", "role": "assistant"}
  ],
  "turn_window": {
    "start_turn_hash": "sha256:start_turn",
    "end_turn_hash": "sha256:end_turn"
  },
  "facet_snapshot": [
    {"facet": "goal", "text": "Visit Japan in November"}
  ],
  "pipeline_config": {
    "id": "ring-default@v1",
    "sha256": "pipeline-sha256-xyz..."
  },
  "draft_ref": {
    "draft_id": "draft_123",
    "text_hash": "sha256:draft_text"
  },
  "signature": {
    "algo": "ed25519",
    "key_id": "ed25519:demo",
    "value": "base64:..."
  },
  "cfpack_format": "cfpack",
  "cfpack_schema_version": "1.0.0",
  "schema_version": "commit_v1"
}
```

### 3.5 句级语义 Diff（规划中）

新一代 diff 将直接利用 **Ring 3 分句** + MiniLM 相似度比较两个版本，并覆盖两类场景：

1. **Commit Diff（Draft 自检）**：Draft 完成后、Commit 之前，在同一分支内任选一个既有 commit（通常是父 commit，也可以是更早的祖先，只要在同一条链上），将“当前 draft（版本 A）”与该 commit 做语义 diff，确认新增/修改是否符合预期，决定是否提交。
2. **Merge Diff（预览）**：准备执行 merge 时，计算分支最新 commit 与目标分支（例如 `main`）最新 commit 之间的语义 diff，相当于展示 merge 预览；同时在 MergeAgent 阶段还会对 `base`、`source`、`target` 三个版本做细粒度对比，帮助定位冲突与缺失片段。

1. 取参考版本 A 的每个分句 `sA_i`，编码向量 `emb(sA_i)`；
2. 取目标版本 B 的全文（或聚合分句矩阵）编码 `Emb(B)`；
3. 计算 `cosine(emb(sA_i), Emb(B))`，高于阈值视为“相同”，否则为“不同/新增”。

> **开放问题（待 SPEC 补充）：**
> - **数字敏感度**：MiniLM 难区分 `$5000` vs `$6000`，需额外数值模块；
> - **极性/否定**：`想去日本` vs `不想去日本` 可能 embedding 接近，需结合 Ring 2 或规则；
> - **编码策略**：B 的整体向量是全文一次编码还是主题聚合待定。

该语义 diff 将作为 merge/commit 的依据，细节同步到 `specification.md`。

---

## 4. Agentic Layer：可插拔 Summary & Merge 设计

### SummaryAgent（原始的，没确定）

- **输入**：`conversation_diff`, `findings_index`, `evidence_index`
- **输出**：`findings_summaries` + `narrative_draft`
- **职能**：读取框架层 Findings → 组织证据 → 生成说明
- **模型选项**：OpenAI、Claude、本地 Llama 等

#### Draft Workflow（进行中）

1. **哈希窗口选择**
   - 沿当前 head 向后逐个回溯 turn hash，直到“上一份 draft commit”（含）为止。
   - Draft 始终看到“上一份 draft commit + 之后所有 turn”，这样重建 draft 时不会遗漏用户上下文。
2. **Intent & Bridge**
   - 用户选择桥接模板（如 `/plan`、`/explain`、`/summary`、`/clarify`、`/other`）。每个 bridge 都绑定一个 YAML 提示词片段，描述该风格如何撰写（固定但可维护），比如 `/plan` 的提示词会要求写清目标、里程碑、阻塞、下一步。yaml文件用户可以自己编辑。
   - 用户再输入自由 intent。Draft 逻辑会先串联“bridge 提示词 + intent”，即便用户意图描述很短，也能继承模板提供的结构化指导。
3. **嵌入筛选（Core）**
   - 读取窗口内所有对话与 commit 在 Ring 3 中已经切好的句子。
   - 将“bridge 提示词 + intent”与这些句子交给配置中的嵌入/相似度插件（默认 MiniLM）计算相似度，并按各 bridge 自定义的阈值筛选（0.60 只是示例，可按模板或用户配置调整）。
   - 每条被保留的句子记录其 `turn_hash` / `commit_hash`，并直接引用 Ring 1 已归一、已标注极性的关键词，把正极性词汇入 Must-Have、负极性词汇入 Mustn’t-Have。
4. **Polish（LLM）——Agentic / SummaryAgent**
   - Prompt 由桥接模板、用户 intent 以及嵌入筛选出的高相关分句组成。生成前让用户选择 LLM 温度（也可使用系统默认值），以控制创造/发散程度。无论温度如何，输出都必须符合 bridge 风格、紧贴 intent，并逐字保留来源分句里的关键词。
   - Prompt 还会附带 Ring 1 生成的 Must-Have / Mustn’t-Have 列表，要求 LLM “必须包含前者、禁止出现后者”。
5. **Validate 循环（Core）**
   - 根据嵌入筛选结果与 Ring 1 极性输出整理关键词列表，正号视为 Must-Have、负号视为 Mustn’t-Have。
   - 校验生成文本既要包含全部 Must-Have，又不能出现 Mustn’t-Have。若缺少 Must-Have，就把缺失清单连同上一版输出反馈给 LLM，回到第 4 步重新 polish；若含有 Mustn’t-Have，同样带着违规清单回到第 4 步重写。循环直到所有 Must-Have 完成覆盖且 Mustn’t-Have 全被清除。
6. **用户审核（Agentic 调用 Core）**
   - 展示校验后的 draft。用户“确认”则触发 `cf commit`；用户“评论”则重启 polish，并追加两类输入：(a) 上一版 draft 文本，(b) 用户评论。
   - 评论内容通过抽取插件获取关键词/极性后，追加到 Must-Have / Mustn’t-Have 列表供下一轮使用。

循环直至用户确认（进入 commit 链）或放弃（窗口留给下一次 draft）。  
> **补充说明（2025-11）**：步骤 3/5 以及 Must/Mustn’t 列表管理由 Core 决定论执行；步骤 4/6 由 Agentic SummaryAgent 负责（桥接模板 + LLM 生成）。Bridge YAML 模板位于 `.contextflow/bridges/`，CLI 初始化时写入默认版本，Agentic 直接读取该目录。
（少一部分，对于关键词的处理，同义关键词合并，关键词时态的合并，比如travel，traveling，traveled合并，近义词不能合并）
### MergeAgent（新增）

- **定位**：Merge 只发生在已有快照（commit）之间，用于将源分支的最新语义快照并入目标分支（例如把 feature 合回 main）。每次 Merge 都会生成一个新的 merge commit。
- **输入**：
  - `base_commit`：源分支与目标分支的共同祖先（初期可取分支切出时的 main commit，后续升级为最近公共祖先）
  - `source_commit`：源分支当前要合入的 commit（通常是 feature 分支的 tip）
  - `target_commit`：目标分支当前的 commit（通常是 main 的 tip）
- **输出**：
  - `merge_draft`：三方合并后的语义快照，包含自动合并结果与冲突标记
  - `merge_plan`：按 facet / 段落列举 base→source、base→target 的变化，用于 UI 呈现
  - `merge_commit`：用户确认 merge draft 后写入目标分支的新 commit（`parents = [target_commit, source_commit]`）
- **流程**：
  1. **三方语义 diff**：分别计算 `diff(base, source)` 与 `diff(base, target)`，对每个 facet / 文本块判断“仅一侧修改”“双方相同修改”“双方冲突修改”。
  2. **自动合并**：对无冲突单元自动选择来源；若两侧修改一致则取修改后的结果；冲突单元记录双方内容与上下文证据。
  3. **生成 merge draft**：把自动合并后的快照落盘为 merge draft，metadata 中包含 base/source/target 指针、冲突计数等。此快照通过 UI 展示为 “Merge Diff 预览”（即合并结果 VS 当前 target 的语义差）。
4. **用户解决冲突**：用户在 merge draft 中查看 facet diff / 文本对比，对冲突单元选择保留 target/source 或手动编辑，也可调用 LLM 给出折中建议。
  5. **产出 merge commit**：用户确认后，将当前 merge draft 固化为 merge commit，挂在目标分支（例如 main）并更新分支指针。
> **补充说明（2025-11）**：
> - 若源分支尚未产生任何 commit（只有 turns），需先完成一次 Draft→Commit 流程，否则无法 merge。
> - 若出现孤立分支没有共同祖先，需显式指定 `base_commit`（可退化为空快照或目标分支当前 HEAD），并在 merge 前通过 rebase/fast-forward 建立语义链路。

---

## 5. Product Layer：CLI + WebUI 体验（确定）

### CLI 说明

CLI 由外部项目实现，用户进入 ContextFlow 会话后会通过 `/command`（如 `/draft`、`/commit`、`/diff`、`/merge` 等）触发核心能力。本仓库仅提供 Draft / Commit / Diff / Merge / `.cfpack` 等决定论 API，CLI 的界面与命令解析逻辑均由外部项目负责。

### WebUI 模块（说明）

本仓库仅提供框架/后端能力，WebUI 由另一个项目负责对接，这里不展开。

---

## 6. 边界定义（确定）

> **说明**：
> - “决定论”指：同一输入、同一版本下必然得到同一输出（不依赖随机数 / LLM）。
> - “可替换”指：只要遵守数据/接口契约，就可以用其他实现替换本仓库的默认实现。

| 模块 | 所属层 | 决定论？ | 可替换？ | 备注 |
|------|--------|----------|----------|------|
| Conversation store | Core | ✅ | ✅ | 语义数据契约固定，存储引擎可换（`.contextflow` JSONL / SQLite 等符合 `schema/` 与 `STORAGE_ARCHITECTURE.md`） |
| Extractor rings & Findings 归一器 | Core | ✅ | ✅ | 算法必须可重放；实现以插件方式存在，可换 spaCy / Stanza / 规则引擎等 |
| Evidence scoring | Core | ✅ | ✅ | 纯函数式打分器，可插拔 BM25 / 相似度模型 / 规则策略 |
| SummaryAgent | Agentic | ❌ | ✅ | LLM / 模板 |
| MergeAgent | Agentic | ❌ | ✅ | 可选 |
| CLI 接口（外部实现） | Product | ✅ | ✅ | 只负责协议编解码 + 调用 Core API，本仓库不绑定具体 CLI 实现 |
| WebUI 接口（外部实现） | Product | ✅ | ✅ | 提供 HTTP/RPC 契约，前端 UI 由其他项目实现，本仓库仅提供后端能力 |

---

## 7. `.cfpack`（语义归档格式）（原始的，没确定）

`.cfpack` 是 ContextFlow 的语义归档 / 互操作格式，用于在不同实现之间交换完整的语义版本历史。它不是运行时唯一的数据结构，而是面向导入/导出、备份与审计的开放协议。

- **单文件 JSON 容器**：
  - `version` / `cfpack_schema_version`：格式版本
  - `turns`：对话 turn 列表及其哈希链
  - `findings`：归一后的 findings 与 evidence 快照
  - `commits`：语义 commit 链及 branch / merge lineage
  - `pipeline` / `config_snapshot`：引用的抽取/聚合配置（`id` + `sha256`）与可复现性相关阈值
  - `hash`：包级哈希算法描述（如 `sha256-jcs-v1`）及校验信息
  - `meta`：项目元信息、生成时间、可选 implementation 标识
- **设计约束**：
  - 仅依赖 JSON + SHA-256，任意语言都能实现解析与验证。
  - 包含自描述与可验证的元数据：即使没有原始数据库，也能复现 commit 视图与哈希链。
  - 作为开放格式，第三方系统只需实现 `.cfpack` 读写即可接入 ContextFlow 生态，与本仓库实现解耦。

---

## 8. 可扩展生态（规划中）
> 以下为规划中的插件挂点，接口形态以实际 SDK 实现为准。
| 模块 | 开放接口 | 示例 |
|------|----------|------|
| Embedder 插件 | `register_embedder()` | bge-small, MiniLM, Instructor-xl |
| Agent 插件 | `register_agent()` | claude-summary, openai-merge |
| 存储后端 | `register_storage()` | LocalFS, GitHub, S3 |
| Exporter | `register_exporter()` | JSON, Markdown, PDF, Neo4j |

---

## 9. 商业与开源策略（规划中）

| 模块 | 开源 | 收费 |
|------|------|------|
| `contextflow-core` | ✅ MIT / Apache 2.0 | ❌ |
| `contextflow-agents` | ✅（默认模板） | ❌ |
| `contextflow.app`（WebUI） | 部分开源 | ✅ SaaS 模式 |
| `contextflow.cloud`（Hub） | ❌ | ✅ 私有语义仓库 + 协作 |

---

## 10. 运行示意（确定）

> **注**：Product 层可直接调用 Framework Core；Agentic Layer 为可选 LLM 增强。

```
┌───────────────────────────────────────────────────────────┐
│                       PRODUCT LAYER                       │
│  ┌───────────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │   CLI 接口    │  │   WebUI 接口 │  │  ContextFlow Hub │ │
│  │ (外部项目，   │  │ (外部项目，   │  │ (外部服务，接 Core│ │
│  │  对接 Core API)│  │  对接 Core API)│  │  API)            │ │
│  └──────┬────────┘  └──────┬──────┘  └──────────┬────────┘ │
└─────────┼─────────────────┼──────────────────────┼──────────┘
          │                 │                      │
┌─────────┼─────────────────┼──────────────────────┼──────────┐
│         │        AGENTIC LAYER（可选 LLM）        │          │
│  ┌──────▼──────────┐              ┌──────────────▼────────┐ │
│  │ SummaryAgent    │              │    MergeAgent         │ │
│  │ (GPT/Claude/    │              │  (冲突求解)           │ │
│  │  Local LLM)     │              │                       │ │
│  └─────────────────┘              └───────────────────────┘ │
└─────────┼────────────────────────────────┼─────────────────┘
          │                                │
┌─────────┼────────────────────────────────┼─────────────────┐
│         │         FRAMEWORK CORE（决定论）                │
│  ┌──────▼──────────────────────────────────▼─────────────┐ │
│  │  Conversation Store（JSONL 账本 + SQLite 索引）         ││
│  │    ↳ Hash（turn / commit 内容 + 流哈希链）              ││
│  │                                                       ││
│  │  Extractor Rings / Findings Aggregator                ││
│  │    ↳ 多插件抽取 + 归一/去重                           ││
│  │  Evidence Scoring                                     ││
│  │    ↳ 可插拔打分器（如 MiniLM / bge-small）           ││
│  │                                                       ││
│  │  Commit / Diff / Merge Engine（Snapshot only）        ││
│  │    ↳ 在 snapshot（draft / commit）之间执行语义差异/合并││
│  │                                                       ││
│  │  `.cfpack` Export                                     ││
│  │    ↳ 导出当前项目语义账本为开放格式                   ││
│  │                                                       ││
│  │  依赖：SHA-256、可插拔 embedding 模型（如 MiniLM、      ││
│  │        bge-small）、正则启发、确定性评分、溯源清单    ││
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

---

## 11. 设计原则（原始的，没确定）

1. **Determinism First**：框架 Core 层必须 100% 可复现
2. **Extractors, Not Slots**：语义事实来自可组合提取器 + Findings 聚合器，而非预先写死的一堆槽位
3. **LLM as Plugin**：核心能力与特定 LLM 解耦，Agentic 层可插拔
4. **Open Format**：`.cfpack` 作为开放 JSON 便于互操作
5. **Git-like UX**：沿用开发者熟悉的命令与心智模型
6. **Progressive Enhancement**：无外部模型亦可运行，接入后体验更优
7. **Minimal Core**：内核尽量小，更多能力通过插件或外部服务扩展

---

## 12. 技术挑战与解法（原始的，没确定）

| 挑战 | 问题 | 解法 |
|------|------|------|
| 稳定性 | 微小措辞导致提取抖动 | 提取器输出规范化 + 元提取去重 + 语义近邻阈值 |
| Findings 聚合冲突 | 语义冲突缺少唯一真值 | 基于证据的决定论 diff + 人类确认流程 + 可选 MergeAgent 建议 |
| 性能扩展 | 长对话成本高 | 增量索引、分块提取、缓存重复评分 |
| 可移植性 | 语义状态需跨系统 | `.cfpack` 开放格式 + 版本化元信息 |
| 可复现性 | 插件升级导致结果漂移 | 在 commit / `.cfpack` 中锁定 extractor / scoring 配置（`id + sha256`）并记录配置快照 |

---

## 13. 成功指标（原始的，没确定）

### 技术指标
- 决定论复现率：**100%**
- Findings 提取/聚合精度（人工标注）：**>85%**
- Merge 建议接受率：**>70%**

### 商业指标
- GitHub Stars：**6 个月目标 ≥ 1K**
- 活跃 CLI 用户：**2026 Q2 目标 ≥ 5K**
- SaaS ARR：**2026 Q4 目标 ≥ $100K**

---

## 14. 竞品定位（原始的，没确定）

| 产品 | 类别 | 依赖 LLM？ | 有版本控制？ | ContextFlow 优势 |
|------|------|------------|--------------|------------------|
| ChatGPT/Claude | 聊天 UI | ✅ | ❌ | 我们是基础设施 |
| Notion AI | 笔记 | ✅ | ❌ | 我们聚焦语义状态 |
| Git | 代码版控 | ❌ | ✅ | 我们处理语义而非语法 |
| LangChain / LlamaIndex | LLM Orchestration | ✅ | ❌ | 我们是语义状态机 + 版控，不是 prompt 流程 |
| **ContextFlow** | **语义版控** | **❌ 核心（Agentic 层可选接 LLM）** | **✅** | **决定论 Core + LLM 可插拔** |

---

_文档版本：2.0（中文对照）_  
_最后更新：2025-11-17_
