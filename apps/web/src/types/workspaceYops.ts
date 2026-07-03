export interface WorkspaceYOpsTreeNode {
  key: string;
  slots: Record<string, WorkspaceYOpsValue>;
  children: WorkspaceYOpsTreeNode[];
}

export type WorkspaceYOpsValue =
  | string
  | number
  | boolean
  | null
  | WorkspaceYOpsValue[]
  | { [key: string]: WorkspaceYOpsValue };

export type WorkspaceYOp =
  | { set: { path: string; value: WorkspaceYOpsValue } }
  | { append: { path: string; value: WorkspaceYOpsValue } }
  | { define: { path: string } }
  | { drop: { path: string } }
  | { unset: { path: string } };

export interface WorkspaceYOpsValidationResult {
  ok: boolean;
  applied: number;
  yops: WorkspaceYOp[];
  baselineTrees: WorkspaceYOpsTreeNode[];
  previewTrees?: WorkspaceYOpsTreeNode[];
  error?: {
    op_index: number;
    code: string;
    message: string;
  };
}
