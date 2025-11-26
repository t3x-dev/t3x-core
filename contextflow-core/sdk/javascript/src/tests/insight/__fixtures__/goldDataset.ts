import type { Turn } from "../../../insight/engine";

/** ---------- Legacy interface (保持与现有评测脚本兼容) ---------- */
export interface GoldConversation {
  id: string;
  turns: Turn[];
  expectedTopAspectContains: string;
}

/** ---------- V2 扩展可选字段 ---------- */
export type SignatureStatus = "valid" | "invalid" | "missing";

export interface MetadataBranch {
  name: string;
  parent?: string;
  created?: string; // ISO
}

export interface MetadataSignature {
  signatory: string; // e.g. "ethan <ethan@example.com>"
  timestamp: string; // ISO
  status: SignatureStatus;
}

export interface Metadata {
  branch?: string | MetadataBranch;
  signature?: MetadataSignature;
  last_merge?: string; // merge id/ref
}

export interface MergeConflict {
  path: string;
  ours?: string; // brief marker or hash
  theirs?: string; // brief marker or hash
  status: "unresolved" | "resolved";
}

export interface MergeInfo {
  from: string; // source branch
  into: string; // target branch
  summary?: string; // human/AI summary
  conflicts?: MergeConflict[];
  resolution?: "ours" | "theirs" | "manual";
}

export interface ToolingLineage {
  commits?: string[]; // commit ids
  branches?: string[]; // known branches
  merge_base?: string; // base commit id
  signature_state?: SignatureStatus;
}

export interface UsageSummary {
  operations?: {
    merge?: number;
    diff?: number;
    commit?: number;
  };
  last_diff?: string; // diff id or short summary
}

export interface ConversationEnvelope {
  source?: "user" | "assistant" | "tool" | "cf-branch";
}

export interface GoldConversationV2 extends GoldConversation {
  metadata?: Metadata;
  merge?: MergeInfo;
  _tooling?: { lineage?: ToolingLineage; snapshot?: string };
  usage_summary?: UsageSummary;
  conversations?: ConversationEnvelope[]; // 可选：记录来源轨道
}

/* ===================== 英文段（与上版相同，补充可选字段） ===================== */
export const enGoldConversationsV2: GoldConversationV2[] = [
  {
    id: "nyc-business-trip",
    turns: [
      {
        id: "t-39",
        text: "Planning a 3-day NYC business trip; hotel near Midtown preferred.",
        role: "user",
        timestamp: "2025-06-10T14:00:00Z",
      },
      {
        id: "t-40",
        text: "Total budget cap is $1500 including taxes.",
        role: "user",
        timestamp: "2025-06-10T14:03:00Z",
      },
    ],
    expectedTopAspectContains: "budget",
    metadata: {
      branch: { name: "main", created: "2025-06-10T13:59:00Z" },
      signature: {
        signatory: "ethan <ethan@example.com>",
        timestamp: "2025-06-10T14:03:05Z",
        status: "valid",
      },
    },
    _tooling: { lineage: { branches: ["main"], commits: ["c1a2b3"], signature_state: "valid" } },
    usage_summary: { operations: { commit: 1 } },
    conversations: [{ source: "user" }],
  },
  {
    id: "website-migration-cutover",
    turns: [
      {
        id: "t-41",
        text: "Let's schedule the migration cutover for Aug 12.",
        role: "assistant",
        timestamp: "2025-06-12T09:00:00Z",
      },
      {
        id: "t-42",
        text: "Please enforce a 48-hour deploy freeze beforehand.",
        role: "user",
        timestamp: "2025-06-12T09:05:00Z",
      },
    ],
    expectedTopAspectContains: "migration",
    metadata: { branch: "release/aug-cutover" },
    _tooling: { lineage: { branches: ["main", "release/aug-cutover"], merge_base: "b4se12" } },
    usage_summary: { operations: { diff: 1 } },
    conversations: [{ source: "cf-branch" }],
  },
  {
    id: "remote-policy-preference",
    turns: [
      {
        id: "t-43",
        text: "I strongly prefer remote work; I can come to the office once a week.",
        role: "user",
        timestamp: "2025-06-15T18:20:00Z",
      },
      {
        id: "t-44",
        text: "Short contracts under 9 months are not ideal for me.",
        role: "user",
        timestamp: "2025-06-15T18:22:00Z",
      },
    ],
    expectedTopAspectContains: "remote",
    metadata: { branch: "feature/remote-policy" },
    _tooling: { lineage: { branches: ["main", "feature/remote-policy"] } },
    conversations: [{ source: "user" }],
  },
  {
    id: "visa-invitation-letter",
    turns: [
      {
        id: "t-45",
        text: "I need an invitation letter for my visa application.",
        role: "user",
        timestamp: "2025-06-18T07:30:00Z",
      },
      {
        id: "t-46",
        text: "If possible, I’d like to book the appointment before June 1 next year.",
        role: "user",
        timestamp: "2025-06-18T07:32:00Z",
      },
    ],
    expectedTopAspectContains: "visa",
    metadata: { branch: "docs/visa" },
    conversations: [{ source: "user" }],
  },
  {
    id: "hotel-amenities-request",
    turns: [
      {
        id: "t-47",
        text: "Please book a non-smoking room on a quiet floor.",
        role: "user",
        timestamp: "2025-06-20T11:10:00Z",
      },
      {
        id: "t-48",
        text: "A gym on site is nice to have but not essential.",
        role: "assistant",
        timestamp: "2025-06-20T11:12:00Z",
      },
    ],
    expectedTopAspectContains: "non-smoking",
    metadata: { branch: "travel/pref" },
    conversations: [{ source: "assistant" }],
  },
];

