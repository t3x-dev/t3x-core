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
    created?: string;
}
export interface MetadataSignature {
    signatory: string;
    timestamp: string;
    status: SignatureStatus;
}
export interface Metadata {
    branch?: string | MetadataBranch;
    signature?: MetadataSignature;
    last_merge?: string;
}
export interface MergeConflict {
    path: string;
    ours?: string;
    theirs?: string;
    status: "unresolved" | "resolved";
}
export interface MergeInfo {
    from: string;
    into: string;
    summary?: string;
    conflicts?: MergeConflict[];
    resolution?: "ours" | "theirs" | "manual";
}
export interface ToolingLineage {
    commits?: string[];
    branches?: string[];
    merge_base?: string;
    signature_state?: SignatureStatus;
}
export interface UsageSummary {
    operations?: {
        merge?: number;
        diff?: number;
        commit?: number;
    };
    last_diff?: string;
}
export interface ConversationEnvelope {
    source?: "user" | "assistant" | "tool" | "cf-branch";
}
export interface GoldConversationV2 extends GoldConversation {
    metadata?: Metadata;
    merge?: MergeInfo;
    _tooling?: {
        lineage?: ToolingLineage;
        snapshot?: string;
    };
    usage_summary?: UsageSummary;
    conversations?: ConversationEnvelope[];
}
export declare const enGoldConversationsV2: GoldConversationV2[];
export declare const zhGoldConversationsV2: GoldConversationV2[];
export declare const branchConversations: GoldConversationV2[];
export declare const mergeSuccessConversations: GoldConversationV2[];
export declare const conflictConversations: GoldConversationV2[];
export declare const signatureAuditConversations: GoldConversationV2[];
export declare const diffExplainConversations: GoldConversationV2[];
/** 包含全部 V2 结构（供你在测试中断言扩展字段） */
export declare const goldConversationsV2: GoldConversationV2[];
/** 向后兼容：降级为旧结构，直接供 Evidence@1 使用 */
export declare const goldConversations: GoldConversation[];
/** 向后兼容：保留过往命名 allGoldConversations */
export declare const allGoldConversations: GoldConversation[];
/** 也可导出默认（兼容你原本只 import goldConversations 的写法） */
export default goldConversations;
