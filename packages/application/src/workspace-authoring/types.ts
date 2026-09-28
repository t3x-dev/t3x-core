import type {
  ProposalGenerationPreparationV1,
  ProposalStatement,
  NativeYOp as YOp,
} from '@t3x-dev/core';

export type DraftDocument =
  | string
  | number
  | boolean
  | null
  | DraftDocument[]
  | { readonly [key: string]: DraftDocument };

export const DRAFT_ACTION_LEDGER_SCHEMA = 't3x.application/draft-action-ledger/v1' as const;
export const DRAFT_ACTION_SCHEMA = 't3x.application/draft-action/v1' as const;

export type DraftActionChannel = 'manual' | 'mcp' | 'assistant' | 'import';

export interface DraftActionActor {
  readonly kind: 'human' | 'agent' | 'service';
  readonly id: string;
  readonly delegator?: {
    readonly kind: string;
    readonly id: string;
  };
}

export interface DraftNodeLineage {
  readonly nodeId: string;
  readonly path: string;
  readonly fromRevision: number;
  readonly toRevision: number | null;
}

export interface DraftActionGeneration {
  readonly transitionId: string;
  readonly preparationDigest: string;
  readonly preparation: ProposalGenerationPreparationV1;
  readonly proposal: ProposalStatement;
}

export interface DraftActionRecord {
  readonly schema: typeof DRAFT_ACTION_SCHEMA;
  readonly actionId: string;
  readonly sequence: number;
  readonly channel: DraftActionChannel;
  readonly actor: DraftActionActor;
  readonly publishedAt: string;
  readonly precondition?: { readonly workspaceRevision: number; readonly refHead: string | null };
  readonly targetRevision?: number;
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly operations: readonly YOp[];
  readonly operationsDigest: string;
  readonly requestDigest: string;
  readonly reason?: string;
  readonly generation?: DraftActionGeneration;
}

export interface DraftActionLedger {
  readonly schema: typeof DRAFT_ACTION_LEDGER_SCHEMA;
  readonly version: 1;
  readonly base: DraftDocument;
  readonly compositionRevision: number;
  readonly actions: readonly DraftActionRecord[];
  readonly receipts?: readonly (DraftActionReceipt & { readonly requestDigest: string })[];
  readonly lineage: readonly DraftNodeLineage[];
}

export interface PublishDraftActionInput {
  readonly actionId: string;
  readonly channel: DraftActionChannel;
  readonly actor: DraftActionActor;
  readonly operations: readonly YOp[];
  readonly expectedRevision: number;
  readonly publishedAt: string;
  readonly reason?: string;
  readonly generation?: DraftActionGeneration;
  readonly precondition?: { readonly workspaceRevision: number; readonly refHead: string | null };
  readonly targetRevision?: number;
}

export interface DraftActionReceipt {
  readonly actionId: string;
  readonly outcome: 'no_change' | 'apply_failed';
  readonly expectedRevision: number;
  readonly compositionRevision: number;
  readonly message: string;
}

export type PublishDraftActionResult =
  | {
      readonly kind: 'published';
      readonly ledger: DraftActionLedger;
      readonly action: DraftActionRecord;
    }
  | {
      readonly kind: 'reused';
      readonly ledger: DraftActionLedger;
      readonly action: DraftActionRecord;
    }
  | {
      readonly kind: 'conflict';
      readonly ledger: DraftActionLedger;
      readonly reason: 'idempotency_mismatch' | 'stale_revision';
      readonly message: string;
    }
  | {
      readonly kind: 'rejected';
      readonly ledger: DraftActionLedger;
      readonly reason: 'historical_write' | 'apply_failed';
      readonly message: string;
    }
  | {
      readonly kind: 'no_change';
      readonly ledger: DraftActionLedger;
      readonly receipt: DraftActionReceipt;
    };

export interface DraftNodeCard {
  readonly nodeId: string;
  readonly path: string;
  readonly beforePath?: string;
  readonly afterPath?: string;
  readonly before: DraftDocument | undefined;
  readonly after: DraftDocument | undefined;
}

export interface DraftActionView {
  readonly action: DraftActionRecord;
  readonly cards: readonly DraftNodeCard[];
}

export interface DraftNodeHistoryEntry {
  readonly ownerNodeId: string;
  readonly publishedAt: string;
  readonly actor: DraftActionActor;
  readonly beforePath?: string;
  readonly afterPath?: string;
  readonly actionId: string;
  readonly sequence: number;
  readonly channel: DraftActionChannel;
  readonly revision: number;
  readonly before: DraftDocument | undefined;
  readonly after: DraftDocument | undefined;
  readonly isSelected: boolean;
}

export interface DraftNodeHistoryView {
  readonly state: 'present' | 'deleted' | 'unknown';
  readonly nodeId: string;
  readonly path: string | null;
  readonly current: DraftDocument | undefined;
  readonly entries: readonly DraftNodeHistoryEntry[];
}

export interface CompensatePreview {
  readonly actionId: string;
  readonly operations: readonly YOp[];
  readonly conflicts: readonly {
    readonly path: string;
    readonly expected: DraftDocument | undefined;
    readonly current: DraftDocument | undefined;
  }[];
}