/* ===================== 中文段（与上版相同，补充可选字段） ===================== */
export const zhGoldConversationsV2: GoldConversationV2[] = [
  {
    id: "shanghai-trip-budget",
    turns: [
      {
        id: "t-49",
        text: "下周去上海出差，酒店尽量靠近虹桥。",
        role: "user",
        timestamp: "2025-06-22T03:00:00Z",
      },
      {
        id: "t-50",
        text: "整体预算控制在 6000 人民币以内。",
        role: "user",
        timestamp: "2025-06-22T03:02:00Z",
      },
    ],
    expectedTopAspectContains: "预算",
    metadata: { branch: "travel/budgets" },
    conversations: [{ source: "user" }],
  },
  {
    id: "milestone-deadline",
    turns: [
      {
        id: "t-51",
        text: "里程碑一必须在 8 月 1 日前完成评审通过。",
        role: "assistant",
        timestamp: "2025-06-23T09:00:00Z",
      },
      {
        id: "t-52",
        text: "相关文档需提前两天提交。",
        role: "assistant",
        timestamp: "2025-06-23T09:01:00Z",
      },
    ],
    expectedTopAspectContains: "里程碑",
    metadata: { branch: { name: "release/m1", parent: "main", created: "2025-06-20T10:00:00Z" } },
    _tooling: { lineage: { branches: ["main", "release/m1"], merge_base: "deadbeef" } },
    conversations: [{ source: "cf-branch" }],
  },
  {
    id: "work-remote-cn",
    turns: [
      {
        id: "t-53",
        text: "我倾向于远程办公，每周最多进办公室一次。",
        role: "user",
        timestamp: "2025-06-24T06:30:00Z",
      },
      {
        id: "t-54",
        text: "如果必须现场，也希望提前一周通知。",
        role: "user",
        timestamp: "2025-06-24T06:32:00Z",
      },
    ],
    expectedTopAspectContains: "远程",
    metadata: { branch: "feature/remote-cn" },
    conversations: [{ source: "user" }],
  },
  {
    id: "contract-term-cn",
    turns: [
      {
        id: "t-55",
        text: "合同期至少 12 个月，低于 9 个月不考虑。",
        role: "user",
        timestamp: "2025-06-25T01:15:00Z",
      },
      {
        id: "t-56",
        text: "可在期末评估是否续约。",
        role: "assistant",
        timestamp: "2025-06-25T01:17:00Z",
      },
    ],
    expectedTopAspectContains: "合同",
    metadata: { branch: "hiring/policy" },
    conversations: [{ source: "assistant" }],
  },
  {
    id: "invoice-reimbursement",
    turns: [
      {
        id: "t-57",
        text: "报销需要开具增值税专用发票，抬头为公司名称。",
        role: "user",
        timestamp: "2025-06-26T12:40:00Z",
      },
      {
        id: "t-58",
        text: "请在 7 个工作日内寄出纸质发票。",
        role: "assistant",
        timestamp: "2025-06-26T12:42:00Z",
      },
    ],
    expectedTopAspectContains: "发票",
    metadata: { branch: "finance/invoice" },
    conversations: [{ source: "assistant" }],
  },
];

