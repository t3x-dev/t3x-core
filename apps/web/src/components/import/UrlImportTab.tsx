'use client';

import { Globe, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as api from '@/infrastructure';
import { ApiError, type ImportPreviewResult, STREAMING_IMPORT_THRESHOLD } from '@/types/api';
import { ImportPreview } from './ImportPreview';
import { ImportProgress } from './ImportProgress';

interface UrlImportTabProps {
  projectId: string;
  onImported: (conversationId: string) => void;
}

export function UrlImportTab({ projectId, onImported }: UrlImportTabProps) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<
    'idle' | 'loading' | 'streaming' | 'success' | 'error'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [turnsImported, setTurnsImported] = useState(0);
  const [streamProgress, setStreamProgress] = useState<{ current: number; total: number } | null>(
    null
  );

  const handlePreview = useCallback(async () => {
    if (!url.trim()) return;
    setPreviewLoading(true);
    setPreview(null);
    setImportStatus('idle');
    try {
      const result = await api.previewUrlImport(url.trim(), projectId);
      setPreview(result);
    } catch (err) {
      setImportStatus('error');
      setStatusMessage(err instanceof ApiError ? err.message : 'Failed to fetch URL');
    } finally {
      setPreviewLoading(false);
    }
  }, [url, projectId]);

  const handleImport = useCallback(async () => {
    if (!url.trim()) return;
    const useStreaming = preview && preview.estimated_turns >= STREAMING_IMPORT_THRESHOLD;

    if (useStreaming) {
      setImportStatus('streaming');
      setStatusMessage('Connecting...');
      setStreamProgress(null);
      try {
        let lastConversationId: string | undefined;
        let lastTurnsImported = 0;

        for await (const event of api.streamUrlImport(url.trim(), projectId)) {
          if (event.type === 'status') {
            setStatusMessage(event.message);
          } else if (event.type === 'progress') {
            setStreamProgress({ current: event.current, total: event.total });
            setStatusMessage(`Importing turns... (${event.current}/${event.total})`);
          } else if (event.type === 'complete') {
            lastConversationId = (event as Record<string, unknown>).conversation_id as string;
            lastTurnsImported = (event as Record<string, unknown>).turns_imported as number;
          } else if (event.type === 'error') {
            setImportStatus('error');
            setStatusMessage(event.message);
            return;
          }
        }

        setImportStatus('success');
        setStatusMessage('Import complete');
        setTurnsImported(lastTurnsImported);
        if (lastConversationId) onImported(lastConversationId);
      } catch (err) {
        setImportStatus('error');
        setStatusMessage(err instanceof ApiError ? err.message : 'Import failed');
      }
    } else {
      setImportStatus('loading');
      setStatusMessage('Importing...');
      try {
        const result = await api.importFromUrl(url.trim(), projectId);
        setImportStatus('success');
        setStatusMessage('Import complete');
        setTurnsImported(result.turns_imported);
        onImported(result.conversation_id);
      } catch (err) {
        setImportStatus('error');
        setStatusMessage(err instanceof ApiError ? err.message : 'Import failed');
      }
    }
  }, [url, projectId, preview, onImported]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="pl-9"
            onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
          />
        </div>
        <Button onClick={handlePreview} disabled={!url.trim() || previewLoading} variant="outline">
          {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Preview'}
        </Button>
      </div>

      {preview?.duplicate_warning && (
        <p className="text-xs text-amber-500">{preview.duplicate_warning}</p>
      )}

      {preview && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {preview.metadata.title && (
                <span className="font-medium text-foreground">{preview.metadata.title}</span>
              )}
            </span>
            <span>{preview.estimated_turns} turns</span>
          </div>
          <ImportPreview paragraphs={preview.paragraphs} />
          <Button
            onClick={handleImport}
            disabled={
              importStatus === 'loading' ||
              importStatus === 'streaming' ||
              importStatus === 'success'
            }
            className="w-full"
          >
            {importStatus === 'loading' || importStatus === 'streaming' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Import {preview.estimated_turns} turns
          </Button>
        </>
      )}

      <ImportProgress
        status={importStatus}
        message={statusMessage}
        turnsImported={turnsImported}
        current={streamProgress?.current}
        total={streamProgress?.total}
      />
    </div>
  );
}
