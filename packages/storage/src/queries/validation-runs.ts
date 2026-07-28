import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type ValidationFindingRecord,
  type ValidationRunRecord,
  type ValidationStepRunRecord,
  validationFindings,
  validationRuns,
  validationStepRuns,
} from '../schema';

export type ValidationRunStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'stale'
  | 'environment_required'
  | 'timed_out';

export type ValidationStepRunStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'environment_required'
  | 'timed_out';

export type ValidationGateStatus = 'ready' | 'blocked' | 'pending' | 'stale';
export type ValidationFindingSeverity = 'error' | 'warning' | 'info';

export interface CreateValidationRunInput {
  project_id: string;
  workspace_id: string;
  subject_hash: string;
  workflow_name: string;
  workflow_hash: string;
  input_hash: string;
  validator_hash: string;
  provider: string;
  status: ValidationRunStatus;
  gate_status: ValidationGateStatus;
  environment_hash?: string | null;
  summary?: string | null;
  result_json?: Record<string, unknown>;
  started_at?: Date | null;
  finished_at?: Date | null;
}

export interface CreateValidationStepRunInput {
  run_id: string;
  step_id: string;
  name: string;
  status: ValidationStepRunStatus;
  summary?: string | null;
  error_code?: string | null;
  exit_code?: number | null;
  duration_ms?: number | null;
  command_json?: unknown[] | null;
  log_excerpt?: string | null;
  log_truncated?: boolean;
  log_artifact_id?: string | null;
  result_json?: Record<string, unknown>;
  started_at?: Date | null;
  finished_at?: Date | null;
}

export interface CreateValidationFindingInput {
  run_id: string;
  severity: ValidationFindingSeverity;
  code: string;
  message: string;
  step_run_id?: string | null;
  file?: string | null;
  line?: number | null;
  state_path?: string | null;
  log_excerpt?: string | null;
  evidence_json?: Record<string, unknown>;
}