/* ===================== A. 分支对话（5 条） ===================== */
export const branchConversations: GoldConversationV2[] = [
  {
    id: "branch-create-feature",
    turns: [
      {
        id: "t-59",
        text: "Create a feature branch named feature/search-v2.",
        role: "user",
        timestamp: "2025-06-27T09:00:00Z",
      },
      {
        id: "t-60",
        text: "OK, tracking remote origin/feature/search-v2.",
        role: "assistant",
        timestamp: "2025-06-27T09:01:00Z",
      },
    ],
    expectedTopAspectContains: "feature",
    metadata: {
      branch: { name: "feature/search-v2", parent: "main", created: "2025-06-27T09:00:30Z" },
    },
    conversations: [{ source: "cf-branch" }],
    _tooling: { lineage: { branches: ["main", "feature/search-v2"] } },
  },
  {
    id: "branch-switch-main",
    turns: [
      {
        id: "t-61",
        text: "Switch back to main after code review.",
        role: "user",
        timestamp: "2025-06-27T10:00:00Z",
      },
      {
        id: "t-62",
        text: "Switched to branch 'main'.",
        role: "tool",
        timestamp: "2025-06-27T10:00:01Z",
      },
    ],
    expectedTopAspectContains: "main",
    metadata: { branch: "main" },
    conversations: [{ source: "tool" }],
  },
  {
    id: "branch-multiple-in-parallel",
    turns: [
      {
        id: "t-63",
        text: "We’ll run feature/payments and feature/invoices in parallel.",
        role: "assistant",
        timestamp: "2025-06-27T11:00:00Z",
      },
      {
        id: "t-64",
        text: "Keep both rebased weekly.",
        role: "assistant",
        timestamp: "2025-06-27T11:01:00Z",
      },
    ],
    expectedTopAspectContains: "feature",
    metadata: { branch: "feature/payments" },
    _tooling: { lineage: { branches: ["main", "feature/payments", "feature/invoices"] } },
  },
  {
    id: "branch-policy-naming",
    turns: [
      {
        id: "t-65",
        text: "Use naming: feature/*, fix/*, release/*.",
        role: "assistant",
        timestamp: "2025-06-27T12:10:00Z",
      },
      {
        id: "t-66",
        text: "Document it under CONTRIBUTING.md.",
        role: "user",
        timestamp: "2025-06-27T12:12:00Z",
      },
    ],
    expectedTopAspectContains: "feature",
    metadata: { branch: "docs/branch-policy" },
  },
  {
    id: "branch-delete-merged",
    turns: [
      {
        id: "t-67",
        text: "Delete branch feature/legacy-cleanup after merge.",
        role: "user",
        timestamp: "2025-06-27T13:30:00Z",
      },
      {
        id: "t-68",
        text: "Remote branch removed.",
        role: "tool",
        timestamp: "2025-06-27T13:30:02Z",
      },
    ],
    expectedTopAspectContains: "branch",
    metadata: { branch: "main" },
  },
];

