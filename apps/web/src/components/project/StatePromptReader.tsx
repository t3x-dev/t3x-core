'use client';

import {
  Boxes,
  Braces,
  CheckCircle2,
  CircleAlert,
  Database,
  FileCode2,
  Gauge,
  Link2,
  ListChecks,
  MessageSquareText,
  Play,
  ShieldCheck,
  Variable,
} from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { Badge } from '@/components/ui/badge';
import type {
  PromptRenderCheck,
  PromptRenderEval,
  PromptRenderIssue,
  PromptRenderMessage,
  PromptRenderModel,
  PromptRenderResource,
} from '@/domain/project/stateViewModel';
import { cn } from '@/utils/cn';

type PromptReaderView =
  | 'overview'
  | 'messages'
  | 'variables'
  | 'context'
  | 'output'
  | 'quality'
  | 'yaml';

interface StatePromptReaderProps {
  model: PromptRenderModel;
  schemaName: string;
  validationGapCount: number;
  validationReady: boolean;
  yamlText: string;
}

const PROMPT_READER_VIEWS: Array<{
  id: PromptReaderView;
  label: string;
  icon: typeof MessageSquareText;
}> = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'messages', label: 'Messages', icon: MessageSquareText },
  { id: 'variables', label: 'Variables', icon: Variable },
  { id: 'context', label: 'Context & Resources', icon: Boxes },
  { id: 'output', label: 'Output', icon: Braces },
  { id: 'quality', label: 'Checks & Evals', icon: ListChecks },
  { id: 'yaml', label: 'YAML', icon: FileCode2 },
];

export function StatePromptReader({
  model,
  schemaName,
  validationGapCount,
  validationReady,
  yamlText,
}: StatePromptReaderProps) {
  const [activeView, setActiveView] = useState<PromptReaderView>('messages');
  const [selectedMessageKey, setSelectedMessageKey] = useState(model.messages[0]?.key ?? '');
  const [selectedVariableKey, setSelectedVariableKey] = useState('');
  const [selectedResourceKey, setSelectedResourceKey] = useState('');
  const selectedMessage =
    model.messages.find((message) => message.key === selectedMessageKey) ??
    model.messages[0] ??
    null;
  const validationLabel = validationReady
    ? 'Schema ready'
    : validationGapCount > 0
      ? `${String(validationGapCount)} validation issue${validationGapCount === 1 ? '' : 's'}`
      : 'Validation pending';

  useEffect(() => {
    const targetId =
      activeView === 'variables' && selectedVariableKey
        ? `prompt-variable-${selectedVariableKey}`
        : activeView === 'context' && selectedResourceKey
          ? `prompt-resource-${selectedResourceKey}`
          : '';
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
  }, [activeView, selectedResourceKey, selectedVariableKey]);

  function handleViewKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % PROMPT_READER_VIEWS.length;
    else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + PROMPT_READER_VIEWS.length) % PROMPT_READER_VIEWS.length;
    } else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = PROMPT_READER_VIEWS.length - 1;
    else return;

    event.preventDefault();
    const nextView = PROMPT_READER_VIEWS[nextIndex];
    if (!nextView) return;
    setActiveView(nextView.id);
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
  }

  function openMessage(key: string) {
    setSelectedMessageKey(key);
    setActiveView('messages');
  }

  function openVariable(key: string) {
    setSelectedVariableKey(key);
    setActiveView('variables');
  }

  function openResource(key: string) {
    setSelectedResourceKey(key);
    setActiveView('context');
  }

  return (
    <section
      aria-label="Prompt schema render"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-card)]"
    >
      <header className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 pt-3">
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-[var(--text-secondary)]">
                prompt <span className="text-[var(--text-tertiary)]">/</span>{' '}
                <span className="text-[var(--text-primary)]">{model.name}</span>
              </span>
              <Badge variant="commit">{schemaName}</Badge>
              <Badge variant={validationReady ? 'success' : 'warning'}>{validationLabel}</Badge>
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">
              {model.summary || model.contract.goal || 'No prompt summary has been committed.'}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5 text-[10px] text-[var(--text-tertiary)]">
            <span>{model.messages.length} messages</span>
            <span aria-hidden="true">·</span>
            <span>{model.variables.length} variables</span>
            <span aria-hidden="true">·</span>
            <span>{model.resources.length} resources</span>
          </div>
        </div>
        <div
          aria-label="Prompt reader views"
          className="-mx-1 flex min-w-0 gap-0.5 overflow-x-auto px-1"
          role="tablist"
        >
          {PROMPT_READER_VIEWS.map((view, index) => {
            const Icon = view.icon;
            return (
              <button
                aria-controls={`prompt-reader-panel-${view.id}`}
                aria-selected={activeView === view.id}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[11px] font-bold text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]',
                  activeView === view.id &&
                    'border-[var(--accent-commit)] text-[var(--accent-commit)]'
                )}
                id={`prompt-reader-tab-${view.id}`}
                key={view.id}
                onClick={() => setActiveView(view.id)}
                onKeyDown={(event) => handleViewKeyDown(event, index)}
                role="tab"
                tabIndex={activeView === view.id ? 0 : -1}
                type="button"
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {view.label}
              </button>
            );
          })}
        </div>
      </header>

      <StateScrollArea className="min-h-0 flex-1" label={`${activeView} prompt view`}>
        <div
          aria-labelledby={`prompt-reader-tab-${activeView}`}
          className="mx-auto w-full max-w-[1220px] p-3 min-[721px]:p-6"
          id={`prompt-reader-panel-${activeView}`}
          role="tabpanel"
        >
          {activeView === 'overview' ? <OverviewView model={model} /> : null}
          {activeView === 'messages' ? (
            <MessagesView
              model={model}
              onOpenResource={openResource}
              onOpenVariable={openVariable}
              onSelectMessage={setSelectedMessageKey}
              selectedMessage={selectedMessage}
            />
          ) : null}
          {activeView === 'variables' ? (
            <VariablesView
              model={model}
              onOpenMessage={openMessage}
              selectedVariableKey={selectedVariableKey}
            />
          ) : null}
          {activeView === 'context' ? (
            <ContextResourcesView
              model={model}
              onOpenMessage={openMessage}
              onOpenResource={openResource}
              selectedResourceKey={selectedResourceKey}
            />
          ) : null}
          {activeView === 'output' ? (
            <OutputView model={model} onOpenResource={openResource} />
          ) : null}
          {activeView === 'quality' ? <QualityView model={model} /> : null}
          {activeView === 'yaml' ? <YamlView yamlText={yamlText} /> : null}
        </div>
      </StateScrollArea>
    </section>
  );
}

