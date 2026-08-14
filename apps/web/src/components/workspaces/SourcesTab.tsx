import type { Pin } from '@t3x-dev/core';
import {
  ClipboardPaste,
  FileText,
  FileUp,
  GitBranch,
  GitCommitHorizontal,
  ImagePlus,
  Link,
  MessageSquareText,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenerationComposer } from '@/components/generation/GenerationComposer';
import {
  DOCUMENT_SOURCE_ACCEPTED_TYPES,
  unsupportedChatMaterialSourceMessage,
} from '@/components/import/documentAcceptTypes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatSourceCount,
  getPrimarySchemaBinding,
  summarizeSourceBundle,
} from '@/domain/workspaces/selectors';
import { useConversationParentResolver } from '@/hooks/conversations/useConversationParentResolver';
import { useMaterialArchive } from '@/hooks/materials/useMaterialArchive';
import { useMaterialDetail } from '@/hooks/materials/useMaterialDetail';
import { useMaterialUpload } from '@/hooks/materials/useMaterialUpload';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import {
  type SourceThreadMessage,
  useSourceThreadGeneration,
} from '@/hooks/sourceThreads/useSourceThreadGeneration';
import { usePinsStore } from '@/store/pinsStore';
import type { MaterialDetail } from '@/types/api';
import type { AttachedImage } from '@/types/generation';
import type {
  SourceBundleItem,
  SourceConversationTurn,
  WorkspaceCandidate,
  WorkspaceSourceArtifact,
} from '@/types/workspaces';
import { WORKSPACE_SOURCE_ARTIFACT_FORMAT } from '@/types/workspaces';
import { cn } from '@/utils/cn';

type SourceEvidenceState = 'candidate' | 'included' | 'excluded' | 'stale';
type ChatSourceEvidenceChange = (sourceId: string, source: SourceBundleItem | null) => void;

interface ParsedPreviewBlock {
  id: string;
  locator: string;
  text: string;
  state: SourceEvidenceState;
}

const SOURCE_CHAT_CONVERSATION_STORAGE_PREFIX = 't3x:workspace-source-chat:';
const SOURCE_CHAT_TURN_PIN_TYPE = 'conversation_turn' as const;

const IMPORT_ACTIONS = [
  { label: 'Import doc', icon: FileUp },
  { label: 'Paste text', icon: ClipboardPaste },
  { label: 'Add URL', icon: Link },
  { label: 'Upload PDF/doc', icon: ImagePlus },
];

const SOURCE_SEGMENT_EDITING_DISABLED_TITLE =
  'Block-level source editing needs persisted source segment operations before enabling.';

