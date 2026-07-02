export type YSchemaValidationStatus = 'pending' | 'checking' | 'verified' | 'failed' | 'stale';

export interface YSchemaValidationRunLike {
  id: string;
  commit_hash: string;
  schema_name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'stale';
  valid: boolean;
  ready: boolean;
  error_count: number;
  gap_count: number;
  fix_count: number;
  finished_at: string | null;
  created_at: string;
}

export interface YSchemaValidationSummary {
  checkedAt: string | null;
  commitHash?: string;
  errorCount: number;
  fixCount: number;
  gapCount: number;
  ready: boolean;
  runId?: string;
  schemaName?: string;
  status: YSchemaValidationStatus;
  valid: boolean;
}

export function toYSchemaValidationSummary(
  run: YSchemaValidationRunLike | null | undefined
): YSchemaValidationSummary | null {
  if (!run) return null;

  return {
    checkedAt: run.finished_at ?? run.created_at,
    commitHash: run.commit_hash,
    errorCount: run.error_count,
    fixCount: run.fix_count,
    gapCount: run.gap_count,
    ready: run.ready,
    runId: run.id,
    schemaName: run.schema_name,
    status: deriveYSchemaValidationStatus(run),
    valid: run.valid,
  };
}

export function getYSchemaValidationPrimaryLabel(
  validation: YSchemaValidationSummary | null | undefined
) {
  if (!validation) return 'YSchema pending';

  switch (validation.status) {
    case 'verified':
      return 'YSchema verified';
    case 'failed':
      return validation.gapCount > 0
        ? `YSchema failed · ${validation.gapCount} gaps`
        : 'YSchema failed';
    case 'checking':
      return 'YSchema checking';
    case 'stale':
      return 'YSchema stale';
    case 'pending':
      return 'YSchema pending';
  }
}

export function getYSchemaValidationCommitLabel(
  validation: YSchemaValidationSummary | null | undefined
) {
  if (!validation?.commitHash) return 'No verified commit';
  const shortHash = validation.commitHash.replace(/^sha256:/, '').slice(0, 8);
  return validation.status === 'verified' ? `Verified ${shortHash}` : `Checked ${shortHash}`;
}

function deriveYSchemaValidationStatus(run: YSchemaValidationRunLike): YSchemaValidationStatus {
  if (run.status === 'pending' || run.status === 'running') return 'checking';
  if (run.status === 'stale') return 'stale';
  if (run.status === 'passed' && run.valid && run.ready) return 'verified';
  return 'failed';
}
