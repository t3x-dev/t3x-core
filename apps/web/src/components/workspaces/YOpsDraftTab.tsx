import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  GitCommitHorizontal,
  Loader2,
  Play,
  ScrollText,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWorkspaceCommit } from '@/hooks/workspaces/useWorkspaceCommit';
import { useWorkspaceYOps } from '@/hooks/workspaces/useWorkspaceYOps';
import type {
  WorkspaceCandidate,
  WorkspaceSchemaFieldStatus,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type { WorkspaceYOp, WorkspaceYOpsTreeNode } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';

export function YOpsDraftTab({
  candidate,
  onCommitted,
  yopsDraftSent,
}: {
  candidate: WorkspaceCandidate;
  onCommitted?: (commitHash: string) => void;
  yopsDraftSent?: boolean;
}) {
  const draft = candidate.yopsDraft;
  const [status, setStatus] = useState<
    'idle' | 'generating' | 'generated' | 'applying' | 'applied' | 'committing' | 'committed'
  >(candidate.lastCommitHash ? 'committed' : 'idle');
  const [generatedYOps, setGeneratedYOps] = useState<WorkspaceYOp[] | null>(null);
  const [materializedTrees, setMaterializedTrees] = useState<WorkspaceYOpsTreeNode[] | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [committedHash, setCommittedHash] = useState(candidate.lastCommitHash ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { commit } = useWorkspaceCommit(candidate);
  const { rootKey, validate } = useWorkspaceYOps(candidate);
  const yopsLines = generatedYOps
    ? buildYOpsCommandLines(generatedYOps)
    : buildYOpsScriptLines(draft.operations, rootKey);
  const changedPaths = useMemo(
    () =>
      new Set(
        generatedYOps
          ? generatedYOps.map(yopPreviewPath)
          : draft.operations.map((op) => operationPreviewPath(op, rootKey))
      ),
    [draft.operations, generatedYOps, rootKey]
  );
  const treeLines = materializedTrees ? buildTreeNodeLines(materializedTrees, changedPaths) : [];
  const pendingCount = Math.max(draft.operations.length - appliedCount, 0);
  const isBusy = status === 'generating' || status === 'applying' || status === 'committing';
  const canValidateProposal = draft.operations.length > 0 && !isBusy && !committedHash;
  const canApplyYOps = Boolean(generatedYOps) && status !== 'idle' && !isBusy && !committedHash;
  const statusText = getYOpsStatusText(status);
  const proposalMode = formatProposalMode(draft.proposalMode ?? 'fixture');
  const extractYOpsTitle = getExtractYOpsTitle({
    committedHash,
    isBusy,
    operationCount: draft.operations.length,
  });
  const applyYOpsTitle = getApplyYOpsTitle({
    committedHash,
    generated: Boolean(generatedYOps),
    isBusy,
  });
  const commitTitle = getCommitTitle({
    appliedCount,
    committedHash,
    isBusy,
  });

  useEffect(() => {
    if (!candidate.lastCommitHash) return;
    setCommittedHash(candidate.lastCommitHash);
    setStatus('committed');
  }, [candidate.lastCommitHash]);

  async function handleGenerate() {
    setStatus('generating');
    setErrorMessage(null);
    try {
      const result = await validate();
      setGeneratedYOps(result.yops);
      setAppliedCount(0);
      setMaterializedTrees(null);
      if (!result.ok) {
        setStatus('idle');
        setErrorMessage(
          `${result.error?.code ?? 'YOPS_INVALID'}: ${result.error?.message ?? 'YOps validation failed'}`
        );
        return;
      }
      setStatus('generated');
    } catch (error) {
      setStatus('idle');
      setErrorMessage(error instanceof Error ? error.message : 'YOps generation failed');
    }
  }

  async function handleApply() {
    setStatus('applying');
    setErrorMessage(null);
    try {
      const result = await validate();
      setGeneratedYOps(result.yops);
      if (!result.ok || !result.previewTrees) {
        setStatus('generated');
        setErrorMessage(
          `${result.error?.code ?? 'YOPS_INVALID'}: ${result.error?.message ?? 'YOps validation failed'}`
        );
        return;
      }
      setMaterializedTrees(result.previewTrees);
      setAppliedCount(result.applied);
      setStatus('applied');
    } catch (error) {
      setStatus(generatedYOps ? 'generated' : 'idle');
      setErrorMessage(error instanceof Error ? error.message : 'YOps apply failed');
    }
  }

  async function handleCommit() {
    if (!materializedTrees || appliedCount === 0 || committedHash) return;
    setStatus('committing');
    setErrorMessage(null);

    try {
      const hash = await commit(materializedTrees);
      setCommittedHash(hash);
      setStatus('committed');
      onCommitted?.(hash);
    } catch (error) {
      setStatus('applied');
      setErrorMessage(error instanceof Error ? error.message : 'Workspace commit failed');
    }
  }

  return (
    <div className="flex min-h-[620px] flex-col overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--workspace-panel)]">
      <header className="flex min-h-10 items-center gap-3 border-b border-[var(--stroke-divider)] px-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            YOps proposal workspace
          </h3>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Badge
            className="border-[var(--accent-extract)]/30 bg-[var(--accent-extract)]/10 text-[var(--accent-extract)]"
            variant="outline"
          >
            {proposalMode}
          </Badge>
          <Badge variant="commit-subtle">Materialized {appliedCount}</Badge>
          <Badge variant="pending-subtle">Pending {pendingCount}</Badge>
          {yopsDraftSent ? <Badge variant="pending-subtle">Proposal ready</Badge> : null}
          {committedHash ? <Badge variant="commit">{shortHash(committedHash)}</Badge> : null}
          <span className="max-w-[180px] truncate text-[10px] font-medium text-[var(--text-tertiary)]">
            {statusText}
          </span>
          <Button
            disabled={!canValidateProposal}
            onClick={handleGenerate}
            size="sm"
            title={extractYOpsTitle}
            type="button"
            variant="canvas-outline"
          >
            {status === 'generating' ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Play aria-hidden="true" className="size-4" />
            )}
            Validate proposal
          </Button>
          <Button
            disabled={!canApplyYOps}
            onClick={handleApply}
            size="sm"
            title={applyYOpsTitle}
            type="button"
            variant="commit"
          >
            {status === 'applying' ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="size-4" />
            )}
            Apply YOps
          </Button>
        </div>
      </header>

      {errorMessage ? (
        <div
          className="flex items-start gap-2 border-b border-[var(--stroke-divider)] bg-[var(--diff-modified-bg)] px-3 py-2 text-xs text-[var(--text-secondary)]"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]"
          />
          <span className="min-w-0 break-words">{errorMessage}</span>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section
          aria-label="YOps proposal"
          className="flex min-h-[360px] min-w-0 flex-col border-b border-[var(--stroke-divider)] lg:border-r lg:border-b-0"
        >
          <PaneHeader
            icon={<ScrollText aria-hidden="true" className="size-4 text-[var(--accent-extract)]" />}
            label="YOps proposal"
            meta={`${generatedYOps?.length ?? draft.operations.length} ops`}
          />
          <CodePane lines={yopsLines} />
        </section>

        <section aria-label="YOps YAML tree" className="flex min-h-[360px] min-w-0 flex-col">
          <PaneHeader
            icon={<Braces aria-hidden="true" className="size-4 text-[var(--accent-commit)]" />}
            label="YAML tree"
            meta={
              materializedTrees
                ? `${appliedCount} applied`
                : generatedYOps
                  ? 'Ready to apply'
                  : 'Waiting for apply'
            }
          />
          {materializedTrees ? (
            <TreePane lines={treeLines} />
          ) : (
            <YOpsTreePendingState
              operationCount={generatedYOps?.length ?? draft.operations.length}
              yopsExtracted={Boolean(generatedYOps)}
            />
          )}
          <footer className="flex min-h-10 items-center gap-3 border-t border-[var(--stroke-divider)] px-3">
            <TreeLegend />
            <span className="ml-auto font-mono text-[10px] text-[var(--text-tertiary)]">
              {appliedCount} applied
            </span>
            <Button
              disabled={appliedCount === 0 || isBusy || Boolean(committedHash)}
              onClick={handleCommit}
              size="sm"
              title={commitTitle}
              type="button"
              variant="commit"
            >
              <GitCommitHorizontal aria-hidden="true" className="size-4" />
              {committedHash
                ? 'Committed'
                : status === 'committing'
                  ? 'Committing'
                  : 'Commit · main'}
            </Button>
          </footer>
        </section>
      </div>
    </div>
  );
}

function getExtractYOpsTitle({
  committedHash,
  isBusy,
  operationCount,
}: {
  committedHash: string | null;
  isBusy: boolean;
  operationCount: number;
}): string {
  if (committedHash) return 'This workspace is already committed.';
  if (isBusy) return 'A workspace operation is already in progress.';
  if (operationCount === 0) return 'No proposed YOps operations are available yet.';
  return 'Validate the proposed YOps before applying it.';
}

function getApplyYOpsTitle({
  committedHash,
  generated,
  isBusy,
}: {
  committedHash: string | null;
  generated: boolean;
  isBusy: boolean;
}): string {
  if (committedHash) return 'This workspace is already committed.';
  if (isBusy) return 'A workspace operation is already in progress.';
  if (!generated) return 'Extract YOps before applying the YAML preview.';
  return 'Apply validated YOps into a YAML preview.';
}

function getCommitTitle({
  appliedCount,
  committedHash,
  isBusy,
}: {
  appliedCount: number;
  committedHash: string | null;
  isBusy: boolean;
}): string {
  if (committedHash) return 'Workspace result is already committed.';
  if (isBusy) return 'A workspace operation is already in progress.';
  if (appliedCount === 0) return 'Apply YOps before committing the workspace result.';
  return 'Commit the materialized YAML result.';
}

function PaneHeader({ icon, label, meta }: { icon: ReactNode; label: string; meta: string }) {
  return (
    <div className="flex h-9 items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--editor-gutter)] px-3">
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className="ml-auto truncate font-mono text-[10px] text-[var(--text-tertiary)]">
        {meta}
      </span>
    </div>
  );
}

function CodePane({ lines }: { lines: string[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--editor-bg)]">
      <div className="grid min-w-[520px] grid-cols-[36px_minmax(0,1fr)] font-mono text-[12px] leading-[19px]">
        {lines.map((line, index) => (
          <div className="contents" key={`${index}-${line}`}>
            <div className="select-none border-r border-[var(--stroke-divider)] bg-[var(--workspace-panel)] pr-2 text-right text-[var(--text-tertiary)]">
              {index + 1}
            </div>
            <pre className="whitespace-pre-wrap px-3 text-[var(--text-primary)]">{line || ' '}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreePane({ lines }: { lines: YamlTreeLine[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--editor-bg)] py-2">
      <div className="min-w-[520px] font-mono text-[12px] leading-[20px]">
        {lines.map((line) => (
          <div className={treeLineClassName(line.status)} key={line.id}>
            <span
              aria-hidden="true"
              className="inline-block select-none text-[var(--text-quaternary)]"
              style={{ width: `${line.indent * 1.25}rem` }}
            />
            <span className="text-[var(--yaml-key)]">{line.key}</span>
            {line.value ? (
              <>
                <span className="text-[var(--yaml-punctuation)]">: </span>
                <span className="text-[var(--yaml-string)]">{line.value}</span>
              </>
            ) : (
              <span className="text-[var(--yaml-punctuation)]">:</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function YOpsTreePendingState({
  operationCount,
  yopsExtracted,
}: {
  operationCount: number;
  yopsExtracted: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--editor-bg)] px-6 py-10">
      <div className="max-w-[320px] text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--text-tertiary)]">
          <Braces aria-hidden="true" className="size-5" />
        </div>
        <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
          No materialized YAML yet
        </p>
        <p className="mt-1 text-xs font-medium leading-5 text-[var(--text-secondary)]">
          {yopsExtracted
            ? `${operationCount} YOps ready. Apply them to preview the materialized tree.`
            : 'Validate the YOps proposal first, then apply it to preview the materialized tree.'}
        </p>
      </div>
    </div>
  );
}

function TreeLegend() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[8px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)]">
      <LegendItem className="bg-[var(--status-info)]" label="Human" />
      <LegendItem className="bg-[var(--status-success)]" label="New" />
      <LegendItem className="bg-[var(--status-warning)]" label="Changed" />
      <LegendItem className="bg-[var(--status-error)]" label="Removed" />
      <LegendItem className="bg-[var(--text-quaternary)]" label="Inherited" />
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', className)} />
      {label}
    </span>
  );
}

function getYOpsStatusText(
  status: 'idle' | 'generating' | 'generated' | 'applying' | 'applied' | 'committing' | 'committed'
) {
  if (status === 'generating') return 'Running deterministic validation';
  if (status === 'generated') return 'Proposal validated';
  if (status === 'applying') return 'Applying preview';
  if (status === 'applied') return 'Preview materialized';
  if (status === 'committing') return 'Creating commit';
  if (status === 'committed') return 'Committed to state';
  return 'Deterministic validator ready';
}

function formatProposalMode(mode: string): string {
  if (mode === 'llm') return 'LLM proposal';
  if (mode === 'deterministic_scaffold') return 'Deterministic scaffold';
  return 'Fixture proposal';
}

function buildYOpsScriptLines(
  operations: WorkspaceYOpsDraftOperation[],
  rootKey: string
): string[] {
  if (operations.length === 0) {
    return ['yops:', '  - set:', '      path: node/slot', '      value: "new value"'];
  }

  const lines = ['yops:'];
  for (const operation of operations) {
    const opName = operation.op === 'add' ? 'append' : operation.op;
    lines.push(`  - ${opName}:`);
    lines.push(`      path: ${operationPreviewPath(operation, rootKey)}`);
    if (operation.afterValue) lines.push(`      value: ${quoteYamlValue(operation.afterValue)}`);
    if (operation.reason) lines.push(`      reason: ${quoteYamlValue(operation.reason)}`);
    if (operation.sourceRefs?.length) {
      lines.push('      source_refs:');
      for (const ref of operation.sourceRefs) lines.push(`        - ${quoteYamlValue(ref)}`);
    }
  }
  return lines;
}

function buildYOpsCommandLines(yops: WorkspaceYOp[]): string[] {
  if (yops.length === 0) return ['yops:'];

  const lines = ['yops:'];
  for (const op of yops) {
    const [opName, payload] = Object.entries(op)[0] as [
      keyof WorkspaceYOp,
      { path: string; value?: unknown },
    ];
    lines.push(`  - ${opName}:`);
    lines.push(`      path: ${payload.path}`);
    if ('value' in payload) lines.push(`      value: ${quoteYamlUnknown(payload.value)}`);
  }
  return lines;
}

function quoteYamlValue(value: string): string {
  return JSON.stringify(value);
}

function quoteYamlUnknown(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
}

function shortHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 11)}...`;
}

interface YamlTreeLine {
  id: string;
  indent: number;
  key: string;
  value?: string;
  status?: WorkspaceSchemaFieldStatus | 'changed';
}

function buildTreeNodeLines(
  trees: WorkspaceYOpsTreeNode[],
  changedPaths: Set<string>
): YamlTreeLine[] {
  return trees.flatMap((tree) => treeNodeToLines(tree, 0, tree.key, changedPaths));
}

function treeNodeToLines(
  node: WorkspaceYOpsTreeNode,
  indent: number,
  path: string,
  changedPaths: Set<string>
): YamlTreeLine[] {
  const lines: YamlTreeLine[] = [
    {
      id: path,
      indent,
      key: node.key,
      status: lineTouchedByYOps(path, changedPaths) ? 'changed' : undefined,
    },
  ];

  for (const [slotKey, slotValue] of Object.entries(node.slots)) {
    const slotPath = `${path}/${slotKey}`;
    lines.push({
      id: slotPath,
      indent: indent + 1,
      key: slotKey,
      value: formatTreeValue(slotValue),
      status: lineTouchedByYOps(slotPath, changedPaths) ? 'changed' : undefined,
    });
  }

  for (const child of node.children) {
    lines.push(...treeNodeToLines(child, indent + 1, `${path}/${child.key}`, changedPaths));
  }

  return lines;
}

function lineTouchedByYOps(path: string, changedPaths: Set<string>) {
  for (const changedPath of changedPaths) {
    if (changedPath === path || changedPath.startsWith(`${path}/`)) return true;
  }
  return false;
}

function formatTreeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function operationPreviewPath(operation: WorkspaceYOpsDraftOperation, rootKey: string) {
  const path = operation.path.replace(/\/-$/, '');
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
    );

  if (segments[0] === rootKey) return segments.join('/');
  return [rootKey, ...segments].join('/');
}

function yopPreviewPath(yop: WorkspaceYOp) {
  const payload = Object.values(yop)[0] as { path?: string };
  return payload.path ?? '';
}

function treeLineClassName(status: YamlTreeLine['status']) {
  const base = 'relative px-3';
  if (status === 'covered') return `${base} bg-[var(--diff-added-bg)]`;
  if (status === 'changed') return `${base} bg-[var(--diff-modified-bg)]`;
  if (status === 'missing' || status === 'needs_confirmation') {
    return `${base} bg-[var(--diff-modified-bg)]`;
  }
  if (status === 'type_mismatch') return `${base} bg-[var(--diff-removed-bg)]`;
  return base;
}
