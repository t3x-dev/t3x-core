'use client';

import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  FileCode2,
  ListChecks,
  Package,
  Route,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SkillRenderModel } from '@/domain/project/stateViewModel';
import type { SkillArtifact } from '@/types/api';
import { cn } from '@/utils/cn';

type SkillReaderMode = 'rendered' | 'bundle' | 'raw';

interface StateSkillReaderProps {
  artifact: SkillArtifact | null;
  artifactError: string | null;
  artifactLoading: boolean;
  model: SkillRenderModel;
  schemaName: string;
  validationGapCount: number;
  validationReady: boolean;
  yamlText: string;
}

export function StateSkillReader({
  artifact,
  artifactError,
  artifactLoading,
  model,
  schemaName,
  validationGapCount,
  validationReady,
  yamlText,
}: StateSkillReaderProps) {
  const [mode, setMode] = useState<SkillReaderMode>('rendered');
  const [selectedPath, setSelectedPath] = useState('SKILL.md');
  const [copied, setCopied] = useState(false);
  const selectedFile =
    artifact?.files.find((file) => file.path === selectedPath) ?? artifact?.files[0] ?? null;
  const copyContent = mode === 'raw' ? yamlText : (selectedFile?.content ?? '');
  const validationLabel = validationReady
    ? 'Schema ready'
    : validationGapCount > 0
      ? `${String(validationGapCount)} validation gap${validationGapCount === 1 ? '' : 's'}`
      : 'Validation pending';

  async function copyVisibleContent() {
    if (!copyContent) return;
    await navigator.clipboard.writeText(copyContent);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section
      aria-label="Skill schema render"
      className="min-h-[665px] overflow-hidden bg-[var(--surface-card)]"
    >
      <header className="flex min-h-[55px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="truncate font-mono text-[11px] font-semibold text-[var(--text-secondary)]">
            skill <span className="text-[var(--text-tertiary)]">/</span>{' '}
            <span className="text-[var(--text-primary)]">{model.name}</span>
          </span>
          <Badge variant={validationReady ? 'success' : 'warning'}>{validationLabel}</Badge>
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          {mode !== 'rendered' ? (
            <Button
              disabled={!copyContent}
              onClick={() => void copyVisibleContent()}
              size="sm"
              type="button"
              variant="canvas-outline"
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          ) : null}
          <div
            aria-label="Skill preview representation"
            className="inline-flex min-h-9 items-stretch rounded-md border border-[var(--stroke-default)] bg-[var(--surface-app)] p-0.5"
            role="tablist"
          >
            {(['rendered', 'bundle', 'raw'] as const).map((nextMode) => (
              <button
                aria-selected={mode === nextMode}
                className={cn(
                  'min-w-[72px] rounded px-3 text-[11px] font-bold capitalize text-[var(--text-tertiary)] transition-colors',
                  mode === nextMode &&
                    'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                )}
                key={nextMode}
                onClick={() => setMode(nextMode)}
                role="tab"
                type="button"
              >
                {nextMode}
              </button>
            ))}
          </div>
        </div>
      </header>

      {mode === 'rendered' ? (
        <SkillDocument
          generatedDescription={artifact?.generated_description ?? ''}
          model={model}
          schemaName={schemaName}
        />
      ) : null}
      {mode === 'bundle' ? (
        <SkillBundlePreview
          artifact={artifact}
          error={artifactError}
          loading={artifactLoading}
          onSelectPath={setSelectedPath}
          selectedFile={selectedFile}
          selectedPath={selectedPath}
        />
      ) : null}
      {mode === 'raw' ? <CodePreview code={yamlText} label="Canonical Skill state YAML" /> : null}
    </section>
  );
}

function SkillDocument({
  generatedDescription,
  model,
  schemaName,
}: {
  generatedDescription: string;
  model: SkillRenderModel;
  schemaName: string;
}) {
  const [selectedWorkflowKey, setSelectedWorkflowKey] = useState(model.workflows[0]?.key ?? '');
  const selectedWorkflow =
    model.workflows.find((workflow) => workflow.key === selectedWorkflowKey) ??
    model.workflows[0] ??
    null;
  const instructionByKey = new Map(
    model.instructions.map((instruction) => [instruction.key, instruction])
  );
  const resourceByKey = new Map(model.resources.map((resource) => [resource.key, resource]));
  const dependencyByKey = new Map(
    model.dependencies.map((dependency) => [dependency.key, dependency])
  );
  const checkByKey = new Map(model.checks.map((check) => [check.key, check]));
  const workflowSteps = (selectedWorkflow?.stepKeys ?? [])
    .flatMap((key) => {
      const instruction = instructionByKey.get(key);
      return instruction ? [instruction] : [];
    })
    .sort((left, right) => left.sequence - right.sequence || left.key.localeCompare(right.key));
  const blockingCheckCount = model.checks.filter((check) => check.blocking).length;

  return (
    <div className="overflow-auto bg-[var(--surface-app)] p-3 min-[721px]:p-6">
      <article className="mx-auto max-w-[1040px] overflow-hidden rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm">
        <header className="border-b border-[var(--stroke-divider)] px-5 py-6 min-[721px]:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="commit">{schemaName}</Badge>
            <Badge variant={model.implicit ? 'success' : 'outline'}>
              {model.implicit ? 'implicit activation' : 'explicit activation'}
            </Badge>
            {model.defaultFreedom ? (
              <Badge variant="outline">{model.defaultFreedom} default freedom</Badge>
            ) : null}
          </div>
          <h1 className="mt-4 font-mono text-2xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">
            {model.name}
          </h1>
          <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-[var(--text-secondary)]">
            {generatedDescription || model.summary || 'No capability summary has been committed.'}
          </p>
          <dl className="mt-5 grid gap-px overflow-hidden rounded-lg border border-[var(--stroke-divider)] bg-[var(--stroke-divider)] sm:grid-cols-3">
            <SkillMetric label="Workflows" value={model.workflows.length} />
            <SkillMetric label="Resources" value={model.resources.length} />
            <SkillMetric label="Blocking checks" value={blockingCheckCount} />
          </dl>
        </header>

        <div className="space-y-7 px-5 py-7 min-[721px]:px-8">
          <SkillSection eyebrow="Contract" title="What the Skill promises">
            <p className="text-[14px] leading-6 text-[var(--text-primary)]">{model.goal}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <StringList title="Inputs" values={model.inputs} />
              <StringList title="Outputs" values={model.outputs} />
              <StringList title="Non-goals" values={model.nonGoals} />
            </div>
            <p className="mt-4 text-xs text-[var(--text-tertiary)]">
              Truth policy: <span className="font-mono">{model.truthPolicy || 'unset'}</span>
            </p>
          </SkillSection>

          <SkillSection eyebrow="Activation" title="When it should run">
            <div className="grid gap-4 md:grid-cols-2">
              <ActivationExamples positive title="Should trigger" values={model.shouldTrigger} />
              <ActivationExamples title="Should not trigger" values={model.shouldNotTrigger} />
            </div>
          </SkillSection>

          <SkillSection eyebrow="Capability routing" title="Workflow modes">
            {selectedWorkflow ? (
              <div className="grid overflow-hidden rounded-xl border border-[var(--stroke-divider)] lg:grid-cols-[250px_minmax(0,1fr)]">
                <nav
                  aria-label="Skill workflows"
                  className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-2 lg:border-r lg:border-b-0"
                >
                  {model.workflows.map((workflow) => (
                    <button
                      aria-current={selectedWorkflow.key === workflow.key ? 'page' : undefined}
                      className={cn(
                        'mb-1 flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                        selectedWorkflow.key === workflow.key
                          ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-card)]/70'
                      )}
                      key={workflow.key}
                      onClick={() => setSelectedWorkflowKey(workflow.key)}
                      type="button"
                    >
                      <Route
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-[var(--accent-commit)]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold">{workflow.title}</span>
                        <span className="mt-1 block font-mono text-[10px] text-[var(--text-tertiary)]">
                          {workflow.kind || 'workflow'}
                        </span>
                      </span>
                    </button>
                  ))}
                </nav>

                <div className="min-w-0 p-4 min-[721px]:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-[var(--text-primary)]">
                          {selectedWorkflow.title}
                        </h3>
                        <Badge variant="commit">{selectedWorkflow.kind}</Badge>
                      </div>
                      <p className="mt-2 max-w-[680px] text-[13px] leading-5 text-[var(--text-secondary)]">
                        {selectedWorkflow.when}
                      </p>
                    </div>
                    <Badge variant={selectedWorkflow.checkKeys.length > 0 ? 'success' : 'warning'}>
                      {selectedWorkflow.checkKeys.length} linked check
                      {selectedWorkflow.checkKeys.length === 1 ? '' : 's'}
                    </Badge>
                  </div>

                  <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                    <WorkflowFact
                      label="Output"
                      value={selectedWorkflow.outputFormats.join(', ') || 'not set'}
                    />
                    <WorkflowFact label="Persistence" value={selectedWorkflow.persistence} />
                    <WorkflowFact label="No result" value={selectedWorkflow.onEmpty} />
                    <WorkflowFact
                      label="Failure"
                      value={
                        selectedWorkflow.fallbackWorkflow
                          ? `${selectedWorkflow.onFailure} → ${selectedWorkflow.fallbackWorkflow}`
                          : selectedWorkflow.onFailure
                      }
                    />
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {selectedWorkflow.resourceKeys.map((key) => (
                      <Badge key={key} variant="outline">
                        <Database aria-hidden="true" className="mr-1 size-3" />
                        {resourceByKey.get(key)?.path || key}
                      </Badge>
                    ))}
                    {selectedWorkflow.dependencyKeys.map((key) => (
                      <Badge key={key} variant="outline">
                        <Package aria-hidden="true" className="mr-1 size-3" />
                        {dependencyByKey.get(key)?.identifier || key}
                      </Badge>
                    ))}
                    {selectedWorkflow.checkKeys.map((key) => (
                      <Badge
                        key={key}
                        variant={checkByKey.get(key)?.blocking ? 'warning' : 'outline'}
                      >
                        <ListChecks aria-hidden="true" className="mr-1 size-3" />
                        {key}
                      </Badge>
                    ))}
                  </div>

                  <p className="mt-6 mb-3 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
                    Routed steps
                  </p>
                  {workflowSteps.length > 0 ? (
                    <ol className="space-y-3">
                      {workflowSteps.map((instruction) => (
                        <InstructionCard instruction={instruction} key={instruction.key} />
                      ))}
                    </ol>
                  ) : (
                    <p className="rounded-lg border border-dashed border-[var(--stroke-default)] p-4 text-xs text-[var(--text-tertiary)]">
                      No instructions are linked to this workflow yet.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-[var(--stroke-default)] p-4 text-sm text-[var(--text-tertiary)]">
                No capability workflow has been committed yet.
              </p>
            )}
          </SkillSection>

          {model.resources.length > 0 ? (
            <SkillSection eyebrow="Progressive disclosure" title="Resource loading">
              <div className="grid gap-3 md:grid-cols-2">
                {model.resources.map((resource) => (
                  <div
                    className="rounded-lg border border-[var(--stroke-divider)] p-4"
                    key={resource.key}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {resource.kind === 'data' ? (
                        <Database aria-hidden="true" className="size-4 text-[var(--accent-leaf)]" />
                      ) : resource.kind === 'script' ? (
                        <Terminal aria-hidden="true" className="size-4 text-[var(--accent-leaf)]" />
                      ) : (
                        <FileCode2
                          aria-hidden="true"
                          className="size-4 text-[var(--accent-leaf)]"
                        />
                      )}
                      <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                        {resource.path}
                      </span>
                      <Badge variant="outline">{resource.kind}</Badge>
                      <Badge variant={resource.loadPolicy === 'always' ? 'warning' : 'outline'}>
                        {resource.loadPolicy || 'load policy unset'}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[var(--text-primary)]">
                      {resource.description}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                      {resource.useWhen}
                    </p>
                    {resource.mediaType ? (
                      <p className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                        {resource.mediaType}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </SkillSection>
          ) : null}

          <SkillSection eyebrow="Deterministic gate" title="Checks before delivery">
            {model.checks.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {model.checks.map((check) => (
                  <div
                    className="rounded-lg border border-[var(--stroke-divider)] p-4"
                    key={check.key}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <ListChecks
                        aria-hidden="true"
                        className="size-4 text-[var(--accent-branch)]"
                      />
                      <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                        {check.key}
                      </span>
                      <Badge variant={check.blocking ? 'warning' : 'outline'}>
                        {check.blocking ? 'blocking' : 'advisory'}
                      </Badge>
                      <Badge variant="outline">{check.runWhen}</Badge>
                    </div>
                    {check.commandResource ? (
                      <p className="mt-3 font-mono text-xs text-[var(--text-secondary)]">
                        {check.commandResource}
                      </p>
                    ) : null}
                    <StringList
                      className="mt-3"
                      title={check.kind === 'checklist' ? 'Assertions' : 'Success criteria'}
                      values={check.kind === 'checklist' ? check.assertions : check.successCriteria}
                    />
                    <p className="mt-3 text-[10px] text-[var(--text-tertiary)]">
                      Verifies {check.workflowKeys.join(', ') || 'no workflow'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">
                No deterministic checks have been committed yet.
              </p>
            )}
          </SkillSection>

          <SkillSection eyebrow="Model evaluation" title="Trigger and behavior signals">
            {model.evals.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {model.evals.map((evaluation) => (
                  <div
                    className="rounded-lg border border-[var(--stroke-divider)] p-4"
                    key={evaluation.key}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldCheck
                        aria-hidden="true"
                        className="size-4 text-[var(--status-success)]"
                      />
                      <Badge variant="outline">{evaluation.kind}</Badge>
                    </div>
                    <p className="mt-3 text-[13px] font-semibold text-[var(--text-primary)]">
                      {evaluation.prompt}
                    </p>
                    <StringList
                      className="mt-3"
                      title="Assertions"
                      values={evaluation.assertions}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">
                No evaluation cases have been committed yet.
              </p>
            )}
          </SkillSection>
        </div>
      </article>
    </div>
  );
}

function SkillBundlePreview({
  artifact,
  error,
  loading,
  onSelectPath,
  selectedFile,
  selectedPath,
}: {
  artifact: SkillArtifact | null;
  error: string | null;
  loading: boolean;
  onSelectPath: (path: string) => void;
  selectedFile: SkillArtifact['files'][number] | null;
  selectedPath: string;
}) {
  if (loading) {
    return (
      <BundleStatus icon={<Sparkles aria-hidden="true" />} text="Compiling deterministic bundle…" />
    );
  }
  if (error) {
    return <BundleStatus icon={<AlertTriangle aria-hidden="true" />} text={error} warning />;
  }
  if (!artifact) {
    return (
      <BundleStatus icon={<Package aria-hidden="true" />} text="Bundle preview is unavailable." />
    );
  }

  return (
    <div className="grid min-h-[665px] bg-[var(--surface-app)] lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 lg:border-r lg:border-b-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={artifact.publishable ? 'success' : 'warning'}>
            {artifact.publishable ? 'bundle ready' : 'gate blocked'}
          </Badge>
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
            {artifact.renderer_version}
          </span>
        </div>
        <p className="mt-3 break-all font-mono text-[10px] leading-4 text-[var(--text-tertiary)]">
          {artifact.bundle_hash}
        </p>
        <div className="mt-4 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
          <div className="flex items-center gap-2">
            <ListChecks aria-hidden="true" className="size-4 text-[var(--accent-branch)]" />
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {artifact.gate.blocking_check_count} blocking check
              {artifact.gate.blocking_check_count === 1 ? '' : 's'} declared
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[var(--text-tertiary)]">
            {artifact.gate.requires_execution
              ? 'Execution is still required at the configured export or delivery gate.'
              : 'No check execution is required.'}
          </p>
          {artifact.gate.errors.length > 0 || artifact.gate.gaps.length > 0 ? (
            <p className="mt-2 text-[10px] leading-4 text-[var(--status-warning)]">
              {artifact.gate.errors.length} policy errors · {artifact.gate.gaps.length} readiness
              gaps
            </p>
          ) : null}
        </div>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
          Bundle files
        </p>
        <div className="mt-2 space-y-1">
          {artifact.files.map((file) => (
            <button
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-mono text-xs text-[var(--text-secondary)]',
                selectedPath === file.path &&
                  'bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]'
              )}
              key={file.path}
              onClick={() => onSelectPath(file.path)}
              type="button"
            >
              <FileCode2 aria-hidden="true" className="size-3.5" />
              <span className="truncate">{file.path}</span>
            </button>
          ))}
          {artifact.missing_resources.map((path) => (
            <div
              className="flex items-center gap-2 px-2.5 py-2 font-mono text-xs text-[var(--status-warning)]"
              key={path}
            >
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              <span className="truncate">{path}</span>
            </div>
          ))}
        </div>
      </aside>
      <CodePreview
        code={selectedFile?.content ?? ''}
        label={selectedFile ? `${selectedFile.path} · ${selectedFile.sha256}` : 'Bundle file'}
      />
    </div>
  );
}

function BundleStatus({
  icon,
  text,
  warning = false,
}: {
  icon: ReactNode;
  text: string;
  warning?: boolean;
}) {
  return (
    <div className="flex min-h-[665px] items-center justify-center bg-[var(--surface-app)] p-8">
      <div
        className={cn(
          'flex max-w-md items-center gap-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4 text-sm text-[var(--text-secondary)]',
          warning && 'border-[var(--status-warning)]/40 text-[var(--status-warning)]'
        )}
      >
        {icon}
        <span>{text}</span>
      </div>
    </div>
  );
}

function CodePreview({ code, label }: { code: string; label: string }) {
  return (
    <div className="min-w-0 overflow-auto bg-[#0d1117]">
      <div className="sticky top-0 border-b border-white/10 bg-[#161b22] px-4 py-2 font-mono text-[10px] text-slate-400">
        {label}
      </div>
      <pre className="min-w-max p-5 font-mono text-xs leading-6 text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InstructionCard({
  instruction,
}: {
  instruction: SkillRenderModel['instructions'][number];
}) {
  return (
    <li className="grid gap-3 rounded-lg border border-[var(--stroke-divider)] p-4 sm:grid-cols-[36px_minmax(0,1fr)]">
      <span className="flex size-9 items-center justify-center rounded-full bg-[var(--accent-commit)]/10 font-mono text-xs font-bold text-[var(--accent-commit)]">
        {instruction.sequence}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold text-[var(--text-primary)]">{instruction.title}</h4>
          <Badge variant="outline">{instruction.kind || 'instruction'}</Badge>
          <Badge variant={instruction.effect === 'none' ? 'outline' : 'warning'}>
            {instruction.effect}
          </Badge>
          <Badge variant="outline">{instruction.freedom} freedom</Badge>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">
          {instruction.body}
        </p>
        {instruction.resourceKeys.length > 0 ? (
          <p className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">
            Uses {instruction.resourceKeys.join(', ')}
          </p>
        ) : null}
        {instruction.approval !== 'none' ? (
          <p className="mt-2 text-xs font-semibold text-[var(--status-warning)]">
            Approval gate: {instruction.approval}
          </p>
        ) : null}
        {instruction.successCriteria.length > 0 ? (
          <StringList
            className="mt-3"
            title="Success criteria"
            values={instruction.successCriteria}
          />
        ) : null}
        {instruction.onFailure ? (
          <p className="mt-3 text-xs text-[var(--text-tertiary)]">
            On failure: {instruction.onFailure}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function WorkflowFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--surface-panel)] px-3 py-2.5">
      <dt className="text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className="mt-1 break-words font-mono text-[10px] text-[var(--text-primary)]">
        {value || 'not set'}
      </dd>
    </div>
  );
}

function SkillMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[var(--surface-panel)] px-4 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function SkillSection({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <section>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent-commit)]">
        {eyebrow}
      </p>
      <h2 className="mt-1 mb-4 text-base font-bold text-[var(--text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function ActivationExamples({
  positive = false,
  title,
  values,
}: {
  positive?: boolean;
  title: string;
  values: string[];
}) {
  return (
    <div className="rounded-lg border border-[var(--stroke-divider)] p-4">
      <h3 className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
        {positive ? (
          <Check aria-hidden="true" className="size-4 text-[var(--status-success)]" />
        ) : (
          <AlertTriangle aria-hidden="true" className="size-4 text-[var(--status-warning)]" />
        )}
        {title}
      </h3>
      <StringList className="mt-3" values={values} />
    </div>
  );
}

function StringList({
  className,
  title,
  values,
}: {
  className?: string;
  title?: string;
  values: string[];
}) {
  return (
    <div className={className}>
      {title ? (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          {title}
        </p>
      ) : null}
      {values.length > 0 ? (
        <ul className="space-y-1.5 text-xs leading-5 text-[var(--text-secondary)]">
          {values.map((value) => (
            <li className="flex gap-2" key={value}>
              <span aria-hidden="true" className="text-[var(--text-tertiary)]">
                ·
              </span>
              <span>{value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--text-tertiary)]">None declared</p>
      )}
    </div>
  );
}
