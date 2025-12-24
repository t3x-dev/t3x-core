# T3X 架构化file格式(T3X 1.0)

> 本规范与 `docs/ARCHITECTURE.zh.md`,`docs/STORAGE_ARCHITECTURE.md` 保持一致:运行时的 JSONL Ledger 与 SQLite Indexes才是权威存储,`.t3x` file是 Ledger 的可移植export视图.`.cfpack` 指的就是该 JSON 逻辑结构;是否额外做 zip/gzip 等外层包装完全取决于实现,此处不作强制要求.下文统一使用 “`.t3x` / `.cfpack`” 指代这一归档格式.本documentation仅定义该export格式的字段与example,字段命名与 Ledger 完全对齐,便于导入/export与三方工具互operations.

---

## 1. 概述

T3X 架构化file(旧称 T3X Schema)是一套轻量的 JSON 规范,用于可移植地打包conversation Turn 链,Draft,Commit,Diff 以及额外的偏好/笔记/file等上下文.Schema 本身保持最小化,可在 CLI,SDK,云端或三方工具之间共享;复杂逻辑交给工具层实现.

## 2. 核心理念

- **Ledger 驱动**:所有决定论status等同于 JSONL Ledger 的子集,可validate,可重放.
- **最小required字段**:顶层只有 `t3x_version` 与 `metadata.created` 是硬性要求;`turns/drafts/commits/diffs` 各自的必填字段在对应章节列明.
- **自然结构**:围绕 turn,draft,commit,diff 组织,并允许附加 notes/preferences/files.
- **可移植**:纯 JSON,无供应商绑定,易于校验.
- **渐进增强**:格式简单,智能能力交由工具层;可随版本演进.

## 3. file格式

T3X file是扩展名为 `.t3x` 的 JSON documentation.

- **MIME**:`application/t3x+json`
- **扩展名**:`.t3x`

### 3.1 最小合法example

```json
{
  "t3x_version": "1.0",
  "metadata": {
    "created": "2025-10-06T12:00:00Z"
  },
  "turns": [],
  "drafts": [],
  "commits": []
}
```

### 3.2 顶层结构

```json
{
  "t3x_version": "1.0",
  "$schema": "https://t3x.dev/schema/v1.0.json",
  "metadata": { ... },
  "turns": [ ... ],
  "drafts": [ ... ],
  "commits": [ ... ],
  "diffs": [ ... ],
  "conversations": [ ... ],      // optional:UI 容器
  "notes": [ ... ],              // optional
  "preferences": { ... },        // optional
  "files": [ ... ],              // optional
  "prompts": [ ... ],            // optional
  "usage_summary": { ... },      // optional
  "_tooling": { ... }            // optional扩展
}
```

`turns/drafts/commits/diffs` 直接对应 JSONL Ledger.`conversations/notes/...` 属于产品层扩展,与hash链无关,可省略.

---

## 4. 字段定义(Ledger 同步)

### 4.1 Metadata

```json
{
  "metadata": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "created": "2025-10-06T12:00:00Z",
    "modified": "2025-10-06T14:30:00Z",
    "name": "My AI Context",
    "description": "Personal context for coding",
    "tags": ["coding", "personal"],
    "version": "1.0"
  }
}
```

- `created` 必填,其余optional.可加自定义字段,但不要覆盖 Ledger 字段.

### 4.2 Turns(Turn Ledger export)

每条 turn 记录必须包含hash链信息与 Ring 快照,以保证可复现.