/* ===================== B. 合并成功（3 条） ===================== */
export const mergeSuccessConversations: GoldConversationV2[] = [
  {
    id: "merge-success-search-v2",
    turns: [
      {
        id: "t-69",
        text: "Merge feature/search-v2 into main.",
        role: "user",
        timestamp: "2025-06-28T08:00:00Z",
      },
      {
        id: "t-70",
        text: "Merge completed. Run cf evidence to review.",
        role: "assistant",
        timestamp: "2025-06-28T08:02:00Z",
      },
    ],
    expectedTopAspectContains: "merge",
    metadata: { branch: "main", last_merge: "mrg-001" },
    merge: {
      from: "feature/search-v2",
      into: "main",
      summary: "Search API refactor merged cleanly",
    },
    _tooling: { lineage: { branches: ["main", "feature/search-v2"], merge_base: "b4se13" } },
    usage_summary: { operations: { merge: 1 }, last_diff: "diff-001" },
  },
  {
    id: "merge-success-invoices",
    turns: [
      {
        id: "t-71",
        text: "feature/invoices squash-merged, please link evidence to summary.",
        role: "assistant",
        timestamp: "2025-06-28T09:00:00Z",
      },
      {
        id: "t-72",
        text: "Evidence attached in SUMMARY.md.",
        role: "assistant",
        timestamp: "2025-06-28T09:01:00Z",
      },
    ],
    expectedTopAspectContains: "evidence",
    metadata: { branch: "main", last_merge: "mrg-002" },
    merge: { from: "feature/invoices", into: "main" },
    usage_summary: { operations: { merge: 1, commit: 1 } },
  },
  {
    id: "merge-success-release",
    turns: [
      {
        id: "t-73",
        text: "Release branch release/2025.07 merged into main.",
        role: "tool",
        timestamp: "2025-06-28T10:15:00Z",
      },
      {
        id: "t-74",
        text: "Tag v1.7.0 created.",
        role: "tool",
        timestamp: "2025-06-28T10:15:02Z",
      },
    ],
    expectedTopAspectContains: "merge",
    metadata: { branch: "main", last_merge: "mrg-003" },
    merge: { from: "release/2025.07", into: "main", summary: "Monthly release" },
  },
];

/* ===================== C. 冲突解决（6 条，总数达标） ===================== */
export const conflictConversations: GoldConversationV2[] = [
  {
    id: "merge-conflict-accept-theirs",
    turns: [
      {
        id: "t-75",
        text: "Conflict detected in src/pricing.ts.",
        role: "tool",
        timestamp: "2025-06-29T07:00:00Z",
      },
      {
        id: "t-76",
        text: "Resolve using 'accept theirs' for pricing logic.",
        role: "user",
        timestamp: "2025-06-29T07:01:00Z",
      },
    ],
    expectedTopAspectContains: "conflict",
    metadata: { branch: "feature/pricing" },
    merge: {
      from: "feature/pricing",
      into: "main",
      conflicts: [
        {
          path: "src/pricing.ts",
          ours: "computeA()",
          theirs: "computeB()",
          status: "resolved",
        },
      ],
      resolution: "theirs",
    },
    _tooling: { lineage: { branches: ["main", "feature/pricing"] } },
  },
  {
    id: "merge-conflict-manual",
    turns: [
      {
        id: "t-77",
        text: "Rebase shows conflicts in docs/README.md and api/routes.py.",
        role: "tool",
        timestamp: "2025-06-29T08:00:00Z",
      },
      {
        id: "t-78",
        text: "I’ll resolve manually and push.",
        role: "assistant",
        timestamp: "2025-06-29T08:02:00Z",
      },
    ],
    expectedTopAspectContains: "conflict",
    metadata: { branch: "feature/api-cleanup" },
    merge: {
      from: "feature/api-cleanup",
      into: "main",
      conflicts: [
        { path: "docs/README.md", status: "resolved" },
        { path: "api/routes.py", status: "resolved" },
      ],
      resolution: "manual",
    },
  },
  {
    id: "merge-conflict-accept-ours",
    turns: [
      {
        id: "t-83",
        text: "Merge reports conflict in frontend/src/App.tsx.",
        role: "tool",
        timestamp: "2025-06-29T09:10:00Z",
      },
      {
        id: "t-84",
        text: "Use 'accept ours' to keep local UI changes.",
        role: "user",
        timestamp: "2025-06-29T09:11:00Z",
      },
    ],
    expectedTopAspectContains: "conflict",
    metadata: { branch: "feature/ui-tweak" },
    merge: {
      from: "feature/ui-tweak",
      into: "main",
      conflicts: [{ path: "frontend/src/App.tsx", status: "resolved" }],
      resolution: "ours",
    },
  },
  {
    id: "merge-conflict-rename-modify",
    turns: [
      {
        id: "t-85",
        text: "Conflict: rename/modify detected on docs/CONTRIBUTING.md.",
        role: "tool",
        timestamp: "2025-06-29T09:30:00Z",
      },
      {
        id: "t-86",
        text: "Resolve manually and keep the new filename.",
        role: "assistant",
        timestamp: "2025-06-29T09:32:00Z",
      },
    ],
    expectedTopAspectContains: "conflict",
    metadata: { branch: "docs/structure" },
    merge: {
      from: "docs/structure",
      into: "main",
      conflicts: [{ path: "docs/CONTRIBUTING.md", status: "resolved" }],
      resolution: "manual",
    },
  },
  {
    id: "cherry-pick-conflict-abort",
    turns: [
      {
        id: "t-87",
        text: "Cherry-pick stopped due to conflict in migrations/001.sql.",
        role: "tool",
        timestamp: "2025-06-29T10:00:00Z",
      },
      {
        id: "t-88",
        text: "Abort cherry-pick and re-apply later.",
        role: "user",
        timestamp: "2025-06-29T10:02:00Z",
      },
    ],
    expectedTopAspectContains: "conflict",
    metadata: { branch: "hotfix/migration" },
    merge: {
      from: "hotfix/migration",
      into: "main",
      conflicts: [{ path: "migrations/001.sql", status: "resolved" }],
      resolution: "manual",
    },
  },
  {
    id: "trivial-whitespace-conflict",
    turns: [
      {
        id: "t-89",
        text: "Trivial whitespace-only conflicts in .github/config.yml.",
        role: "tool",
        timestamp: "2025-06-29T10:30:00Z",
      },
      {
        id: "t-90",
        text: "Auto-resolve and continue rebase.",
        role: "assistant",
        timestamp: "2025-06-29T10:31:00Z",
      },
    ],
    expectedTopAspectContains: "conflict",
    metadata: { branch: "chore/ci-tidy" },
    merge: {
      from: "chore/ci-tidy",
      into: "main",
      conflicts: [{ path: ".github/config.yml", status: "resolved" }],
      resolution: "manual",
    },
  },
];