export interface ValidationRunOutput {
  id: string;
  project_id: string;
  workspace_id: string;
  subject_type: 'candidate';
  subject_hash: string;
  workflow_name: string;
  workflow_hash: string;
  input_hash: string;
  validator_hash: string;
  environment_hash: string | null;
  provider: string;
  status: ValidationRunStatus;
  gate_status: ValidationGateStatus;
  summary: string | null;
  result_json: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface ValidationStepRunOutput {
  id: string;
  run_id: string;
  step_id: string;
  name: string;
  status: ValidationStepRunStatus;
  summary: string | null;
  error_code: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  command_json: unknown[] | null;
  log_excerpt: string | null;
  log_truncated: boolean;
  log_artifact_id: string | null;
  result_json: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface ValidationFindingOutput {
  id: string;
  run_id: string;
  step_run_id: string | null;
  severity: ValidationFindingSeverity;
  file: string | null;
  line: number | null;
  state_path: string | null;
  code: string;
  message: string;
  log_excerpt: string | null;
  evidence_json: Record<string, unknown>;
  created_at: string;
}

export interface ValidationRunDetailsOutput {
  run: ValidationRunOutput;
  steps: ValidationStepRunOutput[];
  findings: ValidationFindingOutput[];
}

export async function createValidationRun(
  db: AnyDB,
  input: CreateValidationRunInput
): Promise<ValidationRunOutput> {
  const [row] = await db
    .insert(validationRuns)
    .values({
      id: `vr_${shortId()}`,
      projectId: input.project_id,
      workspaceId: input.workspace_id,
      subjectType: 'candidate',
      subjectHash: input.subject_hash,
      workflowName: input.workflow_name,
      workflowHash: input.workflow_hash,
      inputHash: input.input_hash,
      validatorHash: input.validator_hash,
      environmentHash: input.environment_hash ?? null,
      provider: input.provider,
      status: input.status,
      gateStatus: input.gate_status,
      summary: input.summary ?? null,
      resultJson: input.result_json ?? {},
      startedAt: input.started_at ?? null,
      finishedAt: input.finished_at ?? null,
    })
    .returning();

  return runToOutput(row);
}

export async function createValidationStepRun(
  db: AnyDB,
  input: CreateValidationStepRunInput
): Promise<ValidationStepRunOutput> {
  const [row] = await db
    .insert(validationStepRuns)
    .values({
      id: `vsr_${shortId()}`,
      runId: input.run_id,
      stepId: input.step_id,
      name: input.name,
      status: input.status,
      summary: input.summary ?? null,
      errorCode: input.error_code ?? null,
      exitCode: input.exit_code ?? null,
      durationMs: input.duration_ms ?? null,
      commandJson: input.command_json ?? null,
      logExcerpt: input.log_excerpt ?? null,
      logTruncated: input.log_truncated ?? false,
      logArtifactId: input.log_artifact_id ?? null,
      resultJson: input.result_json ?? {},
      startedAt: input.started_at ?? null,
      finishedAt: input.finished_at ?? null,
    })
    .returning();

  return stepToOutput(row);
}

export async function createValidationFinding(
  db: AnyDB,
  input: CreateValidationFindingInput
): Promise<ValidationFindingOutput> {
  const [row] = await db
    .insert(validationFindings)
    .values({
      id: `vf_${shortId()}`,
      runId: input.run_id,
      stepRunId: input.step_run_id ?? null,
      severity: input.severity,
      file: input.file ?? null,
      line: input.line ?? null,
      statePath: input.state_path ?? null,
      code: input.code,
      message: input.message,
      logExcerpt: input.log_excerpt ?? null,
      evidenceJson: input.evidence_json ?? {},
    })
    .returning();

  return findingToOutput(row);
}

export async function findValidationRunDetailsById(
  db: AnyDB,
  id: string
): Promise<ValidationRunDetailsOutput | null> {
  const [runRow] = await db.select().from(validationRuns).where(eq(validationRuns.id, id)).limit(1);
  if (!runRow) return null;

  const [stepRows, findingRows] = await Promise.all([
    db
      .select()
      .from(validationStepRuns)
      .where(eq(validationStepRuns.runId, id))
      .orderBy(desc(validationStepRuns.createdAt), desc(validationStepRuns.id)),
    db
      .select()
      .from(validationFindings)
      .where(eq(validationFindings.runId, id))
      .orderBy(desc(validationFindings.createdAt), desc(validationFindings.id)),
  ]);

  return {
    run: runToOutput(runRow),
    steps: stepRows.map(stepToOutput),
    findings: findingRows.map(findingToOutput),
  };
}

export async function findLatestValidationRunByWorkspace(
  db: AnyDB,
  input: {
    project_id: string;
    workspace_id: string;
    workflow_name?: string;
  }
): Promise<ValidationRunOutput | null> {
  const conditions = [
    eq(validationRuns.projectId, input.project_id),
    eq(validationRuns.workspaceId, input.workspace_id),
  ];
  if (input.workflow_name) {
    conditions.push(eq(validationRuns.workflowName, input.workflow_name));
  }

  const [row] = await db
    .select()
    .from(validationRuns)
    .where(and(...conditions))
    .orderBy(desc(validationRuns.createdAt), desc(validationRuns.id))
    .limit(1);

  return row ? runToOutput(row) : null;
}

function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

function runToOutput(row: ValidationRunRecord): ValidationRunOutput {
  return {
    id: row.id,
    project_id: row.projectId,
    workspace_id: row.workspaceId,
    subject_type: row.subjectType as 'candidate',
    subject_hash: row.subjectHash,
    workflow_name: row.workflowName,
    workflow_hash: row.workflowHash,
    input_hash: row.inputHash,
    validator_hash: row.validatorHash,
    environment_hash: row.environmentHash,
    provider: row.provider,
    status: row.status as ValidationRunStatus,
    gate_status: row.gateStatus as ValidationGateStatus,
    summary: row.summary,
    result_json: row.resultJson,
    created_at: row.createdAt.toISOString(),
    started_at: row.startedAt?.toISOString() ?? null,
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

function stepToOutput(row: ValidationStepRunRecord): ValidationStepRunOutput {
  return {
    id: row.id,
    run_id: row.runId,
    step_id: row.stepId,
    name: row.name,
    status: row.status as ValidationStepRunStatus,
    summary: row.summary,
    error_code: row.errorCode,
    exit_code: row.exitCode,
    duration_ms: row.durationMs,
    command_json: row.commandJson ?? null,
    log_excerpt: row.logExcerpt,
    log_truncated: row.logTruncated,
    log_artifact_id: row.logArtifactId,
    result_json: row.resultJson,
    created_at: row.createdAt.toISOString(),
    started_at: row.startedAt?.toISOString() ?? null,
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

function findingToOutput(row: ValidationFindingRecord): ValidationFindingOutput {
  return {
    id: row.id,
    run_id: row.runId,
    step_run_id: row.stepRunId,
    severity: row.severity as ValidationFindingSeverity,
    file: row.file,
    line: row.line,
    state_path: row.statePath,
    code: row.code,
    message: row.message,
    log_excerpt: row.logExcerpt,
    evidence_json: row.evidenceJson,
    created_at: row.createdAt.toISOString(),
  };
}