function OverviewView({ model }: { model: PromptRenderModel }) {
  const blockingChecks = model.checks.filter((check) => check.blocking).length;
  return (
    <div className="space-y-5">
      <ReaderSection eyebrow="Prompt contract" title={model.name}>
        <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
          {model.summary || 'No summary has been committed.'}
        </p>
        <dl className="mt-5 grid overflow-hidden rounded-lg border border-[var(--stroke-divider)] sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Messages" value={String(model.messages.length)} />
          <Metric label="Variables" value={String(model.variables.length)} />
          <Metric label="Blocking checks" value={String(blockingChecks)} />
          <Metric label="Truth policy" value={model.contract.truthPolicy || 'unset'} />
        </dl>
      </ReaderSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReaderSection eyebrow="Intent" title="Goal and boundaries">
          <p className="text-sm leading-6 text-[var(--text-primary)]">
            {model.contract.goal || 'No goal declared.'}
          </p>
          <CompactList label="Non-goals" values={model.contract.nonGoals} />
        </ReaderSection>
        <ReaderSection eyebrow="Runtime" title="Invocation envelope">
          <DefinitionGrid
            rows={[
              ['Mode', model.runtime.mode],
              ['Response', model.runtime.responseFormat],
              ['Streaming', model.runtime.streaming ? 'enabled' : 'disabled'],
              ['Tool policy', model.runtime.toolPolicy],
              [
                'Output budget',
                model.runtime.maxOutputTokens === null
                  ? 'not set'
                  : `${String(model.runtime.maxOutputTokens)} tokens`,
              ],
            ]}
          />
        </ReaderSection>
      </div>

      {model.issues.length > 0 ? (
        <ReaderSection eyebrow="Validation" title="Issues requiring attention">
          <IssueList issues={model.issues} />
        </ReaderSection>
      ) : null}
    </div>
  );
}