/* ===================== D. 签名与审计（3 条，总数达标） ===================== */
export const signatureAuditConversations: GoldConversationV2[] = [
  {
    id: "signature-verify-chain",
    turns: [
      {
        id: "t-79",
        text: "Verify commit signatures for last 10 commits.",
        role: "user",
        timestamp: "2025-06-30T01:00:00Z",
      },
      {
        id: "t-80",
        text: "All signatures valid; hash chain intact.",
        role: "tool",
        timestamp: "2025-06-30T01:00:03Z",
      },
    ],
    expectedTopAspectContains: "signature",
    metadata: {
      branch: "main",
      signature: {
        signatory: "CI <ci@contextflow.dev>",
        timestamp: "2025-06-30T01:00:03Z",
        status: "valid",
      },
    },
    _tooling: { lineage: { commits: ["a1", "a2", "a3"], signature_state: "valid" } },
  },
  {
    id: "signature-invalid-detected",
    turns: [
      {
        id: "t-91",
        text: "Check the last commit signature.",
        role: "user",
        timestamp: "2025-06-30T01:20:00Z",
      },
      {
        id: "t-92",
        text: "Last commit signature INVALID (key not trusted).",
        role: "tool",
        timestamp: "2025-06-30T01:20:03Z",
      },
    ],
    expectedTopAspectContains: "signature",
    metadata: {
      branch: "main",
      signature: {
        signatory: "unknown <noreply@invalid>",
        timestamp: "2025-06-30T01:20:03Z",
        status: "invalid",
      },
    },
    _tooling: { lineage: { signature_state: "invalid" } },
  },
  {
    id: "signature-missing-reattach",
    turns: [
      {
        id: "t-93",
        text: "One commit was made without signing, can we re-sign?",
        role: "user",
        timestamp: "2025-06-30T01:40:00Z",
      },
      {
        id: "t-94",
        text: "Amended with -S. Chain verified as intact.",
        role: "assistant",
        timestamp: "2025-06-30T01:41:00Z",
      },
    ],
    expectedTopAspectContains: "signing",
    metadata: {
      branch: "main",
      signature: {
        signatory: "ethan <ethan@example.com>",
        timestamp: "2025-06-30T01:41:00Z",
        status: "valid",
      },
    },
    _tooling: { lineage: { signature_state: "valid" } },
  },
];

