'use client';

import { CheckSquare, Loader2, MessageSquare, Square } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as api from '@/infrastructure';
import { cn } from '@/lib/utils';
import { FileDropZone } from './FileDropZone';
import { ImportProgress } from './ImportProgress';

interface PlatformImportTabProps {
  projectId: string;
  onImported: () => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude.ai',
  gemini: 'Gemini',
};

export function PlatformImportTab({ projectId, onImported }: PlatformImportTabProps) {
  const [rawData, setRawData] = useState<string | null>(null);
  const [preview, setPreview] = useState<api.PlatformPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const [importStatus, setImportStatus] = useState<
    'idle' | 'loading' | 'streaming' | 'success' | 'error'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [importResult, setImportResult] = useState<api.PlatformImportResult | null>(null);
  const [streamProgress, setStreamProgress] = useState<{ current: number; total: number } | null>(
    null
  );

  const handleFile = useCallback(async (file: File) => {
    setPreview(null);
    setSelectedIds(new Set());
    setImportStatus('idle');
    setImportResult(null);
    setPreviewLoading(true);

    try {
      const text = await file.text();
      setRawData(text);
      const result = await api.previewPlatformImport(file);
      setPreview(result);
      // Select all by default
      const convos = result.conversations ?? [];
      setSelectedIds(new Set(convos.map((c) => c.id)));
    } catch (err) {
      setImportStatus('error');
      setStatusMessage(err instanceof api.ApiError ? err.message : 'Failed to parse export file');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const toggleConversation = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!preview) return;
    if (selectedIds.size === preview.conversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(preview.conversations.map((c) => c.id)));
    }
  };

  const handleImport = useCallback(async () => {
    const ids = selectedIdsRef.current;
    if (!rawData || ids.size === 0) return;

    // Compute total messages to decide on streaming
    const selectedConvos = preview?.conversations.filter((c) => ids.has(c.id)) ?? [];
    const totalMessages = selectedConvos.reduce((sum, c) => sum + c.message_count, 0);
    const useStreaming = totalMessages >= api.STREAMING_IMPORT_THRESHOLD;

    if (useStreaming) {
      setImportStatus('streaming');
      setStatusMessage('Connecting...');
      setStreamProgress(null);
      try {
        let lastResult: api.PlatformImportResult | null = null;

        for await (const event of api.streamPlatformImport(projectId, rawData, Array.from(ids))) {
          if (event.type === 'status') {
            setStatusMessage(event.message);
          } else if (event.type === 'progress') {
            setStreamProgress({ current: event.current, total: event.total });
            setStatusMessage(event.message ?? `Importing... (${event.current}/${event.total})`);
          } else if (event.type === 'complete') {
            const data = event as Record<string, unknown>;
            lastResult = {
              project_id: data.project_id as string,
              imported: data.imported as api.PlatformImportResult['imported'],
              total_conversations: data.total_conversations as number,
              total_turns: data.total_turns as number,
            };
          } else if (event.type === 'error') {
            setImportStatus('error');
            setStatusMessage(event.message);
            return;
          }
        }

        setImportStatus('success');
        setStatusMessage(`Imported ${lastResult?.total_conversations ?? 0} conversations`);
        setImportResult(lastResult);
        onImported();
      } catch (err) {
        setImportStatus('error');
        setStatusMessage(err instanceof api.ApiError ? err.message : 'Import failed');
      }
    } else {
      setImportStatus('loading');
      setStatusMessage('Importing conversations...');
      try {
        const result = await api.importFromPlatform(projectId, rawData, Array.from(ids));
        setImportStatus('success');
        setStatusMessage(`Imported ${result.total_conversations} conversations`);
        setImportResult(result);
        onImported();
      } catch (err) {
        setImportStatus('error');
        setStatusMessage(err instanceof api.ApiError ? err.message : 'Import failed');
      }
    }
  }, [rawData, projectId, preview, onImported]);

  const totalMessages =
    preview?.conversations
      .filter((c) => selectedIds.has(c.id))
      .reduce((sum, c) => sum + c.message_count, 0) ?? 0;

  return (
    <div className="space-y-4">
      <FileDropZone
        accept=".json"
        maxSizeMB={50}
        onFile={handleFile}
        label="Drop your export file here"
        hint="ChatGPT conversations.json, Claude.ai export, or Gemini export"
        disabled={previewLoading || importStatus === 'loading' || importStatus === 'streaming'}
      />

      {previewLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Parsing export file...
        </div>
      )}

      {preview && (
        <>
          <div className="flex items-center justify-between">
            <Badge variant="secondary">
              {PLATFORM_LABELS[preview.platform] || preview.platform}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {preview.conversations.length} conversation
              {preview.conversations.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={toggleAll} className="text-primary hover:underline">
              {selectedIds.size === preview.conversations.length ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-muted-foreground">
              {selectedIds.size} selected &middot; {totalMessages} messages
            </span>
          </div>

          <ScrollArea className="max-h-[250px] rounded-lg border">
            <div className="space-y-0.5 p-2">
              {preview.conversations.map((conv) => {
                const selected = selectedIds.has(conv.id);
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => toggleConversation(conv.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      selected ? 'bg-primary/10' : 'hover:bg-muted/50'
                    )}
                  >
                    {selected ? (
                      <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{conv.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {conv.message_count} msg
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          <Button
            onClick={handleImport}
            disabled={
              selectedIds.size === 0 ||
              importStatus === 'loading' ||
              importStatus === 'streaming' ||
              importStatus === 'success'
            }
            className="w-full"
          >
            {importStatus === 'loading' || importStatus === 'streaming' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Import {selectedIds.size} conversation{selectedIds.size !== 1 ? 's' : ''}
          </Button>
        </>
      )}

      <ImportProgress
        status={importStatus}
        message={statusMessage}
        turnsImported={importResult?.total_turns}
        current={streamProgress?.current}
        total={streamProgress?.total}
      />
    </div>
  );
}
