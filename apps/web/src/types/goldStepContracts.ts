/**
 * Gold Step Store Contracts
 *
 * 两人并行开发的共享合约。只定义接口签名，不写实现。
 * Person A 实现 draftStore / commandStore / editingStore
 * Person B 实现 phaseStore / hoverStore
 *
 * 合约锁定后不改。如需修改，两人同步确认。
 */

import type { SemanticContent, TreeNode, YOp, YOpsLogEntry, YOpsSource } from '@t3x-dev/core';

// ─────────────────────────────────────────────
// 共享类型
// ─────────────────────────────────────────────

/** 提取阶段（不含 'committing'，提交状态由 commitStore.isCommitting 管理） */
export type Phase = 'idle' | 'yops' | 'triage' | 'review';

/** 用户手动切换的 tab（可以独立于 phase） */
export type ViewTab = 'yops' | 'triage' | 'review';

/** 面板折叠状态 */
export type PanelMode = 'collapsed' | 'default';

/** 进入 Review 的路径 */
export type EntryPath = 'extract' | 'edit';

/** undo 栈条目 */
export interface UndoEntry {
  /** 原始操作 */
  ops: YOp[];
  /** 逆操作（undo 时应用） */
  inverseOps: YOp[];
}

// ─────────────────────────────────────────────
// A1. DraftStore — 语义数据唯一数据源
// ─────────────────────────────────────────────
// Owner: Person A
// 替代: extractionPanelStore 中的 draft/yopsLog 部分

export interface DraftStoreState {
  /** 当前 YAML 树（唯一写入点） */
  draft: SemanticContent;
  /** 操作日志（完整审计链） */
  yopsLog: YOpsLogEntry[];
  /** 最近 N 次 YOps 快照（用于 diff 显示） */
  yopsHistory: YOp[][];
  /** 被移除的节点（用于恢复） */
  removedNodes: TreeNode[];
  /** 提取流 YOp 实时 feed（给 YOpsFeed 组件用） */
  feedYops: YOp[];
  /** pipeline 步骤状态 */
  pipelineSteps: PipelineStep[];
  /** 是否正在提取 */
  isExtracting: boolean;
  /** 当前会话 ID */
  conversationId: string | null;
  /** 话题列表 */
  topics: Topic[];
  /** 当前活跃话题 */
  activeTopicId: string | null;
  /** 触发提取的回调（由 useExtractionStream 注册） */
  triggerExtract: ((opts?: TriggerExtractOptions) => void) | null;
}

export interface DraftStoreActions {
  /** 整体设置 draft（LLM 提取完成后调用） */
  setDraft(content: SemanticContent): void;
  /** 应用 YOps 到 draft（所有编辑的唯一入口） */
  applyYOps(ops: YOp[], source: YOpsSource, turnHash?: string): void;
  /** 重置 draft 及所有相关状态 */
  resetDraft(): void;
  /** 从 DB 恢复 YOps 日志 */
  hydrateYOpsLog(entries: YOpsLogEntry[]): void;
  /** 设置提取状态 */
  setExtracting(value: boolean): void;
  /** 设置会话 ID */
  setConversationId(id: string | null): void;
  /** 话题管理 */
  setTopics(topics: Topic[]): void;
  setActiveTopicId(id: string | null): void;
  addTopic(topic: Topic): void;
  /** 注册提取触发器 */
  setTriggerExtract(fn: ((opts?: TriggerExtractOptions) => void) | null): void;
}

export type DraftStore = DraftStoreState & DraftStoreActions;

// ─────────────────────────────────────────────
// A2. CommandStore — 命令模式 (undo/redo)
// ─────────────────────────────────────────────
// Owner: Person A
// 全新模块，extractionPanelStore 中没有对应物

export interface CommandStoreState {
  /** undo 栈 */
  undoStack: UndoEntry[];
  /** redo 栈 */
  redoStack: UndoEntry[];
  /** 所有未提交的变更（用于 PendingChangesBar 显示和 commit 时提交） */
  pendingOps: YOp[];
  /** 是否有未提交变更 */
  hasPending: boolean;
  /** 变更统计（用于 PendingChangesBar） */
  pendingSummary: PendingSummary;
}

export interface CommandStoreActions {
  /**
   * 执行 YOps：
   * 1. 用 yopInverse 计算逆操作
   * 2. 调 draftStore.applyYOps() 同步更新数据
   * 3. 入 undoStack + 追加 pendingOps
   * 4. 清空 redoStack
   */
  execute(ops: YOp[]): void;
  /**
   * 撤销：
   * 1. pop undoStack
   * 2. 应用 inverseOps 到 draftStore
   * 3. push 到 redoStack
   * 4. 从 pendingOps 移除对应的 ops
   */
  undo(): void;
  /**
   * 重做：
   * 1. pop redoStack
   * 2. 重新应用 ops 到 draftStore
   * 3. push 回 undoStack
   * 4. 追加到 pendingOps
   */
  redo(): void;
  /** 提交成功后清空所有栈和 pendingOps */
  clearPending(): void;
}