```json
{
  "turns": [
    {
      "turn_hash": "sha256:e9f...",
      "parent_turn_hash": "sha256:aa1...",
      "project_id": "proj_demo",
      "conversation_id": "conv_main",
      "role": "user",
      "content": "I want to travel to Japan in November",
      "rings": {
        "ring1": {
          "keywords": [
            {"lemma": "travel", "polarity": +1},
            {"lemma": "Japan", "polarity": +1},
            {"lemma": "November", "polarity": +1}
          ],
          "time_anchor": "2025-11"
        },
        "ring2": {
          "intent_seed": ["plan_trip"],
          "time_window": "2025-11"
        },
        "ring3": {
          "segments": [
            {"id": "s1-1", "text": "I want to travel to Japan"},
            {"id": "s1-2", "text": "Prefer late November"}
          ]
        }
      },
      "metadata": {
        "model": "gpt-4.1-mini",
        "tokens": {"prompt": 32, "completion": 0}
      },
      "created_at": "2025-11-18T12:34:56Z",
      "schema_version": "turn_v1"
    }
  ]
}
```

要求:`turn_hash = SHA256(JCS(record_without_hash))`,`parent_turn_hash` 为空表示链起点.`rings` 字段与抽取插件output一致.

> description:Draft 生成时通常会遍历各 turn 的 Ring 1,将 `polarity = +1` 的关键词write `must_have`,`polarity = -1` write `mustnt_have`,以保证 Must/Mustn’t 与源上下文严格对应.

### 4.3 Drafts

Draft 记录 Draft→Commit 可复现所需的全部上下文.

```json
{
  "drafts": [
    {
      "draft_id": "draft_2025-11-18T12:40",
      "project_id": "proj_demo",
      "base_commit_hash": "sha256:commit_prev",
      "turn_anchor_hash": "sha256:e9f...",
      "bridge_id": "plan",
      "bridge_payload": {
        "prompt": "...桥接模版快照...",
        "threshold": 0.60
      },
      "must_have": ["travel", "Japan"],
      "mustnt_have": ["cancel"],
      "llm_config": {
        "provider": "openai",
        "model": "gpt-4.1",
        "temperature": 0.3,
        "max_tokens": 2048
      },
      "text": "...polished draft...",
      "status": "adopted",
      "created_at": "2025-11-18T12:42:00Z",
      "schema_version": "draft_v1"
    }
  ]
}
```

`status` 取 `ephemeral|adopted|superseded`.`bridge_payload` 应包含桥接模版,阈值,LLM 设定等关键信息.

### 4.4 Commits

Commit 数组描述semantic快照 DAG,与 Ledger 完全相同.

```json
{
  "commits": [
    {
      "commit_hash": "sha256:commit_tip",
      "parent_hashes": ["sha256:commit_prev"],
      "project_id": "proj_demo",
      "branch": "main",
      "turn_window": {
        "start_turn_hash": "sha256:aa1...",
        "end_turn_hash": "sha256:e9f..."
      },
      "facet_snapshot": [
        {"facet": "goal", "text": "Visit Japan in November"},
        {"facet": "constraints", "text": "Avoid crowded places"}
      ],
      "pipeline_config": {
        "extractors": {"plugin": "spacy@v1"},
        "embedder": {"plugin": "minilm@v2"},
        "thresholds": {"plan": 0.60}
      },
      "draft_ref": {
        "draft_id": "draft_2025-11-18T12:40",
        "text_hash": "sha256:draft_text"
      },
      "signature": {
        "algo": "ed25519",
        "key_id": "ed25519:demo",
        "value": "base64:..."
      },
      "created_at": "2025-11-18T12:45:00Z",
      "schema_version": "commit_v1"
    }
  ]
}
```

- Merge = `parent_hashes` 有多个元素;无需单独字段.
- `facet_snapshot` 与 Draft validate使用的 Ring 聚合一致.
- `pipeline_config`/`draft_ref` 负责保证重放时的configuration稳定.

> 术语description:本文中的 `commit_hash` 与 `docs/ARCHITECTURE.zh.md` **3.4 可复现性定义** 中example的 `commit_id` 是同一概念,均指对 canonical payload 做 JCS + SHA-256 得到的hash值.

### 4.5 Diffs(缓存,optional)

```json
{
  "diffs": [
    {
      "base_commit_hash": "sha256:commit_prev",
      "target_commit_hash": "sha256:commit_tip",
      "algo_version": "semantic_diff@v1",
      "diff_json": {"added": [...], "removed": [...]},
      "computed_at": "2025-11-18T12:46:00Z"
    }
  ]
}
```