/* ===================== E. 变更解释（4 条，总数达标） ===================== */
export const diffExplainConversations: GoldConversationV2[] = [
  {
    id: "diff-aspect-explain",
    turns: [
      {
        id: "t-81",
        text: "Show :diff for feature/search-v2 vs main.",
        role: "user",
        timestamp: "2025-06-30T02:00:00Z",
      },
      {
        id: "t-82",
        text: "Aspect change: relevance scoring updated; evidence taken from tests/search.spec.ts.",
        role: "assistant",
        timestamp: "2025-06-30T02:01:00Z",
      },
    ],
    expectedTopAspectContains: "diff",
    metadata: { branch: "feature/search-v2" },
    usage_summary: { operations: { diff: 1 }, last_diff: "diff-002" },
    _tooling: { snapshot: "search-v2-vs-main@diff-002" },
  },
  {
    id: "diff-config-change",
    turns: [
      {
        id: "t-95",
        text: "Show :diff for config vs main.",
        role: "user",
        timestamp: "2025-06-30T02:10:00Z",
      },
      {
        id: "t-96",
        text: "Timeout increased 30s→60s; evidence from config.ts#L42.",
        role: "assistant",
        timestamp: "2025-06-30T02:11:00Z",
      },
    ],
    expectedTopAspectContains: "diff",
    metadata: { branch: "feature/config-timeout" },
    usage_summary: { operations: { diff: 1 }, last_diff: "diff-003" },
  },
  {
    id: "diff-api-breaking",
    turns: [
      {
        id: "t-97",
        text: "Explain breaking API changes in v2.",
        role: "user",
        timestamp: "2025-06-30T02:20:00Z",
      },
      {
        id: "t-98",
        text: "Removed /v1/search; renamed param q→query; evidence from CHANGELOG.md.",
        role: "assistant",
        timestamp: "2025-06-30T02:21:00Z",
      },
    ],
    expectedTopAspectContains: "breaking",
    metadata: { branch: "release/v2" },
    usage_summary: { operations: { diff: 1 }, last_diff: "diff-004" },
  },
  {
    id: "diff-copy-changes",
    turns: [
      {
        id: "t-99",
        text: "Summarize docs wording-only changes.",
        role: "user",
        timestamp: "2025-06-30T02:30:00Z",
      },
      {
        id: "t-100",
        text: "Copy edits only, no semantic change; evidence from docs commit 3f2c9a.",
        role: "assistant",
        timestamp: "2025-06-30T02:31:00Z",
      },
    ],
    expectedTopAspectContains: "semantic",
    metadata: { branch: "docs/copy-edits" },
    usage_summary: { operations: { diff: 1 }, last_diff: "diff-005" },
  },
];

/* ===================== 汇总导出 ===================== */
/** 包含全部 V2 结构（供你在测试中断言扩展字段） */
export const goldConversationsV2: GoldConversationV2[] = [
  ...enGoldConversationsV2,
  ...zhGoldConversationsV2,
  ...branchConversations,
  ...mergeSuccessConversations,
  ...conflictConversations,
  ...signatureAuditConversations,
  ...diffExplainConversations,
];

/** 向后兼容：降级为旧结构，直接供 Evidence@1 使用 */
export const goldConversations: GoldConversation[] = goldConversationsV2.map(
  ({ id, turns, expectedTopAspectContains }) => ({ id, turns, expectedTopAspectContains }),
);

/** 向后兼容：保留过往命名 allGoldConversations */
export const allGoldConversations: GoldConversation[] = goldConversations;

/** 也可导出默认（兼容你原本只 import goldConversations 的写法） */
export default goldConversations;