function MessagesView({
  model,
  onOpenResource,
  onOpenVariable,
  onSelectMessage,
  selectedMessage,
}: {
  model: PromptRenderModel;
  onOpenResource: (key: string) => void;
  onOpenVariable: (key: string) => void;
  onSelectMessage: (key: string) => void;
  selectedMessage: PromptRenderMessage | null;
}) {
  if (!selectedMessage) return <EmptyState message="No messages have been committed." />;

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
        <div className="border-b border-[var(--stroke-divider)] px-4 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
            Stable compile order
          </p>
        </div>
        <ol className="divide-y divide-[var(--stroke-divider)]">
          {model.messages.map((message) => (
            <li key={message.key}>
              <button
                aria-current={selectedMessage.key === message.key ? 'true' : undefined}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]',
                  selectedMessage.key === message.key && 'bg-[var(--accent-commit)]/10'
                )}
                onClick={() => onSelectMessage(message.key)}
                type="button"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--stroke-default)] bg-[var(--surface-card)] font-mono text-[10px] font-bold text-[var(--accent-commit)]">
                  {message.sequence}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <strong className="truncate font-mono text-xs text-[var(--text-primary)]">
                      {message.key}
                    </strong>
                    {message.issues.length > 0 ? (
                      <CircleAlert
                        aria-label={`${String(message.issues.length)} validation issues`}
                        className="size-3.5 shrink-0 text-[var(--status-warning)]"
                      />
                    ) : (
                      <CheckCircle2
                        aria-label="Valid message"
                        className="size-3.5 shrink-0 text-[var(--status-success)]"
                      />
                    )}
                  </span>
                  <span className="mt-1 block text-[10px] text-[var(--text-tertiary)]">
                    {message.role || 'role unset'} · {message.variableKeys.length} variables
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <article className="min-w-0 overflow-hidden rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)]">
        <header className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="commit">sequence {selectedMessage.sequence}</Badge>
            <Badge variant="outline">{selectedMessage.role || 'role unset'}</Badge>
            <Badge variant={selectedMessage.issues.length > 0 ? 'warning' : 'success'}>
              {selectedMessage.issues.length > 0
                ? `${String(selectedMessage.issues.length)} issue${selectedMessage.issues.length === 1 ? '' : 's'}`
                : 'valid'}
            </Badge>
            {selectedMessage.optional ? <Badge variant="outline">optional</Badge> : null}
          </div>
          <h2 className="mt-3 font-mono text-lg font-bold text-[var(--text-primary)]">
            {selectedMessage.key}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {selectedMessage.purpose || 'No purpose declared.'}
          </p>
        </header>

        <div className="space-y-5 p-5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
              Message template
            </p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-code)] p-4 font-mono text-xs leading-6 text-[var(--text-code)]">
              {selectedMessage.template || 'No template committed.'}
            </pre>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <LinkGroup
              empty="No variables referenced."
              label="Variables"
              onOpen={onOpenVariable}
              values={selectedMessage.variableKeys}
            />
            <LinkGroup
              empty="No resources referenced."
              label="Resources"
              onOpen={onOpenResource}
              values={selectedMessage.resourceKeys}
            />
          </div>

          {selectedMessage.contextKeys.length > 0 ? (
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                Context routes
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedMessage.contextKeys.map((key) => (
                  <Badge key={key} variant="outline">
                    <Database aria-hidden="true" />
                    {key}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 md:grid-cols-2">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                Source provenance
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedMessage.sources.length > 0 ? (
                  selectedMessage.sources.map((source) => (
                    <Badge
                      key={`${source.type}:${source.id}`}
                      title={source.id}
                      variant="conversation"
                    >
                      {source.label}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-[var(--text-tertiary)]">No source reference.</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                Latest YOp
              </p>
              {selectedMessage.latestYOp ? (
                <div className="mt-2">
                  <Badge variant="branch">{selectedMessage.latestYOp.label}</Badge>
                  <code className="mt-1.5 block break-all font-mono text-[10px] text-[var(--text-secondary)]">
                    {selectedMessage.latestYOp.path}
                  </code>
                </div>
              ) : (
                <span className="mt-2 block text-xs text-[var(--text-tertiary)]">
                  No matching YOp attached.
                </span>
              )}
            </div>
          </div>

          {selectedMessage.issues.length > 0 ? <IssueList issues={selectedMessage.issues} /> : null}
        </div>
      </article>
    </div>
  );
}

function VariablesView({
  model,
  onOpenMessage,
  selectedVariableKey,
}: {
  model: PromptRenderModel;
  onOpenMessage: (key: string) => void;
  selectedVariableKey: string;
}) {
  return (
    <ReaderSection eyebrow="Typed inputs" title="Variables">
      {model.variables.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--stroke-divider)]">
          <table className="w-full min-w-[900px] border-collapse text-left text-xs">
            <thead className="bg-[var(--surface-panel)] text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              <tr>
                <th className="px-4 py-3">Variable</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Required</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Default</th>
                <th className="px-4 py-3">Missing behavior</th>
                <th className="px-4 py-3">Used by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--stroke-divider)]">
              {model.variables.map((variable) => (
                <tr
                  className={cn(
                    'align-top transition-colors',
                    selectedVariableKey === variable.key && 'bg-[var(--accent-commit)]/10'
                  )}
                  id={`prompt-variable-${variable.key}`}
                  key={variable.key}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="font-mono font-bold text-[var(--text-primary)]">
                        {variable.key}
                      </code>
                      {variable.issues.length > 0 ? (
                        <CircleAlert
                          aria-label={`${String(variable.issues.length)} validation issues`}
                          className="size-3.5 text-[var(--status-warning)]"
                        />
                      ) : null}
                    </div>
                    <p className="mt-1 max-w-[260px] leading-5 text-[var(--text-tertiary)]">
                      {variable.description}
                    </p>
                    {variable.issues.map((issue) => (
                      <p
                        className="mt-1 font-mono text-[10px] text-[var(--status-warning)]"
                        key={`${issue.code}:${issue.path}`}
                      >
                        {issue.path}
                      </p>
                    ))}
                  </td>
                  <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">
                    {variable.valueType || 'unset'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={variable.required ? 'warning' : 'outline'}>
                      {variable.required ? 'required' : 'optional'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{variable.source || 'unset'}</td>
                  <td className="max-w-[180px] break-words px-4 py-3 font-mono">
                    {displayValue(variable.defaultValue)}
                  </td>
                  <td className="px-4 py-3 font-mono">{variable.onMissing || 'unset'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {variable.usedByMessageKeys.map((key) => (
                        <RelationButton key={key} label={key} onClick={() => onOpenMessage(key)} />
                      ))}
                      {variable.usedByMessageKeys.length === 0 ? '—' : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="No variables have been committed." />
      )}
    </ReaderSection>
  );
}

function ContextResourcesView({
  model,
  onOpenMessage,
  onOpenResource,
  selectedResourceKey,
}: {
  model: PromptRenderModel;
  onOpenMessage: (key: string) => void;
  onOpenResource: (key: string) => void;
  selectedResourceKey: string;
}) {
  const contextResources = model.resources.filter((resource) => resource.modelContextEligible);
  const nonContextResources = model.resources.filter((resource) => !resource.modelContextEligible);
  return (
    <div className="space-y-5">
      <ReaderSection eyebrow="Context routing" title="Context providers">
        {model.contexts.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {model.contexts.map((context) => (
              <article
                className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
                key={context.key}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Database aria-hidden="true" className="size-4 text-[var(--accent-leaf)]" />
                  <code className="font-mono text-xs font-bold text-[var(--text-primary)]">
                    {context.key}
                  </code>
                  <Badge variant="outline">{context.kind}</Badge>
                  <Badge variant={context.required ? 'warning' : 'outline'}>
                    {context.required ? 'required' : 'optional'}
                  </Badge>
                </div>
                <DefinitionGrid
                  className="mt-4"
                  rows={[
                    ['Load', context.loadPolicy],
                    ['Placement', context.placement],
                    ['On empty', context.onEmpty],
                    [
                      'Budget',
                      context.maxTokens === null
                        ? 'not set'
                        : `${String(context.maxTokens)} tokens`,
                    ],
                  ]}
                />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {context.resourceKey ? (
                    <RelationButton
                      label={context.resourceKey}
                      onClick={() => onOpenResource(context.resourceKey)}
                    />
                  ) : null}
                  {context.targetMessageKeys.map((key) => (
                    <RelationButton key={key} label={key} onClick={() => onOpenMessage(key)} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState message="No context providers have been committed." />
        )}
      </ReaderSection>

      <ResourceSection
        description="Only always and on-demand resources may be loaded into model context."
        eyebrow="Model-visible"
        onOpenMessage={onOpenMessage}
        resources={contextResources}
        selectedResourceKey={selectedResourceKey}
        title="Context resources"
      />
      <ResourceSection
        description="Execute-only and output-only resources remain outside model context."
        eyebrow="Runtime & delivery"
        onOpenMessage={onOpenMessage}
        resources={nonContextResources}
        selectedResourceKey={selectedResourceKey}
        title="Excluded from model context"
      />
    </div>
  );
}

function ResourceSection({
  description,
  eyebrow,
  onOpenMessage,
  resources,
  selectedResourceKey,
  title,
}: {
  description: string;
  eyebrow: string;
  onOpenMessage: (key: string) => void;
  resources: PromptRenderResource[];
  selectedResourceKey: string;
  title: string;
}) {
  return (
    <ReaderSection eyebrow={eyebrow} title={title}>
      <p className="mb-4 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
      {resources.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {resources.map((resource) => (
            <article
              className={cn(
                'rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4 transition-colors',
                selectedResourceKey === resource.key &&
                  'border-[var(--accent-commit)] bg-[var(--accent-commit)]/10'
              )}
              id={`prompt-resource-${resource.key}`}
              key={resource.key}
            >
              <div className="flex flex-wrap items-center gap-2">
                <FileCode2 aria-hidden="true" className="size-4 text-[var(--accent-leaf)]" />
                <code className="font-mono text-xs font-bold text-[var(--text-primary)]">
                  {resource.key}
                </code>
                <Badge variant="outline">{resource.kind}</Badge>
                <Badge variant={resource.modelContextEligible ? 'success' : 'branch'}>
                  {resource.loadPolicy || 'policy unset'}
                </Badge>
              </div>
              <code className="mt-3 block break-all font-mono text-[10px] text-[var(--text-secondary)]">
                {resource.path || 'path unset'}
              </code>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                {resource.description}
              </p>
              {resource.usedByMessageKeys.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {resource.usedByMessageKeys.map((key) => (
                    <RelationButton key={key} label={key} onClick={() => onOpenMessage(key)} />
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState message="No resources in this loading class." />
      )}
    </ReaderSection>
  );
}

function OutputView({
  model,
  onOpenResource,
}: {
  model: PromptRenderModel;
  onOpenResource: (key: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ReaderSection eyebrow="Response contract" title="Output parsing">
        <DefinitionGrid
          rows={[
            ['Format', model.output.format],
            ['Strict', model.output.strict ? 'yes' : 'no'],
            ['Parse failure', model.output.onParseFailure],
            [
              'Max retries',
              model.output.maxRetries === null ? 'not set' : String(model.output.maxRetries),
            ],
          ]}
        />
      </ReaderSection>
      <ReaderSection eyebrow="Schema relation" title="Output resource">
        {model.output.schemaResource ? (
          <button
            className="flex w-full items-center gap-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 text-left hover:border-[var(--accent-commit)]"
            onClick={() => onOpenResource(model.output.schemaResource)}
            type="button"
          >
            <Braces aria-hidden="true" className="size-5 text-[var(--accent-commit)]" />
            <span>
              <span className="block font-mono text-xs font-bold text-[var(--text-primary)]">
                {model.output.schemaResource}
              </span>
              <span className="mt-1 block text-[10px] text-[var(--text-tertiary)]">
                Open output-only resource
              </span>
            </span>
          </button>
        ) : (
          <EmptyState message="No output schema resource is linked." />
        )}
      </ReaderSection>
    </div>
  );
}

function QualityView({ model }: { model: PromptRenderModel }) {
  const blockingChecks = model.checks.filter((check) => check.blocking);
  const advisoryChecks = model.checks.filter((check) => !check.blocking);
  return (
    <div className="space-y-5">
      <ReaderSection eyebrow="Deterministic gate" title="Blocking checks">
        <CheckGrid checks={blockingChecks} />
      </ReaderSection>
      {advisoryChecks.length > 0 ? (
        <ReaderSection eyebrow="Deterministic signal" title="Non-blocking checks">
          <CheckGrid checks={advisoryChecks} />
        </ReaderSection>
      ) : null}
      <ReaderSection eyebrow="Model quality" title="Non-blocking quality evals">
        <EvalGrid evals={model.evals} />
      </ReaderSection>
    </div>
  );
}

function CheckGrid({ checks }: { checks: PromptRenderCheck[] }) {
  if (checks.length === 0) return <EmptyState message="No checks in this group." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {checks.map((check) => (
        <article
          className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
          key={check.key}
        >
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-4 text-[var(--status-success)]" />
            <code className="font-mono text-xs font-bold text-[var(--text-primary)]">
              {check.key}
            </code>
            <Badge variant={check.blocking ? 'warning' : 'outline'}>
              {check.blocking ? 'blocking' : 'advisory'}
            </Badge>
            <Badge variant="outline">{check.runWhen}</Badge>
          </div>
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            {check.kind || 'check'}
            {check.verifiesOutput ? ' · verifies output' : ''}
          </p>
          <CompactList
            label="Assertions"
            values={check.assertions.length > 0 ? check.assertions : check.successCriteria}
          />
        </article>
      ))}
    </div>
  );
}

function EvalGrid({ evals }: { evals: PromptRenderEval[] }) {
  if (evals.length === 0) return <EmptyState message="No quality evals have been committed." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {evals.map((evaluation) => (
        <article
          className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
          key={evaluation.key}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Play aria-hidden="true" className="size-4 text-[var(--accent-pending)]" />
            <code className="font-mono text-xs font-bold text-[var(--text-primary)]">
              {evaluation.key}
            </code>
            <Badge variant="pending">{evaluation.kind}</Badge>
            <Badge variant="outline">non-blocking</Badge>
          </div>
          {evaluation.minimumScore !== null ? (
            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              Minimum score {evaluation.minimumScore}
            </p>
          ) : null}
          <CompactList label="Assertions" values={evaluation.assertions} />
        </article>
      ))}
    </div>
  );
}

function YamlView({ yamlText }: { yamlText: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-code)]">
      <pre className="overflow-x-auto p-5 font-mono text-xs leading-6 text-[var(--text-code)]">
        {yamlText}
      </pre>
    </div>
  );
}

function ReaderSection({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4 min-[721px]:p-5">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--stroke-divider)] p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function DefinitionGrid({
  className,
  rows,
}: {
  className?: string;
  rows: Array<[string, string]>;
}) {
  return (
    <dl className={cn('grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs', className)}>
      {rows.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-[var(--text-tertiary)]">{label}</dt>
          <dd className="font-mono font-semibold text-[var(--text-primary)]">{value || 'unset'}</dd>
        </div>
      ))}
    </dl>
  );
}

function CompactList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </p>
      {values.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--text-secondary)]">
          {values.map((value) => (
            <li className="flex gap-2" key={value}>
              <span aria-hidden="true" className="text-[var(--accent-commit)]">
                ·
              </span>
              <span>{value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">None declared.</p>
      )}
    </div>
  );
}

function LinkGroup({
  empty,
  label,
  onOpen,
  values,
}: {
  empty: string;
  label: string;
  onOpen: (key: string) => void;
  values: string[];
}) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <RelationButton key={value} label={value} onClick={() => onOpen(value)} />
        ))}
        {values.length === 0 ? (
          <span className="text-xs text-[var(--text-tertiary)]">{empty}</span>
        ) : null}
      </div>
    </div>
  );
}

function RelationButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex items-center gap-1 rounded-full border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--accent-commit)] hover:border-[var(--accent-commit)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40"
      onClick={onClick}
      type="button"
    >
      <Link2 aria-hidden="true" className="size-3" />
      {label}
    </button>
  );
}

function IssueList({ issues }: { issues: PromptRenderIssue[] }) {
  return (
    <div className="grid gap-2">
      {issues.map((issue) => (
        <div
          className="rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] p-3"
          key={`${issue.code}:${issue.path}`}
        >
          <div className="flex items-center gap-2">
            <CircleAlert aria-hidden="true" className="size-4 text-[var(--status-warning)]" />
            <strong className="text-xs text-[var(--text-primary)]">{issue.label}</strong>
            <Badge variant="warning">{issue.code}</Badge>
          </div>
          <code className="mt-2 block break-all font-mono text-[10px] text-[var(--status-warning)]">
            {issue.path}
          </code>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{issue.message}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-[var(--stroke-default)] p-4 text-xs text-[var(--text-tertiary)]">
      {message}
    </p>
  );
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