Diff 仅作缓存,可安全delete并由工具重算.

---

## 5. optional扩展段落

这些字段不参与 Ledger,但对产品体验有用,可按需提供.

### 5.1 Conversations(UI 容器)

`conversations` 描述conversation元信息,消息内容应通过 `turn_hash` 引用 `turns` 数组,而不是重复存储.

```json
{
  "conversations": [
    {
      "id": "conv_main",
      "title": "Trip planning",
      "created": "2025-11-18T12:30:00Z",
      "source": "t3x-cli",
      "turn_refs": ["sha256:aa1...", "sha256:e9f..."]
    }
  ]
}
```

### 5.2 Notes / Preferences / Files / Prompts / Usage Summary

沿用旧版规范,字段含义不变;它们存储非 Ledger 数据(例如知识笔记,偏好,附件,tip词模板,使用统计).example略.

### 5.3 `_tooling`

供实现方扩展(如save额外Indexes,validate日志,嵌入缓存等).建议使用命名空间,避免与其他工具冲突.

```json
{
  "_tooling": {
    "t3x_cli": {
      "version": "1.2.3",
      "commands": ["cf draft", "cf commit"]
    },
    "lineage_reports": [ ... ]
  }
}
```

---

## 6. 溯源协议(Turn & Commit 链)

`.t3x` file一旦包含actual Ledger 数据,即应完整保留 Turn 链与 Commit DAG;空projectthen允许 `turns/commits` 为空数组.

1. **Turn 链**:`turns[*].turn_hash` 与 `parent_turn_hash` 构成只追加hash链;任何修改都会被检测.`hash = SHA256(JCS(record_without_hash))`.
2. **Commit 链**:`commits[*].parent_hashes` list父节点,Merge 只需写多个父hash.`turn_window.end_turn_hash` 记录生成快照时看到的最新 turn,以保证 Draft/Commit 对应的上下文可复现.

最小 commit 载荷为前述 `commit_v1` 结构;signature字段optional,但推荐启用以便审计.

### 6.1 工作流tip

- **继续conversation**:新增 turn 只追加到 `turns`,`parent_turn_hash` 指向上一条;确认 Draft 后write新的 commit,并在 `parent_hashes` 中引用当前 head.
- **Merge**:当存在branch时,生成 `parent_hashes` ⊃ 2 的 commit.merge后继续新增 turn,下一次 commit 的父hash即 merge commit.
- **validate**:增量operations只检查新增链段;完整审计可遍历 `.t3x.turns`/`.commits` 并重算hash.Draft 本身不进入 commit 链.

---

## 7. 安全与合规

1. **敏感信息**:file可能包含个人/商业机密,必要时加密存储.
2. **输入校验**:导入 `.t3x` 时务必validate字段与hash,防止注入或篡改.
3. **内容清洗**:展示前进行 XSS 过滤.
4. **访问控制**:限制能够读写 `.t3x` file的主体.
5. **secret keymanagement**:不要把 API Key 放进file,使用ring境variable或秘密management服务.

---

## 8. reference实现

- Python SDK:`sdk/python/`
- JavaScript/TypeScript SDK:`sdk/javascript/`
- CLI:`cli/`

---

## 9. 版本历史

### 1.0(2025-10-06)

- 初始发布,定义最小核心字段.
- 2025-11 修订:对齐 Ledger 结构,新增 `turns/drafts/commits/diffs`,hash链字段,Draft/Commit Canonical payload,Merge=多父 commit.

---

## 10. 贡献与许可

- 许可协议:MIT License.
- 贡献方式:在 GitHub(https://github.com/chivereaper/t3x)commit issue 或 PR.
- 相关documentation:`docs/ARCHITECTURE.zh.md`,`docs/STORAGE_ARCHITECTURE.md`,安装guide,CLI reference,FAQ 等.