export function SourcesTab({
  candidate,
  candidateExtracted,
  conversationId,
  extracting,
  flowError,
  onChatSourceEvidenceChange,
  onExtractCandidate,
  onMaterialUploaded,
  onSourceArtifactChange,
  parentCommitHash,
  targetBranch,
}: {
  candidate: WorkspaceCandidate;
  candidateExtracted?: boolean;
  conversationId?: string;
  extracting?: boolean;
  flowError?: string;
  onChatSourceEvidenceChange?: ChatSourceEvidenceChange;
  onExtractCandidate?: () => Promise<void> | void;
  onMaterialUploaded?: () => Promise<void> | void;
  onSourceArtifactChange?: (artifact: WorkspaceSourceArtifact | undefined) => void;
  parentCommitHash?: string;
  targetBranch?: string;
}) {
  const sources = candidate.sourceBundle;
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(sources[0]?.id ?? null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { archiveMaterial, archiving: materialArchiving } = useMaterialArchive();
  const { upload: uploadMaterial, uploading: materialUploading } = useMaterialUpload();
  const { add: addPin, fetch: fetchPins, remove: removePin } = usePinsCrud();
  const pins = usePinsStore((state) => state.pins);
  const primarySchema = getPrimarySchemaBinding(candidate.schemaBindings);
  const coverageLabel =
    candidate.schemaReview.gaps.length > 0
      ? `${candidate.schemaReview.gaps.length} coverage gap${
          candidate.schemaReview.gaps.length === 1 ? '' : 's'
        }`
      : 'Evidence coverage ready';

  useEffect(() => {
    if (sources.some((source) => source.id === selectedSourceId)) return;
    setSelectedSourceId(sources[0]?.id ?? null);
  }, [selectedSourceId, sources]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? sources[0] ?? null,
    [selectedSourceId, sources]
  );
  const selectedMaterialId = selectedSource?.materialId ?? null;
  const materialDetail = useMaterialDetail(candidate.projectId, selectedMaterialId);
  const selectedMaterialPin = useMemo(
    () =>
      selectedMaterialId
        ? pins.find((pin) => pin.type === 'import' && pin.ref_id === selectedMaterialId)
        : undefined,
    [pins, selectedMaterialId]
  );

  useEffect(() => {
    void fetchPins(candidate.projectId);
  }, [candidate.projectId, fetchPins]);

  const handleUploadFile = useCallback(
    async (file: File) => {
      const unsupportedMessage = unsupportedChatMaterialSourceMessage(file);
      if (unsupportedMessage) {
        setSourceError(unsupportedMessage);
        return;
      }

      setSourceError(null);
      try {
        const material = await uploadMaterial(candidate.projectId, file);
        await onMaterialUploaded?.();
        setSelectedSourceId(`material:${material.id}`);
      } catch (err) {
        setSourceError(err instanceof Error ? err.message : 'Material upload failed.');
      }
    },
    [candidate.projectId, onMaterialUploaded, uploadMaterial]
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) return;
      void handleUploadFile(file);
    },
    [handleUploadFile]
  );

  const handlePasteTextSource = useCallback(async () => {
    const text = pasteText.trim();
    if (!text) {
      setSourceError('Paste text before importing a source note.');
      return;
    }

    const title = pasteTitle.trim() || 'Pasted source note';
    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'pasted-source-note';
    const file = new File([text], `${slug}.txt`, { type: 'text/plain' });

    setSourceError(null);
    try {
      const material = await uploadMaterial(candidate.projectId, file);
      await onMaterialUploaded?.();
      setSelectedSourceId(`material:${material.id}`);
      setPasteDialogOpen(false);
      setPasteTitle('');
      setPasteText('');
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Text source import failed.');
    }
  }, [candidate.projectId, onMaterialUploaded, pasteText, pasteTitle, uploadMaterial]);

  const handleToggleIncludePreview = useCallback(async () => {
    if (!selectedMaterialId) return;
    setSourceError(null);

    try {
      if (selectedMaterialPin) {
        await removePin(selectedMaterialPin.id);
      } else {
        await addPin(candidate.projectId, 'import', selectedMaterialId);
      }
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Source include update failed.');
    }
  }, [addPin, candidate.projectId, removePin, selectedMaterialId, selectedMaterialPin]);

  const handleDeleteSourceMaterial = useCallback(
    async (source: SourceBundleItem) => {
      if (!source.materialId) return;
      setSourceError(null);

      try {
        const sourceArtifact = candidate.sourceArtifact;
        if (sourceArtifact?.root?.materialId === source.materialId) {
          onSourceArtifactChange?.(undefined);
        } else if (
          sourceArtifact?.resources.some((resource) => resource.materialId === source.materialId)
        ) {
          onSourceArtifactChange?.({
            ...sourceArtifact,
            resources: sourceArtifact.resources.filter(
              (resource) => resource.materialId !== source.materialId
            ),
          });
        }
        const sourcePin = pins.find(
          (pin) => pin.type === 'import' && pin.ref_id === source.materialId
        );
        if (sourcePin) {
          await removePin(sourcePin.id);
        }
        await archiveMaterial(candidate.projectId, source.materialId);
        await onMaterialUploaded?.();

        if (selectedSourceId === source.id) {
          setSelectedSourceId(
            sources.find((nextSource) => nextSource.id !== source.id)?.id ?? null
          );
        }
      } catch (err) {
        setSourceError(err instanceof Error ? err.message : 'Material delete failed.');
      }
    },
    [
      archiveMaterial,
      candidate.projectId,
      onMaterialUploaded,
      onSourceArtifactChange,
      pins,
      removePin,
      selectedSourceId,
      sources,
    ]
  );

  return (
    <div className="flex flex-col gap-3">
      <input
        accept={DOCUMENT_SOURCE_ACCEPTED_TYPES}
        aria-label="Upload source material"
        className="hidden"
        onChange={handleFileInputChange}
        ref={fileInputRef}
        type="file"
      />
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--stroke-divider)] pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {candidate.title}
            </h3>
            <Badge
              className="border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)]"
              variant="outline"
            >
              Source staging
            </Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm font-medium text-[var(--text-secondary)]">
            Collect source evidence, then generate a schema-aligned proposal. If no model is
            configured, T3X uses a deterministic scaffold that you can review and refine.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
            <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-0.5">
              {formatSourceCount(sources)}
            </span>
            <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-0.5">
              {primarySchema
                ? `${primarySchema.schemaName} ${primarySchema.version}`
                : 'No schema binding'}
            </span>
            <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-0.5">
              {coverageLabel}
            </span>
          </div>
        </div>
        <Button disabled={extracting} onClick={onExtractCandidate} type="button" variant="commit">
          {extracting
            ? 'Generating...'
            : candidateExtracted
              ? 'Regenerate candidate proposal'
              : 'Generate candidate proposal'}
        </Button>
      </header>

      {sourceError || flowError ? (
        <div
          className="rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-3 py-2 text-sm text-[var(--status-error)]"
          role="alert"
        >
          {sourceError ?? flowError}
        </div>
      ) : null}

      <Tabs
        className="min-h-[680px] overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
        defaultValue={parentCommitHash ? 'chat' : 'materials'}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2">
          <TabsList className="h-auto justify-start rounded-none bg-transparent p-0">
            <TabsTrigger className="gap-2 px-3 py-2 text-xs" value="materials">
              <FileUp className="size-3.5" />
              Materials
              <span className="rounded-full border border-[var(--stroke-divider)] px-1.5 py-0 text-[10px]">
                {sources.length}
              </span>
            </TabsTrigger>
            <TabsTrigger className="gap-2 px-3 py-2 text-xs" value="chat">
              <MessageSquareText className="size-3.5" />
              Chat
            </TabsTrigger>
          </TabsList>
          <p className="text-xs font-medium text-[var(--text-tertiary)]">
            Import, parse, or mark chat turns as source evidence.
          </p>
        </div>

        <TabsContent className="m-0 min-h-0 p-3" value="materials">
          <div className="grid h-[620px] min-h-0 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
            <SourceBundlePanel
              candidate={candidate}
              className="min-h-0"
              listClassName="max-h-[420px]"
              materialArchiving={materialArchiving}
              materialUploading={materialUploading}
              onDeleteSource={(source) => void handleDeleteSourceMaterial(source)}
              onPasteTextClick={() => setPasteDialogOpen(true)}
              onSelectSource={setSelectedSourceId}
              onUploadClick={() => fileInputRef.current?.click()}
              selectedSource={selectedSource}
              sources={sources}
            />
            <section
              aria-label="Parsed text preview"
              className="min-h-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
            >
              <ParsedTextPreview
                candidate={candidate}
                materialDetail={materialDetail.material}
                materialDetailError={materialDetail.error}
                materialDetailLoading={materialDetail.loading}
                onToggleIncludePreview={handleToggleIncludePreview}
                onSourceArtifactChange={onSourceArtifactChange}
                onDeleteMaterial={() =>
                  selectedSource ? void handleDeleteSourceMaterial(selectedSource) : undefined
                }
                source={selectedSource}
                sourceDeleting={materialArchiving}
                sourcePinned={Boolean(selectedMaterialPin)}
              />
            </section>
          </div>
        </TabsContent>

        <TabsContent className="m-0 min-h-0" value="chat">
          <section
            aria-label="Source chat"
            className="flex h-[680px] min-h-0 flex-col bg-[var(--surface-card)]"
          >
            <SourceChatPanel
              addPin={addPin}
              candidate={candidate}
              conversationId={conversationId}
              onChatSourceEvidenceChange={onChatSourceEvidenceChange}
              parentCommitHash={parentCommitHash}
              pins={pins}
              removePin={removePin}
              selectedSource={selectedSource}
              targetBranch={targetBranch}
            />
          </section>
        </TabsContent>
      </Tabs>
      <Dialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Paste source text</DialogTitle>
            <DialogDescription>
              Add source evidence for required PRD fields, then regenerate the candidate proposal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-xs font-semibold text-[var(--text-secondary)]">
              Title
              <input
                className="h-9 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--source)]"
                onChange={(event) => setPasteTitle(event.target.value)}
                placeholder="Audience note"
                value={pasteTitle}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--text-secondary)]">
              Source text
              <textarea
                className="min-h-40 resize-y rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] outline-none focus:border-[var(--source)]"
                onChange={(event) => setPasteText(event.target.value)}
                placeholder="Audience: Product managers, engineering reviewers, and implementation owners."
                value={pasteText}
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              disabled={materialUploading}
              onClick={() => setPasteDialogOpen(false)}
              type="button"
              variant="canvas-outline"
            >
              Cancel
            </Button>
            <Button
              disabled={materialUploading || pasteText.trim().length === 0}
              onClick={() => void handlePasteTextSource()}
              type="button"
              variant="commit"
            >
              {materialUploading ? 'Importing...' : 'Import text'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SourceBundlePanel({
  candidate,
  className,
  listClassName,
  materialArchiving,
  materialUploading,
  onDeleteSource,
  onPasteTextClick,
  onSelectSource,
  onUploadClick,
  selectedSource,
  sources,
}: {
  candidate: WorkspaceCandidate;
  className?: string;
  listClassName?: string;
  materialArchiving: boolean;
  materialUploading: boolean;
  onDeleteSource: (source: SourceBundleItem) => void;
  onPasteTextClick: () => void;
  onSelectSource: (sourceId: string) => void;
  onUploadClick: () => void;
  selectedSource: SourceBundleItem | null;
  sources: SourceBundleItem[];
}) {
  return (
    <aside
      aria-label="Source imports and bundle"
      className={cn(
        'flex min-h-0 flex-col rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Sources</h3>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            {summarizeSourceBundle(sources)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Add manual note source"
            disabled
            size="icon-sm"
            title="Manual note sources need a persisted workspace source endpoint before enabling."
            type="button"
            variant="canvas-ghost"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            aria-label="Upload document source"
            size="icon-sm"
            onClick={onUploadClick}
            type="button"
            variant="canvas-ghost"
          >
            <Upload className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-[var(--stroke-divider)] p-2 sm:grid-cols-4 lg:grid-cols-2">
        {IMPORT_ACTIONS.map((action) => {
          const Icon = action.icon;
          const uploadsMaterial =
            action.label === 'Import doc' || action.label === 'Upload PDF/doc';
          const pastesText = action.label === 'Paste text';
          const enabled = uploadsMaterial || pastesText;

          return (
            <Button
              className="h-9 justify-start gap-2 px-2 text-xs"
              disabled={!enabled || materialUploading}
              key={action.label}
              onClick={() => {
                if (uploadsMaterial) onUploadClick();
                if (pastesText) onPasteTextClick();
              }}
              title={getImportActionTitle(action.label, enabled, materialUploading)}
              type="button"
              variant="canvas-outline"
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {action.label}
            </Button>
          );
        })}
      </div>

      <ul
        aria-label="Source list"
        className={cn('flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-2', listClassName)}
      >
        {sources.length === 0 ? (
          <li className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4 text-center text-sm text-[var(--text-secondary)]">
            No source material yet.
          </li>
        ) : null}
        {sources.map((source) => {
          const selected = source.id === selectedSource?.id;
          const Icon = source.type === 'chat' ? MessageSquareText : FileText;
          const evidenceState = getSourceEvidenceState(source, candidate);

          return (
            <li key={source.id}>
              <div className="relative">
                <button
                  aria-pressed={selected}
                  className={cn(
                    'w-full rounded-md border p-3 text-left transition-colors',
                    source.materialId ? 'pr-10' : '',
                    selected
                      ? 'border-[var(--source)] bg-[var(--source)]/5'
                      : 'border-transparent bg-[var(--surface-card)] hover:border-[var(--stroke-divider)] hover:bg-[var(--hover-bg)]'
                  )}
                  onClick={() => onSelectSource(source.id)}
                  type="button"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <span
                      className={cn(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border',
                        selected
                          ? 'border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)]'
                          : 'border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--text-secondary)]'
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                        {source.title}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[var(--text-tertiary)]">
                        {formatSourceReference(source)}
                      </span>
                      <span className="mt-2 inline-flex rounded-full border border-[var(--stroke-divider)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                        {evidenceState}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-[var(--stroke-divider)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--text-secondary)]">
                      {source.type}
                    </span>
                  </span>
                </button>
                {source.materialId ? (
                  <Button
                    aria-label={`Delete ${source.title}`}
                    className="absolute right-2 top-2 text-[var(--status-error)] hover:text-[var(--status-error)]"
                    disabled={materialArchiving}
                    onClick={() => onDeleteSource(source)}
                    size="icon-sm"
                    type="button"
                    variant="canvas-ghost"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function ParsedTextPreview({
  candidate,
  materialDetail,
  materialDetailError,
  materialDetailLoading,
  onDeleteMaterial,
  onToggleIncludePreview,
  onSourceArtifactChange,
  source,
  sourceDeleting,
  sourcePinned,
}: {
  candidate: WorkspaceCandidate;
  materialDetail: MaterialDetail | null;
  materialDetailError: Error | null;
  materialDetailLoading: boolean;
  onDeleteMaterial: () => void;
  onToggleIncludePreview: () => Promise<void>;
  onSourceArtifactChange?: (artifact: WorkspaceSourceArtifact | undefined) => void;
  source: SourceBundleItem | null;
  sourceDeleting: boolean;
  sourcePinned: boolean;
}) {
  if (!source) {
    return (
      <div className="flex min-h-64 items-center justify-center p-6 text-sm text-[var(--text-secondary)]">
        Import a document, image, PDF, URL, or chat turn to create a parsed text preview.
      </div>
    );
  }

  const blocks = getParsedPreviewBlocks(source, candidate, materialDetail, sourcePinned);
  const parserLabel = materialDetail
    ? getMaterialParserLabel(materialDetail)
    : getParserLabel(source);
  const evidenceState = sourcePinned ? 'included' : getSourceEvidenceState(source, candidate);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
                Parsed text preview
              </h3>
              <Badge
                className="border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)]"
                variant="outline"
              >
                {evidenceState}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Imported material is parsed into reviewable text before later extract and diff review.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled
              title="Re-parse needs a persisted material parse job before enabling."
              type="button"
              variant="canvas-outline"
            >
              Re-parse
            </Button>
            {source.materialId ? (
              <Button
                className="border-[var(--status-error)]/30 text-[var(--status-error)] hover:border-[var(--status-error)]/50 hover:text-[var(--status-error)]"
                disabled={sourceDeleting}
                onClick={onDeleteMaterial}
                type="button"
                variant="canvas-outline"
              >
                Delete material
              </Button>
            ) : null}
            <Button
              disabled={!source.materialId}
              onClick={() => void onToggleIncludePreview()}
              type="button"
              variant={sourcePinned ? 'canvas-outline' : 'commit'}
            >
              {sourcePinned ? 'Remove source' : 'Include preview'}
            </Button>
          </div>
        </div>

        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          <SourceMeta label="Import" value={source.title} />
          <SourceMeta label="Parser" value={parserLabel} />
          <SourceMeta
            label="Reference"
            value={
              materialDetail
                ? `${materialDetail.segment_count} parsed blocks`
                : formatSourceReference(source)
            }
          />
        </dl>
      </header>

      {isYamlSource(source) && source.materialId ? (
        <SourceArtifactRoleEditor
          artifact={candidate.sourceArtifact}
          key={`${source.materialId}:${candidate.sourceArtifact?.rootPath ?? ''}:${
            candidate.sourceArtifact?.resources.find(
              (resource) => resource.materialId === source.materialId
            )?.path ?? ''
          }`}
          materialId={source.materialId}
          onChange={onSourceArtifactChange}
          source={source}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {materialDetailLoading ? (
          <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 text-sm text-[var(--text-secondary)]">
            Loading parsed text preview...
          </div>
        ) : null}
        {materialDetailError ? (
          <div
            className="rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] p-4 text-sm text-[var(--status-error)]"
            role="alert"
          >
            Failed to load parsed text preview.
          </div>
        ) : null}
        <div className="grid gap-3">
          {blocks.map((block, index) => (
            <article
              className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
              key={block.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-0.5 text-[var(--text-secondary)]">
                    {block.locator}
                  </span>
                  <span className="rounded-full border border-[var(--source)]/25 bg-[var(--source)]/10 px-2 py-0.5 text-[var(--source)]">
                    preview block {index + 1}
                  </span>
                  <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-0.5 text-[var(--text-secondary)]">
                    {block.state}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    disabled
                    size="sm"
                    title={SOURCE_SEGMENT_EDITING_DISABLED_TITLE}
                    type="button"
                    variant="canvas-outline"
                  >
                    Include
                  </Button>
                  <Button
                    disabled
                    size="sm"
                    title={SOURCE_SEGMENT_EDITING_DISABLED_TITLE}
                    type="button"
                    variant="canvas-outline"
                  >
                    Exclude
                  </Button>
                  <Button
                    disabled
                    size="sm"
                    title={SOURCE_SEGMENT_EDITING_DISABLED_TITLE}
                    type="button"
                    variant="canvas-outline"
                  >
                    Split
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-primary)]">{block.text}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function SourceArtifactRoleEditor({
  artifact,
  materialId,
  onChange,
  source,
}: {
  artifact: WorkspaceSourceArtifact | undefined;
  materialId: string;
  onChange?: (artifact: WorkspaceSourceArtifact | undefined) => void;
  source: SourceBundleItem;
}) {
  const isRoot = artifact?.root?.materialId === materialId;
  const resource = artifact?.resources.find((item) => item.materialId === materialId);
  const defaultPath = source.fileName?.trim() || 'device.yaml';
  const [portablePath, setPortablePath] = useState(
    isRoot ? artifact.rootPath : (resource?.path ?? defaultPath)
  );

  const normalizedPath = normalizePortableSourcePath(portablePath);
  const duplicatePath =
    artifact?.resources.some(
      (item) => item.materialId !== materialId && item.path === normalizedPath
    ) ||
    (!isRoot && artifact?.rootPath === normalizedPath);
  const roleDisabled = !onChange || !normalizedPath || duplicatePath;

  const useAsRoot = () => {
    if (!onChange || !normalizedPath) return;
    onChange({
      format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
      rootPath: normalizedPath,
      root: {
        materialId,
        ...(source.contentHash ? { contentHash: source.contentHash } : {}),
      },
      resources: (artifact?.resources ?? []).filter(
        (item) => item.materialId !== materialId && item.path !== normalizedPath
      ),
    });
  };

  const useAsResource = () => {
    if (!onChange || !artifact?.root || !normalizedPath || duplicatePath) return;
    onChange({
      ...artifact,
      resources: [
        ...artifact.resources.filter((item) => item.materialId !== materialId),
        {
          path: normalizedPath,
          materialId,
          ...(source.contentHash ? { contentHash: source.contentHash } : {}),
        },
      ],
    });
  };

  const removeRole = () => {
    if (!onChange || !artifact) return;
    if (isRoot) {
      onChange(undefined);
      return;
    }
    onChange({
      ...artifact,
      resources: artifact.resources.filter((item) => item.materialId !== materialId),
    });
  };

  const updateRolePath = () => {
    if (!onChange || !artifact || !normalizedPath || duplicatePath) return;
    if (isRoot) {
      onChange({ ...artifact, rootPath: normalizedPath });
      return;
    }
    onChange({
      ...artifact,
      resources: artifact.resources.map((item) =>
        item.materialId === materialId ? { ...item, path: normalizedPath } : item
      ),
    });
  };

  return (
    <section
      aria-label="ESPHome configuration role"
      className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
              ESPHome configuration role
            </h4>
            {isRoot ? <Badge variant="success">Root configuration</Badge> : null}
            {resource ? <Badge variant="outline">Local resource</Badge> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            T3X stores this Material selection and path. The server re-resolves the exact bytes
            whenever checks or a decision run.
          </p>
        </div>
        <label className="grid min-w-56 gap-1 text-xs font-semibold text-[var(--text-secondary)]">
          Portable path
          <input
            className="h-9 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--source)]"
            onChange={(event) => setPortablePath(event.target.value)}
            placeholder="device.yaml"
            value={portablePath}
          />
        </label>
      </div>
      {duplicatePath ? (
        <p className="mt-2 text-xs text-[var(--status-error)]" role="alert">
          Another local resource already uses this path.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {isRoot || resource ? (
          <>
            <Button disabled={roleDisabled} onClick={updateRolePath} type="button" variant="commit">
              Update path
            </Button>
            <Button onClick={removeRole} type="button" variant="canvas-outline">
              Remove configuration role
            </Button>
          </>
        ) : null}
        {!isRoot ? (
          <Button disabled={roleDisabled} onClick={useAsRoot} type="button" variant="commit">
            Use as root configuration
          </Button>
        ) : null}
        {!isRoot && !resource ? (
          <Button
            disabled={roleDisabled || !artifact?.root}
            onClick={useAsResource}
            title={artifact?.root ? undefined : 'Choose a root configuration first.'}
            type="button"
            variant="canvas-outline"
          >
            Add as local resource
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function normalizePortableSourcePath(value: string): string {
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.split('/').some((segment) => segment === '.' || segment === '..' || !segment)
  ) {
    return '';
  }
  return normalized;
}

function isYamlSource(source: SourceBundleItem): boolean {
  return source.format === 'yaml' || Boolean(source.fileName?.match(/\.ya?ml$/i));
}

function SourceChatPanel({
  addPin,
  candidate,
  conversationId,
  onChatSourceEvidenceChange,
  parentCommitHash,
  pins,
  removePin,
  selectedSource,
  targetBranch,
}: {
  addPin: (projectId: string, type: Pin['type'], refId: string) => Promise<Pin | null>;
  candidate: WorkspaceCandidate;
  conversationId?: string;
  onChatSourceEvidenceChange?: ChatSourceEvidenceChange;
  parentCommitHash?: string;
  pins: Pin[];
  removePin: (pinId: string) => Promise<void>;
  selectedSource: SourceBundleItem | null;
  targetBranch?: string;
}) {
  const [sourceConversationId, setSourceConversationId] = useState<string | undefined>(() =>
    parentCommitHash
      ? conversationId
      : (conversationId ?? readStoredSourceChatConversationId(candidate.projectId, candidate.id))
  );
  const [conversationScopeResolved, setConversationScopeResolved] = useState(
    !parentCommitHash || Boolean(conversationId)
  );
  const [turnSourceError, setTurnSourceError] = useState<string | null>(null);
  const [pinningTurnId, setPinningTurnId] = useState<string | null>(null);
  const { findConversationForParent } = useConversationParentResolver();
  const {
    selectedProvider,
    selectedModel,
    handleModelChange,
    loading: modelsLoading,
    isSelectionReady,
  } = useChatModelSelection({});

  const candidateConversationIds = useMemo(
    () =>
      candidate.sourceBundle
        .filter((source) => source.type === 'chat' && source.conversationId)
        .map((source) => source.conversationId as string),
    [candidate.sourceBundle]
  );
  const candidateConversationFingerprint = candidateConversationIds.join('\u001f');

  useEffect(() => {
    let active = true;

    if (conversationId) {
      setSourceConversationId(conversationId);
      setConversationScopeResolved(true);
      writeStoredSourceChatConversationId(
        candidate.projectId,
        candidate.id,
        conversationId,
        parentCommitHash
      );
      return () => {
        active = false;
      };
    }

    if (!parentCommitHash) {
      setSourceConversationId(
        readStoredSourceChatConversationId(candidate.projectId, candidate.id)
      );
      setConversationScopeResolved(true);
      return () => {
        active = false;
      };
    }

    setSourceConversationId(undefined);
    setConversationScopeResolved(false);
    const possibleConversationIds = Array.from(
      new Set(
        [
          readStoredSourceChatConversationId(candidate.projectId, candidate.id, parentCommitHash),
          readStoredSourceChatConversationId(candidate.projectId, candidate.id),
          ...candidateConversationIds,
        ].filter((value): value is string => Boolean(value))
      )
    );

    void findConversationForParent(possibleConversationIds, parentCommitHash).then(
      (matchedConversationId) => {
        if (!active) return;
        setSourceConversationId(matchedConversationId);
        setConversationScopeResolved(true);
        if (matchedConversationId) {
          writeStoredSourceChatConversationId(
            candidate.projectId,
            candidate.id,
            matchedConversationId,
            parentCommitHash
          );
        } else {
          removeStoredSourceChatConversationId(candidate.projectId, candidate.id, parentCommitHash);
        }
      }
    );

    return () => {
      active = false;
    };
  }, [
    candidate.id,
    candidate.projectId,
    candidateConversationFingerprint,
    conversationId,
    findConversationForParent,
    parentCommitHash,
  ]);

  useEffect(() => {
    if (!conversationScopeResolved || !parentCommitHash || !onChatSourceEvidenceChange) return;

    for (const source of candidate.sourceBundle) {
      if (
        source.type === 'chat' &&
        (!sourceConversationId || source.conversationId !== sourceConversationId)
      ) {
        onChatSourceEvidenceChange(source.id, null);
      }
    }
  }, [
    candidate.sourceBundle,
    conversationScopeResolved,
    onChatSourceEvidenceChange,
    parentCommitHash,
    sourceConversationId,
  ]);

  const handleConversationCreated = useCallback(
    (conversationId: string) => {
      setSourceConversationId(conversationId);
      setConversationScopeResolved(true);
      writeStoredSourceChatConversationId(
        candidate.projectId,
        candidate.id,
        conversationId,
        parentCommitHash
      );
    },
    [candidate.id, candidate.projectId, parentCommitHash]
  );

  const chat = useSourceThreadGeneration({
    projectId: candidate.projectId,
    conversationId: sourceConversationId,
    title: `${candidate.title} source chat`,
    provider: selectedProvider ?? undefined,
    model: selectedModel ?? undefined,
    parentCommitHash,
    sourceDraftReply: {
      workspaceId: candidate.id,
      workspaceRevision: candidate.revision,
    },
    onConversationCreated: handleConversationCreated,
  });

  const chatTurns = useMemo(() => {
    const messageTurns = chat.messages.map((message, index) =>
      chatMessageToSourceTurn(message, index)
    );

    if (chat.streamingContent.trim().length > 0) {
      messageTurns.push({
        id: `${sourceConversationId ?? candidate.id}_streaming_assistant`,
        role: 'assistant',
        author: 'Assistant',
        content: chat.streamingContent,
        pinnable: false,
      });
    }

    if (messageTurns.length > 0) return messageTurns;
    if (!conversationScopeResolved) return [];
    if (parentCommitHash && !sourceConversationId) return [];
    return getSourceChatTurns(candidate, selectedSource, sourceConversationId);
  }, [
    candidate,
    chat.messages,
    chat.streamingContent,
    conversationScopeResolved,
    parentCommitHash,
    selectedSource,
    sourceConversationId,
  ]);

  const turnPinsByRefId = useMemo(() => {
    const map = new Map<string, Pin>();
    for (const pin of pins) {
      if (pin.type === SOURCE_CHAT_TURN_PIN_TYPE) {
        map.set(pin.ref_id, pin);
      }
    }
    return map;
  }, [pins]);

  const selectedSourceTurns = useMemo(() => {
    const selectedTurnIds = new Set(turnPinsByRefId.keys());
    for (const turn of chatTurns) {
      if (!turn.pinnable || selectedTurnIds.has(turn.id)) continue;
      if (sourceDraftReferencesSelectedTurn(turn, selectedTurnIds)) {
        selectedTurnIds.add(turn.id);
      }
    }

    return chatTurns
      .filter((turn) => turn.pinnable && selectedTurnIds.has(turn.id))
      .map((turn) => ({
        ...turn,
        conversationId:
          turn.conversationId ?? sourceConversationId ?? selectedSource?.conversationId,
        projectId: turn.projectId ?? candidate.projectId,
        pinnable: true,
      }));
  }, [
    candidate.projectId,
    chatTurns,
    selectedSource?.conversationId,
    sourceConversationId,
    turnPinsByRefId,
  ]);
  const selectedTurnCount = selectedSourceTurns.length;

  useEffect(() => {
    if (!onChatSourceEvidenceChange || !conversationScopeResolved) return;

    const sourceId = getSourceChatSourceId(candidate.id, selectedSource, sourceConversationId);
    if (selectedSourceTurns.length === 0) {
      onChatSourceEvidenceChange(sourceId, null);
      return;
    }

    const conversationId = sourceConversationId ?? selectedSource?.conversationId;
    onChatSourceEvidenceChange(sourceId, {
      id: sourceId,
      type: 'chat',
      title:
        selectedSource?.type === 'chat' ? selectedSource.title : `${candidate.title} source chat`,
      ...(conversationId ? { conversationId } : {}),
      previewTurns: selectedSourceTurns,
    });
  }, [
    candidate.id,
    candidate.title,
    conversationScopeResolved,
    onChatSourceEvidenceChange,
    selectedSource?.conversationId,
    selectedSource?.id,
    selectedSource?.title,
    selectedSource?.type,
    selectedSourceTurns,
    sourceConversationId,
  ]);

  const handleToggleTurnSource = useCallback(
    async (turn: SourceConversationTurn) => {
      if (!turn.pinnable) return;

      setTurnSourceError(null);
      setPinningTurnId(turn.id);

      try {
        const existingPin = turnPinsByRefId.get(turn.id);
        if (existingPin) {
          await removePin(existingPin.id);
        } else {
          await addPin(candidate.projectId, SOURCE_CHAT_TURN_PIN_TYPE, turn.id);
        }
      } catch (err) {
        setTurnSourceError(err instanceof Error ? err.message : 'Source turn update failed.');
      } finally {
        setPinningTurnId(null);
      }
    },
    [addPin, candidate.projectId, removePin, turnPinsByRefId]
  );

  const handleSourceSend = useCallback(
    (message: string, images?: AttachedImage[]) => {
      chat.sendMessage(message, images ? { images } : undefined);
    },
    [chat]
  );

  const chatDisabled = chat.isLoading || modelsLoading || !isSelectionReady;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
              Source chat
            </h3>
            <Badge variant="outline">{chatTurns.length} turns</Badge>
            <Badge
              className="border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)]"
              variant="outline"
            >
              {selectedTurnCount} selected source turns
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Ask for clarification, capture useful turns, and decide what becomes source evidence.
          </p>
        </div>
      </header>

      {parentCommitHash ? (
        <output className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2 text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <GitCommitHorizontal
              aria-hidden="true"
              className="size-3.5 text-[var(--accent-commit)]"
            />
            Based on{' '}
            <span className="font-mono font-semibold">{shortSourceHash(parentCommitHash)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <GitBranch aria-hidden="true" className="size-3.5 text-[var(--accent-branch)]" />
            Next commit to <span className="font-mono font-semibold">{targetBranch ?? 'main'}</span>
          </span>
        </output>
      ) : null}

      {chat.error || chat.warning || turnSourceError ? (
        <div
          className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2 text-sm text-[var(--status-error)]"
          role={chat.error ? 'alert' : 'status'}
        >
          {chat.error ?? chat.warning ?? turnSourceError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <section
          aria-label="Source conversation"
          className="chat-scrollbar min-h-0 flex-1 overflow-auto bg-[var(--chat-panel)] px-4 py-4"
        >
          {chatTurns.length > 0 ? (
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {chatTurns.map((turn, index) => (
                <SourceTurnBubble
                  index={index + 1}
                  key={turn.id}
                  onToggleSource={() => void handleToggleTurnSource(turn)}
                  sourcePinned={turnPinsByRefId.has(turn.id)}
                  turn={turn}
                  turnSourceBusy={pinningTurnId === turn.id}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-tertiary)]">
              No source chat turns yet.
            </div>
          )}
        </section>
        <div className="border-t border-[var(--stroke-divider)] bg-[var(--chat-panel)] px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <GenerationComposer
              draftKey={`workspace-source:${candidate.id}`}
              disabled={chatDisabled}
              isStreaming={chat.isStreaming}
              onModelChange={handleModelChange}
              onSend={handleSourceSend}
              onStop={chat.stopGenerating}
              placeholder="Ask the model, paste source text, or describe a requirement change..."
              selectedModel={selectedModel ?? ''}
              selectedProvider={selectedProvider ?? ''}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function sourceChatConversationStorageKey(
  projectId: string,
  workspaceId: string,
  parentCommitHash?: string
): string {
  const scope = parentCommitHash ? `:${parentCommitHash}` : '';
  return `${SOURCE_CHAT_CONVERSATION_STORAGE_PREFIX}${projectId}:${workspaceId}${scope}`;
}

function readStoredSourceChatConversationId(
  projectId: string,
  workspaceId: string,
  parentCommitHash?: string
): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return (
      window.localStorage.getItem(
        sourceChatConversationStorageKey(projectId, workspaceId, parentCommitHash)
      ) ?? undefined
    );
  } catch {
    return undefined;
  }
}

function writeStoredSourceChatConversationId(
  projectId: string,
  workspaceId: string,
  conversationId: string,
  parentCommitHash?: string
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      sourceChatConversationStorageKey(projectId, workspaceId, parentCommitHash),
      conversationId
    );
  } catch {
    // Source chat can still work for the current session without persisted localStorage.
  }
}

function removeStoredSourceChatConversationId(
  projectId: string,
  workspaceId: string,
  parentCommitHash?: string
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(
      sourceChatConversationStorageKey(projectId, workspaceId, parentCommitHash)
    );
  } catch {
    // A fresh in-memory conversation can still start without localStorage.
  }
}

function shortSourceHash(hash: string): string {
  return hash.replace(/^sha256:/, '').slice(0, 12);
}

function getSourceChatSourceId(
  candidateId: string,
  selectedSource: SourceBundleItem | null,
  conversationId: string | undefined
): string {
  if (selectedSource?.type === 'chat') return selectedSource.id;
  return `source_chat:${conversationId ?? candidateId}`;
}

function chatMessageToSourceTurn(
  message: SourceThreadMessage,
  index: number
): SourceConversationTurn {
  const id = message.id || `source_chat_turn_${index}`;

  return {
    id,
    role: message.role,
    author: message.role === 'user' ? 'You' : 'Assistant',
    content: message.content,
    conversationId: message.conversationId,
    projectId: message.projectId,
    pinnable: isPersistedTurnId(id),
    ...(message.rings ? { rings: message.rings } : {}),
  };
}

function isPersistedTurnId(id: string): boolean {
  return Boolean(id) && !id.startsWith('msg-') && !id.endsWith('_streaming_assistant');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sourceDraftReferencesSelectedTurn(
  turn: SourceConversationTurn,
  selectedTurnIds: ReadonlySet<string>
): boolean {
  if (turn.role !== 'assistant' || !isRecord(turn.rings)) return false;
  const draft = turn.rings.source_chat_draft;
  if (!isRecord(draft) || draft.schema !== 't3x/source-chat-draft-v1' || draft.version !== 1) {
    return false;
  }
  if (!Array.isArray(draft.source_items)) return false;
  return draft.source_items.some((item) => {
    if (!isRecord(item) || typeof item.source_turn_hash !== 'string') return false;
    return selectedTurnIds.has(item.source_turn_hash);
  });
}

function getImportActionTitle(
  label: string,
  enabled: boolean,
  materialUploading: boolean
): string | undefined {
  if (materialUploading && enabled) return 'Source import is already in progress.';
  if (label === 'Paste text') {
    return 'Paste text as a source material.';
  }
  if (label === 'Add URL') {
    return 'URL sources need a persisted workspace source endpoint before enabling.';
  }
  return undefined;
}

function SourceTurnBubble({
  index,
  onToggleSource,
  sourcePinned,
  turn,
  turnSourceBusy,
}: {
  index: number;
  onToggleSource: () => void;
  sourcePinned: boolean;
  turn: SourceConversationTurn;
  turnSourceBusy: boolean;
}) {
  const isUser = turn.role === 'user';

  return (
    <article className={cn('flex gap-3', isUser && 'justify-end')}>
      {!isUser && <SourceAvatar label="AI" tone="assistant" />}
      <div
        className={cn(
          'max-w-[min(680px,85%)] rounded-lg border px-3 py-2 text-sm leading-6',
          isUser
            ? 'border-[var(--accent-conversation)]/20 bg-[var(--accent-conversation)]/10 text-[var(--text-primary)]'
            : 'border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--text-secondary)]'
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
          <span>{turn.author}</span>
          <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            turn {index}
          </span>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px]',
              sourcePinned
                ? 'border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)]'
                : 'border-[var(--stroke-divider)] text-[var(--text-secondary)]'
            )}
          >
            {sourcePinned ? 'included source' : 'source candidate'}
          </span>
          {isUser ? (
            <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
              requirement input
            </span>
          ) : (
            <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
              analysis helper
            </span>
          )}
          <Button
            className="ml-auto h-6 px-2 text-[10px]"
            disabled={!turn.pinnable || turnSourceBusy}
            onClick={onToggleSource}
            title={getTurnSourceButtonTitle(turn, sourcePinned, turnSourceBusy)}
            type="button"
            variant={sourcePinned ? 'canvas-outline' : 'commit'}
          >
            {turnSourceBusy
              ? 'Saving'
              : sourcePinned
                ? 'Remove source'
                : turn.pinnable
                  ? 'Include turn'
                  : 'Saving turn'}
          </Button>
        </div>
        <p className="whitespace-pre-line break-words">{turn.content}</p>
      </div>
      {isUser && <SourceAvatar label="YX" tone="user" />}
    </article>
  );
}

function getTurnSourceButtonTitle(
  turn: SourceConversationTurn,
  sourcePinned: boolean,
  turnSourceBusy: boolean
): string {
  if (turnSourceBusy) return 'Saving this source turn update.';
  if (!turn.pinnable) {
    return 'This chat turn must finish saving before it can become source evidence.';
  }
  if (sourcePinned) return 'Remove this chat turn from source evidence.';
  return 'Include this saved chat turn as source evidence.';
}

function SourceAvatar({ label, tone }: { label: string; tone: 'assistant' | 'user' }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        tone === 'assistant'
          ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
          : 'bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]'
      )}
    >
      {label}
    </span>
  );
}

function SourceMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-1.5">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-0.5 truncate font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function getSourceChatTurns(
  candidate: WorkspaceCandidate,
  selectedSource: SourceBundleItem | null,
  conversationId?: string
): SourceConversationTurn[] {
  if (conversationId) {
    return (
      candidate.sourceBundle.find(
        (source) => source.type === 'chat' && source.conversationId === conversationId
      )?.previewTurns ?? []
    );
  }

  if (selectedSource?.type === 'chat') {
    return selectedSource.previewTurns ?? [];
  }

  const chatSources = candidate.sourceBundle.filter((source) => source.type === 'chat');
  const turns = chatSources.flatMap((source) => source.previewTurns ?? []);

  return turns;
}

function getSourceEvidenceState(
  source: SourceBundleItem,
  _candidate: WorkspaceCandidate
): SourceEvidenceState {
  if (source.type === 'prompt_run') return 'stale';
  return 'candidate';
}

function getParsedPreviewBlocks(
  source: SourceBundleItem,
  candidate: WorkspaceCandidate,
  materialDetail: MaterialDetail | null,
  sourcePinned: boolean
): ParsedPreviewBlock[] {
  if (materialDetail) {
    return materialDetail.segments.slice(0, 20).map((segment) => ({
      id: segment.id,
      locator: segment.label,
      text: segment.text,
      state: sourcePinned ? 'included' : getSourceEvidenceState(source, candidate),
    }));
  }

  if (source.previewText) {
    return source.previewText
      .split(/\n{2,}/)
      .filter(Boolean)
      .slice(0, 3)
      .map((text, index) => ({
        id: `${source.id}_preview_${index}`,
        locator: source.type === 'chat' ? `turn ${index + 1}` : `paragraph ${index + 1}`,
        text,
        state: getSourceEvidenceState(source, candidate),
      }));
  }

  if (source.type === 'chat') {
    const turns = source.previewTurns ?? [];

    return turns.slice(0, 3).map((turn, index) => ({
      id: `${source.id}_turn_${turn.id}`,
      locator: `turn ${index + 1}`,
      text: turn.content,
      state: turn.role === 'user' ? 'included' : 'candidate',
    }));
  }

  const text =
    source.description ??
    `${source.title} has been imported. Parse the material into text before selecting evidence.`;

  return [
    {
      id: `${source.id}_preview_1`,
      locator: source.fileName ? 'page 1 / paragraph 1' : 'paragraph 1',
      text,
      state: getSourceEvidenceState(source, candidate),
    },
    {
      id: `${source.id}_preview_2`,
      locator: source.fileName ? 'page 1 / paragraph 2' : 'paragraph 2',
      text: 'Parsed text should be reviewed, split, included, or excluded before generating a candidate proposal.',
      state: 'candidate',
    },
  ];
}

function getParserLabel(source: SourceBundleItem): string {
  if (source.type === 'chat') return 'chat transcript';
  if (source.format === 'markdown' || source.format === 'text') return 'native text parse';
  if (source.fileName?.toLowerCase().endsWith('.pdf')) return 'pdf parser + vision fallback';
  if (source.fileName?.match(/\.(png|jpe?g|webp|gif)$/i)) return 'vision llm parse';
  if (source.type === 'document') return 'document parser';
  return 'source parser';
}

function getMaterialParserLabel(material: MaterialDetail): string {
  const quality = material.parse_quality.status;
  if (material.mime_type?.toLowerCase().includes('pdf')) return `pdf parser / ${quality}`;
  if (material.mime_type?.toLowerCase().includes('spreadsheet')) {
    return `spreadsheet parser / ${quality}`;
  }
  if (material.mime_type?.toLowerCase().includes('csv')) return `csv parser / ${quality}`;
  return `document parser / ${quality}`;
}

function formatSourceReference(source: SourceBundleItem): string {
  if (source.conversationId) return source.conversationId;
  if (source.fileName) return source.fileName;
  if (source.runId) return source.runId;
  if (source.format) return source.format;
  return 'Source evidence';
}
