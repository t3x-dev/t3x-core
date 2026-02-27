'use client';

import { FileText, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import * as api from '@/lib/api';
import { FileDropZone } from './FileDropZone';
import { ImportPreview } from './ImportPreview';
import { ImportProgress } from './ImportProgress';

interface DocumentImportTabProps {
  projectId: string;
  onImported: (conversationId: string) => void;
}

const ACCEPTED_TYPES = '.pdf,.docx,.doc,.md,.txt,.html,.htm';

export function DocumentImportTab({ projectId, onImported }: DocumentImportTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<api.ImportPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<
    'idle' | 'loading' | 'streaming' | 'success' | 'error'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [turnsImported, setTurnsImported] = useState(0);
  const [streamProgress, setStreamProgress] = useState<{ current: number; total: number } | null>(
    null
  );

  const handleFile = useCallback(
    async (f: File) => {
      setFile(f);
      setPreview(null);
      setImportStatus('idle');
      setPreviewLoading(true);
      try {
        const result = await api.previewDocumentImport(f, projectId);
        setPreview(result);
      } catch (err) {
        setImportStatus('error');
        setStatusMessage(err instanceof api.ApiError ? err.message : 'Failed to parse document');
      } finally {
        setPreviewLoading(false);
      }
    },
    [projectId]
  );

  const handleImport = useCallback(async () => {
    if (!file) return;
    const useStreaming = preview && preview.estimated_turns >= api.STREAMING_IMPORT_THRESHOLD;

    if (useStreaming) {
      setImportStatus('streaming');
      setStatusMessage('Connecting...');
      setStreamProgress(null);
      try {
        let lastConversationId: string | undefined;
        let lastTurnsImported = 0;

        for await (const event of api.streamDocumentImport(file, projectId)) {
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
        setStatusMessage(err instanceof api.ApiError ? err.message : 'Import failed');
      }
    } else {
      setImportStatus('loading');
      setStatusMessage('Importing...');
      try {
        const result = await api.importDocument(file, projectId);
        setImportStatus('success');
        setStatusMessage('Import complete');
        setTurnsImported(result.turns_imported);
        onImported(result.conversation_id);
      } catch (err) {
        setImportStatus('error');
        setStatusMessage(err instanceof api.ApiError ? err.message : 'Import failed');
      }
    }
  }, [file, projectId, preview, onImported]);

  return (
    <div className="space-y-4">
      <FileDropZone
        accept={ACCEPTED_TYPES}
        maxSizeMB={10}
        onFile={handleFile}
        label="Drop a document here or click to browse"
        hint="PDF, DOCX, Markdown, TXT, HTML (max 10MB)"
        disabled={previewLoading || importStatus === 'loading' || importStatus === 'streaming'}
      />

      {file && (
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{file.name}</span>
          <span className="text-xs text-muted-foreground">
            ({(file.size / 1024).toFixed(1)} KB)
          </span>
        </div>
      )}

      {previewLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Parsing document...
        </div>
      )}

      {preview?.duplicate_warning && (
        <p className="text-xs text-amber-500">{preview.duplicate_warning}</p>
      )}

      {preview?.metadata.extraction_quality && preview.metadata.extraction_quality !== 'good' && (
        <Badge variant="outline" className="text-amber-500 border-amber-500/30">
          {preview.metadata.extraction_quality === 'partial'
            ? 'Partial extraction — some content may be missing'
            : 'Poor extraction — this may be a scanned document'}
        </Badge>
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