export type CommandStore = CommandStoreState & CommandStoreActions;

/** 变更统计 */
export interface PendingSummary {
  edits: number; // set（修改已有值）
  deletes: number; // unset + drop
  adds: number; // set（新增）+ add
  total: number;
}

// ─────────────────────────────────────────────
// B1. PhaseStore — 阶段状态机
// ─────────────────────────────────────────────
// Owner: Person B
// 替代: extractionPanelStore 中的 extractionPhase/panelMode 部分

export interface PhaseStoreState {
  /** 当前阶段（自动推进） */
  phase: Phase;
  /** 用户手动选择的 tab（可以回看之前阶段） */
  viewTab: ViewTab;
  /** 面板折叠状态 */
  panelMode: PanelMode;
  /** 进入 Review 的路径：'extract' 显示 ← Back，'edit' 不显示 */
  entryPath: EntryPath;
  /** Gate 质量问题 */
  gateIssues: Record<string, GateIssue[]>;
  /** 漂移检测 */
  driftDetected: boolean;
  driftInfo: DriftInfo | null;
  driftChoices: string[];
  /** 建议问题 */
  advisoryQuestions: AdvisoryQuestion[];
}

export interface PhaseStoreActions {
  /** 设置阶段（同时自动同步 viewTab） */
  setPhase(phase: Phase): void;
  /** 手动切换 tab */
  setViewTab(tab: ViewTab): void;
  /** 面板折叠 */
  setPanelMode(mode: PanelMode): void;
  setEntryPath(path: EntryPath): void;
  togglePanel(): void;
  /** Gate / Drift / Advisory */
  setGateIssues(issues: Record<string, GateIssue[]>): void;
  setDriftDetected(info: DriftInfo, choices: string[]): void;
  clearDrift(): void;
  setAdvisoryQuestions(questions: AdvisoryQuestion[]): void;
}

export type PhaseStore = PhaseStoreState & PhaseStoreActions;

// ─────────────────────────────────────────────
// B2. HoverStore — 双向高亮追踪
// ─────────────────────────────────────────────
// Owner: Person B
// 替代: extractionPanelStore 中的 hover 字段

export interface HoverStoreState {
  /** YAML 侧当前 hover 的节点 ID */
  hoveredNodeId: string | null;
  /** YAML 侧当前 hover 的 slot key */
  hoveredSlotKey: string | null;
  /** Chat 侧当前 hover 的 turn 索引 */
  hoveredTurnIndex: number | null;
  /** 是否需要滚动到 hover 位置 */
  scrollToCenter: boolean;
  /** hover 是否从 chat 侧触发 */
  hoveredFromChat: boolean;
  /** 焦点意图高亮 */
  focusIntentEnabled: boolean;
  /** LLM 高亮的节点 */
  llmHighlightedNodeIds: Record<string, boolean>;
}

export interface HoverStoreActions {
  /** YAML→Chat：hover 某个节点/slot（60ms debounce） */
  setHoveredNodeId(nodeId: string | null, slotKey?: string | null): void;
  /** Chat→YAML：hover 某个 turn（60ms debounce） */
  setHoveredTurnIndex(index: number | null): void;
  /** 焦点意图 */
  setFocusIntent(enabled: boolean): void;
  setLlmHighlightedNodeIds(ids: Record<string, boolean>): void;
}

export type HoverStore = HoverStoreState & HoverStoreActions;

// ─────────────────────────────────────────────
// A3. EditingStore — 内联编辑状态
// ─────────────────────────────────────────────
// Owner: Person A
// 全新模块

export interface EditingStoreState {
  /** 当前正在编辑的 slot（同时只允许一个） */
  editing: { nodeId: string; slotKey: string } | null;
  /** 当前正在新增 slot 的节点 */
  adding: { nodeId: string } | null;
}

export interface EditingStoreActions {
  /** 开始编辑某个 slot */
  startEdit(nodeId: string, slotKey: string): void;
  /** 结束编辑（保存或取消后调用） */
  stopEdit(): void;
  /** 开始在某节点下添加新 slot */
  startAdding(nodeId: string): void;
  /** 结束添加 */
  stopAdding(): void;
}

export type EditingStore = EditingStoreState & EditingStoreActions;

// ─────────────────────────────────────────────
// 辅助类型（两人共用）
// ─────────────────────────────────────────────

export interface PipelineStep {
  step: string;
  result?: unknown;
  timestamp: number;
}

export interface TriggerExtractOptions {
  topicId?: string;
  driftDecision?: string;
}

export interface Topic {
  id: string;
  conversation_id: string;
  project_id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface GateIssue {
  type: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface DriftInfo {
  relation?: string;
  new_topic?: string;
  old_topic?: string;
}

export interface AdvisoryQuestion {
  id: string;
  type: string;
  treeId: string;
  slotKey?: string;
  question: string;
  currentValue?: string;
}
