'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, Circle, GripVertical, Loader2, RefreshCw, Zap } from 'lucide-react';
import { ProviderCredentialDialog } from '@/components/settings/ProviderCredentialDialog';
import {
  getLocalGenerationProviderId,
  getSettingsProviderName,
  useProvidersSettingsPanel,
  type ProviderInfo,
  type RoleGroup,
  type TestConnectionResult,
} from '@/hooks/providers/useProvidersSettingsPanel';
import { cn } from '@/utils/cn';

interface ProvidersSettingsPanelProps {
  className?: string;
}

const ROLE_LABELS: Record<RoleGroup, string> = {
  generation: 'LLM Generation',
  embedding: 'Embedding',
  extraction: 'NLP Extraction',
  merge: 'Merge Resolution',
};

const ROLE_DESCRIPTIONS: Record<RoleGroup, string> = {
  generation: 'Generate leaf output and agent drafts',
  embedding: 'Semantic similarity and validation',
  extraction: 'Ring extraction and NLP analysis',
  merge: 'LLM-assisted conflict resolution',
};

function SortableProviderCard({
  provider,
  testResult,
  onTest,
  onManageCredentials,
  isDraggable,
}: {
  provider: ProviderInfo;
  testResult: TestConnectionResult | 'loading' | undefined;
  onTest: (id: string) => void;
  onManageCredentials: (provider: ProviderInfo) => void;
  isDraggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: provider.id,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isTesting = testResult === 'loading';
  const result = testResult && testResult !== 'loading' ? testResult : null;
  const localProviderId = getLocalGenerationProviderId(provider);
  const displayName = getSettingsProviderName(provider);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center justify-between rounded-lg border px-4 py-3',
        'border-[var(--stroke-divider)]',
        provider.configured
          ? 'bg-[var(--surface-primary)]'
          : 'bg-[var(--surface-secondary)] opacity-60',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-[var(--accent-blue)]'
      )}
    >
      <div className="flex items-center gap-3">
        {isDraggable ? (
          <button
            type="button"
            className="cursor-grab touch-none text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <div className="w-4" />
        )}
        {provider.configured ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
        )}
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">{displayName}</div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {provider.configured ? (
              <>
                {provider.default_model && <span>Default: {provider.default_model}</span>}
                {result && (
                  <span className="ml-2">
                    {result.ok ? (
                      <span className="text-[var(--status-success)]">
                        Connected ({result.latency_ms}ms)
                      </span>
                    ) : (
                      <span className="text-[var(--status-error)]">{result.error}</span>
                    )}
                  </span>
                )}
              </>
            ) : (
              <span>Requires: {provider.required_env_keys.join(', ') || 'Local server'}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {provider.available_models && provider.available_models.length > 0 && (
          <span className="hidden text-xs text-[var(--text-tertiary)] sm:inline">
            {provider.available_models.length} models
          </span>
        )}
        {localProviderId && (
          <button
            type="button"
            onClick={() => onManageCredentials(provider)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium',
              'border border-[var(--stroke-divider)]',
              'text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
          >
            {provider.configured ? 'Manage' : 'Connect'}
          </button>
        )}
        {provider.configured && (
          <button
            type="button"
            onClick={() => onTest(provider.id)}
            disabled={isTesting}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium',
              'border border-[var(--stroke-divider)]',
              'text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Test
          </button>
        )}
      </div>
    </div>
  );
}

function SortableRoleGroup({
  role,
  providers,
  testResults,
  onTest,
  onManageCredentials,
  onReorder,
}: {
  role: RoleGroup;
  providers: ProviderInfo[];
  testResults: Record<string, TestConnectionResult | 'loading'>;
  onTest: (id: string) => void;
  onManageCredentials: (provider: ProviderInfo) => void;
  onReorder: (role: RoleGroup, oldIndex: number, newIndex: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const configured = providers.filter((provider) => provider.configured);
  const unconfigured = providers.filter((provider) => !provider.configured);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = configured.findIndex((provider) => provider.id === active.id);
    const newIndex = configured.findIndex((provider) => provider.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(role, oldIndex, newIndex);
  };

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{ROLE_LABELS[role]}</h2>
        <p className="text-xs text-[var(--text-tertiary)]">{ROLE_DESCRIPTIONS[role]}</p>
        {configured.length > 1 && (
          <p className="mt-1 text-xs italic text-[var(--text-tertiary)]">
            Fallback order: drag to reorder priority
          </p>
        )}
      </div>

      <div className="space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={configured.map((provider) => provider.id)}
            strategy={verticalListSortingStrategy}
          >
            {configured.map((provider) => (
              <SortableProviderCard
                key={provider.id}
                provider={provider}
                testResult={testResults[provider.id]}
                onTest={onTest}
                onManageCredentials={onManageCredentials}
                isDraggable={configured.length > 1}
              />
            ))}
          </SortableContext>
        </DndContext>

        {unconfigured.map((provider) => (
          <SortableProviderCard
            key={provider.id}
            provider={provider}
            testResult={testResults[provider.id]}
            onTest={onTest}
            onManageCredentials={onManageCredentials}
            isDraggable={false}
          />
        ))}
      </div>
    </section>
  );
}

export function ProvidersSettingsPanel({ className }: ProvidersSettingsPanelProps) {
  const {
    closeDialog,
    dialogError,
    dialogProvider,
    dialogStatus,
    dialogStatusLoading,
    groupedProviders,
    handleDialogDelete,
    handleDialogSave,
    handleManageCredentials,
    handleReorder,
    handleTest,
    loadError,
    loadProviders,
    loading,
    saving,
    testResults,
  } = useProvidersSettingsPanel();

  return (
    <div className={cn('mx-auto max-w-3xl px-6 py-8', className)}>
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Providers</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Configure LLM, embedding, and NLP providers for T3X features.
          {saving && <span className="ml-2 text-xs text-[var(--text-tertiary)]">Saving...</span>}
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : (
        <>
          <div className="space-y-8">
            {(Object.keys(ROLE_LABELS) as RoleGroup[]).map((role) => {
              const roleProviders = groupedProviders[role] ?? [];
              if (roleProviders.length === 0) return null;

              return (
                <SortableRoleGroup
                  key={role}
                  role={role}
                  providers={roleProviders}
                  testResults={testResults}
                  onTest={handleTest}
                  onManageCredentials={handleManageCredentials}
                  onReorder={handleReorder}
                />
              );
            })}
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={() => void loadProviders()}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium',
                'border border-[var(--stroke-divider)]',
                'text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
              )}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </>
      )}

      {dialogProvider && (
        <ProviderCredentialDialog
          providerId={dialogProvider.id}
          providerName={dialogProvider.name}
          availableModels={dialogProvider.availableModels}
          error={dialogError}
          open={dialogProvider !== null}
          onOpenChange={(open) => {
            if (!open) {
              closeDialog();
            }
          }}
          onDelete={handleDialogDelete}
          onSave={handleDialogSave}
          status={
            dialogStatus
              ? {
                  configured: dialogStatus.configured,
                  defaultModel: dialogStatus.default_model,
                  lastTestStatus: dialogStatus.last_test_status,
                  lastTestError: dialogStatus.last_test_error,
                }
              : null
          }
          statusLoading={dialogStatusLoading}
        />
      )}
    </div>
  );
}
