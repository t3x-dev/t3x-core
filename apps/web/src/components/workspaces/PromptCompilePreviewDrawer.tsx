'use client';

import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  CircleAlert,
  Database,
  FileInput,
  LoaderCircle,
  MessageSquareText,
  Play,
  RefreshCw,
  Variable,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { describePromptWorkspaceCompile } from '@/domain/workspaces/promptCompile';
import {
  PromptCompilePreviewClientError,
  usePromptCompilePreview,
} from '@/hooks/workspaces/usePromptCompilePreview';
import type {
  PromptCompileIssue,
  PromptCompilePreviewResponse,
  PromptCompileResolutionStatus,
} from '@/types/promptCompile';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';

interface PromptCompilePreviewDrawerProps {
  candidate: WorkspaceCandidate;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface CachedPromptPreview {
  fingerprint: string;
  response: PromptCompilePreviewResponse;
}

type PreviewRequestState = 'idle' | 'loading' | 'error' | 'unavailable';

export function PromptCompilePreviewDrawer({
  candidate,
  onOpenChange,
  open,
}: PromptCompilePreviewDrawerProps) {
  const descriptor = useMemo(() => describePromptWorkspaceCompile(candidate), [candidate]);
  const { compilePromptPreview } = usePromptCompilePreview();
  const [cache, setCache] = useState<Record<string, CachedPromptPreview>>({});
  const [requestState, setRequestState] = useState<PreviewRequestState>('idle');
  const [requestError, setRequestError] = useState('');
  const requestSequence = useRef(0);
  const cached = cache[candidate.id];
  const response = cached?.response;
  const previewStale = Boolean(cached && cached.fingerprint !== descriptor.fingerprint);
  const blockingIssues = response?.issues.filter((issue) => issue.blocking) ?? [];

  const compile = useCallback(async () => {
    if (descriptor.candidateStale || !descriptor.available) {
      setRequestState(descriptor.available ? 'idle' : 'unavailable');
      return;
    }

    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setRequestState('loading');
    setRequestError('');
    try {
      const next = await compilePromptPreview(descriptor.request);
      if (requestSequence.current !== sequence) return;
      setCache((current) => ({
        ...current,
        [candidate.id]: { fingerprint: descriptor.fingerprint, response: next },
      }));
      setRequestState('idle');
    } catch (error) {
      if (requestSequence.current !== sequence) return;
      const unavailable =
        error instanceof PromptCompilePreviewClientError && error.runtimeUnavailable;
      setRequestState(unavailable ? 'unavailable' : 'error');
      setRequestError(
        error instanceof Error ? error.message : 'The compile preview request failed.'
      );
    }
  }, [candidate.id, compilePromptPreview, descriptor]);

  useEffect(() => {
    if (!open) requestSequence.current += 1;
  }, [open]);

  function jumpToIssue(issue: PromptCompileIssue) {
    const target = issueTarget(issue);
    const element = document.getElementById(target);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (element instanceof HTMLElement) element.focus({ preventScroll: true });
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]"
        side="right"
      >
        <SheetHeader className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-4 pr-12 text-left sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-lg text-[var(--text-primary)]">Compile preview</SheetTitle>
            {response ? (
              <Badge variant={response.compiled ? 'success' : 'warning'}>
                {response.compiled ? 'Compiled' : 'Blocked'}
              </Badge>
            ) : null}
            {previewStale ? <Badge variant="warning">Stale result</Badge> : null}
          </div>
          <SheetDescription className="pr-2 leading-5 text-[var(--text-secondary)]">
            Backend-rendered messages and deterministic resolution results for {candidate.title}.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {!descriptor.available || requestState === 'unavailable' ? (
            <PreviewState
              description={
                requestError ||
                `No compile runtime is registered for ${descriptor.request.schema_name}@${descriptor.request.schema_version}.`
              }
              icon={CircleAlert}
              title="Runtime unavailable"
              tone="warning"
            />
          ) : null}

          {descriptor.available && descriptor.candidateStale ? (
            <PreviewState
              description="Regenerate this Workspace candidate before requesting a new compile. The previous preview remains available below when one exists."
              icon={AlertTriangle}
              title="Candidate is stale — compile disabled"
              tone="warning"
            />
          ) : null}

          {requestState === 'loading' ? (
            <PreviewState
              description="The server is validating fields, resolving inputs and compiling final messages."
              icon={LoaderCircle}
              spin
              title={response ? 'Refreshing preview' : 'Compiling preview'}
              tone="neutral"
            />
          ) : null}

          {requestState === 'error' ? (
            <PreviewState
              description={`${requestError || 'The compile preview request failed.'} Your Workspace State and last successful response were kept.`}
              icon={CircleAlert}
              title="Preview request failed"
              tone="error"
            />
          ) : null}

          {previewStale ? (
            <PreviewState
              description="The Workspace candidate changed after this response was generated. Review it as historical output or compile the current candidate again."
              icon={RefreshCw}
              title="Showing the previous candidate result"
              tone="warning"
            />
          ) : null}

          {!response &&
          requestState === 'idle' &&
          descriptor.available &&
          !descriptor.candidateStale ? (
            <PreviewState
              description="No compiled response has been requested for this candidate yet."
              icon={Play}
              title="No preview yet"
              tone="neutral"
            />
          ) : null}

          {response ? (
            <div className="space-y-5 pb-5">
              <PreviewSummary response={response} />
              <CompiledMessages messages={response.messages} />
              <VariableResolutions variables={response.variables} />
              <ContextAndResources response={response} />
              <OutputContract response={response} />
              <BlockingIssues issues={blockingIssues} onJump={jumpToIssue} />
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs leading-4 text-[var(--text-tertiary)]">
            Preview compiles only; it never calls a model.
          </p>
          <Button
            className="w-full sm:w-auto"
            disabled={
              descriptor.candidateStale || !descriptor.available || requestState === 'loading'
            }
            onClick={() => void compile()}
            type="button"
          >
            {requestState === 'loading' ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            {response ? 'Recompile current candidate' : 'Compile current candidate'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PreviewSummary({ response }: { response: PromptCompilePreviewResponse }) {
  return (
    <section aria-labelledby="prompt-preview-summary">
      <SectionHeading id="prompt-preview-summary" icon={FileInput} title="Input & adapter" />
      <dl className="mt-2 grid overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] sm:grid-cols-2">
        <SummaryMetric label="Input source" value={response.inputSource.label} />
        <SummaryMetric
          label="Adapter"
          value={`${response.adapter.id} · ${response.adapter.mode || 'unset'}`}
        />
        <SummaryMetric
          label="Response"
          value={response.adapter.responseFormat || response.output.format || 'unset'}
        />
        <SummaryMetric
          label="Compiler"
          value={response.compilerVersion.replace('t3x-prompt-compiler@', 'v')}
        />
      </dl>
    </section>
  );
}

function CompiledMessages({ messages }: { messages: PromptCompilePreviewResponse['messages'] }) {
  return (
    <section aria-labelledby="prompt-preview-messages">
      <SectionHeading
        count={messages.length}
        id="prompt-preview-messages"
        icon={MessageSquareText}
        title="Compiled messages"
      />
      {messages.length === 0 ? (
        <EmptyLine text="No messages were compiled." />
      ) : (
        <ol className="mt-2 space-y-2">
          {messages.map((message) => (
            <li
              className="scroll-mt-20 rounded-md border border-[var(--stroke-divider)] bg-[var(--editor-bg)] p-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              id={`prompt-preview-message-${message.key}`}
              key={message.key}
              tabIndex={-1}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{String(message.sequence)}</Badge>
                <Badge variant="commit-subtle">{message.role || 'unknown role'}</Badge>
                <span className="font-mono text-xs font-semibold text-[var(--text-secondary)]">
                  {message.key}
                </span>
              </div>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-[var(--text-primary)]">
                {message.content || '(empty compiled message)'}
              </pre>
              <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
                {message.variableKeys.length} variables · {message.contextKeys.length} contexts ·{' '}
                {message.resourceKeys.length} resources
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function VariableResolutions({
  variables,
}: {
  variables: PromptCompilePreviewResponse['variables'];
}) {
  const unresolved = variables.filter((variable) =>
    ['missing', 'invalid'].includes(variable.status)
  );
  return (
    <section aria-labelledby="prompt-preview-variables">
      <SectionHeading
        count={variables.length}
        id="prompt-preview-variables"
        icon={Variable}
        title="Variable resolution"
      />
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
        {String(variables.length - unresolved.length)} resolved · {String(unresolved.length)}{' '}
        unresolved
      </p>
      {variables.length === 0 ? (
        <EmptyLine text="No variables were returned by the compiler." />
      ) : (
        <div className="mt-2 overflow-hidden rounded-md border border-[var(--stroke-divider)]">
          {variables.map((variable) => (
            <div
              className="grid scroll-mt-20 gap-1 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2.5 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] sm:grid-cols-[minmax(0,1fr)_auto]"
              id={`prompt-preview-variable-${variable.key}`}
              key={variable.key}
              tabIndex={-1}
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {variable.key}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                  {variable.source || 'unknown source'} ·{' '}
                  {variable.required ? 'required' : 'optional'}
                </p>
              </div>
              <ResolutionBadge status={variable.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ContextAndResources({ response }: { response: PromptCompilePreviewResponse }) {
  return (
    <section aria-labelledby="prompt-preview-resources">
      <SectionHeading
        count={response.resources.length}
        id="prompt-preview-resources"
        icon={Database}
        title="Context & resources"
      />
      <dl className="mt-2 grid overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] sm:grid-cols-3">
        <SummaryMetric
          label="Context budget"
          value={`${String(response.contextBudget.maxTokens)} tokens`}
        />
        <SummaryMetric label="Resolved contexts" value={String(response.contextBudget.resolved)} />
        <SummaryMetric label="Missing contexts" value={String(response.contextBudget.missing)} />
      </dl>
      {response.contexts.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded-md border border-[var(--stroke-divider)]">
          {response.contexts.map((context) => (
            <div
              className="grid scroll-mt-20 gap-1 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2.5 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] sm:grid-cols-[minmax(0,1fr)_auto]"
              id={`prompt-preview-context-${context.key}`}
              key={context.key}
              tabIndex={-1}
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {context.key}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                  Context · {context.loadPolicy || 'unset'} · {context.placement || 'unset'}
                </p>
              </div>
              <Badge variant={context.status === 'resolved' ? 'success' : 'warning'}>
                {context.status === 'resolved' ? 'Resolved' : 'Missing'}
              </Badge>
            </div>
          ))}
        </div>
      ) : null}
      {response.resources.length === 0 ? (
        <EmptyLine text="No resource resolutions were returned." />
      ) : (
        <div className="mt-2 overflow-hidden rounded-md border border-[var(--stroke-divider)]">
          {response.resources.map((resource) => (
            <div
              className="grid scroll-mt-20 gap-1 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2.5 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] sm:grid-cols-[minmax(0,1fr)_auto]"
              id={`prompt-preview-resource-${resource.key}`}
              key={resource.key}
              tabIndex={-1}
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {resource.key}
                </p>
                <p className="mt-1 truncate text-[11px] text-[var(--text-tertiary)]">
                  {resource.kind || 'resource'} · {resource.bundlePath || 'no bundle path'}
                </p>
              </div>
              <Badge variant={resource.available ? 'success' : 'warning'}>
                {resource.available ? 'Resolved' : 'Missing'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OutputContract({ response }: { response: PromptCompilePreviewResponse }) {
  return (
    <section
      aria-labelledby="prompt-preview-output-heading"
      className="scroll-mt-20 outline-none"
      id="prompt-preview-output"
      tabIndex={-1}
    >
      <SectionHeading id="prompt-preview-output-heading" icon={Braces} title="Output contract" />
      <dl className="mt-2 grid overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] sm:grid-cols-2">
        <SummaryMetric label="Format" value={response.output.format || 'unset'} />
        <SummaryMetric label="Strict" value={response.output.strict ? 'Yes' : 'No'} />
        <SummaryMetric label="Parse failure" value={response.output.onParseFailure || 'unset'} />
        <SummaryMetric
          label="Schema resource"
          value={response.output.schemaResource || 'Not required'}
        />
      </dl>
    </section>
  );
}

function BlockingIssues({
  issues,
  onJump,
}: {
  issues: PromptCompileIssue[];
  onJump: (issue: PromptCompileIssue) => void;
}) {
  return (
    <section aria-labelledby="prompt-preview-issues">
      <SectionHeading
        count={issues.length}
        id="prompt-preview-issues"
        icon={issues.length === 0 ? CheckCircle2 : CircleAlert}
        title="Blocking issues"
      />
      {issues.length === 0 ? (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--status-success)]/30 bg-[var(--status-success-muted)] px-3 py-3 text-sm text-[var(--text-primary)]">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 text-[var(--status-success)]" />
          <span>No blocking compile issues.</span>
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {issues.map((issue, index) => (
            <li
              className="rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] p-3"
              key={`${issue.code}:${issue.path}:${String(index)}`}
            >
              <div className="flex items-start gap-2">
                <CircleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-[var(--status-error)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Compilation blocked: {issue.message}
                  </p>
                  <p className="mt-1 break-all font-mono text-[11px] text-[var(--text-secondary)]">
                    {issue.path}
                  </p>
                </div>
              </div>
              <Button
                className="mt-2 h-7 px-2 text-xs"
                onClick={() => onJump(issue)}
                size="sm"
                type="button"
                variant="outline"
              >
                Jump to {issueTargetLabel(issue)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PreviewState({
  description,
  icon: Icon,
  spin = false,
  title,
  tone,
}: {
  description: string;
  icon: typeof CircleAlert;
  spin?: boolean;
  title: string;
  tone: 'error' | 'neutral' | 'warning';
}) {
  return (
    <div
      className={cn(
        'mb-4 flex items-start gap-3 rounded-md border px-3 py-3',
        tone === 'error' && 'border-[var(--status-error)]/30 bg-[var(--status-error-muted)]',
        tone === 'warning' && 'border-[var(--status-warning)]/35 bg-[var(--status-warning-muted)]',
        tone === 'neutral' && 'border-[var(--stroke-divider)] bg-[var(--surface-panel)]'
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-4 shrink-0',
          spin && 'animate-spin',
          tone === 'error' && 'text-[var(--status-error)]',
          tone === 'warning' && 'text-[var(--status-warning)]',
          tone === 'neutral' && 'text-[var(--text-secondary)]'
        )}
      />
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
      </div>
    </div>
  );
}

function SectionHeading({
  count,
  icon: Icon,
  id,
  title,
}: {
  count?: number;
  icon: typeof CircleAlert;
  id: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon aria-hidden="true" className="size-4 text-[var(--text-secondary)]" />
      <h3 className="text-sm font-semibold text-[var(--text-primary)]" id={id}>
        {title}
      </h3>
      {count !== undefined ? <Badge variant="secondary">{String(count)}</Badge> : null}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-[var(--stroke-divider)] px-3 py-2.5 last:border-b-0 sm:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(2n)]:border-r-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ResolutionBadge({ status }: { status: PromptCompileResolutionStatus }) {
  const unresolved = status === 'missing' || status === 'invalid';
  return <Badge variant={unresolved ? 'warning' : 'success'}>{status}</Badge>;
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="mt-2 rounded-md border border-dashed border-[var(--stroke-divider)] px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">
      {text}
    </p>
  );
}

function issueTarget(issue: PromptCompileIssue): string {
  const normalized = issue.path.replace(/^prompt\//, '').replace(/^\//, '');
  const [section, key] = normalized.split('/');
  if (section === 'messages' && key) return `prompt-preview-message-${key}`;
  if (section === 'variables' && key) return `prompt-preview-variable-${key}`;
  if (section === 'contexts' && key) return `prompt-preview-context-${key}`;
  if (section === 'resources' && key) return `prompt-preview-resource-${key}`;
  return 'prompt-preview-output';
}

function issueTargetLabel(issue: PromptCompileIssue): string {
  const normalized = issue.path.replace(/^prompt\//, '').replace(/^\//, '');
  if (normalized.startsWith('messages/')) return 'Message';
  if (normalized.startsWith('variables/')) return 'Variable';
  if (normalized.startsWith('resources/') || normalized.startsWith('contexts/')) return 'Resource';
  return 'Output';
}
